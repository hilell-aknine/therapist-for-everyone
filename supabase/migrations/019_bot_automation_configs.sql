-- Migration 019: Bot Automation Configs
-- Stores enable/disable state and configurable parameters for each CRM bot automation.
-- The bot reads this table (with 5-min cache) before running any scheduled task.

CREATE TABLE IF NOT EXISTS bot_automation_configs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('reports', 'pipelines', 'followups', 'monitoring', 'export')),
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'fa-robot',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  params JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE bot_automation_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_automation_configs" ON bot_automation_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "service_read_automation_configs" ON bot_automation_configs
  FOR SELECT USING (auth.role() = 'service_role');

-- Seed: 14 automations
INSERT INTO bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params) VALUES
  ('morning_briefing',      'reports',    'תקציר בוקר',              'סיכום קצר של מה מחכה היום — לידים, מטופלים, פגישות',               'כל יום 08:30',      'fa-sun',                    true, '{}'),
  ('daily_summary',         'reports',    'סיכום יומי',              'סיכום AI של כל מה שקרה היום בעסק',                                 'כל יום 20:00',      'fa-chart-line',             true, '{}'),
  ('weekly_report',         'reports',    'דוח שבועי',               'ניתוח AI של השבוע עם מגמות ותובנות',                               'יום ראשון 09:30',   'fa-chart-bar',              true, '{}'),
  ('lead_nurture',          'pipelines',  'טיפוח לידים',             'תזכורת כשלידים חדשים לא קיבלו מענה',                               'כל 2 שעות',         'fa-user-clock',             true, '{"leadAutoContactHours":1,"leadStaleHours":48}'),
  ('patient_auto_match',    'pipelines',  'שיבוץ אוטומטי',           'הצעת מטפל מתאים למטופלים שמחכים',                                  'כל 2 שעות',         'fa-people-arrows',          true, '{"patientAutoMatchHours":4}'),
  ('post_appointment',      'pipelines',  'מעקב פוסט-פגישה',         'תזכורת מעקב אחרי פגישות שהושלמו',                                 'כל 2 שעות',         'fa-clipboard-check',        true, '{"postAppointmentHours":24}'),
  ('patient_welcome',       'followups',  'ברוכים הבאים — מטופל',    'הודעת וואטסאפ אוטומטית למטופל חדש',                                '4 פעמים ביום',      'fa-hand-holding-heart',     true, '{}'),
  ('therapist_welcome',     'followups',  'ברוכים הבאים — מטפל',     'הודעה והסבר למטפל שאושר',                                          '4 פעמים ביום',      'fa-user-doctor',            true, '{}'),
  ('post_treatment',        'followups',  'מעקב אחרי טיפול',        'שאלת "מה שלומך" שבוע אחרי סיום טיפול',                             '4 פעמים ביום',      'fa-heart-pulse',            true, '{}'),
  ('payment_reminders',     'followups',  'תזכורות תשלום',           'התראה על תשלומים שעברו 7+ ימים',                                   '4 פעמים ביום',      'fa-shekel-sign',            true, '{"overdueDays":7}'),
  ('appointment_reminders', 'monitoring', 'תזכורות פגישה',           'הודעה למטופל 2-3 שעות לפני פגישה',                                 'כל 30 דקות',        'fa-calendar-check',         true, '{}'),
  ('new_lead_polling',      'monitoring', 'זיהוי לידים חדשים',       'סריקת לידים חדשים מהאתר בזמן אמת',                                'כל 2 דקות',         'fa-bell',                   true, '{}'),
  ('proactive_alerts',      'monitoring', 'התראות עסקיות',           'לידים ישנים, מטופלים ללא שיבוץ, מטפלים פנויים, תשלומים באיחור',    'כל יום 09:00',      'fa-triangle-exclamation',   true, '{}'),
  ('monthly_export',        'export',     'ייצוא חודשי',             'ייצוא CSV אוטומטי של כל הנתונים',                                  '1 בחודש 06:00',     'fa-file-csv',               true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Notify PostgREST to reload schema
SELECT public.reload_pgrst();
