-- ============================================================================
-- Migration 034: Portal Questionnaires Table
-- Stores free learning portal registration questionnaire responses
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_questionnaires (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Step 1: Personal Details
    gender TEXT,
    birth_date TEXT,
    city TEXT,
    occupation TEXT,

    -- Step 2: Learning Preferences
    why_nlp TEXT,
    study_time TEXT,
    digital_challenge TEXT,
    knew_ram TEXT,

    -- Step 3: Personal Reflection
    motivation_tip TEXT,
    main_challenge TEXT,
    vision_one_year TEXT,

    -- Meta
    source TEXT DEFAULT 'portal_questionnaire',
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE portal_questionnaires ENABLE ROW LEVEL SECURITY;

-- Admin can see and manage all
CREATE POLICY "admin_full_access_portal_q" ON portal_questionnaires
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Authenticated users can insert their own
CREATE POLICY "auth_insert_own_portal_q" ON portal_questionnaires
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Authenticated users can read their own
CREATE POLICY "auth_read_own_portal_q" ON portal_questionnaires
    FOR SELECT USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_portal_q_created_at ON portal_questionnaires(created_at DESC);
CREATE INDEX idx_portal_q_user_id ON portal_questionnaires(user_id);
