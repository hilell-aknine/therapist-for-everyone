-- ============================================================================
-- Migration 059: Fix partial-update bug in admin_automations_upsert
--
-- The original RPC (migration 058) wrapped most fields in COALESCE so that
-- a missing key in the JSON payload preserves the existing column value:
--     is_enabled = COALESCE((rule->>'is_enabled')::BOOLEAN, is_enabled)
--
-- But `name` and `description` were assigned without COALESCE:
--     name        = rule->>'name'         -- becomes NULL if key absent
--     description = rule->>'description'  -- ditto
--
-- The toggle button in the admin UI (admin-automations.js:502) sends a
-- partial payload `{ id, is_enabled }` for fast on/off flips. Without
-- COALESCE on `name`, the UPDATE rewrites `name` to NULL and the NOT NULL
-- constraint rejects the whole row — so toggling silently fails on every
-- click.
--
-- This migration replaces the function with the COALESCE-everywhere version.
-- The full-rule save path is unaffected because saveAutomation() already
-- guarantees `name` is non-empty before sending.
-- ============================================================================

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
            name            = COALESCE(rule->>'name', name),
            description     = COALESCE(rule->>'description', description),
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
