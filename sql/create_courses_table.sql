-- ============================================================================
-- טבלת courses — מטפל לכל אחד
-- הרצה ב-Supabase SQL Editor
-- ============================================================================

-- 1. יצירת הטבלה
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'fa-book',
    status TEXT DEFAULT 'coming_soon' CHECK (status IN ('open', 'coming_soon', 'locked')),
    link TEXT,
    lesson_count INTEGER DEFAULT 0,
    duration_text TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS — כולם קוראים, רק אדמין עורך
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read courses"
    ON public.courses FOR SELECT
    USING (true);

CREATE POLICY "Only admins can modify courses"
    ON public.courses FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    );

-- 3. Seed data — 3 קורסים
INSERT INTO public.courses (slug, title, description, icon, status, link, lesson_count, duration_text, display_order)
VALUES
    (
        'nlp-practitioner',
        'NLP Practitioner — פרקטישנר',
        'קורס מקיף ב-NLP עם הסמכה בינלאומית. למדו את כל הטכניקות והכלים המעשיים של ה-NLP בקורס חינמי ומלא.',
        'fa-brain',
        'open',
        'free-portal.html',
        51,
        '7 מודולים · 51 שיעורים',
        1
    ),
    (
        'nlp-master',
        'NLP Master Practitioner — מאסטר',
        'הכשרת מאסטר NLP מתקדמת. העמקה בטכניקות מתקדמות, עבודה עם טראומה, ושליטה מלאה בשפת הגוף.',
        'fa-crown',
        'coming_soon',
        NULL,
        0,
        'בקרוב...',
        2
    ),
    (
        'emotional-messaging',
        'סדנת מסרים מרגשות',
        'סדנה מעשית ליצירת מסרים שמניעים לפעולה. שיווק רגשי, כתיבה שיווקית, ו-NLP בתקשורת.',
        'fa-comments',
        'coming_soon',
        NULL,
        0,
        'בקרוב...',
        3
    )
ON CONFLICT (slug) DO NOTHING;
