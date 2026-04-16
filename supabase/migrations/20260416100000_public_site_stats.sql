-- ============================================================================
-- Migration 066: Public site stats RPC
--
-- Returns aggregate hero stats for the homepage. No auth required — only
-- exposes counts, never individual data. Replaces hardcoded 25K/70/350.
--
-- Stats returned:
--   completed_lessons — total lesson completions across all users
--   total_watch_hours — sum of watched_seconds / 3600
--   registered_learners — count of portal_questionnaires (real signups)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.public_site_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'completed_lessons', COALESCE((
            SELECT COUNT(*)::INT
            FROM public.course_progress
            WHERE completed = true
              AND (video_id IS NULL OR video_id NOT LIKE 'last_watched_%')
        ), 0),
        'total_watch_hours', COALESCE((
            SELECT ROUND(SUM(watched_seconds) / 3600.0)::INT
            FROM public.course_progress
            WHERE watched_seconds > 0
        ), 0),
        'registered_learners', COALESCE((
            SELECT COUNT(*)::INT
            FROM public.portal_questionnaires
        ), 0)
    ) INTO result;

    RETURN result;
END;
$$;

-- Allow anonymous access — only aggregate counts, no PII
GRANT EXECUTE ON FUNCTION public.public_site_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.public_site_stats() TO authenticated;
