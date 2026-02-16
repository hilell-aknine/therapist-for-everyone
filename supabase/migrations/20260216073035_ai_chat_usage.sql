-- =============================================
-- AI Chat Usage Tracking (Rate Limiting)
-- 50 messages per user per day
-- =============================================

CREATE TABLE IF NOT EXISTS ai_chat_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message_count int DEFAULT 0,
  date date DEFAULT CURRENT_DATE,
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE ai_chat_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own usage"
  ON ai_chat_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own usage
CREATE POLICY "Users can insert own usage"
  ON ai_chat_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own usage
CREATE POLICY "Users can update own usage"
  ON ai_chat_usage
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_user_date
  ON ai_chat_usage(user_id, date);
