-- ============================================
-- Migration 004: Enable RLS on all sensitive tables
-- Security Audit P0 Fix — 2026-02-14
-- ============================================

-- Enable RLS on all sensitive tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on matches if it exists
DO $$ BEGIN
  ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Enable RLS on reviews if it exists
DO $$ BEGIN
  ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- PROFILES policies
-- ============================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- PATIENTS policies
-- ============================================

-- Patients can view their own record
CREATE POLICY "Patients can view own record"
  ON patients FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all patients
CREATE POLICY "Admins can view all patients"
  ON patients FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update patients (approve, assign therapist, etc.)
CREATE POLICY "Admins can update patients"
  ON patients FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone can insert (lead capture — no login required)
CREATE POLICY "Anyone can submit patient form"
  ON patients FOR INSERT
  WITH CHECK (true);

-- Therapists can view their assigned patients
CREATE POLICY "Therapists can view assigned patients"
  ON patients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.patient_id = patients.id
        AND matches.therapist_id IN (
          SELECT id FROM therapists WHERE user_id = auth.uid()
        )
    )
  );

-- ============================================
-- THERAPISTS policies
-- ============================================

-- Therapists can view their own record
CREATE POLICY "Therapists can view own record"
  ON therapists FOR SELECT
  USING (auth.uid() = user_id);

-- Therapists can update their own record
CREATE POLICY "Therapists can update own record"
  ON therapists FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all therapists
CREATE POLICY "Admins can view all therapists"
  ON therapists FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update therapists (approve, verify, etc.)
CREATE POLICY "Admins can update therapists"
  ON therapists FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone can insert (lead capture)
CREATE POLICY "Anyone can submit therapist application"
  ON therapists FOR INSERT
  WITH CHECK (true);

-- ============================================
-- APPOINTMENTS policies
-- ============================================

-- Patients can view their own appointments
CREATE POLICY "Patients can view own appointments"
  ON appointments FOR SELECT
  USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

-- Therapists can view their own appointments
CREATE POLICY "Therapists can view own appointments"
  ON appointments FOR SELECT
  USING (
    therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
  );

-- Admins can view all appointments
CREATE POLICY "Admins can view all appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can manage appointments
CREATE POLICY "Admins can manage appointments"
  ON appointments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- MATCHES policies (if table exists)
-- ============================================

DO $$ BEGIN
  -- Admins can manage matches
  CREATE POLICY "Admins can manage matches"
    ON matches FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

  -- Patients can view their own matches
  CREATE POLICY "Patients can view own matches"
    ON matches FOR SELECT
    USING (
      patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

  -- Therapists can view their own matches
  CREATE POLICY "Therapists can view own matches"
    ON matches FOR SELECT
    USING (
      therapist_id IN (SELECT id FROM therapists WHERE user_id = auth.uid())
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- Done
-- ============================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc/sql
