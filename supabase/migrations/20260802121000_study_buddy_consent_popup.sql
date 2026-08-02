-- study_buddy_consent — the permission popup for "ללמוד עם חבר" (2026-08-02).
--
-- Nobody appears in the matching pool until they answer this. It is asked once, after
-- a completed lesson, of learners at 3+ completed lessons (the line the live data drew:
-- 151 of 294 learners never pass 2 lessons, so asking earlier would mostly be asking
-- people who already left).
--
-- Deliberately category='engagement' and NOT 'critical': it must obey the daily cap and
-- the cooldown like every other popup. A consent request that ambushes someone is how
-- you get a "no". max_per_day=1 plus the client-side once-ever guard (a row in
-- study_buddy_prefs = answered) means it is asked once and then never again, whichever
-- way it was answered.
--
-- target_audience='authenticated' rather than 'free_user': paying Master customers are
-- exactly the people worth studying with, and there is no upsell here to protect.

INSERT INTO popup_configs (
    popup_id, title, message, cta_text, cta_link,
    category, priority, is_active, status,
    max_per_day, cooldown_minutes,
    trigger_event, trigger_min_lessons,
    target_audience,
    description_he, admin_notes
) VALUES (
    'study_buddy_consent',
    'ללמוד עם עוד מישהו מהפורטל?',
    'רוב מי שנשאר עד סוף הקורס לא עשה את זה לבד. אנחנו יכולים להראות לך מי מהלומדים נמצא בערך באותו מקום כמוך, ולחבר ביניכם. הפרטים שלך לא נחשפים לאף אחד: מישהו יוכל לבקש ללמוד איתך, ורק אם תאשר, תקבלו אחד את הפרטים של השני.',
    'מעניין אותי',
    NULL,
    'engagement',
    3,
    true,
    'live',
    1,      -- once a day at most, and the client guard makes it once ever
    1440,
    'lesson_complete',
    3,      -- 151 of 294 learners never pass 2 lessons
    'authenticated',
    'בקשת הסכמה להצטרפות למאגר "ללמוד עם חבר". נשאלת פעם אחת בלבד, אחרי שיעור, ללומדים עם 3 שיעורים ומעלה. תשובה (כן או לא) נשמרת ב-study_buddy_prefs והפופאפ לא חוזר.',
    'created 2026-08-02. בריכת ההתאמה בזמן היצירה: 98 לומדים (3+ שיעורים, טלפון בפרופיל, פעילים ב-90 יום).'
)
ON CONFLICT (popup_id) DO UPDATE SET
    title               = EXCLUDED.title,
    message             = EXCLUDED.message,
    cta_text            = EXCLUDED.cta_text,
    category            = EXCLUDED.category,
    priority            = EXCLUDED.priority,
    max_per_day         = EXCLUDED.max_per_day,
    cooldown_minutes    = EXCLUDED.cooldown_minutes,
    trigger_event       = EXCLUDED.trigger_event,
    trigger_min_lessons = EXCLUDED.trigger_min_lessons,
    target_audience     = EXCLUDED.target_audience,
    is_active           = EXCLUDED.is_active,
    status              = EXCLUDED.status,
    updated_at          = NOW();
