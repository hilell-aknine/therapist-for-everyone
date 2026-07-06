-- P0 FIX (2026-07-06): public.profiles was readable by ANYONE with the anon key.
-- Root cause: a rogue permissive policy "Public profiles are viewable by everyone"
-- with USING (true) for role public overrode the correct own-row policy, so all 748
-- rows (email, phone, full_name, role, sales_notes) leaked to unauthenticated GETs.
--
-- The admin dashboard reads all profiles via the browser client (subject to RLS) and
-- there was NO admin SELECT policy — it only worked BECAUSE of the leak. So we cannot
-- simply drop the rogue policy; we must first give admins a proper SELECT path.
--
-- is_admin() is SECURITY DEFINER (bypasses RLS) → no infinite recursion when used in
-- a policy ON profiles. Verified in a rolled-back transaction before applying:
--   admin → 748 rows, normal user → own 1 row, anon → 0 rows.
--
-- Login pages (login.html / login-v2.html) previously relied on an anonymous
-- profiles read to check "does this email exist" before the magic link; that was
-- replaced with signInWithOtp({ shouldCreateUser:false }), which needs no profiles read.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Admin can read every profile (dashboard: leads, pipeline, learners, settings).
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

-- Close the leak. The correct "Users can read own profile" (own row) policy remains,
-- so authenticated users still read their own row; anon reads nothing.
DROP POLICY "Public profiles are viewable by everyone" ON public.profiles;
