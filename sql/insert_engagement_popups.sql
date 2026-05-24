-- ============================================================================
-- One-off: register top_percentile_v2 + weekly_streak_v2 in popup_configs
-- ============================================================================
-- Run via Supabase SQL editor (NOT `db push` — blocked by lead_intake landmine).
-- Idempotent: ON CONFLICT (popup_id) DO NOTHING.
-- After running, both popups appear in admin.html → ניהול פופאפים, where
-- title/message/is_active/cooldown_minutes/status can be edited live.
--
-- Both use trigger_event='manual' because the client (course-library-v2.html)
-- knows precisely when to fire — see hooks in markLessonCompleted + authGate.
-- ============================================================================

INSERT INTO public.popup_configs (
  popup_id, title, message, category, priority,
  is_active, max_per_day, cooldown_minutes, target_audience,
  status, trigger_event, description_he
) VALUES
  (
    'top_percentile_v2',
    'אחוזון עליון — 15%',
    'השלמת 2 שיעורים השבוע! הנתון הזה מכניס אותך ל-15% העליונים של הלומדים הפעילים בפורטל.',
    'engagement', 3,
    true, 1, 60, 'authenticated',
    'live', 'manual',
    'נדלק כשמשתמש מסיים את השיעור השני שלו השבוע. שייכות לקבוצת איכות, בלי לרמוס את מי שמתקשה. cooldown 60 דק׳ ו-1 ליום.'
  ),
  (
    'weekly_streak_v2',
    'רצף שבועי',
    'זה השבוע השני ברציפות שאתה נכנס ומתקדם. רק 20% מהנרשמים שומרים על רצף כזה. אל תעצור עכשיו!',
    'engagement', 3,
    true, 1, 60, 'authenticated',
    'live', 'manual',
    'נדלק על login כשהמשתמש בשבוע השני (ומעלה) ברציפות. הקופי משתנה דינמית לפי אורך הרצף ("השלישי", "ה-4" וכו׳). cooldown 60 דק׳ ו-1 ליום.'
  )
ON CONFLICT (popup_id) DO NOTHING;

-- Verification query — run after the INSERT to confirm both rows landed live:
-- SELECT popup_id, title, status, is_active, trigger_event, target_audience,
--        max_per_day, cooldown_minutes
-- FROM public.popup_configs
-- WHERE popup_id IN ('top_percentile_v2', 'weekly_streak_v2');
