-- Migration 005: Course questionnaires table
-- Stores questionnaire responses from NLP course students after they register at 50% progress.

CREATE TABLE IF NOT EXISTS course_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  course_slug TEXT DEFAULT 'nlp-practitioner',
  full_name TEXT,
  email TEXT,
  phone TEXT,
  motivation TEXT,
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  interest_certification TEXT CHECK (interest_certification IN ('yes', 'maybe', 'no')),
  preferred_learning TEXT CHECK (preferred_learning IN ('online', 'in_person', 'both')),
  how_found_us TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE course_questionnaires ENABLE ROW LEVEL SECURITY;

-- Users can insert their own questionnaire
CREATE POLICY "Users can insert own questionnaire"
  ON course_questionnaires FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own questionnaire
CREATE POLICY "Users can read own questionnaire"
  ON course_questionnaires FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can read all (for CRM bot)
CREATE POLICY "Service role full access"
  ON course_questionnaires FOR ALL
  USING (auth.role() = 'service_role');
