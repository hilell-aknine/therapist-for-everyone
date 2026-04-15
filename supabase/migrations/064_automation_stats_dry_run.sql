-- ============================================================================
-- 064_automation_stats_dry_run
-- Extend admin_automations_stats() to surface dry_run activity alongside sent.
-- Fixes a UX trap where admins could not tell the difference between
-- "rule isn't firing" and "rule is firing but in test mode" from the card view.
-- Existing 'sent_*' columns are unchanged — purely additive.
-- Must DROP first: Postgres cannot CREATE OR REPLACE a function whose RETURNS
-- TABLE signature changed (we're adding dry_runs_7d column).
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_automations_stats();

CREATE OR REPLACE FUNCTION public.admin_automations_stats()
RETURNS TABLE (
    rule_id      UUID,
    total_sent   BIGINT,
    sent_today   BIGINT,
    sent_7d      BIGINT,
    failed_7d    BIGINT,
    dry_runs_7d  BIGINT,
    last_fired   TIMESTAMPTZ
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
        COUNT(*) FILTER (WHERE r.status = 'sent'    AND r.fired_at >= now() - interval '7 days')::BIGINT AS sent_7d,
        COUNT(*) FILTER (WHERE r.status = 'failed'  AND r.fired_at >= now() - interval '7 days')::BIGINT AS failed_7d,
        COUNT(*) FILTER (WHERE r.status = 'dry_run' AND r.fired_at >= now() - interval '7 days')::BIGINT AS dry_runs_7d,
        MAX(r.fired_at) AS last_fired
    FROM public.automation_runs r
    GROUP BY r.rule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_automations_stats() TO authenticated;
