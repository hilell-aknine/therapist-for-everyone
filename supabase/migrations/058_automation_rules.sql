-- ============================================================================
-- Migration 058: Smart Automations — Rule Builder
--
-- Lets the admin author IF/THEN rules from the dashboard ("send WhatsApp to
-- anyone who completed > 5 lessons", etc) without code changes.
--
-- Tables:
--   automation_rules — the rule definitions (audience filter + action template)
--   automation_runs  — per-message audit log (drives cooldown + history view)
--
-- Access: tables locked to service-role only via RLS (false). Admin UI
-- reaches them through SECURITY DEFINER RPCs that verify profiles.role='admin'.
-- This is the same pattern as migration 051 (admin_get_*_full).
-- ============================================================================

-- ─── TABLES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automation_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    is_enabled      BOOLEAN NOT NULL DEFAULT false,
    dry_run         BOOLEAN NOT NULL DEFAULT true,
    trigger_type    TEXT NOT NULL DEFAULT 'schedule' CHECK (trigger_type IN ('schedule','event')),
    trigger_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
    audience_filter JSONB NOT NULL DEFAULT '{"all":[]}'::jsonb,
    action_type     TEXT NOT NULL DEFAULT 'whatsapp' CHECK (action_type IN ('whatsapp')),
    action_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
    cooldown_days   INT  NOT NULL DEFAULT 9999,
    daily_cap       INT  NOT NULL DEFAULT 100,
    last_run_at     TIMESTAMPTZ,
    last_run_status TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
    user_id       UUID,
    phone         TEXT,
    fired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status        TEXT NOT NULL CHECK (status IN ('sent','skipped','failed','dry_run')),
    message_text  TEXT,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_rule_user_status ON public.automation_runs(rule_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_rule_fired       ON public.automation_runs(rule_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_rules_enabled         ON public.automation_rules(is_enabled) WHERE is_enabled = true;

-- ─── RLS — service role only (admin UI uses RPCs below) ──────────────────

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.automation_rules;
DROP POLICY IF EXISTS "service role only" ON public.automation_runs;

CREATE POLICY "service role only" ON public.automation_rules FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "service role only" ON public.automation_runs  FOR ALL USING (false) WITH CHECK (false);

-- ─── ADMIN RPCs (SECURITY DEFINER, role check inside) ────────────────────

CREATE OR REPLACE FUNCTION public.admin_automations_list()
RETURNS SETOF public.automation_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY SELECT * FROM public.automation_rules ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_automations_upsert(rule JSONB)
RETURNS public.automation_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result public.automation_rules;
    rule_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    rule_id := NULLIF(rule->>'id','')::UUID;

    IF rule_id IS NULL THEN
        INSERT INTO public.automation_rules (
            name, description, is_enabled, dry_run, trigger_type, trigger_config,
            audience_filter, action_type, action_config, cooldown_days, daily_cap, created_by
        ) VALUES (
            rule->>'name',
            rule->>'description',
            COALESCE((rule->>'is_enabled')::BOOLEAN, false),
            COALESCE((rule->>'dry_run')::BOOLEAN, true),
            COALESCE(rule->>'trigger_type','schedule'),
            COALESCE(rule->'trigger_config','{}'::jsonb),
            COALESCE(rule->'audience_filter','{"all":[]}'::jsonb),
            COALESCE(rule->>'action_type','whatsapp'),
            COALESCE(rule->'action_config','{}'::jsonb),
            COALESCE((rule->>'cooldown_days')::INT, 9999),
            COALESCE((rule->>'daily_cap')::INT, 100),
            auth.uid()
        )
        RETURNING * INTO result;
    ELSE
        UPDATE public.automation_rules SET
            name            = rule->>'name',
            description     = rule->>'description',
            is_enabled      = COALESCE((rule->>'is_enabled')::BOOLEAN, is_enabled),
            dry_run         = COALESCE((rule->>'dry_run')::BOOLEAN, dry_run),
            trigger_type    = COALESCE(rule->>'trigger_type', trigger_type),
            trigger_config  = COALESCE(rule->'trigger_config', trigger_config),
            audience_filter = COALESCE(rule->'audience_filter', audience_filter),
            action_type     = COALESCE(rule->>'action_type', action_type),
            action_config   = COALESCE(rule->'action_config', action_config),
            cooldown_days   = COALESCE((rule->>'cooldown_days')::INT, cooldown_days),
            daily_cap       = COALESCE((rule->>'daily_cap')::INT, daily_cap),
            updated_at      = now()
        WHERE id = rule_id
        RETURNING * INTO result;
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_automations_delete(rule_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    DELETE FROM public.automation_rules WHERE id = rule_id;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_automations_runs(rule_id UUID, max_rows INT DEFAULT 50)
RETURNS SETOF public.automation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY
    SELECT * FROM public.automation_runs
    WHERE automation_runs.rule_id = admin_automations_runs.rule_id
    ORDER BY fired_at DESC
    LIMIT max_rows;
END;
$$;

-- Stats: per-rule counters for the list view (today's sends, lifetime, last 7 days)
CREATE OR REPLACE FUNCTION public.admin_automations_stats()
RETURNS TABLE (
    rule_id UUID,
    total_sent BIGINT,
    sent_today BIGINT,
    sent_7d BIGINT,
    failed_7d BIGINT,
    last_fired TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY
    SELECT
        r.rule_id,
        COUNT(*) FILTER (WHERE r.status = 'sent')::BIGINT AS total_sent,
        COUNT(*) FILTER (WHERE r.status = 'sent' AND r.fired_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem'))::BIGINT AS sent_today,
        COUNT(*) FILTER (WHERE r.status = 'sent' AND r.fired_at >= now() - interval '7 days')::BIGINT AS sent_7d,
        COUNT(*) FILTER (WHERE r.status = 'failed' AND r.fired_at >= now() - interval '7 days')::BIGINT AS failed_7d,
        MAX(r.fired_at) AS last_fired
    FROM public.automation_runs r
    GROUP BY r.rule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_automations_list()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automations_upsert(JSONB)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automations_delete(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automations_runs(UUID,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automations_stats()        TO authenticated;

-- ─── REGISTER the new cron handler in bot_automation_configs ──────────────
-- The crm-bot scheduler reads bot_automation_configs to know which handlers
-- to schedule. We register smart_automations_tick as enabled by default with
-- an every-minute cron — it's lightweight (early-exit if no rules enabled)
-- and the per-rule cron logic lives inside the handler.
INSERT INTO public.bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params)
VALUES (
    'smart_automations_tick',
    'operations',
    'מנוע אוטומציות חכמות',
    'מריץ את הכללים של "אוטומציות חכמות" — שולח WhatsApp לפי כללי IF/THEN שמוגדרים בלשונית הייעודית',
    'כל דקה (לוגיקה פנימית פר-כלל)',
    'fa-bolt',
    true,
    '{"cron":"* * * * *"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
