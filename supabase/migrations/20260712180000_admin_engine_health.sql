-- ============================================================================
-- admin_engine_health() — the WhatsApp engine's vital signs, in one round-trip.
--
-- Migration 060 exposed pg_cron (which jobs ran). It says nothing about what the
-- engine actually DID: welcome messages queued/sent/stuck, reminder sends and
-- their failures. On 2026-07-12 three learners had been silently blacklisted for
-- 6 days and 31 people got duplicate welcomes — none of it visible anywhere in
-- the dashboard. This RPC is what would have shown it.
--
-- welcome_queue and automation_runs are service-role tables (no admin RLS SELECT
-- policy), so the admin reaches them the same way as migrations 051/060: a
-- SECURITY DEFINER function that verifies profiles.role = 'admin' itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_engine_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT jsonb_build_object(
        'welcome', (
            SELECT jsonb_build_object(
                'pending', COUNT(*) FILTER (WHERE status = 'pending'),
                'sent',    COUNT(*) FILTER (WHERE status = 'sent'),
                'failed',  COUNT(*) FILTER (WHERE status = 'failed'),
                'sent_7d', COUNT(*) FILTER (WHERE status = 'sent' AND sent_at > now() - interval '7 days'),
                'last_sent', MAX(sent_at),
                -- A row stuck in 'pending' for over an hour means the queue processor
                -- is not draining. That is the alarm; a healthy queue is always ~0.
                'stuck',   COUNT(*) FILTER (WHERE status = 'pending' AND created_at < now() - interval '1 hour')
            )
            FROM public.welcome_queue
        ),
        'reminders', (
            SELECT jsonb_build_object(
                'sent_7d',   COUNT(*) FILTER (WHERE status = 'sent'   AND fired_at > now() - interval '7 days'),
                'failed_7d', COUNT(*) FILTER (WHERE status = 'failed' AND fired_at > now() - interval '7 days'),
                'sent_24h',  COUNT(*) FILTER (WHERE status = 'sent'   AND fired_at > now() - interval '24 hours'),
                'failed_24h',COUNT(*) FILTER (WHERE status = 'failed' AND fired_at > now() - interval '24 hours'),
                'last_sent', MAX(fired_at) FILTER (WHERE status = 'sent')
            )
            FROM public.automation_runs
        ),
        -- Recent failures, phone partially masked — this panel is a health view,
        -- not a contact list.
        'recent_failures', COALESCE((
            SELECT jsonb_agg(f ORDER BY f->>'fired_at' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'fired_at', r.fired_at,
                    'phone', left(r.phone, 6) || '***' || right(r.phone, 2),
                    'rule', COALESCE(ru.name, '—'),
                    'error', left(COALESCE(r.error, ''), 160)
                ) AS f
                FROM public.automation_runs r
                LEFT JOIN public.automation_rules ru ON ru.id = r.rule_id
                WHERE r.status = 'failed' AND r.fired_at > now() - interval '30 days'
                ORDER BY r.fired_at DESC
                LIMIT 20
            ) t
        ), '[]'::jsonb),
        'rules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'name', name,
                'is_enabled', is_enabled,
                'dry_run', dry_run,
                'last_run_at', last_run_at,
                'last_run_status', last_run_status
            ) ORDER BY name)
            FROM public.automation_rules
        ), '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_engine_health() FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_engine_health() TO authenticated;
