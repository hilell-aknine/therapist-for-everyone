-- ============================================
-- Migration 017: Lockdown anonymous INSERT policies
-- Security fix — anonymous inserts now go through
-- the submit-lead Edge Function (Turnstile-protected).
-- The Edge Function uses service_role key which bypasses RLS.
-- ============================================

-- 1. Drop the wide-open anonymous INSERT policy on patients
-- (Created in migration 004)
DROP POLICY IF EXISTS "Anyone can submit patient form" ON public.patients;

-- 2. Drop the wide-open anonymous INSERT policy on therapists
-- (Created in migration 004)
DROP POLICY IF EXISTS "Anyone can submit therapist application" ON public.therapists;

-- 3. Drop the wide-open anonymous INSERT policy on contact_requests
-- (Created in migration 009)
DROP POLICY IF EXISTS "Anyone can submit contact request" ON public.contact_requests;

-- 4. Add restricted INSERT policies — only authenticated users can insert
-- (for logged-in registration flows that don't go through the Edge Function)

DROP POLICY IF EXISTS "Authenticated users can insert patient record" ON public.patients;
CREATE POLICY "Authenticated users can insert patient record"
    ON public.patients FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert therapist record" ON public.therapists;
CREATE POLICY "Authenticated users can insert therapist record"
    ON public.therapists FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- contact_requests: NO authenticated insert policy needed.
-- All submissions (anonymous + authenticated) go through Edge Function.
-- Service role bypasses RLS automatically.

-- 5. Revoke direct anon INSERT grant on contact_requests
-- (migration 009 granted ALL to anon — tighten to SELECT only for PostgREST)
REVOKE INSERT, UPDATE, DELETE ON public.contact_requests FROM anon;

-- ============================================
-- IMPORTANT DEPLOYMENT NOTE:
-- Before running this migration, ensure:
-- 1. submit-lead Edge Function is deployed and tested
-- 2. TURNSTILE_SECRET_KEY is set in Supabase secrets
-- 3. Frontend code is updated to call Edge Function
-- Run in this order: deploy Edge Function → deploy frontend → run migration
-- ============================================
