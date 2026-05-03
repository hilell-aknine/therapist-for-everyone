-- ============================================================================
-- Allow authenticated users to UPDATE their own attribution rows.
--
-- Why: marketing-tools.js calls PATCH on lead_attribution after form
-- submission to backfill fbclid, fbc/fbp cookies, landing_url, device, browser
-- and other browser-side fields the DB trigger can't see (they live in
-- localStorage, not in the lead's table columns).
--
-- The existing "auth_insert_own" policy only allows INSERT for
-- linked_table='profiles'. There is NO update policy at all, so every PATCH
-- from the browser silently 401s and lead_attribution stays mostly NULL for
-- any lead whose UTM was stripped en route (iOS in-app browser, ITP).
--
-- This migration adds two narrow UPDATE policies:
--   1. auth_update_own_profile_attr — user updates own profile row
--   2. auth_update_own_q_attr       — user updates row of own questionnaire
--
-- Both restricted by ownership (auth.uid()) so a user can never touch another
-- person's attribution data.
-- ============================================================================

-- Drop just in case (idempotent)
DROP POLICY IF EXISTS "auth_update_own_profile_attr" ON public.lead_attribution;
DROP POLICY IF EXISTS "auth_update_own_q_attr"       ON public.lead_attribution;

CREATE POLICY "auth_update_own_profile_attr" ON public.lead_attribution
    FOR UPDATE TO authenticated
    USING (linked_table = 'profiles' AND linked_id = auth.uid())
    WITH CHECK (linked_table = 'profiles' AND linked_id = auth.uid());

CREATE POLICY "auth_update_own_q_attr" ON public.lead_attribution
    FOR UPDATE TO authenticated
    USING (
        linked_table = 'portal_questionnaires' AND
        EXISTS (
            SELECT 1 FROM public.portal_questionnaires pq
            WHERE pq.id = lead_attribution.linked_id
              AND pq.user_id = auth.uid()
        )
    )
    WITH CHECK (
        linked_table = 'portal_questionnaires' AND
        EXISTS (
            SELECT 1 FROM public.portal_questionnaires pq
            WHERE pq.id = lead_attribution.linked_id
              AND pq.user_id = auth.uid()
        )
    );
