-- Migration: training_cta — fire after EVERY lesson, route to the in-portal sales page
-- Date: 2026-06-17
--
-- Hillel's request: on completing ANY full practitioner lesson, a free user should
-- see a simple Master popup that leads to the Master SALES PAGE (not straight to
-- Cardcom). Two changes vs the 2026-06-01 row:
--   1. trigger_min_lessons 5 -> 1   (fires from the very first completed lesson)
--   2. frequency loosened           (max_per_day 1 -> 10, cooldown 1440min -> 1min)
--      so it can re-appear after each lesson. The client still enforces a global
--      MAX_ENGAGEMENT_PER_DAY guard (~3/day) and a "dismissed today" stop, so an
--      engaged learner is reminded without being spammed.
--   3. cta_link -> '#master-sales'  (the in-portal sales view; the button handler
--      trainingCtaCheckout() in course-library-v2.html now calls showMasterSalesView()).
--
-- The sales page itself (open to all portal members) carries the intro video,
-- Ram's personal letter, the 1,900 price and the "קניתם אותי" buy button -> Cardcom.
-- Positioning stays PERSONAL DEVELOPMENT, not "become a certified therapist".
--
-- Idempotent: UPSERT on the unique popup_id. Safe to re-run.

INSERT INTO public.popup_configs
    (popup_id, title, message, cta_text, cta_link, category, priority,
     is_active, status, target_audience, trigger_event, trigger_min_lessons,
     max_per_day, cooldown_minutes, description_he, admin_notes)
VALUES
    ('training_cta',
     'מוכן להעמיק את ההתפתחות האישית שלך?',
     'סיימת עוד שיעור — כל הכבוד. תכנית המאסטר לוקחת אותך עמוק לתוך הכלים, אל השינוי האמיתי בחיים שלך, בקשרים, ובראש.',
     'לפרטים על תכנית המאסטר',
     '#master-sales',
     'engagement', 3,
     true, 'live', 'free_user', 'lesson_complete', 1,
     10, 1,
     'פופאפ שדרוג למאסטר (התפתחות אישית), נפתח אחרי כל שיעור שהושלם למשתמש חינמי, מוביל לדף המכירה של המאסטר בתוך הפורטל.',
     'changed 2026-06-17: fire every lesson (min_lessons 1, cap loosened) + CTA -> in-portal sales page instead of Cardcom')
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
