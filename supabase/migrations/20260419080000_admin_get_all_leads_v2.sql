-- ============================================================================
-- Migration: admin_get_all_leads() v2 — Unified leads view
--
-- Returns ALL leads from TWO sources:
-- 1. profiles LEFT JOIN portal_questionnaires (registered users)
-- 2. contact_requests (form submissions without account)
--
-- Adds lead_source column: 'profile' or 'contact_form'
-- Everyone who ever interacted appears in one unified view.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_get_all_leads();
CREATE FUNCTION public.admin_get_all_leads()
RETURNS TABLE (
    profile_id UUID,
    user_email TEXT,
    user_phone TEXT,
    full_name TEXT,
    user_role TEXT,
    profile_created_at TIMESTAMPTZ,
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
    q_created_at TIMESTAMPTZ,
    lead_source TEXT,
    request_type TEXT,
    contact_message TEXT
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
    -- Source 1: Registered users (profiles + optional questionnaire)
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
        COALESCE(pq.phone, p.phone) AS phone,
        pq.how_found,
        pq.why_nlp,
        pq.study_time,
        pq.digital_challenge,
        pq.knew_ram,
        pq.motivation_tip,
        pq.main_challenge,
        pq.vision_one_year,
        COALESCE(pq.status, 'new') AS q_status,
        pq.heat_level,
        COALESCE(pq.call_count, 0) AS call_count,
        pq.last_called_at,
        pq.caller_notes,
        pq.assigned_caller,
        COALESCE(pq.utm_source, p.utm_source) AS utm_source,
        pq.created_at           AS q_created_at,
        'profile'::TEXT         AS lead_source,
        NULL::TEXT               AS request_type,
        NULL::TEXT               AS contact_message
    FROM public.profiles p
    LEFT JOIN public.portal_questionnaires pq ON pq.user_id = p.id

    UNION ALL

    -- Source 2: Contact form submissions (no account)
    -- Exclude those whose phone already exists in profiles (avoid duplicates)
    SELECT
        cr.id                   AS profile_id,
        cr.email                AS user_email,
        cr.phone                AS user_phone,
        COALESCE(cr.full_name, cr.name) AS full_name,
        NULL::TEXT               AS user_role,
        cr.created_at           AS profile_created_at,
        false                   AS has_questionnaire,
        NULL::UUID               AS q_id,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        cr.phone                AS phone,
        NULL::TEXT               AS how_found,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT,
        cr.status               AS q_status,
        NULL::TEXT               AS heat_level,
        0                       AS call_count,
        cr.last_contacted_at    AS last_called_at,
        NULL::TEXT               AS caller_notes,
        NULL::TEXT               AS assigned_caller,
        cr.utm_source,
        cr.created_at           AS q_created_at,
        'contact_form'::TEXT    AS lead_source,
        cr.request_type,
        cr.message              AS contact_message
    FROM public.contact_requests cr
    WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.phone IS NOT NULL AND p2.phone <> ''
          AND p2.phone = cr.phone
    )

    ORDER BY profile_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_leads() TO authenticated;
