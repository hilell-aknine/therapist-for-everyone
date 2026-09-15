-- Study Buddy usage logging — "are they actually using it?" (2026-09-15)
--
-- WHY: the feature has produced 4 accepted connections between 5 people (verified live
-- 2026-09-15). Whether those 5 ever USE the connection was unanswerable: the only stored
-- evidence is the accepted row itself. A co-study check on lesson timestamps found 0
-- shared lessons and 0 completions within 6h of each other, and in 3 of the 4 pairs one
-- side completed nothing at all after connecting — but absence of lessons is not absence
-- of use, so the question stayed open.
--
-- The decisive proxy is RETURN VISITS: buddy_connections() is the only place a phone
-- number is ever returned, so every call to it is a person opening the screen where their
-- buddy's number lives. Nothing logged that. Now it does.
--
-- It also fixes the missing denominator. `popup_events` holds 3 rows for
-- 'study_buddy_consent' against 12 people who actually answered, so client-side
-- impressions are not being recorded and "how many of the eligible 75 were ever asked"
-- could not be recovered. buddy_status() runs at portal boot for every signed-in learner
-- (initBuddyState in course-library-v2.html), so logging it here yields the eligible
-- population that loaded the portal — server-side, with no frontend change and therefore
-- no deploy.
--
-- DESIGN NOTES
--   * One row per (user, event, Israel-local day) upserted with a hit counter, not one
--     row per call. buddy_status fires on every portal load; per-call rows would bury the
--     signal in noise. Distinct days is also the metric that actually answers the
--     question ("did they come back"), and it keeps this table permanently small.
--   * Israel-local day, not UTC — same reason as every other date in this project.
--   * buddy_log() swallows every exception. Logging must never be able to break the
--     feature it measures.
--   * The four read RPCs change STABLE -> VOLATILE because a STABLE function cannot
--     write. Safe here: the browser reaches them through supabaseClient.rpc(), which
--     POSTs (see buddyRpc, course-library-v2.html:4928) — PostgREST only requires
--     STABLE/IMMUTABLE for GET. Do NOT add `{ get: true }` to those calls.
--   * Function bodies below are otherwise byte-identical to
--     20260802120000_study_buddy_matching.sql. The privacy model is untouched: no extra
--     column leaves the database, and buddy_event_log stores no contact detail.

-- ============================================================================
-- 1. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buddy_event_log (
    id       bigserial PRIMARY KEY,
    user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event    text NOT NULL CHECK (event IN (
                 'status', 'matches_viewed', 'incoming_viewed', 'connections_viewed')),
    day      date NOT NULL,
    first_at timestamptz NOT NULL DEFAULT now(),
    last_at  timestamptz NOT NULL DEFAULT now(),
    hits     int  NOT NULL DEFAULT 1,
    meta     jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.buddy_event_log IS
    'Study-buddy usage telemetry. One row per (user, event, Israel-local day) with a hit counter. connections_viewed = someone opened the screen that shows a buddy phone number; that is the return-visit signal. Contains no contact details.';

CREATE UNIQUE INDEX IF NOT EXISTS buddy_event_log_uniq
    ON public.buddy_event_log (user_id, event, day);
CREATE INDEX IF NOT EXISTS buddy_event_log_event_day_idx
    ON public.buddy_event_log (event, day DESC);

ALTER TABLE public.buddy_event_log ENABLE ROW LEVEL SECURITY;

-- Same access shape as study_buddy_prefs / study_buddy_requests: admin SELECT only,
-- no policy for plain `authenticated`, nothing for anon. Writes happen exclusively
-- through the SECURITY DEFINER function below.
DROP POLICY IF EXISTS "Admins read buddy event log" ON public.buddy_event_log;
CREATE POLICY "Admins read buddy event log" ON public.buddy_event_log
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.buddy_event_log FROM anon;
REVOKE ALL ON public.buddy_event_log FROM authenticated;
REVOKE ALL ON SEQUENCE public.buddy_event_log_id_seq FROM anon, authenticated;

-- ============================================================================
-- 2. LOGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buddy_log(p_event text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO buddy_event_log (user_id, event, day, meta)
    VALUES (v_uid, p_event, (now() AT TIME ZONE 'Asia/Jerusalem')::date,
            coalesce(p_meta, '{}'::jsonb))
    ON CONFLICT (user_id, event, day) DO UPDATE
       SET last_at = now(),
           hits    = buddy_event_log.hits + 1,
           meta    = EXCLUDED.meta;
EXCEPTION
    -- Telemetry is never allowed to take the feature down with it.
    WHEN OTHERS THEN
        RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_log(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. THE FOUR READ RPCs — unchanged behaviour, now instrumented
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buddy_status()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_n int;
    v_pref study_buddy_prefs%ROWTYPE;
    v_has_phone boolean;
    v_out jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('signed_in', false);
    END IF;

    v_n := buddy_lessons_done(v_uid);
    SELECT * INTO v_pref FROM study_buddy_prefs WHERE user_id = v_uid;
    SELECT nullif(trim(coalesce(phone, '')), '') IS NOT NULL INTO v_has_phone
      FROM profiles WHERE id = v_uid;

    v_out := jsonb_build_object(
        'signed_in',        true,
        'lessons_done',     v_n,
        'min_lessons',      buddy_min_lessons(),
        'eligible',         (v_n >= buddy_min_lessons()),
        'has_phone',        coalesce(v_has_phone, false),
        'asked',            (v_pref.user_id IS NOT NULL),
        'opted_in',         coalesce(v_pref.opted_in, false),
        'stage',            buddy_stage_label(v_n),
        'pending_incoming', (SELECT count(*) FROM study_buddy_requests
                              WHERE target_id = v_uid AND status = 'pending'),
        'pending_outgoing', (SELECT count(*) FROM study_buddy_requests
                              WHERE requester_id = v_uid AND status = 'pending'),
        'connections',      (SELECT count(*) FROM study_buddy_requests
                              WHERE status = 'accepted'
                                AND (requester_id = v_uid OR target_id = v_uid))
    );

    -- Only the eligible pool is logged. Everyone else is noise for this question, and
    -- an ineligible learner was never in a position to be asked in the first place.
    IF v_n >= buddy_min_lessons() THEN
        PERFORM buddy_log('status', jsonb_build_object(
            'lessons_done', v_n,
            'asked',        (v_pref.user_id IS NOT NULL),
            'opted_in',     coalesce(v_pref.opted_in, false),
            'has_phone',    coalesce(v_has_phone, false),
            'connections',  (v_out->>'connections')::int
        ));
    END IF;

    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_matches()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_me_n int;
    v_me_last timestamptz;
    v_rows jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('rows', '[]'::jsonb, 'reason', 'not_signed_in');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM study_buddy_prefs WHERE user_id = v_uid AND opted_in) THEN
        PERFORM buddy_log('matches_viewed', jsonb_build_object('reason', 'not_opted_in', 'count', 0));
        RETURN jsonb_build_object('rows', '[]'::jsonb, 'reason', 'not_opted_in');
    END IF;

    v_me_n := buddy_lessons_done(v_uid);
    v_me_last := buddy_last_active(v_uid);

    WITH cand AS (
        SELECT
            p.user_id,
            split_part(trim(pr.full_name), ' ', 1)      AS first_name,
            buddy_lessons_done(p.user_id)                AS n,
            buddy_last_active(p.user_id)                 AS last_at
        FROM study_buddy_prefs p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.opted_in
          AND p.user_id <> v_uid
          AND nullif(trim(coalesce(pr.phone, '')), '')     IS NOT NULL
          AND nullif(trim(coalesce(pr.full_name, '')), '') IS NOT NULL
          AND NOT EXISTS (
                SELECT 1 FROM study_buddy_requests r
                 WHERE (r.requester_id = v_uid       AND r.target_id = p.user_id)
                    OR (r.requester_id = p.user_id   AND r.target_id = v_uid))
    ),
    ranked AS (
        SELECT *,
               abs(n - v_me_n) AS gap,
               (last_at > now() - interval '14 days') AS fresh
        FROM cand
        WHERE n >= buddy_min_lessons()
          AND last_at > now() - interval '90 days'
        ORDER BY abs(n - v_me_n) ASC, last_at DESC
        LIMIT 3
    )
    SELECT jsonb_agg(jsonb_build_object(
        'token',      buddy_pair_token(v_uid, user_id),
        'first_name', first_name,
        'lessons',    n,
        'stage',      buddy_stage_label(n),
        'fresh',      fresh,
        'reason',
            CASE
                WHEN gap <= 2 THEN 'שניכם כמעט בדיוק באותו מקום בקורס'
                WHEN n > v_me_n THEN 'הוא קצת לפניך בקורס, יש לו מה לפתוח לך'
                ELSE 'אתה קצת לפניו, ולהסביר למישהו זו הדרך הכי טובה לקבע חומר'
            END
            || CASE
                WHEN fresh AND v_me_last > now() - interval '14 days'
                    THEN ', ושניכם למדתם בשבועיים האחרונים'
                ELSE '' END
    ) ORDER BY gap ASC, last_at DESC)
    INTO v_rows FROM ranked;

    -- An empty candidate list is the most actionable thing this can record: it means the
    -- learner opened the screen and was shown nobody.
    PERFORM buddy_log('matches_viewed', jsonb_build_object(
        'count',  coalesce(jsonb_array_length(v_rows), 0),
        'reason', CASE WHEN v_rows IS NULL THEN 'no_candidates' ELSE 'ok' END,
        'my_lessons', v_me_n
    ));

    RETURN jsonb_build_object(
        'rows',   coalesce(v_rows, '[]'::jsonb),
        'reason', CASE WHEN v_rows IS NULL THEN 'no_candidates' ELSE 'ok' END,
        'my_lessons', v_me_n,
        'my_stage',   buddy_stage_label(v_me_n)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_incoming()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_me_n int;
    v_rows jsonb;
BEGIN
    IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
    v_me_n := buddy_lessons_done(v_uid);

    SELECT jsonb_agg(jsonb_build_object(
        'id',         r.id,
        'first_name', split_part(trim(pr.full_name), ' ', 1),
        'lessons',    buddy_lessons_done(r.requester_id),
        'stage',      buddy_stage_label(buddy_lessons_done(r.requester_id)),
        'reason',     CASE
                         WHEN abs(buddy_lessons_done(r.requester_id) - v_me_n) <= 2
                             THEN 'אתם כמעט בדיוק באותו מקום בקורס'
                         WHEN buddy_lessons_done(r.requester_id) > v_me_n
                             THEN 'הוא קצת לפניך בקורס'
                         ELSE 'הוא קצת אחריך בקורס'
                      END,
        'created_at', r.created_at
    ) ORDER BY r.created_at DESC)
    INTO v_rows
    FROM study_buddy_requests r
    JOIN profiles pr ON pr.id = r.requester_id
    WHERE r.target_id = v_uid AND r.status = 'pending';

    -- A pending request that is seen and still not answered is a different problem from
    -- one that was never seen. This is what tells the two apart.
    PERFORM buddy_log('incoming_viewed', jsonb_build_object(
        'count', coalesce(jsonb_array_length(v_rows), 0)));

    RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_connections()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rows jsonb;
BEGIN
    IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'id',        r.id,
        'name',      nullif(trim(pr.full_name), ''),
        'phone',     nullif(trim(pr.phone), ''),
        'lessons',   buddy_lessons_done(other.id),
        'stage',     buddy_stage_label(buddy_lessons_done(other.id)),
        'since',     r.responded_at,
        'i_asked',   (r.requester_id = v_uid)
    ) ORDER BY r.responded_at DESC)
    INTO v_rows
    FROM study_buddy_requests r
    JOIN LATERAL (
        SELECT CASE WHEN r.requester_id = v_uid THEN r.target_id ELSE r.requester_id END AS id
    ) other ON true
    JOIN profiles pr ON pr.id = other.id
    WHERE r.status = 'accepted'
      AND (r.requester_id = v_uid OR r.target_id = v_uid);

    -- THE metric. A non-zero count here means this person opened the screen holding a
    -- buddy's phone number. Distinct days per user = did they come back.
    PERFORM buddy_log('connections_viewed', jsonb_build_object(
        'count', coalesce(jsonb_array_length(v_rows), 0)));

    RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

-- ============================================================================
-- 4. GRANTS — CREATE OR REPLACE keeps existing privileges, re-asserted for safety
-- ============================================================================
DO $$
DECLARE fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.buddy_status()',
        'public.buddy_matches()',
        'public.buddy_incoming()',
        'public.buddy_connections()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- ============================================================================
-- 5. ADMIN READOUT
-- ============================================================================
-- One call that answers the original question. Admin only.
CREATE OR REPLACE FUNCTION public.buddy_usage_report()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
      'logging_since', (SELECT min(day) FROM buddy_event_log),
      'last_event',    (SELECT max(last_at) FROM buddy_event_log),
      -- Denominator: eligible learners who actually loaded the portal since logging began.
      'eligible_seen',        (SELECT count(DISTINCT user_id) FROM buddy_event_log WHERE event='status'),
      'eligible_seen_unasked',(SELECT count(DISTINCT user_id) FROM buddy_event_log
                                WHERE event='status' AND (meta->>'asked') = 'false'),
      'opted_in_total',       (SELECT count(*) FROM study_buddy_prefs WHERE opted_in),
      'answered_total',       (SELECT count(*) FROM study_buddy_prefs),
      -- Did anyone open the matches screen, and were they shown anybody?
      'matches_viewers',      (SELECT count(DISTINCT user_id) FROM buddy_event_log WHERE event='matches_viewed'),
      'matches_empty_screens',(SELECT count(*) FROM buddy_event_log
                                WHERE event='matches_viewed' AND (meta->>'count')::int = 0),
      -- THE answer: return visits to the screen that holds a phone number.
      'connection_viewers',   (SELECT count(DISTINCT user_id) FROM buddy_event_log
                                WHERE event='connections_viewed' AND (meta->>'count')::int > 0),
      'connection_view_days', (SELECT coalesce(jsonb_object_agg(user_id, d), '{}'::jsonb)
                                 FROM (SELECT user_id, count(*) AS d FROM buddy_event_log
                                        WHERE event='connections_viewed' AND (meta->>'count')::int > 0
                                        GROUP BY user_id) s),
      'pending_seen_unanswered', (SELECT count(DISTINCT user_id) FROM buddy_event_log
                                   WHERE event='incoming_viewed' AND (meta->>'count')::int > 0)
    ) INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_usage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buddy_usage_report() TO authenticated;
