-- ============================================================================
-- 1. Allow authenticated users to INSERT lead_attribution
--    (needed for ensureProfile() to save attribution on signup)
-- 2. Only allow inserting rows linked to own user ID
-- ============================================================================

-- Drop the overly restrictive "service role only" policy
DROP POLICY IF EXISTS "service role only" ON lead_attribution;

-- Service role can do everything (Edge Functions)
CREATE POLICY "service_role_all" ON lead_attribution
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can INSERT their own attribution (for signup tracking)
CREATE POLICY "auth_insert_own" ON lead_attribution
  FOR INSERT TO authenticated
  WITH CHECK (
    linked_table = 'profiles' AND linked_id = auth.uid()
  );

-- No SELECT/UPDATE/DELETE for regular users (admin RPCs use SECURITY DEFINER)
