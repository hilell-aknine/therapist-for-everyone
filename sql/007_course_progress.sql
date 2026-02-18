-- Create course_progress table for tracking video watch progress
CREATE TABLE IF NOT EXISTS public.course_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    course_type TEXT DEFAULT 'nlp-practitioner',
    lesson_number INTEGER,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    watched_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, video_id)
);

-- Enable RLS
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- Users can read their own progress
CREATE POLICY "Users can view own progress"
    ON public.course_progress FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "Users can insert own progress"
    ON public.course_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "Users can update own progress"
    ON public.course_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- Admins can view all progress
CREATE POLICY "Admins can view all progress"
    ON public.course_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_course_progress_user_id ON public.course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course_type ON public.course_progress(course_type);
