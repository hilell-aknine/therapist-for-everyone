-- ============================================================================
-- Migration 056: Cross-device popup dismissal persistence
-- ============================================================================
-- Before: dismissals stored in localStorage only. Dismiss on phone, see again
-- on laptop. Now persisted in Supabase and merged into popupHistory on login.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.popup_dismissals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    popup_id TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ DEFAULT now(),
    dismissal_date DATE GENERATED ALWAYS AS ((dismissed_at AT TIME ZONE 'Asia/Jerusalem')::date) STORED,
    UNIQUE (user_id, popup_id, dismissal_date)
);

-- Fast lookup for "what did this user dismiss today?"
CREATE INDEX IF NOT EXISTS idx_popup_dismissals_user_date
    ON public.popup_dismissals (user_id, dismissal_date DESC);

ALTER TABLE public.popup_dismissals ENABLE ROW LEVEL SECURITY;

-- User can insert/select their own dismissals
CREATE POLICY "Users manage own dismissals"
    ON public.popup_dismissals FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Admin can read all dismissals (for analytics)
CREATE POLICY "Admins view all dismissals"
    ON public.popup_dismissals FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMENT ON TABLE public.popup_dismissals IS
    'Cross-device popup dismissal persistence. One row per (user, popup, day in Israel timezone). Read by PopupManager on auth to merge into localStorage popup_history so dismissals persist across devices.';
