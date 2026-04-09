-- ============================================================================
-- Migration 049: Security hardening — 5 critical fixes + questionnaire protection
-- Security audit 2026-04-09
-- ============================================================================

-- ============================================================================
-- FIX 1: course_access — Replace broken app_metadata admin check
--        with profiles.role = 'admin' (consistent with all other tables)
--
--        The old policy uses (auth.jwt() -> 'app_metadata' ->> 'is_admin')
--        which is never set in this project. All other tables use
--        profiles.role = 'admin'. This policy silently blocks all admin ops.
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can manage access" ON public.course_access;

CREATE POLICY "Admins can manage course access"
    ON public.course_access FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================================
-- FIX 2: appointments — Revoke anonymous access
--        Migration 004 already created SELECT policies for patients/therapists
--        + admin FOR ALL. In a matchmaking platform, admin manages appointments
--        (creates, reschedules, cancels). No INSERT/UPDATE needed for end users.
--
--        NOTE: therapists.user_id does not exist in live DB, so we cannot
--        create policies referencing it. Existing SELECT policies from
--        migration 004 use patient_id/therapist_id foreign keys directly.
-- ============================================================================

-- Block anonymous access entirely — appointments are auth-only
REVOKE ALL ON public.appointments FROM anon;

-- ============================================================================
-- FIX 3: referral_leaderboard — Recreate as SECURITY INVOKER
--        Without explicit setting, views default to SECURITY DEFINER in PG<15,
--        meaning the view runs with the CREATOR's privileges and bypasses RLS
--        on the underlying referrals + profiles tables.
-- ============================================================================

DROP VIEW IF EXISTS public.referral_leaderboard;

CREATE VIEW public.referral_leaderboard
    WITH (security_invoker = true)
AS
SELECT
    r.referrer_id,
    p.full_name AS referrer_name,
    COUNT(*) AS referral_count,
    MAX(r.created_at) AS last_referral_at
FROM public.referrals r
JOIN public.profiles p ON p.id = r.referrer_id
WHERE r.created_at >= (now() - INTERVAL '30 days')
GROUP BY r.referrer_id, p.full_name
ORDER BY referral_count DESC, last_referral_at DESC;

-- Re-grant (DROP VIEW removes grants)
GRANT SELECT ON public.referral_leaderboard TO authenticated;

-- ============================================================================
-- FIX 4: campaign_performance — Recreate as SECURITY INVOKER
--        Contains budget, spend, cost-per-lead — sensitive financial data.
--        With SECURITY INVOKER, RLS on ad_campaigns (admin-only) is enforced,
--        so non-admins get 0 rows even though GRANT is to authenticated.
-- ============================================================================

DROP VIEW IF EXISTS public.campaign_performance;

CREATE VIEW public.campaign_performance
    WITH (security_invoker = true)
AS
SELECT
    ac.id, ac.name, ac.platform, ac.utm_campaign,
    ac.budget, ac.spend_to_date, ac.start_date, ac.end_date, ac.status,
    ac.target_audience_description, ac.ad_copy, ac.notes,
    COALESCE(p.cnt, 0) AS patient_leads,
    COALESCE(t.cnt, 0) AS therapist_leads,
    COALESCE(cr.cnt, 0) AS contact_leads,
    COALESCE(pr.cnt, 0) AS signups,
    COALESCE(pq.cnt, 0) AS questionnaires,
    (COALESCE(p.cnt,0) + COALESCE(t.cnt,0) + COALESCE(cr.cnt,0)) AS total_leads,
    CASE WHEN ac.spend_to_date > 0
        THEN ROUND(ac.spend_to_date / NULLIF(COALESCE(p.cnt,0)+COALESCE(t.cnt,0)+COALESCE(cr.cnt,0), 0), 2)
        ELSE NULL
    END AS cost_per_lead,
    ac.created_at, ac.updated_at
FROM public.ad_campaigns ac
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.patients   WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) p  ON p.utm_campaign  = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.therapists WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) t  ON t.utm_campaign  = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.contact_requests WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) cr ON cr.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.profiles   WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) pr ON pr.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.portal_questionnaires WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) pq ON pq.utm_campaign = ac.utm_campaign;

GRANT SELECT ON public.campaign_performance TO authenticated;

-- ============================================================================
-- FIX 5: REVOKE PostgREST access to sensitive questionnaire/intake columns
--
--        Business context: This is a therapist-patient matchmaking platform.
--        Intake questionnaires contain highly sensitive personal data:
--        health declarations, psychiatric medication status, personal
--        weaknesses, ID numbers, digital signatures.
--
--        Column-level REVOKE blocks PostgREST from returning these columns
--        in API responses, even if the row-level RLS policy allows access.
--        Admin/service_role still has full access (service_role bypasses RLS+grants).
-- ============================================================================

-- 5a. therapists.questionnaire — JSONB with health declarations, psychiatric meds,
--     personal therapy status, medical issues, insurance info
REVOKE SELECT (questionnaire) ON public.therapists FROM anon;
REVOKE SELECT (questionnaire) ON public.therapists FROM authenticated;

-- 5b. therapists.signature_data — base64 digital signature image
REVOKE SELECT (signature_data) ON public.therapists FROM anon;
REVOKE SELECT (signature_data) ON public.therapists FROM authenticated;

-- 5c. questionnaire_submissions — NLP program application: inner world / personal reflection
--     weakness, challenge, what_is_therapist, what_touched_you are deeply personal
REVOKE SELECT (weakness, challenge, what_is_therapist, what_touched_you)
    ON public.questionnaire_submissions FROM anon;
REVOKE SELECT (weakness, challenge, what_is_therapist, what_touched_you)
    ON public.questionnaire_submissions FROM authenticated;

-- 5d. portal_questionnaires — learning portal registration: personal reflection
REVOKE SELECT (motivation_tip, main_challenge, vision_one_year)
    ON public.portal_questionnaires FROM anon;
REVOKE SELECT (motivation_tip, main_challenge, vision_one_year)
    ON public.portal_questionnaires FROM authenticated;

-- 5e. signed_contracts — government ID number + digital signature
--     These should NEVER be exposed via PostgREST API
REVOKE SELECT (signer_id_number, signature_data)
    ON public.signed_contracts FROM anon;
REVOKE SELECT (signer_id_number, signature_data)
    ON public.signed_contracts FROM authenticated;

-- 5f. course_questionnaires — SKIPPED
--     Table was dropped in migration 20260315160000_cleanup_roles_indexes_tables.sql
--     No action needed.

-- ============================================================================
-- BONUS: Fix crm_bot_phones + crm_bot_access leaking to anon/authenticated
--        (Found in same audit — personal phone numbers exposed via USING(true))
-- ============================================================================

DROP POLICY IF EXISTS "service_read_bot_phones" ON public.crm_bot_phones;
CREATE POLICY "Only service role can read bot phones"
    ON public.crm_bot_phones FOR SELECT
    USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read bot phones"
    ON public.crm_bot_phones FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "service_read_bot_access" ON public.crm_bot_access;
CREATE POLICY "Only service role can read bot access"
    ON public.crm_bot_access FOR SELECT
    USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read bot access"
    ON public.crm_bot_access FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================================
-- Summary of what this migration does:
--
-- FIX 1: course_access — admin policy aligned to profiles.role pattern
-- FIX 2: appointments — REVOKE anon (admin manages, users only SELECT)
-- FIX 3: referral_leaderboard — SECURITY INVOKER (RLS enforced on underlying tables)
-- FIX 4: campaign_performance — SECURITY INVOKER (financial data hidden from non-admins)
-- FIX 5: Column-level REVOKE on 5 tables × 11 sensitive columns:
--         therapists:                questionnaire, signature_data
--         questionnaire_submissions: weakness, challenge, what_is_therapist, what_touched_you
--         portal_questionnaires:     motivation_tip, main_challenge, vision_one_year
--         signed_contracts:          signer_id_number, signature_data
--         (course_questionnaires:    SKIPPED — table dropped)
-- BONUS: crm_bot_phones + crm_bot_access — restricted to service_role + admin
--
-- Deploy: npx supabase db push --include-all
-- ============================================================================
