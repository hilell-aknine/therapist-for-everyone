-- ============================================================================
-- Migration 045: Add free_user + admin audience, improve trigger_condition
-- ============================================================================

-- Expand target_audience CHECK to include free_user and admin
ALTER TABLE public.popup_configs DROP CONSTRAINT IF EXISTS popup_configs_target_audience_check;
ALTER TABLE public.popup_configs ADD CONSTRAINT popup_configs_target_audience_check
    CHECK (target_audience IN ('all', 'authenticated', 'unauthenticated', 'free_user', 'paid_customer', 'admin'));

-- Add Hebrew helper columns for admin UI
ALTER TABLE public.popup_configs ADD COLUMN IF NOT EXISTS trigger_event TEXT DEFAULT 'manual';
ALTER TABLE public.popup_configs ADD COLUMN IF NOT EXISTS trigger_min_lessons INTEGER DEFAULT 0;
ALTER TABLE public.popup_configs ADD COLUMN IF NOT EXISTS description_he TEXT;

-- Add CHECK for trigger_event
ALTER TABLE public.popup_configs ADD CONSTRAINT popup_configs_trigger_event_check
    CHECK (trigger_event IN ('manual', 'page_load', 'lesson_complete', 'login', 'signup'));

-- Update existing seed data with Hebrew descriptions
UPDATE public.popup_configs SET
    description_he = 'מוצג פעם אחת למי שעדיין לא אישר עוגיות',
    trigger_event = 'page_load'
WHERE popup_id = 'cookie_consent';

UPDATE public.popup_configs SET
    description_he = 'מוצג כשאורח מנסה לגשת לתוכן פרימיום או הגיע ל-50% מהקורס',
    trigger_event = 'manual',
    target_audience = 'unauthenticated'
WHERE popup_id = 'auth_modal';

UPDATE public.popup_configs SET
    description_he = 'שאלון קצר כדי שה-AI ידבר ברמה של המשתמש. מוצג פעם אחת אחרי הרשמה',
    trigger_event = 'login',
    target_audience = 'free_user'
WHERE popup_id = 'ai_questionnaire';

UPDATE public.popup_configs SET
    description_he = 'מעודד שיתוף עם חברים אחרי סיום שיעור שלישי. פעם ביום בלבד',
    trigger_event = 'lesson_complete',
    trigger_min_lessons = 3,
    target_audience = 'free_user'
WHERE popup_id = 'share_prompt';

UPDATE public.popup_configs SET
    description_he = 'מזכיר לאורח להירשם אחרי דקה של צפייה בסרטון',
    trigger_event = 'manual',
    target_audience = 'unauthenticated'
WHERE popup_id = 'video_toast';
