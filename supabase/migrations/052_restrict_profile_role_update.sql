-- ============================================================================
-- Migration 052: Prevent users from changing their own role
--
-- The current "Users can update own profile" policy allows updating ANY column,
-- including 'role'. A user can open browser console and run:
--   Profiles.update(myId, { role: 'admin' })
-- to escalate privileges.
--
-- Fix: WITH CHECK ensures the role value after UPDATE equals the current role,
-- making self-role-change impossible. Admin can still change roles via
-- service_role (Edge Functions, admin-paid.js).
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    );
