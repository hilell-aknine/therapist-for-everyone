-- ============================================================================
-- Migration 053: Add source column to ai_chat_usage for separate rate limiting
--
-- gemini-mentor needs its own daily counter (100/day) separate from
-- ai-chat (200/day). The 'source' column distinguishes them.
-- ============================================================================

-- Add source column (default 'chat' for existing rows)
ALTER TABLE public.ai_chat_usage ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'chat';

-- Drop old unique constraint and create new one including source
ALTER TABLE public.ai_chat_usage DROP CONSTRAINT IF EXISTS ai_chat_usage_user_id_date_key;
ALTER TABLE public.ai_chat_usage ADD CONSTRAINT ai_chat_usage_user_date_source_key UNIQUE (user_id, date, source);

-- Update index
DROP INDEX IF EXISTS idx_ai_chat_usage_user_date;
CREATE INDEX idx_ai_chat_usage_user_date_source ON public.ai_chat_usage(user_id, date, source);
