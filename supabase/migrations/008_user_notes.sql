-- ============================================================================
-- Migration 008: user_notes table for syncing lesson notes to Supabase
-- Run this manually in the Supabase Dashboard SQL Editor
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id TEXT NOT NULL,
  course_type TEXT DEFAULT 'nlp-practitioner',
  lesson_title TEXT,
  module_title TEXT,
  lesson_number INTEGER,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, video_id)
);

-- Enable Row Level Security
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own notes
CREATE POLICY "Users manage own notes" ON user_notes
  FOR ALL USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_user_notes_user_id ON user_notes(user_id);
CREATE INDEX idx_user_notes_updated ON user_notes(user_id, updated_at DESC);
