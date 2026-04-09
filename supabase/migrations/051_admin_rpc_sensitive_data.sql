-- ============================================================================
-- Migration 051: Admin RPC functions for sensitive data access
--
-- Migration 049 REVOKEd SELECT on sensitive columns from authenticated role.
-- This blocks PostgREST API access for regular users (good), but also
-- blocks the admin panel which uses the same authenticated role (bad).
--
-- Solution: SECURITY DEFINER functions that verify admin role, then
-- return full data including sensitive columns. The function runs as
-- the definer (superuser), bypassing column-level REVOKE.
--
-- The JS admin code calls db.rpc('function_name') instead of
-- db.from('table').select('*').
-- ============================================================================

-- 1. Full therapist data (including questionnaire JSONB + signature)
CREATE OR REPLACE FUNCTION public.admin_get_therapists_full()
RETURNS SETOF public.therapists
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY SELECT * FROM public.therapists ORDER BY created_at DESC;
END;
$$;

-- 2. All questionnaire submissions (including inner world answers)
CREATE OR REPLACE FUNCTION public.admin_get_questionnaire_submissions_full()
RETURNS SETOF public.questionnaire_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY SELECT * FROM public.questionnaire_submissions ORDER BY created_at DESC;
END;
$$;

-- 3. Single questionnaire submission by ID (for pipeline modal)
CREATE OR REPLACE FUNCTION public.admin_get_questionnaire_by_id(q_id UUID)
RETURNS SETOF public.questionnaire_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY SELECT * FROM public.questionnaire_submissions WHERE id = q_id;
END;
$$;

-- 4. All portal questionnaires (including personal reflection answers)
CREATE OR REPLACE FUNCTION public.admin_get_portal_questionnaires_full()
RETURNS SETOF public.portal_questionnaires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY SELECT * FROM public.portal_questionnaires ORDER BY created_at DESC;
END;
$$;

-- Grant EXECUTE to authenticated (the function itself checks admin role)
GRANT EXECUTE ON FUNCTION public.admin_get_therapists_full() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_questionnaire_submissions_full() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_questionnaire_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_portal_questionnaires_full() TO authenticated;

-- Deny anonymous execution
REVOKE EXECUTE ON FUNCTION public.admin_get_therapists_full() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_questionnaire_submissions_full() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_questionnaire_by_id(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_portal_questionnaires_full() FROM anon;
