-- ============================================================================
-- Migration: admin_get_all_leads() v3 — Surface contact_request data on
-- existing profile rows, and dedup contact_form source by email too.
--
-- Bug fixed:
--   Training-program leads (and any contact_requests) submitted by users who
--   already had a profile were invisible in the admin dashboard. v2 dedup
--   excluded them from source 2 (contact_form) but source 1 (profile) had
--   request_type/contact_message hardcoded to NULL, so the "טופס הכשרה" badge
--   never rendered.
--
-- Changes:
--   1. Source 1 LEFT JOIN LATERAL: pull the latest contact_request matching
--      the profile by phone OR email, surface its request_type and message.
--   2. Source 2 dedup: also exclude when email matches a profile (not just
--      phone) — fixes false-duplicates from earlier signups.
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
    -- Source 1: Registered users (profiles + optional questionnaire + latest contact_request)
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
        latest_cr.request_type  AS request_type,
        latest_cr.message       AS contact_message
    FROM public.profiles p
    LEFT JOIN public.portal_questionnaires pq ON pq.user_id = p.id
    LEFT JOIN LATERAL (
        SELECT cr.request_type, cr.message
        FROM public.contact_requests cr
        WHERE (cr.phone IS NOT NULL AND cr.phone <> '' AND cr.phone = p.phone)
           OR (cr.email IS NOT NULL AND cr.email <> '' AND cr.email = p.email)
        ORDER BY cr.created_at DESC
        LIMIT 1
    ) latest_cr ON true

    UNION ALL

    -- Source 2: Contact form submissions without a matching profile
    -- Dedup by phone OR email so we don't double-count the same person.
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
        WHERE (p2.phone IS NOT NULL AND p2.phone <> '' AND p2.phone = cr.phone)
           OR (p2.email IS NOT NULL AND p2.email <> '' AND p2.email = cr.email)
    )

    ORDER BY profile_created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_leads() TO authenticated;
