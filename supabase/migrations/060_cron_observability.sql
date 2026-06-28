-- ============================================================================
-- Migration 060: Workflow Observability — "see inside the black box" of cron
--
-- Surfaces the scheduled automations that run via pg_cron (capi-queue-process,
-- meta-ads-daily-spend, smart_automations_tick, ...) to the admin dashboard:
-- which jobs exist, their schedule, last run status, and per-run history with
-- the actual return message — so a failed night run is visible instead of
-- silent.
--
-- The data lives in the `cron` schema (cron.job + cron.job_run_details), which
-- PostgREST does NOT expose. Admin reaches it through SECURITY DEFINER RPCs
-- that verify profiles.role='admin' — the SAME pattern as migrations 051/058.
--
-- Security: return_message and command can carry the cron HTTP Authorization
-- header (anon Bearer token). We redact any `Bearer <token>` before returning
-- so the panel never prints a credential, and we surface only the target
-- function name (functions/v1/<name>) instead of the raw SQL command.
-- ============================================================================

-- ─── Job list + folded last-run summary + 7-day stats (one round-trip) ──────
CREATE OR REPLACE FUNCTION public.admin_cron_jobs()
RETURNS TABLE (
    jobid       BIGINT,
    jobname     TEXT,
    schedule    TEXT,
    active      BOOLEAN,
    target      TEXT,
    last_status TEXT,
    last_start  TIMESTAMPTZ,
    last_message TEXT,
    runs_24h    BIGINT,
    success_7d  BIGINT,
    failed_7d   BIGINT,
    avg_ms      NUMERIC
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
        j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        COALESCE(
            substring(j.command FROM 'functions/v1/([a-z0-9_-]+)'),
            'משימת SQL פנימית'
        ) AS target,
        lr.status AS last_status,
        lr.start_time AS last_start,
        LEFT(regexp_replace(COALESCE(lr.return_message, ''),
             'Bearer[[:space:]]+[A-Za-z0-9._-]+', 'Bearer ***', 'g'), 300) AS last_message,
        COALESCE(s.runs_24h, 0)   AS runs_24h,
        COALESCE(s.success_7d, 0) AS success_7d,
        COALESCE(s.failed_7d, 0)  AS failed_7d,
        s.avg_ms
    FROM cron.job j
    LEFT JOIN LATERAL (
        SELECT d.status, d.start_time, d.return_message
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid
        ORDER BY d.start_time DESC NULLS LAST
        LIMIT 1
    ) lr ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            count(*) FILTER (WHERE d.start_time >= now() - interval '24 hours') AS runs_24h,
            count(*) FILTER (WHERE d.status = 'succeeded' AND d.start_time >= now() - interval '7 days') AS success_7d,
            count(*) FILTER (WHERE d.status = 'failed'    AND d.start_time >= now() - interval '7 days') AS failed_7d,
            round(avg(extract(epoch FROM (d.end_time - d.start_time)) * 1000)
                  FILTER (WHERE d.end_time IS NOT NULL AND d.start_time >= now() - interval '7 days')) AS avg_ms
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid
    ) s ON TRUE
    ORDER BY j.active DESC, lr.start_time DESC NULLS LAST;
END;
$$;

-- ─── Per-job run history (drill-down timeline) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_cron_runs(p_jobid BIGINT, max_rows INT DEFAULT 25)
RETURNS TABLE (
    runid          BIGINT,
    status         TEXT,
    return_message TEXT,
    start_time     TIMESTAMPTZ,
    end_time       TIMESTAMPTZ,
    duration_ms    NUMERIC
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
        d.runid,
        d.status,
        LEFT(regexp_replace(COALESCE(d.return_message, ''),
             'Bearer[[:space:]]+[A-Za-z0-9._-]+', 'Bearer ***', 'g'), 500) AS return_message,
        d.start_time,
        d.end_time,
        round(extract(epoch FROM (d.end_time - d.start_time)) * 1000) AS duration_ms
    FROM cron.job_run_details d
    WHERE d.jobid = p_jobid
    ORDER BY d.start_time DESC NULLS LAST
    LIMIT max_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cron_jobs()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_runs(BIGINT, INT)    TO authenticated;
