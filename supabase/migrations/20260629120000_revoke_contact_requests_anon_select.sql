-- ============================================================================
-- Migration: revoke residual anon SELECT on contact_requests
-- ----------------------------------------------------------------------------
-- 009_create_contact_requests.sql:52 ran `GRANT ALL ON contact_requests TO anon`.
-- 017_lockdown_anonymous_inserts.sql:39 revoked only INSERT/UPDATE/DELETE, so a
-- raw table-level SELECT grant to anon was left behind. It is currently harmless
-- only because RLS is enabled with no permissive anon SELECT policy — but that is
-- fragile: if RLS were ever toggled off, anon would read every lead (name/phone/
-- email/message). Defense-in-depth: remove the grant. Admins are unaffected —
-- they read as the `authenticated` role via the existing "Admins can view all
-- contact requests" policy; lead capture still works (submit-lead uses service_role).
-- ============================================================================

REVOKE SELECT ON public.contact_requests FROM anon;

-- Belt-and-suspenders: ensure no stray broad grant survives for anon on this table.
REVOKE ALL ON public.contact_requests FROM anon;
