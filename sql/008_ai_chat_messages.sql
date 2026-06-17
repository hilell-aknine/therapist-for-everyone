-- =============================================
-- AI Chat Messages — per-user per-lesson chat history
-- Stores the full conversation thread for the AI tutor
-- =============================================

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lesson_id   text        NOT NULL,
    course_type text,                               -- 'master' | 'practitioner' | 'techniques' | NULL
    role        text        NOT NULL CHECK (role IN ('user', 'model')),
    content     text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only
DROP POLICY IF EXISTS "Users can view own chat messages" ON public.ai_chat_messages;
CREATE POLICY "Users can view own chat messages"
    ON public.ai_chat_messages FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT: own rows only
DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.ai_chat_messages;
CREATE POLICY "Users can insert own chat messages"
    ON public.ai_chat_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- DELETE: own rows only
DROP POLICY IF EXISTS "Users can delete own chat messages" ON public.ai_chat_messages;
CREATE POLICY "Users can delete own chat messages"
    ON public.ai_chat_messages FOR DELETE
    USING (auth.uid() = user_id);

-- Index for fast per-user per-lesson queries (ordered by time)
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_lesson_time
    ON public.ai_chat_messages (user_id, lesson_id, created_at);

-- Grants (mirrors 006/007 pattern)
GRANT SELECT, INSERT, DELETE ON public.ai_chat_messages TO authenticated;
