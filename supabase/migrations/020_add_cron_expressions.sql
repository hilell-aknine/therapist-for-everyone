-- Migration 020: Add cron expressions to automation params
-- Stores actual cron expressions in params.cron so the bot can schedule dynamically.
-- The 'schedule' column remains as Hebrew display text for the admin dashboard.

UPDATE bot_automation_configs SET params = params || '{"cron": "30 8 * * *"}'::jsonb
WHERE id = 'morning_briefing';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 20 * * *"}'::jsonb
WHERE id = 'daily_summary';

UPDATE bot_automation_configs SET params = params || '{"cron": "30 9 * * 0"}'::jsonb
WHERE id = 'weekly_report';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 */2 * * *"}'::jsonb
WHERE id = 'lead_nurture';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 */2 * * *"}'::jsonb
WHERE id = 'patient_auto_match';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 */2 * * *"}'::jsonb
WHERE id = 'post_appointment';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 8,12,16,20 * * *"}'::jsonb
WHERE id = 'patient_welcome';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 8,12,16,20 * * *"}'::jsonb
WHERE id = 'therapist_welcome';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 8,12,16,20 * * *"}'::jsonb
WHERE id = 'post_treatment';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 8,12,16,20 * * *"}'::jsonb
WHERE id = 'payment_reminders';

UPDATE bot_automation_configs SET params = params || '{"cron": "*/30 * * * *"}'::jsonb
WHERE id = 'appointment_reminders';

UPDATE bot_automation_configs SET params = params || '{"cron": "*/2 * * * *"}'::jsonb
WHERE id = 'new_lead_polling';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 9 * * *"}'::jsonb
WHERE id = 'proactive_alerts';

UPDATE bot_automation_configs SET params = params || '{"cron": "0 6 1 * *"}'::jsonb
WHERE id = 'monthly_export';

SELECT public.reload_pgrst();
