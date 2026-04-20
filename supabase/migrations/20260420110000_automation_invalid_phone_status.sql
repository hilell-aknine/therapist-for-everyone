-- Add 'invalid_phone' status to automation_runs for permanent 466 failures.
-- This prevents the engine from retrying numbers that aren't on WhatsApp.

-- Drop the old CHECK and add the new one with 'invalid_phone'
ALTER TABLE public.automation_runs
  DROP CONSTRAINT IF EXISTS automation_runs_status_check;

ALTER TABLE public.automation_runs
  ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('sent', 'skipped', 'failed', 'dry_run', 'invalid_phone'));

-- Index for fast lookup of invalid phones per rule
CREATE INDEX IF NOT EXISTS idx_runs_invalid_phone
  ON public.automation_runs(rule_id, user_id)
  WHERE status = 'invalid_phone';

-- Extend stats RPC: add invalid_7d column.
-- Must DROP first because RETURNS TABLE signature is changing.
DROP FUNCTION IF EXISTS public.admin_automations_stats();

CREATE OR REPLACE FUNCTION public.admin_automations_stats()
RETURNS TABLE (
    rule_id      UUID,
    total_sent   BIGINT,
    sent_today   BIGINT,
    sent_7d      BIGINT,
    failed_7d    BIGINT,
    dry_runs_7d  BIGINT,
    invalid_7d   BIGINT,
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
        COUNT(*) FILTER (WHERE r.status = 'sent'          AND r.fired_at >= now() - interval '7 days')::BIGINT AS sent_7d,
        COUNT(*) FILTER (WHERE r.status = 'failed'        AND r.fired_at >= now() - interval '7 days')::BIGINT AS failed_7d,
        COUNT(*) FILTER (WHERE r.status = 'dry_run'       AND r.fired_at >= now() - interval '7 days')::BIGINT AS dry_runs_7d,
        COUNT(*) FILTER (WHERE r.status = 'invalid_phone' AND r.fired_at >= now() - interval '7 days')::BIGINT AS invalid_7d,
        MAX(r.fired_at) AS last_fired
    FROM public.automation_runs r
    GROUP BY r.rule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_automations_stats() TO authenticated;
