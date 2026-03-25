-- ============================================================================
-- Migration 044: Popup management tables
-- ============================================================================

-- Popup configurations — admin-editable popup definitions
CREATE TABLE IF NOT EXISTS public.popup_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    popup_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    cta_text TEXT,
    cta_link TEXT,
    category TEXT DEFAULT 'engagement' CHECK (category IN ('critical', 'engagement', 'info')),
    priority INTEGER DEFAULT 4 CHECK (priority BETWEEN 1 AND 5),
    is_active BOOLEAN DEFAULT true,
    max_per_day INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 5,
    trigger_condition JSONB,
    target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'authenticated', 'unauthenticated', 'paid_customer')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.popup_configs ENABLE ROW LEVEL SECURITY;

-- Admin can read/write
CREATE POLICY "Admins can manage popup configs"
    ON public.popup_configs FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Authenticated users can read active configs (for PopupManager to fetch)
CREATE POLICY "Authenticated users can read active popup configs"
    ON public.popup_configs FOR SELECT
    USING (auth.role() = 'authenticated' AND is_active = true);

-- Popup events — lightweight tracking
CREATE TABLE IF NOT EXISTS public.popup_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    popup_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'dismissed', 'clicked', 'timeout')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for aggregation queries
CREATE INDEX idx_popup_events_popup_created ON public.popup_events (popup_id, created_at DESC);
CREATE INDEX idx_popup_events_type ON public.popup_events (event_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.popup_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own events
CREATE POLICY "Users can log own popup events"
    ON public.popup_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admin can read all events
CREATE POLICY "Admins can view all popup events"
    ON public.popup_events FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Seed default popup configs for existing hardcoded popups
INSERT INTO public.popup_configs (popup_id, title, message, category, priority, is_active, max_per_day, cooldown_minutes, target_audience) VALUES
    ('cookie_consent', 'הסכמת עוגיות', 'האתר משתמש בעוגיות', 'critical', 1, true, 1, 0, 'all'),
    ('auth_modal', 'הרשמה/התחברות', 'קבלו גישה מלאה בחינם', 'critical', 2, true, 99, 0, 'unauthenticated'),
    ('ai_questionnaire', 'שאלון AI', 'התאימו את המורה AI שלכם', 'engagement', 3, true, 1, 30, 'authenticated'),
    ('share_prompt', 'הנעה לשיתוף', 'נהנית מהשיעור? שתפו עם חבר', 'engagement', 4, true, 1, 5, 'authenticated'),
    ('video_toast', 'הרשמה בזמן צפייה', 'הירשמו כדי להמשיך ללמוד', 'info', 5, true, 1, 30, 'unauthenticated')
ON CONFLICT (popup_id) DO NOTHING;
