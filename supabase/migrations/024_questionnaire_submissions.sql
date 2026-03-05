-- ============================================================================
-- Migration 024: Questionnaire Submissions Table
-- Stores NLP training program application questionnaire responses
-- ============================================================================

CREATE TABLE IF NOT EXISTS questionnaire_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Step 1: Personal Details
    full_name TEXT NOT NULL,
    gender TEXT,
    email TEXT,
    phone TEXT,
    birth_year TEXT,
    occupation TEXT,

    -- Step 2: Connection
    how_found TEXT,
    what_touched_you TEXT,

    -- Step 3: Inner World
    what_is_therapist TEXT,
    weakness TEXT,
    challenge TEXT,
    achievement TEXT,

    -- Step 4: Dreams & Goals
    why_now TEXT,
    vision_3_years TEXT,
    motto TEXT,

    -- Step 5: Background
    currently_practicing TEXT,
    previous_studies TEXT,
    people_accompanied TEXT,

    -- Meta
    privacy_accepted BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'new',
    source TEXT DEFAULT 'questionnaire_form',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE questionnaire_submissions ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_full_access_questionnaire" ON questionnaire_submissions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Allow service role inserts (from Edge Function)
CREATE POLICY "service_role_insert_questionnaire" ON questionnaire_submissions
    FOR INSERT WITH CHECK (true);

-- Index for admin queries
CREATE INDEX idx_questionnaire_created_at ON questionnaire_submissions(created_at DESC);
CREATE INDEX idx_questionnaire_status ON questionnaire_submissions(status);
