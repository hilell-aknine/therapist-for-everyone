-- pg_cron: call fetch-meta-ads-spend daily at 03:00 UTC (06:00 Israel during DST,
-- 05:00 during standard time — close enough for daily spend reconciliation).
-- Pulls yesterday's campaign-level metrics from Meta Marketing API.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop existing schedule if re-running
DO $$ BEGIN
  PERFORM cron.unschedule('meta-ads-daily-spend');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'meta-ads-daily-spend',
    '0 3 * * *',
    $$
    SELECT net.http_post(
        url := 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1/fetch-meta-ads-spend?days=1',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw'
        ),
        body := '{}'::jsonb
    );
    $$
);
