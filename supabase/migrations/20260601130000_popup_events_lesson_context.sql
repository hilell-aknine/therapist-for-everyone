-- Migration: popup_events.lesson_identifier — lesson context on popup events
-- Date: 2026-06-01
--
-- Context (audit-2026-06-01.md): popup_events had no lesson linkage, so a
-- 'shown'/'clicked'/'dismissed' event could not be attributed to the lesson the
-- user was on ("did users who finished lesson 5 convert on the share prompt?"
-- was unanswerable without unreliable time-proximity joins).
--
-- js/popup-manager.js now sends `lesson_identifier` on every logEvent() insert
-- (value supplied by the page via PopupManager.setLessonContext()). This adds the
-- column it writes to. Nullable — events fired with no active lesson stay NULL.
--
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.

ALTER TABLE public.popup_events
    ADD COLUMN IF NOT EXISTS lesson_identifier TEXT;

-- Supports funnel queries that slice popup performance by lesson.
CREATE INDEX IF NOT EXISTS idx_popup_events_lesson
    ON public.popup_events (lesson_identifier, event_type, created_at DESC);
