-- Migration 021: Add 20 professional automations
-- 4 new categories: lead_lifecycle, safety, operations, retention
-- All new automations default to is_enabled = false (handlers not yet implemented)

-- Step 1: Expand category CHECK constraint
ALTER TABLE bot_automation_configs DROP CONSTRAINT IF EXISTS bot_automation_configs_category_check;
ALTER TABLE bot_automation_configs ADD CONSTRAINT bot_automation_configs_category_check
  CHECK (category IN (
    'reports', 'pipelines', 'followups', 'monitoring', 'export',
    'lead_lifecycle', 'safety', 'operations', 'retention'
  ));

-- Step 2: Insert 20 new automations
-- ══════════════════════════════════════════════════════════
-- Category: lead_lifecycle (ניהול לידים) — 5 automations
-- ══════════════════════════════════════════════════════════

INSERT INTO bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params) VALUES
  (
    'lead_first_response',
    'lead_lifecycle',
    'תגובה ראשונית ללידים',
    'התראה כשליד חדש לא קיבל מענה תוך X דקות — מונע אובדן לידים חמים',
    'כל 5 דקות',
    'fa-bolt',
    false,
    '{"cron":"*/5 * * * *","maxResponseMinutes":30}'
  ),
  (
    'lead_escalation',
    'lead_lifecycle',
    'הסלמת לידים ישנים',
    'העברת לידים שלא טופלו מעל X שעות לרשימת עדיפות גבוהה עם התראה למנהל',
    'כל 3 שעות',
    'fa-arrow-up',
    false,
    '{"cron":"0 */3 * * *","escalateAfterHours":72}'
  ),
  (
    'lead_scoring',
    'lead_lifecycle',
    'ניקוד לידים אוטומטי',
    'ניקוד אוטומטי של לידים לפי דחיפות ותוכן ההודעה — מעל X נקודות שולח התראה',
    'כל 4 שעות',
    'fa-star',
    false,
    '{"cron":"0 */4 * * *","minScoreToAlert":80}'
  ),
  (
    'lead_source_report',
    'lead_lifecycle',
    'דוח מקורות לידים',
    'ניתוח שבועי של מקורות הלידים (UTM) — מאיפה מגיעים הלידים האיכותיים',
    'יום ראשון 10:00',
    'fa-chart-simple',
    false,
    '{"cron":"0 10 * * 0"}'
  ),
  (
    'lead_duplicate_detect',
    'lead_lifecycle',
    'זיהוי לידים כפולים',
    'סריקה יומית לאיתור לידים עם טלפון או אימייל זהה — מניעת כפילויות',
    'כל יום 07:00',
    'fa-copy',
    false,
    '{"cron":"0 7 * * *"}'
  )
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- Category: safety (בטיחות וחירום) — 5 automations
-- ══════════════════════════════════════════════════════════

INSERT INTO bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params) VALUES
  (
    'emergency_keyword_scan',
    'safety',
    'סריקת מילות חירום',
    'זיהוי מילות מפתח של מצוקה בהודעות נכנסות — התראה מיידית לצוות',
    'כל 2 דקות',
    'fa-triangle-exclamation',
    false,
    '{"cron":"*/2 * * * *"}'
  ),
  (
    'inactive_patient_alert',
    'safety',
    'מטופל לא פעיל',
    'התראה כשמטופל פעיל לא נצפה בפגישה מעל X ימים — מניעת נשירה שקטה',
    'כל יום 09:00',
    'fa-user-xmark',
    false,
    '{"cron":"0 9 * * *","inactiveDays":30}'
  ),
  (
    'therapist_no_show_alert',
    'safety',
    'אי-הגעת מטפל',
    'זיהוי פגישות שבהן המטפל לא הגיע — התראה אחרי X דקות חסד',
    'כל 15 דקות',
    'fa-calendar-xmark',
    false,
    '{"cron":"*/15 * * * *","graceMinutes":15}'
  ),
  (
    'consent_expiry_check',
    'safety',
    'בדיקת תוקף הסכמות',
    'סריקה שבועית של טפסי הסכמה שפג תוקפם — חובה משפטית',
    'יום שני 08:00',
    'fa-file-signature',
    false,
    '{"cron":"0 8 * * 1","expiryDays":365}'
  ),
  (
    'safety_daily_digest',
    'safety',
    'דוח בטיחות יומי',
    'סיכום יומי של אירועי בטיחות — אי-הגעות, מטופלים לא פעילים, הסכמות',
    'כל יום 21:00',
    'fa-shield-halved',
    false,
    '{"cron":"0 21 * * *"}'
  )
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- Category: operations (תפעול שוטף) — 5 automations
-- ══════════════════════════════════════════════════════════

INSERT INTO bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params) VALUES
  (
    'therapist_availability_check',
    'operations',
    'בדיקת זמינות מטפלים',
    'סריקה יומית של סטטוס מטפלים — מי פעיל, מי לא התחבר, מי חסום',
    'כל יום 07:00',
    'fa-user-check',
    false,
    '{"cron":"0 7 * * *"}'
  ),
  (
    'appointment_gap_alert',
    'operations',
    'פערים בלוח זמנים',
    'זיהוי חלונות ריקים בלוח הזמנים — הצעה לשיבוץ מטופלים מרשימת ההמתנה',
    'ראשון ורביעי 10:00',
    'fa-puzzle-piece',
    false,
    '{"cron":"0 10 * * 0,3","minGapHours":2}'
  ),
  (
    'waitlist_processor',
    'operations',
    'ניהול רשימת המתנה',
    'עיבוד אוטומטי של מטופלים ברשימת המתנה — התאמה למטפלים פנויים',
    'כל 6 שעות',
    'fa-list-check',
    false,
    '{"cron":"0 */6 * * *","maxWaitDays":14}'
  ),
  (
    'session_limit_alert',
    'operations',
    'התראת מכסת טיפולים',
    'התראה כשמטופל מתקרב למכסת הטיפולים (10 פגישות) — בפגישה X שולח התראה',
    'כל יום 09:00',
    'fa-hourglass-half',
    false,
    '{"cron":"0 9 * * *","alertAtSession":8,"maxSessions":10}'
  ),
  (
    'therapist_load_balance',
    'operations',
    'איזון עומס מטפלים',
    'דוח שבועי על עומס מטפלים — מי עמוס מדי, מי פנוי — הצעה לאיזון',
    'יום ראשון 08:00',
    'fa-scale-balanced',
    false,
    '{"cron":"0 8 * * 0","maxPatientsPerTherapist":8,"minPatientsPerTherapist":2}'
  )
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- Category: retention (שימור וקשר) — 5 automations
-- ══════════════════════════════════════════════════════════

INSERT INTO bot_automation_configs (id, category, label, description, schedule, icon, is_enabled, params) VALUES
  (
    'birthday_greeting',
    'retention',
    'ברכת יום הולדת',
    'שליחת ברכת יום הולדת אוטומטית למטופלים ומטפלים — חיזוק הקשר האישי',
    'כל יום 09:00',
    'fa-cake-candles',
    false,
    '{"cron":"0 9 * * *"}'
  ),
  (
    'milestone_celebration',
    'retention',
    'ציון אבני דרך',
    'הודעת עידוד בפגישות מפתח (3, 5, 8, 10) — חיזוק מוטיבציה של מטופלים',
    'כל יום 10:00',
    'fa-trophy',
    false,
    '{"cron":"0 10 * * *","sessionMilestones":"3,5,8,10"}'
  ),
  (
    'reactivation_outreach',
    'retention',
    'הפעלה מחדש',
    'פנייה למטופלים שהפסיקו טיפול לפני X ימים — הצעה לחידוש',
    'יום שני 11:00',
    'fa-rotate',
    false,
    '{"cron":"0 11 * * 1","dormantDays":60}'
  ),
  (
    'satisfaction_survey',
    'retention',
    'סקר שביעות רצון',
    'שליחת סקר קצר אחרי X פגישות — מדידת שביעות רצון ואיכות הטיפול',
    'כל יום 14:00',
    'fa-clipboard-question',
    false,
    '{"cron":"0 14 * * *","afterSessions":3}'
  ),
  (
    'community_digest',
    'retention',
    'עדכון קהילתי',
    'עדכון דו-שבועי לקהילה — חדשות, טיפים, תוכן מקצועי לחיזוק המעורבות',
    '1 ו-15 בחודש 12:00',
    'fa-newspaper',
    false,
    '{"cron":"0 12 1,15 * *"}'
  )
ON CONFLICT (id) DO NOTHING;

-- Notify PostgREST to reload schema
SELECT public.reload_pgrst();
