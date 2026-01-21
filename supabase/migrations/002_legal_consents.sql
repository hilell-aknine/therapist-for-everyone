-- ============================================================================
-- Migration: 002_legal_consents.sql
-- Purpose: Create legal_consents table for tracking user agreement signatures
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Add 'role' column to profiles (if missing)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'student';
        ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('admin', 'therapist', 'patient', 'student'));
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create legal_consents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_consents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    agreed_version TEXT NOT NULL DEFAULT '1.0',
    ip_address TEXT,
    user_agent TEXT,
    signed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_legal_consents_user_id ON legal_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_consents_version ON legal_consents(agreed_version);

-- Unique constraint (user can only sign each version once)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_legal_consents_user_version'
    ) THEN
        CREATE UNIQUE INDEX idx_legal_consents_user_version
            ON legal_consents(user_id, agreed_version);
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Enable RLS
-- ============================================================================

ALTER TABLE legal_consents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Users can view own consents" ON legal_consents;
DROP POLICY IF EXISTS "Users can insert own consent" ON legal_consents;
DROP POLICY IF EXISTS "Admins can view all consents" ON legal_consents;

-- Policy: Users can view their own consent records
CREATE POLICY "Users can view own consents" ON legal_consents
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own consent
CREATE POLICY "Users can insert own consent" ON legal_consents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all consents
CREATE POLICY "Admins can view all consents" ON legal_consents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- ============================================================================
-- STEP 4: Helper Function
-- ============================================================================

CREATE OR REPLACE FUNCTION has_valid_consent(check_user_id UUID, required_version TEXT DEFAULT '1.0')
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM legal_consents
        WHERE user_id = check_user_id
        AND agreed_version = required_version
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION has_valid_consent TO authenticated;

-- ============================================================================
-- Done!
-- ============================================================================
SELECT 'Migration 002 completed successfully!' as status;
