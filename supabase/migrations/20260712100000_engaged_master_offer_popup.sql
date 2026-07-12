-- engaged_master_offer — the personal Master pitch for learners who are deep in the course.
--
-- Why: 284 people opened the practitioner course. 112 stopped after a single lesson.
-- 38 passed five lessons and keep coming back (scripts/hot_learners.py, 2026-07-12).
-- Until now all of them got the SAME generic upsell as someone who watched one video.
-- These 38 already proved the method works on them — they are the people most likely
-- to buy, and they get an offer that says so, by name, with the number of lessons they
-- actually finished.
--
-- Pairing: training_cta is now excluded for anyone at 5+ lessons (client-side condition),
-- so nobody receives both pitches. Everyone under 5 lessons keeps the generic one.
--
-- Frequency: deliberately NOT the 10/day + 1-minute cooldown that training_cta carries.
-- Twice a day, four hours apart. For this segment a stronger offer beats a louder one,
-- and being pestered is what makes people close the tab.

-- target_audience carries a CHECK constraint; 'engaged_learner' has to be allowed
-- before the row can exist.
ALTER TABLE public.popup_configs
  DROP CONSTRAINT IF EXISTS popup_configs_target_audience_check;

ALTER TABLE public.popup_configs
  ADD CONSTRAINT popup_configs_target_audience_check
  CHECK (target_audience = ANY (ARRAY[
    'all','authenticated','unauthenticated',
    'free_user','paid_customer','admin',
    'engaged_learner'   -- free users at 5+ completed lessons (matchesAudience in js/popup-manager.js)
  ]));

INSERT INTO popup_configs (
    popup_id, title, message, cta_text, cta_link,
    category, priority, is_active, status,
    max_per_day, cooldown_minutes,
    trigger_event, trigger_min_lessons,
    target_audience,
    description_he, admin_notes
) VALUES (
    'engaged_master_offer',
    -- Note: the popup's HEADLINE is rendered client-side, because it carries the
    -- learner's live lesson count and a stale number here would be worse than nothing.
    -- This title is the dashboard label. The message and CTA below ARE what the user sees.
    'הצעת מאסטר אישית ללומד מתקדם',
    'רוב מי שנרשם לפורטל עוצר אחרי שיעור אחד. אתה לא. הגעת רחוק מספיק כדי לדעת שהשיטה הזו עובדת עליך — והמאסטר הוא בדיוק המקום שבו זה הופך מ״הבנתי״ ל״אני יודע לעשות״.',
    'קחו אותי למאסטר',
    '#master-sales',
    'engagement',
    2,                    -- outranks training_cta (3): the better-qualified pitch wins
    true,
    'live',
    2,                    -- at most twice a day
    240,                  -- four hours apart
    'lesson_complete',
    5,                    -- the line the data drew: 112 people stop at 1, the ones past 5 keep going
    'engaged_learner',
    'הצעת מאסטר אישית ללומדים שסיימו 5+ שיעורים ועדיין חוזרים. מציגה את שמם ואת מספר השיעורים שסיימו בפועל. הפופאפ הגנרי (training_cta) מושבת עבורם כדי שלא יקבלו שתי הצעות.',
    'created 2026-07-12 from scripts/hot_learners.py — 38 learners above the line at creation time'
)
ON CONFLICT (popup_id) DO UPDATE SET
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    cta_text = EXCLUDED.cta_text,
    cta_link = EXCLUDED.cta_link,
    priority = EXCLUDED.priority,
    max_per_day = EXCLUDED.max_per_day,
    cooldown_minutes = EXCLUDED.cooldown_minutes,
    trigger_event = EXCLUDED.trigger_event,
    trigger_min_lessons = EXCLUDED.trigger_min_lessons,
    target_audience = EXCLUDED.target_audience,
    is_active = EXCLUDED.is_active,
    status = EXCLUDED.status,
    updated_at = NOW();
