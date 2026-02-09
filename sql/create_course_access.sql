-- טבלת course_access — גישה לקורסים נעולים לפי משתמש
-- אדמין מוסיף שורה = המשתמש מקבל גישה

CREATE TABLE IF NOT EXISTS public.course_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_slug TEXT NOT NULL REFERENCES public.courses(slug) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, course_slug)
);

ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;

-- משתמש יכול לראות רק את הגישות שלו
CREATE POLICY "Users can read own access"
    ON public.course_access FOR SELECT
    USING (auth.uid() = user_id);

-- רק אדמין יכול לתת/להסיר גישה
CREATE POLICY "Only admins can manage access"
    ON public.course_access FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    );
