-- Migration: Master upsell popup — go live (personal-development angle)
-- Date: 2026-06-01
--
-- Re-enables the 'training_cta' popup as the Master-course upsell funnel:
-- free portal users who completed >= 5 lessons see a popup whose CTA navigates
-- to the Cardcom payment page. Positioning is PERSONAL DEVELOPMENT (deepening
-- the personal journey), NOT "become a certified therapist / profession".
-- The popup overlay + CTA navigation are wired in pages/course-library.html
-- (showTrainingCta / goToMasterCheckout). This row is what makes PopupManager
-- actually fire it (status=live, trigger=lesson_complete, audience=free_user).
-- Click/shown/dismissed events log to popup_events with lesson_identifier context.
--
-- Idempotent: UPSERT on the unique popup_id. Safe to re-run.

INSERT INTO public.popup_configs
    (popup_id, title, message, cta_text, cta_link, category, priority,
     is_active, status, target_audience, trigger_event, trigger_min_lessons,
     max_per_day, cooldown_minutes, description_he, admin_notes)
VALUES
    ('training_cta',
     'מוכן להעמיק את ההתפתחות האישית שלך?',
     'הכשרת המאסטר לוקחת אותך עמוק לתוך הכלים, בשביל השינוי האמיתי בחיים שלך, בקשרים, ובראש.',
     'לפרטים והצטרפות',
     'https://secure.cardcom.solutions/EA/EA5/oLgmreU4vkf2bf73tIxpA/PaymentSP',
     'engagement', 3,
     true, 'live', 'free_user', 'lesson_complete', 5,
     1, 1440,
     'פופאפ שדרוג למאסטר (התפתחות אישית), נפתח אחרי 5 שיעורים למשתמש חינמי, מוביל לדף התשלום ב-Cardcom.',
     're-enabled 2026-06-01 for Master upsell funnel (Cardcom), personal-development angle')
ON CONFLICT (popup_id) DO UPDATE SET
     title               = EXCLUDED.title,
     message             = EXCLUDED.message,
     cta_text            = EXCLUDED.cta_text,
     cta_link            = EXCLUDED.cta_link,
     category            = EXCLUDED.category,
     priority            = EXCLUDED.priority,
     is_active           = true,
     status              = 'live',
     target_audience     = EXCLUDED.target_audience,
     trigger_event       = EXCLUDED.trigger_event,
     trigger_min_lessons = EXCLUDED.trigger_min_lessons,
     max_per_day         = EXCLUDED.max_per_day,
     cooldown_minutes    = EXCLUDED.cooldown_minutes,
     description_he      = EXCLUDED.description_he,
     admin_notes         = EXCLUDED.admin_notes;
