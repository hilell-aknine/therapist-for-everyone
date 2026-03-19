-- 028: Create lessons table for course portal
-- Stores lesson metadata with section grouping and sort order

CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    section_name TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast section-based sorted queries
CREATE INDEX idx_lessons_section_order ON public.lessons (section_name, order_index);

-- Enable RLS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all lessons
CREATE POLICY "Authenticated users can view lessons"
    ON public.lessons
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage lessons"
    ON public.lessons
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );
