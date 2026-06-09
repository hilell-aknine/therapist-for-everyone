-- ============================================================================
-- cron: ניקוז תור הודעות הפתיחה — welcome-queue-processor כל דקה
--
-- ⚠️ הרצה ידנית בלבד דרך עורך ה-SQL של Supabase.
-- אסור להכניס תחת supabase/migrations — קיים DB freeze בפרויקט.
-- מריצים אחרי שהטבלה welcome_queue כבר נוצרה (sql/welcome_queue.sql)
-- ואחרי שהפונקציה welcome-queue-processor כבר נפרסה.
--
-- מבנה זהה בדיוק לקרון של CAPI (20260422120000_capi_cron_schedule.sql):
-- אותו net.http_post, אותה כותרת Authorization עם מפתח ה-anon, אותה תדירות.
-- כל דקה הקרון מעיר את הפונקציה, והיא מנקזת אצווה (~35 שורות) בקצב ~1.2ש'
-- בין הודעות — בטוח מתחת לתקרת Green API.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing job if re-running (idempotent)
DO $$ BEGIN
  PERFORM cron.unschedule('welcome-queue-process');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: every minute
SELECT cron.schedule(
    'welcome-queue-process',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1/welcome-queue-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw'
        ),
        body := '{}'::jsonb
    );
    $$
);
