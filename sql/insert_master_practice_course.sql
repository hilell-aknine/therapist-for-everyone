-- הוספת קורס תרגולים פרקטיים מאסטר לטבלת courses
-- הרצה ב-Supabase SQL Editor

INSERT INTO public.courses (slug, title, description, icon, status, link, lesson_count, duration_text, display_order)
VALUES (
    'nlp-master-practice',
    'תרגולים פרקטיים - מאסטר NLP',
    '49 קליפים מעשיים מ-10 שיעורי המאסטר: הדגמות חיות, תרגולים מודרכים, דמיון מודרך ותרגולי זוגות. מאורגן ב-15 קטגוריות נושאיות.',
    'fa-crown',
    'locked',
    'pages/master-practice.html',
    49,
    '15 קטגוריות · 49 תרגולים',
    2
)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    link = EXCLUDED.link,
    lesson_count = EXCLUDED.lesson_count,
    duration_text = EXCLUDED.duration_text;
