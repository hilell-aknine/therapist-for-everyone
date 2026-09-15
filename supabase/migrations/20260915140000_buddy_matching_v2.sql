-- Study Buddy matching v2 — perseverance, reciprocity, expiry (2026-09-15)
--
-- WHY, in one line: the live data showed the feature produced 4 connections and no
-- measurable learning, and the research says the way we were matching can make things
-- WORSE than not matching at all.
--
-- Measured on this project 2026-09-15:
--   * 5 people hold a connection. 1 of them kept learning after it. 3 of the 4 pairs had
--     a side that completed nothing afterwards, and 2 of those accepted while ALREADY
--     dormant (last lesson predates the connection).
--   * 0 shared lessons and 0 completions within 6h of each other across every pair.
--   * 3 requests still pending at 22, 34 and 44 days.
--   * 12 of 161 eligible learners have answered the consent question.
--
-- Research this is built on:
--   * "When Learning Together Goes Wrong: Negative Peer Effects in Online Learning"
--     (ideas.repec.org/p/dpr/wpaper/1242r.html) — pairing a learner with a LOW-PERSEVERANCE
--     peer makes them stop studying EARLIER and perform WORSE than studying alone. The
--     positive effect appears only when both sides are similar in level AND persevering.
--     => a dormant candidate is not a weak match, it is a harmful one. Hence change 1.
--   * Reciprocal recommender literature (arxiv 2007.16120, arxiv 2408.09748) — ranking that
--     accounts for the OTHER side's likelihood of accepting raised top-10 success from 23%
--     to 42% in a dating deployment; and popular candidates congest the market
--     ("rich-get-richer"), lowering total matches. => hence change 2.
--   * TrailMap (PMC12561731) — broadcast/queue matching produces long response delays and
--     attrition. => hence change 3.
--
-- WHAT CHANGES
--   1. Candidate window 90 days -> 30, and ranking puts perseverance ABOVE lesson
--      proximity. The v1 comment justified 90 days with "the pool is ~98 people, a strict
--      band leaves most learners with an empty screen". That premise is dead: the real
--      opted-in pool is 9. An empty screen is now the CORRECT output when no persevering
--      candidate exists, because the alternative is an actively harmful pairing. The new
--      'no_active_candidates' reason plus buddy_event_log makes that visible instead of
--      silent.
--   2. Reciprocity-aware ranking: candidates who have ever answered a request rank first,
--      and anyone already holding 2+ unanswered requests is excluded entirely. That is the
--      congestion cap — without it one unresponsive person absorbs the requests of a
--      9-person pool. (Measured: one learner holds 2 of the 3 stuck requests.)
--   3. Pending requests expire after 14 days. This is the important structural fix: the
--      UNIQUE (requester_id, target_id) index means an unanswered request removes that pair
--      from circulation FOREVER. In a 9-person pool three stuck requests is a third of the
--      market frozen. Expiry archives the row and deletes it, which frees the pair.
--
-- WHAT DOES NOT CHANGE — the privacy model is untouched:
--   double opt-in, first-name-only before a match, consent required to appear, and a phone
--   number returned by buddy_connections() alone. No new column leaves the database.
--
-- ⚠️ A DECLINE STILL BLOCKS FOREVER. Only never-answered requests expire. "No" is an
-- answer and keeps its anti-harassment guarantee; silence is not an answer.

-- ============================================================================
-- 1. ARCHIVE — so expiry is auditable and reversible
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buddy_request_archive (
    id           uuid PRIMARY KEY,
    requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    status       text,
    created_at   timestamptz,
    responded_at timestamptz,
    archived_at  timestamptz NOT NULL DEFAULT now(),
    reason       text NOT NULL
);

COMMENT ON TABLE public.buddy_request_archive IS
    'Requests removed from study_buddy_requests. Currently only reason=''expired_unanswered''. Exists so expiry frees the pair for re-matching without losing the record — restoring a row here re-creates the original request.';

ALTER TABLE public.buddy_request_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read buddy request archive" ON public.buddy_request_archive;
CREATE POLICY "Admins read buddy request archive" ON public.buddy_request_archive
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.buddy_request_archive FROM anon, authenticated;

-- ============================================================================
-- 2. EXPIRY
-- ============================================================================
-- Archives then DELETES pending requests older than p_days. The delete is the point:
-- it releases the unique-pair lock so both people return to circulation. An 'expired'
-- status value would have kept the row and therefore kept the pair blocked.
CREATE OR REPLACE FUNCTION public.buddy_expire_stale(p_days int DEFAULT 14)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n int;
BEGIN
    WITH stale AS (
        SELECT * FROM study_buddy_requests
         WHERE status = 'pending'
           AND responded_at IS NULL          -- belt and braces: never touch an answered row
           AND created_at < now() - make_interval(days => p_days)
    ), archived AS (
        INSERT INTO buddy_request_archive
            (id, requester_id, target_id, status, created_at, responded_at, reason)
        SELECT id, requester_id, target_id, status, created_at, responded_at,
               'expired_unanswered'
          FROM stale
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    )
    DELETE FROM study_buddy_requests r
     WHERE r.id IN (SELECT id FROM archived);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_expire_stale(int) FROM PUBLIC, anon, authenticated;

-- Daily at 03:30. Pure SQL, so unlike buddy-notify this needs no service key from Vault.
DO $$
BEGIN
    PERFORM cron.unschedule('buddy_expire_stale');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, or pg_cron absent on this instance
END $$;

DO $$
BEGIN
    PERFORM cron.schedule('buddy_expire_stale', '30 3 * * *',
                          'SELECT public.buddy_expire_stale(14)');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — buddy_expire_stale must be scheduled another way';
END $$;

-- ============================================================================
-- 3. MATCHING v2
-- ============================================================================
-- Payload shape is unchanged (token / first_name / lessons / stage / fresh / reason) so
-- the existing UI keeps working with no frontend deploy. Only WHO appears, in WHAT order,
-- and the wording of `reason` change.
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
            -- NOTE: buddy_last_active() spans every course_type on purpose, which now
            -- includes the 'nlp-clips' micro-lesson feed. Someone working through 2-minute
            -- clips is showing up, and that is exactly what perseverance means here.
            buddy_last_active(p.user_id)                 AS last_at,
            (SELECT count(*) FROM study_buddy_requests r
              WHERE r.target_id = p.user_id AND r.status = 'pending')      AS inbox_pending,
            (SELECT count(*) FROM study_buddy_requests r
              WHERE r.target_id = p.user_id AND r.responded_at IS NOT NULL) AS answered_ever
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
               (last_at > now() - interval '14 days') AS fresh,
               -- Lower is better. Perseverance and responsiveness outrank lesson
               -- proximity, which is the whole correction: v1 sorted by gap first and
               -- happily surfaced someone who had been gone for 89 days.
               ( CASE WHEN answered_ever > 0 THEN 0 ELSE 1 END
               + CASE WHEN inbox_pending > 0 THEN 1 ELSE 0 END
               + CASE WHEN last_at > now() - interval '14 days' THEN 0 ELSE 1 END
               ) AS penalty
        FROM cand
        WHERE n >= buddy_min_lessons()
          -- 30 days, down from 90. Beyond this the pairing is a net negative.
          AND last_at > now() - interval '30 days'
          -- Congestion cap: someone sitting on 2+ unanswered requests is both unlikely to
          -- answer and is absorbing a pool this small cannot spare.
          AND inbox_pending < 2
        ORDER BY penalty ASC, abs(n - v_me_n) ASC, last_at DESC
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
                WHEN fresh THEN ', והוא למד בשבועיים האחרונים'
                ELSE '' END
    ) ORDER BY penalty ASC, gap ASC, last_at DESC)
    INTO v_rows FROM ranked;

    PERFORM buddy_log('matches_viewed', jsonb_build_object(
        'count',      coalesce(jsonb_array_length(v_rows), 0),
        'reason',     CASE WHEN v_rows IS NULL THEN 'no_active_candidates' ELSE 'ok' END,
        'my_lessons', v_me_n
    ));

    RETURN jsonb_build_object(
        'rows',   coalesce(v_rows, '[]'::jsonb),
        -- v1 returned 'no_candidates'. v2 distinguishes it: the pool is not empty, it has
        -- nobody currently ACTIVE, and that is a different problem with a different fix.
        'reason', CASE WHEN v_rows IS NULL THEN 'no_active_candidates' ELSE 'ok' END,
        'my_lessons', v_me_n,
        'my_stage',   buddy_stage_label(v_me_n)
    );
END;
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.buddy_matches() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.buddy_matches() FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.buddy_matches() TO authenticated';
END $$;

-- ============================================================================
-- 4. POOL HEALTH — the number to check before inviting anyone
-- ============================================================================
-- Inviting learners into a pool with no active candidates spends the one chance you get
-- and lands them on an empty screen. Admin only.
CREATE OR REPLACE FUNCTION public.buddy_pool_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    WITH pool AS (
        SELECT p.user_id,
               buddy_lessons_done(p.user_id) AS n,
               buddy_last_active(p.user_id)  AS last_at,
               nullif(trim(coalesce(pr.phone, '')), '') IS NOT NULL AS has_phone,
               (SELECT count(*) FROM study_buddy_requests r
                 WHERE r.target_id = p.user_id AND r.status = 'pending') AS inbox_pending
          FROM study_buddy_prefs p
          JOIN profiles pr ON pr.id = p.user_id
         WHERE p.opted_in
    )
    SELECT jsonb_build_object(
        'opted_in',            (SELECT count(*) FROM pool),
        'with_phone',          (SELECT count(*) FROM pool WHERE has_phone),
        -- The only number that matters: how many can actually be SHOWN to someone.
        'matchable_now',       (SELECT count(*) FROM pool
                                 WHERE has_phone AND n >= buddy_min_lessons()
                                   AND last_at > now() - interval '30 days'
                                   AND inbox_pending < 2),
        'active_14d',          (SELECT count(*) FROM pool
                                 WHERE last_at > now() - interval '14 days'),
        'dormant_over_30d',    (SELECT count(*) FROM pool
                                 WHERE last_at IS NULL OR last_at <= now() - interval '30 days'),
        'pending_requests',    (SELECT count(*) FROM study_buddy_requests WHERE status = 'pending'),
        'pending_over_14d',    (SELECT count(*) FROM study_buddy_requests
                                 WHERE status = 'pending' AND created_at < now() - interval '14 days'),
        'expired_archived',    (SELECT count(*) FROM buddy_request_archive
                                 WHERE reason = 'expired_unanswered'),
        'accepted_total',      (SELECT count(*) FROM study_buddy_requests WHERE status = 'accepted'),
        -- A pool this small cannot sustain matching; say so in the payload rather than
        -- leaving it to be inferred.
        'verdict',             CASE WHEN (SELECT count(*) FROM pool
                                          WHERE has_phone AND n >= buddy_min_lessons()
                                            AND last_at > now() - interval '30 days'
                                            AND inbox_pending < 2) < 4
                                    THEN 'too_thin_to_invite'
                                    ELSE 'ok' END
    ) INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_pool_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buddy_pool_health() TO authenticated;
