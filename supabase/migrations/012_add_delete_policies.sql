-- ============================================
-- Migration 012: Add DELETE RLS policies for admin
-- Fixes: admin dashboard delete not working
-- ============================================

-- Patients: admin can delete
DROP POLICY IF EXISTS "Admins can delete patients" ON patients;
CREATE POLICY "Admins can delete patients"
  ON patients FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Therapists: admin can delete
DROP POLICY IF EXISTS "Admins can delete therapists" ON therapists;
CREATE POLICY "Admins can delete therapists"
  ON therapists FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Profiles: admin can delete
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Contact requests: admin can delete
DROP POLICY IF EXISTS "Admins can delete contact requests" ON contact_requests;
CREATE POLICY "Admins can delete contact requests"
  ON contact_requests FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update profiles (missing from original migration)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update contact_requests (idempotent — may already exist from 009)
DROP POLICY IF EXISTS "Admins can update contact requests" ON contact_requests;
CREATE POLICY "Admins can update contact requests"
  ON contact_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
