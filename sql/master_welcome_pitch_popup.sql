-- master_welcome_pitch popup — go live (manual-apply, NOT a migration — DB freeze)
-- Date: 2026-06-11
--
-- First-registration Master offer: every NEW free user (auth account created on/after
-- 2026-06-11) sees Ram's personal pitch message ONCE, 10s after landing in the portal.
-- CTA routes to the in-portal Master sales page (#master-sales).
-- Client wiring: pages/course-library-v2.html (lmsMasterPitchModal, showMasterPitch,
-- masterPitchCta; armed from checkPaidRole, requested explicitly → trigger_event='manual').
-- The new-registrant cutoff + once-ever live client-side; this row provides the
-- admin kill-switch (status/is_active) + audience guard + analytics identity.
--
-- Idempotent: UPSERT on the unique popup_id. Safe to re-run.

INSERT INTO public.popup_configs
    (popup_id, title, message, cta_text, cta_link, category, priority,
     is_active, status, target_audience, trigger_event, trigger_min_lessons,
     max_per_day, cooldown_minutes, description_he, admin_notes)
VALUES
    ('master_welcome_pitch',
     'רגע לפני שמתחילים — מילה מרם',
     'הצעת המאסטר לנרשמים חדשים: המסר האישי של רם (פרקטישנר חינם, מאסטר 1,900 ש״ח + בונוסים). הטקסט המלא חי בקוד הפורטל.',
     'ספרו לי עוד על המאסטר',
     'https://www.therapist-home.com/pages/course-library-v2.html#master-sales',
     'engagement', 3,
     true, 'live', 'free_user', 'manual', 0,
     1, 0,
     'פופאפ קבלת פנים לנרשמים חדשים בלבד (מ-11.6.2026): מסר אישי מרם על קורס המאסטר, פעם אחת לכל משתמש, מוביל לדף המכירה בתוך הפורטל.',
     'created 2026-06-11 per Hillel — first-registration Master pitch, CTA → #master-sales')
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
