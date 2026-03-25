-- ============================================================================
-- Migration 047: Add missing indexes to course_progress table
-- ============================================================================
-- These indexes are critical for performance as the user base grows.
-- Without them, every progress lookup scans the entire table.

CREATE INDEX IF NOT EXISTS idx_course_progress_user_id
    ON public.course_progress (user_id);

CREATE INDEX IF NOT EXISTS idx_course_progress_user_video
    ON public.course_progress (user_id, video_id);

CREATE INDEX IF NOT EXISTS idx_course_progress_course_type
    ON public.course_progress (user_id, course_type);

CREATE INDEX IF NOT EXISTS idx_course_progress_completed_at
    ON public.course_progress (completed_at DESC)
    WHERE completed = true;
