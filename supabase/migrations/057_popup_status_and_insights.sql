-- ============================================================================
-- Migration 057: Popup lifecycle status + insights log
-- ============================================================================
-- Adds:
--   1. popup_configs.status — draft/scheduled/live/paused/archived lifecycle
--   2. popup_insights_log — append-only log for Claude Code observations,
--      admin notes, and optimization recommendations (the "Claude can check
--      and give recommendations" hook the user asked for)
-- ============================================================================

-- 1. Status enum on popup_configs
ALTER TABLE public.popup_configs
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'live'
    CHECK (status IN ('draft', 'scheduled', 'live', 'paused', 'archived'));

-- Backfill: existing rows with is_active=true → 'live', false → 'paused'
UPDATE public.popup_configs
    SET status = CASE WHEN is_active THEN 'live' ELSE 'paused' END
    WHERE status IS NULL OR status = 'live';

CREATE INDEX IF NOT EXISTS idx_popup_configs_status
    ON public.popup_configs (status)
    WHERE status IN ('live', 'scheduled');

-- 2. Insights log — append-only log of observations and recommendations
-- Claude Code writes here when analyzing popup performance. Admin writes here
-- when recording hypotheses or experiment results. Creates a running narrative
-- of "what we tried, what we learned, what to try next".
CREATE TABLE IF NOT EXISTS public.popup_insights_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    popup_id TEXT,                    -- NULL = global/cross-popup insight
    kind TEXT NOT NULL CHECK (kind IN ('observation', 'hypothesis', 'recommendation', 'experiment_result', 'note')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,               -- Markdown allowed
    metrics_snapshot JSONB,           -- Optional: shown/clicked/ctr/dismiss_rate at time of writing
    author TEXT NOT NULL DEFAULT 'admin' CHECK (author IN ('admin', 'claude_code', 'system')),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_popup_insights_popup_created
    ON public.popup_insights_log (popup_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_popup_insights_kind
    ON public.popup_insights_log (kind, created_at DESC);

ALTER TABLE public.popup_insights_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write
CREATE POLICY "Admins manage popup insights"
    ON public.popup_insights_log FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMENT ON TABLE public.popup_insights_log IS
    'Append-only log of popup performance observations, hypotheses, and recommendations. Written by admin and by Claude Code (author=claude_code) when running analysis via docs/popup-insights.md playbook. Read by admin dashboard to show "what we know so far" timeline per popup.';
COMMENT ON COLUMN public.popup_insights_log.metrics_snapshot IS
    'JSON snapshot of key metrics at time of writing, e.g. {"shown": 1240, "ctr": 8.3, "dismiss_rate": 52.1, "period_days": 30}. Used to reconstruct the state that led to a recommendation.';
