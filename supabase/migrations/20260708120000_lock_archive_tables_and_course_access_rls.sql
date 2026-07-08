-- ============================================================================
-- Lock down dead _archive_* tables + enable RLS on course_access
-- ============================================================================
-- Trigger: Supabase Security Advisor email (06 Jul 2026) flagged 2 CRITICAL
-- issues on project eimcudmlfjlyxjyrdcgc:
--   1. rls_disabled_in_public     -> public.course_access, public._archive_appointments
--   2. sensitive_columns_exposed  -> public._archive_appointments (patient_id)
--
-- Live verification (2026-07-08 via Management API) additionally found the whole
-- _archive_* class is exposed: _archive_patients / _archive_therapists /
-- _archive_matches carry an `ALL {authenticated} USING(true)` policy, so ANY
-- signed-in user could read archived patient/therapist PII. anon can INSERT into
-- _archive_patients / _archive_therapists.
--
-- All _archive_* tables are DEAD (renamed 2026-05-17 by
-- 20260517100000_archive_dead_tables.sql). No live code in js/pages/functions
-- reads them; only scripts/backup-supabase.py touches them, and it uses the
-- service_role key which bypasses RLS. Therefore the correct, zero-risk fix is
-- to lock every _archive_* table to service_role only:
--   ENABLE RLS + DROP all policies (=> deny-all under RLS) + REVOKE anon/auth grants.
--
-- course_access is a live (currently empty, 0 rows) supplementary access-grant
-- table read by pages/master-practice.html for the signed-in user's own row
-- (hasAccess = own course_access row OR admin OR paid_customer). We enable RLS,
-- keep the existing admin-manage policy, ADD a self-SELECT policy so the gate
-- keeps working if the table is ever populated, and revoke the dangerous anon
-- table grants (anon had SELECT/INSERT/UPDATE/DELETE).
--
-- Reversible: _archive_* originals are restorable via
--   sql/rollback/20260517100000_archive_dead_tables.rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. course_access — enable RLS, self-read policy, drop anon exposure
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own course access" ON public.course_access;
CREATE POLICY "Users read own course access"
  ON public.course_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- (existing "Admins can manage course access" ALL policy is left in place)

REVOKE ALL ON public.course_access FROM anon;

-- ---------------------------------------------------------------------------
-- 2. All dead _archive_* tables — lock to service_role only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE '\_archive\_%'
  LOOP
    -- ensure RLS is enabled (closes _archive_appointments)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- drop every existing policy (they grant authenticated/anon access to dead PII)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- remove table-level API grants (service_role keeps access, it is not revoked here)
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. contact_requests — live table, 308 real leads (name/email/phone/city/msg).
--    Live check (2026-07-08) found policy `contacts_select USING(true)` for
--    authenticated => ANY signed-in user (student/lead) could read all 308
--    leads' PII. Admins already have "Admins can view all contact requests"
--    (role='admin' SELECT). Every non-admin code path only INSERTs via the
--    submit-lead Edge Function (service_role, bypasses RLS), so dropping the
--    always-true SELECT policy is safe. anon SELECT grant is also revoked.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "contacts_select" ON public.contact_requests;
REVOKE SELECT ON public.contact_requests FROM anon;
