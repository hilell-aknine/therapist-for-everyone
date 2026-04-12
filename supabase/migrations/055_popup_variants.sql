-- ============================================================================
-- Migration 055: A/B testing variants for popups
-- ============================================================================
-- Lets admin create multiple popups with the same variant_group. PopupManager
-- picks one variant per session (sticky), and popup_events records which one
-- was shown so admin dashboard can compare CTR side-by-side.
-- ============================================================================

-- 1. Group popups into experiments (e.g. 'share_prompt_test_apr26')
ALTER TABLE public.popup_configs
    ADD COLUMN IF NOT EXISTS variant_group TEXT;

-- 2. Human-readable variant label for the dashboard (e.g. 'A', 'B', 'control')
ALTER TABLE public.popup_configs
    ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- 3. Admin notes for Claude Code analysis (the insights playbook hook)
-- This is the "admin notes" field the user asked for: every popup can carry
-- free-form notes about hypotheses, experiment context, what to watch for.
-- Claude Code reads this field when generating optimization recommendations.
ALTER TABLE public.popup_configs
    ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- 4. Index on variant_group for fast experiment lookups
CREATE INDEX IF NOT EXISTS idx_popup_configs_variant_group
    ON public.popup_configs (variant_group)
    WHERE variant_group IS NOT NULL;

COMMENT ON COLUMN public.popup_configs.variant_group IS
    'Groups popups into an A/B test. All popups with the same variant_group + active are candidates. PopupManager picks one sticky per session.';
COMMENT ON COLUMN public.popup_configs.variant_label IS
    'Short human label for dashboard comparison (e.g. "A", "B", "control", "short_copy").';
COMMENT ON COLUMN public.popup_configs.admin_notes IS
    'Free-form notes from admin: hypotheses, experiment context, metrics to watch, links to related popups. Read by Claude Code when generating optimization recommendations via docs/popup-insights.md playbook.';
