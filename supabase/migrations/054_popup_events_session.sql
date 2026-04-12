-- ============================================================================
-- Migration 054: Anonymous popup event tracking via session_id
-- ============================================================================
-- Unlocks measurement for unauthenticated popups (auth_modal, auth_wall,
-- video_toast). Before this, all guest interactions were silently dropped.
-- ============================================================================

-- 1. Add session_id column for anonymous event correlation
ALTER TABLE public.popup_events
    ADD COLUMN IF NOT EXISTS session_id TEXT;

-- 2. Add variant column for A/B testing (forward-compat with migration 055)
ALTER TABLE public.popup_events
    ADD COLUMN IF NOT EXISTS variant TEXT;

-- 3. Index for dashboard aggregation (7-day trend, conversion funnels)
CREATE INDEX IF NOT EXISTS idx_popup_events_session
    ON public.popup_events (session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- 4. Update RLS: allow ANONYMOUS inserts when user_id IS NULL AND session_id is present
-- The existing policy "Users can log own popup events" only covers authenticated users.
DROP POLICY IF EXISTS "Anonymous users can log popup events with session" ON public.popup_events;
CREATE POLICY "Anonymous users can log popup events with session"
    ON public.popup_events FOR INSERT
    WITH CHECK (
        -- Authenticated path: user_id must match auth.uid()
        (auth.uid() IS NOT NULL AND auth.uid() = user_id)
        OR
        -- Anonymous path: no user_id, but session_id must be present
        (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL AND length(session_id) BETWEEN 8 AND 128)
    );

-- 5. Drop the old authenticated-only INSERT policy (replaced by the combined one above)
DROP POLICY IF EXISTS "Users can log own popup events" ON public.popup_events;

-- 6. Allow anonymous SELECT? NO. Admin-only SELECT remains (existing policy unchanged).

-- 7. Comment for documentation
COMMENT ON COLUMN public.popup_events.session_id IS
    'Anonymous session identifier (UUID). Set when user_id IS NULL. Used to correlate guest popup interactions across the same browser session.';
COMMENT ON COLUMN public.popup_events.variant IS
    'A/B test variant label. NULL for single-variant popups. See migration 055.';
