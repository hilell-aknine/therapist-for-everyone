-- Migration: Cleanup roles column, fix trigger, add indexes, drop dead tables
-- Phase 1B + Phase 2 + Phase 3

-- ============================================================================
-- Phase 1B: Fix CHECK constraint + trigger + drop roles column
-- ============================================================================

-- 1. Update CHECK constraint to include student_lead and sales_rep
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin','therapist','patient','student','student_lead','sales_rep'));

-- 2. Migrate data from roles (array) to role (text) if column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'roles') THEN
        UPDATE profiles SET role = roles[1]
        WHERE role IS NULL AND roles IS NOT NULL AND array_length(roles, 1) > 0;

        ALTER TABLE profiles DROP COLUMN roles;
    END IF;
END $$;

-- 3. Fix trigger that creates new profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, created_at)
    VALUES (
        NEW.id, NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
        'student_lead', NOW()
    ) ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Phase 2: Missing indexes (zero risk, performance boost)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_matches_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_matches_therapist_id ON appointments(therapist_id);

-- ============================================================================
-- Phase 3: Drop dead/duplicate tables
-- ============================================================================

DROP TABLE IF EXISTS course_questionnaires;
