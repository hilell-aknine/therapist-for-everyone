-- Migration: watch time per lesson + daily portal visits + completion-event RLS fix
-- Date: 2026-10-29 (request 6, approved by Hillel)
--
-- 1. lesson_completion_events had RLS on but only the community-bot read policy:
--    migration 20260601120000 was never applied, so every browser INSERT was
--    silently denied and the table holds 0 rows. Re-create its three policies.
-- 2. add_watch_seconds(): adds real PLAYING seconds to course_progress.watched_seconds
--    on the learner's own lesson row. `last_watched_*` bookkeeping rows reuse that
--    column for a module index, so they are refused here.
-- 3. portal_visits + log_portal_visit(): one row per learner per Israel-local day
--    (first/last time + page loads). Written only through the RPC.

-- ── 1. lesson_completion_events ───────────────────────────────────────────────
DROP POLICY IF EXISTS "users_insert_own_completion_event" ON public.lesson_completion_events;
CREATE POLICY "users_insert_own_completion_event" ON public.lesson_completion_events
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_select_own_completion_events" ON public.lesson_completion_events;
CREATE POLICY "users_select_own_completion_events" ON public.lesson_completion_events
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_completion_events" ON public.lesson_completion_events;
CREATE POLICY "admin_select_all_completion_events" ON public.lesson_completion_events
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- ── 2. watch time ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_watch_seconds(p_video_id text, p_course_type text, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;
    IF p_video_id IS NULL OR p_video_id = '' OR p_video_id LIKE 'last_watched%' OR length(p_video_id) > 64 THEN RETURN; END IF;
    IF p_course_type NOT IN ('nlp-practitioner', 'nlp-master', 'nlp-techniques') THEN RETURN; END IF;
    IF p_seconds IS NULL OR p_seconds < 1 THEN RETURN; END IF;

    INSERT INTO course_progress (user_id, video_id, course_type, watched_seconds)
    VALUES (v_uid, p_video_id, p_course_type, least(p_seconds, 120))
    ON CONFLICT (user_id, video_id) DO UPDATE
        SET watched_seconds = coalesce(course_progress.watched_seconds, 0) + excluded.watched_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.add_watch_seconds(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_watch_seconds(text, text, integer) TO authenticated;

-- ── 3. portal visits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_visits (
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_date date NOT NULL,
    first_at   timestamptz NOT NULL DEFAULT now(),
    last_at    timestamptz NOT NULL DEFAULT now(),
    hits       integer NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, visit_date)
);

ALTER TABLE public.portal_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_visits FROM anon, authenticated;
GRANT SELECT ON public.portal_visits TO authenticated;

DROP POLICY IF EXISTS "admin_select_portal_visits" ON public.portal_visits;
CREATE POLICY "admin_select_portal_visits" ON public.portal_visits
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE OR REPLACE FUNCTION public.log_portal_visit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;
    INSERT INTO portal_visits (user_id, visit_date)
    VALUES (v_uid, (now() AT TIME ZONE 'Asia/Jerusalem')::date)
    ON CONFLICT (user_id, visit_date) DO UPDATE
        SET last_at = now(), hits = portal_visits.hits + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.log_portal_visit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_portal_visit() TO authenticated;
