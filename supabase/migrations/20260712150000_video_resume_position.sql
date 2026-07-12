-- Resume playback at the exact second, on any device.
--
-- Until now the *lesson* a learner last watched was persisted (the `last_watched_<course>`
-- sentinel row), but the *position inside that lesson* lived only in the browser's
-- localStorage. So "המשך צפייה" opened the right video and then started it at 0:00 for
-- anyone on a second device, a different browser, or after clearing site data.
--
-- This column gives the position a home on the server, next to the rest of the progress.

ALTER TABLE public.course_progress
  ADD COLUMN IF NOT EXISTS position_seconds INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.course_progress.position_seconds IS
  'Last playback position in seconds for this video. 0 = start from the beginning (unwatched, or finished).';

-- Cheap lookup of "all my saved positions" on portal load.
CREATE INDEX IF NOT EXISTS idx_course_progress_position
  ON public.course_progress (user_id)
  WHERE position_seconds > 0;
