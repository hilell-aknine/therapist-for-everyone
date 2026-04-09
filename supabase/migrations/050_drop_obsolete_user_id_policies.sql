-- ============================================================================
-- Migration 050: Drop obsolete policies that reference non-existent user_id
--
-- Business context: This is a matchmaking platform only. Therapists and
-- patients do NOT log in to manage appointments or view records.
-- All ongoing management happens externally. The therapists/patients tables
-- have no user_id column — these policies were dead from day one.
--
-- What remains after cleanup:
--   therapists  → admin SELECT + admin UPDATE + anon INSERT (lead capture)
--   patients    → admin SELECT + admin UPDATE + anon INSERT (lead capture)
--   appointments → admin FOR ALL (admin manages all matchmaking)
--   matches     → admin FOR ALL (if table exists)
-- ============================================================================

-- therapists: drop self-view policies (no user_id column exists)
DROP POLICY IF EXISTS "Therapists can view own profile" ON public.therapists;
DROP POLICY IF EXISTS "Therapists can view own record" ON public.therapists;
DROP POLICY IF EXISTS "Therapists can view own data" ON public.therapists;

-- patients: drop self-view policy (no user_id column exists)
DROP POLICY IF EXISTS "Patients can view own record" ON public.patients;

-- patients: drop therapist-assigned-patients policy (references therapists.user_id)
DROP POLICY IF EXISTS "Therapists can view assigned patients" ON public.patients;

-- appointments: drop patient/therapist self-view (references user_id in subquery)
DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Therapists can view own appointments" ON public.appointments;

-- matches: drop patient/therapist self-view (references user_id in subquery)
-- Wrapped in DO block because matches table may not exist (was conditionally created)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Patients can view own matches" ON public.matches;
    DROP POLICY IF EXISTS "Therapists can view own matches" ON public.matches;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- Verify: after this migration, remaining policies per table should be:
--
-- therapists:
--   "Admins can view all therapists"     (004) — admin SELECT
--   "Admins can update therapists"       (003/004) — admin UPDATE
--   "Anyone can submit therapist application" (003/004) — anon INSERT
--
-- patients:
--   "Admins can view all patients"       (004) — admin SELECT
--   "Admins can update patients"         (004) — admin UPDATE
--   "Anyone can submit patient form"     (004) — anon INSERT
--
-- appointments:
--   "Admins can view all appointments"   (004) — admin SELECT
--   "Admins can manage appointments"     (004) — admin ALL
--
-- matches (if exists):
--   "Admins can manage matches"          (004) — admin ALL
-- ============================================================================
