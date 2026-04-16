-- ============================================================================
-- Migration: admin_get_all_leads() — Unified leads view
--
-- Returns ALL profiles LEFT JOINed with portal_questionnaires.
-- Everyone who signed up appears — those without questionnaire have NULLs.
-- Includes sensitive questionnaire columns (SECURITY DEFINER bypasses REVOKE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_all_leads()
RETURNS TABLE (
    -- Profile fields
    profile_id UUID,
    user_email TEXT,
    user_phone TEXT,
    full_name TEXT,
    user_role TEXT,
    profile_created_at TIMESTAMPTZ,
    -- Questionnaire fields (NULL if not filled)
    has_questionnaire BOOLEAN,
    q_id UUID,
    gender TEXT,
    birth_date TEXT,
    city TEXT,
    occupation TEXT,
    phone TEXT,
    how_found TEXT,
    why_nlp TEXT,
    study_time TEXT,
    digital_challenge TEXT,
    knew_ram TEXT,
    motivation_tip TEXT,
    main_challenge TEXT,
    vision_one_year TEXT,
    q_status TEXT,
    heat_level TEXT,
    call_count INT,
    last_called_at TIMESTAMPTZ,
    caller_notes TEXT,
    assigned_caller TEXT,
    utm_source TEXT,
    q_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT
        p.id                    AS profile_id,
        p.email                 AS user_email,
        p.phone                 AS user_phone,
        p.full_name             AS full_name,
        p.role                  AS user_role,
        p.created_at            AS profile_created_at,
        (pq.id IS NOT NULL)     AS has_questionnaire,
        pq.id                   AS q_id,
        pq.gender,
        pq.birth_date,
        pq.city,
        pq.occupation,
        pq.phone                AS phone,
        pq.how_found,
        pq.why_nlp,
        pq.study_time,
        pq.digital_challenge,
        pq.knew_ram,
        pq.motivation_tip,
        pq.main_challenge,
        pq.vision_one_year,
        pq.status               AS q_status,
        pq.heat_level,
        pq.call_count,
        pq.last_called_at,
        pq.caller_notes,
        pq.assigned_caller,
        pq.utm_source,
        pq.created_at           AS q_created_at
    FROM public.profiles p
    LEFT JOIN public.portal_questionnaires pq ON pq.user_id = p.id
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_leads() TO authenticated;
