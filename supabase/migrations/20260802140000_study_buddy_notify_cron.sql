-- pg_cron: drain study_buddy_notifications every 5 minutes.
--
-- ⚠️ NOT APPLIED YET — this is the go-live switch. Applying it starts the drainer;
-- the drainer still delivers nothing until study_buddy_settings.notifications_enabled
-- is set to true. Two deliberate steps, so neither one alone can start messaging
-- learners by accident.
--
-- SECURITY — why the key is not written here: buddy-notify requires a service_role
-- token (it drains a queue and sends WhatsApp). **This repository is public**, so
-- unlike the older cron migrations in this folder, the token is NOT inlined. It is read
-- at run time from Supabase Vault. Create the secret once, outside git:
--
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'buddy_notify_service_key',
--                              'service_role key used by the study-buddy cron drainer');
--
-- Rotating the key later means updating that one Vault row, not editing this file.
--
-- Cadence: every 5 minutes. A study invitation is not a chat message; five minutes is
-- indistinguishable from instant to the person receiving it, and it keeps the send rate
-- far under Green API's ~1 msg/sec ceiling. Outside the 09:00-20:00 Israel window the
-- function returns immediately and the rows simply wait for morning.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('study-buddy-notify');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'study-buddy-notify',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1/buddy-notify',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret FROM vault.decrypted_secrets
                 WHERE name = 'buddy_notify_service_key' LIMIT 1)
        ),
        body := '{}'::jsonb
    );
    $$
);
