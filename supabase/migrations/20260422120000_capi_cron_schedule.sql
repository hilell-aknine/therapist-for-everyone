-- pg_cron: call capi-queue-processor Edge Function every minute.
-- Processes pending Meta CAPI events from capi_event_queue table.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job if re-running (idempotent)
DO $$ BEGIN
  PERFORM cron.unschedule('capi-queue-process');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: every minute
SELECT cron.schedule(
    'capi-queue-process',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1/capi-queue-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw'
        ),
        body := '{}'::jsonb
    );
    $$
);
