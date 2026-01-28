-- ============================================================================
-- Migration: 003_therapist_form_upgrade.sql
-- Purpose: Add new columns for upgraded therapist registration form (v3.2)
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Add new columns to therapists table
-- ============================================================================

-- Personal info columns
DO $$
BEGIN
    -- Full name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'full_name') THEN
        ALTER TABLE therapists ADD COLUMN full_name TEXT;
    END IF;

    -- Phone
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'phone') THEN
        ALTER TABLE therapists ADD COLUMN phone TEXT;
    END IF;

    -- Email
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'email') THEN
        ALTER TABLE therapists ADD COLUMN email TEXT;
    END IF;

    -- City
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'city') THEN
        ALTER TABLE therapists ADD COLUMN city TEXT;
    END IF;

    -- Birth date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'birth_date') THEN
        ALTER TABLE therapists ADD COLUMN birth_date DATE;
    END IF;

    -- Gender
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'gender') THEN
        ALTER TABLE therapists ADD COLUMN gender TEXT;
    END IF;
END $$;

-- Professional info columns
DO $$
BEGIN
    -- Specialization (singular - main specialty)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'specialization') THEN
        ALTER TABLE therapists ADD COLUMN specialization TEXT;
    END IF;

    -- License number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'license_number') THEN
        ALTER TABLE therapists ADD COLUMN license_number TEXT;
    END IF;

    -- Education
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'education') THEN
        ALTER TABLE therapists ADD COLUMN education TEXT;
    END IF;

    -- Social link (LinkedIn, website)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'social_link') THEN
        ALTER TABLE therapists ADD COLUMN social_link TEXT;
    END IF;
END $$;

-- Work mode columns
DO $$
BEGIN
    -- Works online (Zoom)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'works_online') THEN
        ALTER TABLE therapists ADD COLUMN works_online BOOLEAN DEFAULT false;
    END IF;

    -- Works in person (clinic)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'works_in_person') THEN
        ALTER TABLE therapists ADD COLUMN works_in_person BOOLEAN DEFAULT false;
    END IF;

    -- Available hours per week
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'available_hours_per_week') THEN
        ALTER TABLE therapists ADD COLUMN available_hours_per_week INTEGER;
    END IF;
END $$;

-- Questionnaire JSONB (for deep questions, health declarations, commitment details)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'questionnaire') THEN
        ALTER TABLE therapists ADD COLUMN questionnaire JSONB DEFAULT '{}'::JSONB;
    END IF;
END $$;

-- Legal and verification columns
DO $$
BEGIN
    -- Digital signature data (base64 image)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'signature_data') THEN
        ALTER TABLE therapists ADD COLUMN signature_data TEXT;
    END IF;

    -- Age confirmation (18+)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'age_confirmed') THEN
        ALTER TABLE therapists ADD COLUMN age_confirmed BOOLEAN DEFAULT false;
    END IF;

    -- Terms confirmation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'terms_confirmed') THEN
        ALTER TABLE therapists ADD COLUMN terms_confirmed BOOLEAN DEFAULT false;
    END IF;

    -- Documents verified by admin
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'documents_verified') THEN
        ALTER TABLE therapists ADD COLUMN documents_verified BOOLEAN DEFAULT false;
    END IF;

    -- Application status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'therapists' AND column_name = 'status') THEN
        ALTER TABLE therapists ADD COLUMN status TEXT DEFAULT 'new';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add constraints
-- ============================================================================

-- Status constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'therapists_status_check'
    ) THEN
        ALTER TABLE therapists ADD CONSTRAINT therapists_status_check
            CHECK (status IN ('new', 'pending_review', 'approved', 'rejected', 'inactive'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Gender constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'therapists_gender_check'
    ) THEN
        ALTER TABLE therapists ADD CONSTRAINT therapists_gender_check
            CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ============================================================================
-- STEP 3: Create indexes for common queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_therapists_status ON therapists(status);
CREATE INDEX IF NOT EXISTS idx_therapists_specialization ON therapists(specialization);
CREATE INDEX IF NOT EXISTS idx_therapists_city ON therapists(city);
CREATE INDEX IF NOT EXISTS idx_therapists_works_online ON therapists(works_online) WHERE works_online = true;
CREATE INDEX IF NOT EXISTS idx_therapists_works_in_person ON therapists(works_in_person) WHERE works_in_person = true;

-- ============================================================================
-- STEP 4: Add RLS policies for anonymous insert (lead capture)
-- ============================================================================

-- Allow anonymous insert (for form submission without auth)
DROP POLICY IF EXISTS "Anyone can submit therapist application" ON therapists;
CREATE POLICY "Anyone can submit therapist application" ON therapists
    FOR INSERT
    WITH CHECK (true);

-- Therapists can view their own data (when authenticated)
DROP POLICY IF EXISTS "Therapists can view own profile" ON therapists;
CREATE POLICY "Therapists can view own profile" ON therapists
    FOR SELECT USING (
        auth.uid() = user_id
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admins can update therapists
DROP POLICY IF EXISTS "Admins can update therapists" ON therapists;
CREATE POLICY "Admins can update therapists" ON therapists
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- ============================================================================
-- STEP 5: Update comment on questionnaire column
-- ============================================================================

COMMENT ON COLUMN therapists.questionnaire IS 'JSONB containing:
- why_profession: string
- why_join: string
- experience: string
- case_study: string
- challenges: string
- health: {has_medical_issues, medical_issues_details, takes_psychiatric_meds, in_personal_therapy}
- commitment: {monthly_hours, duration_months, therapy_mode}
- practice: {total_patients_estimate, current_active_patients, treatment_methods[]}
- legal: {has_insurance, accepts_responsibility, waiver_confirmed, scrolled_terms, signed_at}
';

-- ============================================================================
-- Done!
-- ============================================================================
SELECT 'Migration 003 completed successfully! Therapist form upgrade ready.' as status;
