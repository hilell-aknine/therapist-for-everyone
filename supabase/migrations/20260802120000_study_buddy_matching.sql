-- Study Buddy matching — "ללמוד עם חבר" (2026-08-02)
--
-- WHY: 294 people completed at least one lesson, but 151 of them stopped after one or
-- two. Of the rest, only 34 touched the course in the last 30 days. The pool that can
-- realistically be matched (3+ completed lessons, a phone on file, active within 90
-- days) is 98 people. Learning alone is the churn driver; this lets a learner find
-- someone at roughly the same point and study together.
--
-- PRIVACY MODEL (decided by Hillel 2026-08-02, all three answers = option 1):
--   1. DOUBLE OPT-IN. A phone number is NEVER handed out because someone asked. The
--      requester sees no contact detail; the target gets a request; contact is exchanged
--      only after the target explicitly accepts. Either side alone gets nothing.
--   2. FIRST NAME ONLY before a match. No surname, no phone, no email, no user_id in
--      any candidate payload — matches carry an opaque per-pair token instead.
--   3. Consent is required to appear at all (study_buddy_prefs.opted_in), and is only
--      asked of learners with 3+ completed lessons.
--
-- This is the same discipline as 20260722120000_leaderboard_privacy_rpc.sql, and it
-- exists because 20260706120000_fix_profiles_public_read_leak.sql showed what happens
-- when profile rows are reachable from the browser: 748 rows with email + phone leaked.
-- Therefore BOTH tables below are RLS-enabled with NO authenticated policy at all.
-- Every read and write goes through the SECURITY DEFINER functions in this file, which
-- decide exactly which columns leave the database.

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_buddy_prefs (
    user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    opted_in    boolean     NOT NULL DEFAULT false,
    opted_in_at timestamptz,
    declined_at timestamptz,
    asked_at    timestamptz NOT NULL DEFAULT now(),  -- consent popup answered → never nag again
    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.study_buddy_prefs IS
    'Study-buddy consent. A row exists once the learner ANSWERED the consent popup (either way); opted_in says which. No row = never asked.';

CREATE TABLE IF NOT EXISTS public.study_buddy_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','cancelled')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    CONSTRAINT study_buddy_no_self CHECK (requester_id <> target_id)
);

-- One row per ordered pair, forever. A declined request is NOT deletable by the
-- requester and blocks re-asking — that is the anti-harassment guarantee, not an
-- oversight. Someone who said no is never asked again by the same person.
CREATE UNIQUE INDEX IF NOT EXISTS study_buddy_requests_pair_idx
    ON public.study_buddy_requests (requester_id, target_id);
CREATE INDEX IF NOT EXISTS study_buddy_requests_target_idx
    ON public.study_buddy_requests (target_id, status);
CREATE INDEX IF NOT EXISTS study_buddy_requests_requester_idx
    ON public.study_buddy_requests (requester_id, status);

ALTER TABLE public.study_buddy_prefs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_buddy_requests ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policy for `authenticated` on either table. With RLS on and no
-- matching policy, direct REST reads return zero rows for every signed-in user. The
-- only paths in are the functions below. Admin gets read-only for the dashboard.
DROP POLICY IF EXISTS "Admins read buddy prefs" ON public.study_buddy_prefs;
CREATE POLICY "Admins read buddy prefs" ON public.study_buddy_prefs
    FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read buddy requests" ON public.study_buddy_requests;
CREATE POLICY "Admins read buddy requests" ON public.study_buddy_requests
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.study_buddy_prefs    FROM anon;
REVOKE ALL ON public.study_buddy_requests FROM anon;

-- ============================================================================
-- 2. HELPERS
-- ============================================================================

-- Position in the course = DISTINCT completed lessons of the practitioner course.
-- Verified against live data (2026-08-02): course_progress.video_id holds a YouTube id,
-- there is no module column, and `last_watched_*` bookkeeping rows share the table —
-- they carry completed=false but are excluded explicitly so a future write cannot
-- inflate anyone's position. lesson_number is per-module and NOT a global position, so
-- it is deliberately unused here.
CREATE OR REPLACE FUNCTION public.buddy_lessons_done(p_user uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(count(DISTINCT video_id), 0)::int
    FROM course_progress
    WHERE user_id = p_user
      AND completed = true
      AND course_type = 'nlp-practitioner'
      AND video_id NOT LIKE 'last_watched%';
$$;

CREATE OR REPLACE FUNCTION public.buddy_last_active(p_user uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT max(completed_at)
    FROM course_progress
    WHERE user_id = p_user AND completed = true AND video_id NOT LIKE 'last_watched%';
$$;

-- Plain-Hebrew position label. The practitioner course is 51 lessons.
CREATE OR REPLACE FUNCTION public.buddy_stage_label(p_n int)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE
        WHEN p_n <= 10 THEN 'בתחילת הדרך'
        WHEN p_n <= 25 THEN 'באמצע הקורס'
        WHEN p_n <= 40 THEN 'בשליש האחרון'
        ELSE 'לקראת סיום הקורס'
    END;
$$;

-- Minimum completed lessons to be asked for consent / to appear as a match.
-- 3 was chosen off the live distribution: 151 of 294 learners never pass 2 lessons,
-- so a lower bar fills the pool with people who already left.
CREATE OR REPLACE FUNCTION public.buddy_min_lessons()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 3; $$;

-- ============================================================================
-- 3. STATUS + CONSENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buddy_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_n int;
    v_pref study_buddy_prefs%ROWTYPE;
    v_has_phone boolean;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('signed_in', false);
    END IF;

    v_n := buddy_lessons_done(v_uid);
    SELECT * INTO v_pref FROM study_buddy_prefs WHERE user_id = v_uid;
    SELECT nullif(trim(coalesce(phone, '')), '') IS NOT NULL INTO v_has_phone
      FROM profiles WHERE id = v_uid;

    RETURN jsonb_build_object(
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
END;
$$;

-- Records the answer to the consent popup. p_opt_in=false is a real answer (it stops
-- the popup from ever asking again), not a no-op.
CREATE OR REPLACE FUNCTION public.buddy_set_opt_in(p_opt_in boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_n int;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
    END IF;

    v_n := buddy_lessons_done(v_uid);
    IF p_opt_in AND v_n < buddy_min_lessons() THEN
        RAISE EXCEPTION 'not eligible yet' USING ERRCODE = '42501';
    END IF;

    INSERT INTO study_buddy_prefs (user_id, opted_in, opted_in_at, declined_at, asked_at, updated_at)
    VALUES (v_uid, p_opt_in,
            CASE WHEN p_opt_in THEN now() END,
            CASE WHEN p_opt_in THEN NULL ELSE now() END,
            now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
        opted_in    = EXCLUDED.opted_in,
        opted_in_at = CASE WHEN EXCLUDED.opted_in THEN coalesce(study_buddy_prefs.opted_in_at, now()) END,
        declined_at = CASE WHEN EXCLUDED.opted_in THEN NULL ELSE now() END,
        updated_at  = now();

    -- Opting out withdraws you from circulation immediately: every request still
    -- waiting for an answer (in either direction) is cancelled. Accepted connections
    -- survive on purpose — those two people already exchanged contact knowingly, and
    -- silently deleting a real connection would be the surprising behaviour.
    IF NOT p_opt_in THEN
        UPDATE study_buddy_requests
           SET status = 'cancelled', responded_at = now()
         WHERE status = 'pending'
           AND (requester_id = v_uid OR target_id = v_uid);
    END IF;

    RETURN buddy_status();
END;
$$;

-- ============================================================================
-- 4. MATCHING
-- ============================================================================
-- Returns at most 3 candidates. NOTHING identifying leaves this function: no user_id,
-- no surname, no phone, no email. Each candidate carries `token` = the deterministic
-- pair hash, which buddy_request() resolves back to a user. A token is useless on its
-- own — it can only be spent by the caller it was minted for, on one specific pair.
-- md5 (pg_catalog, always present) rather than pgcrypto's digest(): this token is a
-- lookup key, not a secret. It is validated by RE-DERIVING it from the caller's own
-- auth.uid(), so guessing or stealing one buys nothing.
CREATE OR REPLACE FUNCTION public.buddy_pair_token(p_from uuid, p_to uuid)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT md5('sbud:' || p_from::text || ':' || p_to::text);
$$;

CREATE OR REPLACE FUNCTION public.buddy_matches()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_me_n int;
    v_me_last timestamptz;
    v_rows jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('rows', '[]'::jsonb, 'reason', 'not_signed_in');
    END IF;

    -- You only get to see people if you are visible yourself. Symmetry is the whole
    -- deal: no browsing the room from behind a curtain.
    IF NOT EXISTS (SELECT 1 FROM study_buddy_prefs WHERE user_id = v_uid AND opted_in) THEN
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
          -- Anyone already in a conversation with me — pending, accepted, declined or
          -- cancelled — never resurfaces as a suggestion.
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
        -- Proximity first, then whoever is actually still showing up. With ~98 people
        -- in the pool an exact-position match usually does not exist, so the window is
        -- deliberately the whole pool ranked by distance rather than a hard band —
        -- otherwise most learners would open this to an empty screen.
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

    RETURN jsonb_build_object(
        'rows',   coalesce(v_rows, '[]'::jsonb),
        'reason', CASE WHEN v_rows IS NULL THEN 'no_candidates' ELSE 'ok' END,
        'my_lessons', v_me_n,
        'my_stage',   buddy_stage_label(v_me_n)
    );
END;
$$;

-- ============================================================================
-- 5. REQUEST / RESPOND
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buddy_request(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_target uuid;
    v_today int;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM study_buddy_prefs WHERE user_id = v_uid AND opted_in) THEN
        RAISE EXCEPTION 'not opted in' USING ERRCODE = '42501';
    END IF;

    -- Resolve the opaque token back to a user. Only tokens minted FOR THIS CALLER
    -- resolve, so a token copied from someone else's session is inert. Restricting the
    -- search to opted-in profiles means a stale token cannot reach someone who left.
    SELECT p.user_id INTO v_target
      FROM study_buddy_prefs p
     WHERE p.opted_in
       AND p.user_id <> v_uid
       AND buddy_pair_token(v_uid, p.user_id) = p_token
     LIMIT 1;

    IF v_target IS NULL THEN
        RAISE EXCEPTION 'match no longer available' USING ERRCODE = '22023';
    END IF;

    -- Rate limit: 3 new requests a day. This is a study portal, not a dating app.
    SELECT count(*) INTO v_today
      FROM study_buddy_requests
     WHERE requester_id = v_uid AND created_at > now() - interval '24 hours';
    IF v_today >= 3 THEN
        RAISE EXCEPTION 'daily limit reached' USING ERRCODE = '54000';
    END IF;

    -- The unique pair index makes a re-ask after a decline fail here by design.
    INSERT INTO study_buddy_requests (requester_id, target_id) VALUES (v_uid, v_target);

    RETURN jsonb_build_object('ok', true);
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_requested');
END;
$$;

-- Requests waiting for MY answer. Same masking as buddy_matches: first name only.
CREATE OR REPLACE FUNCTION public.buddy_incoming()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

    RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

-- The consent gate. Contact details are created by THIS call and nothing else.
CREATE OR REPLACE FUNCTION public.buddy_respond(p_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_req study_buddy_requests%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
    END IF;

    -- Only the TARGET may answer, and only while it is still pending.
    SELECT * INTO v_req FROM study_buddy_requests
     WHERE id = p_id AND target_id = v_uid AND status = 'pending'
     FOR UPDATE;

    IF v_req.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    UPDATE study_buddy_requests
       SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
           responded_at = now()
     WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'accepted', p_accept);
END;
$$;

-- Cancel a request I sent that has not been answered yet.
CREATE OR REPLACE FUNCTION public.buddy_cancel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
    END IF;
    DELETE FROM study_buddy_requests
     WHERE id = p_id AND requester_id = v_uid AND status = 'pending';
    RETURN jsonb_build_object('ok', FOUND);
END;
$$;

-- ============================================================================
-- 6. CONNECTIONS — the only place a phone number is ever returned
-- ============================================================================
-- Reachable exclusively through an 'accepted' row, which only the target can create.
-- Both people therefore said yes: one by asking, one by accepting. The full name
-- appears only here, for the same reason.
CREATE OR REPLACE FUNCTION public.buddy_connections()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

    RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

-- ============================================================================
-- 7. GRANTS — authenticated only, never anon
-- ============================================================================
DO $$
DECLARE fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.buddy_status()',
        'public.buddy_set_opt_in(boolean)',
        'public.buddy_matches()',
        'public.buddy_request(text)',
        'public.buddy_incoming()',
        'public.buddy_respond(uuid, boolean)',
        'public.buddy_cancel(uuid)',
        'public.buddy_connections()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- Internal helpers: never callable from the browser. buddy_lessons_done in particular
-- is SECURITY DEFINER over another user's progress — it must stay server-side only.
REVOKE ALL ON FUNCTION public.buddy_lessons_done(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buddy_last_active(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buddy_pair_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
