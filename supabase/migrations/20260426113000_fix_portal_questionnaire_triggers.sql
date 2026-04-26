-- ============================================================================
-- Fix: portal_questionnaires INSERT was returning 400 since 2026-04-23
-- Cause:
--   1. enqueue_qualified_lead() trigger references NEW.email — but
--      portal_questionnaires has no `email` column (email lives on profiles).
--   2. portal_questionnaire_to_contact_request() trigger inserts a `data`
--      jsonb column into contact_requests — that column doesn't exist.
-- Fix:
--   1. Drop NEW.email references in enqueue_qualified_lead — fall back to
--      v_profile.email (loaded via user_id from profiles).
--   2. Add `data jsonb` column to contact_requests so the second trigger
--      can attach questionnaire context for the CRM bot.
-- ============================================================================

-- 1. Add missing column to contact_requests
ALTER TABLE public.contact_requests
    ADD COLUMN IF NOT EXISTS data JSONB;

-- 2. Re-create enqueue_qualified_lead without NEW.email references
CREATE OR REPLACE FUNCTION public.enqueue_qualified_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attr     RECORD;
    v_profile  RECORD;
    v_event_id TEXT;
BEGIN
    -- Find the lead_attribution row by user_id only
    -- (portal_questionnaires has no email column — profile lookup below covers it)
    SELECT meta_fbc, meta_fbp, raw_ua, client_ip, capi_event_id
    INTO v_attr
    FROM public.lead_attribution
    WHERE NEW.user_id IS NOT NULL
      AND linked_id = NEW.user_id
      AND linked_table = 'profiles'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Find profile for PII
    IF NEW.user_id IS NOT NULL THEN
        SELECT email, phone, full_name INTO v_profile
        FROM public.profiles WHERE id = NEW.user_id;
    END IF;

    -- Use browser-generated event_id for dedup, or generate new one as fallback
    v_event_id := COALESCE(NULLIF(v_attr.capi_event_id, ''), gen_random_uuid()::TEXT);

    INSERT INTO public.capi_event_queue (event_name, event_id, event_source_url, user_data, custom_data)
    VALUES (
        'QualifiedLead',
        v_event_id,
        'https://www.therapist-home.com/pages/portal-questionnaire.html',
        jsonb_build_object(
            'email',       COALESCE(v_profile.email, ''),
            'phone',       COALESCE(NEW.phone, v_profile.phone, ''),
            'first_name',  COALESCE(split_part(COALESCE(v_profile.full_name, ''), ' ', 1), ''),
            'last_name',   COALESCE(
                NULLIF(
                    substring(COALESCE(v_profile.full_name, '') from position(' ' in COALESCE(v_profile.full_name, '')) + 1),
                    COALESCE(v_profile.full_name, '')
                ), ''),
            'external_id', COALESCE(NEW.user_id::TEXT, ''),
            'fbc',         COALESCE(v_attr.meta_fbc, ''),
            'fbp',         COALESCE(v_attr.meta_fbp, ''),
            'client_user_agent', COALESCE(v_attr.raw_ua, ''),
            'client_ip_address', COALESCE(v_attr.client_ip, '')
        ),
        jsonb_build_object(
            'content_name', 'questionnaire_complete',
            'source',       'portal_questionnaire_db_trigger'
        )
    );

    RETURN NEW;
END;
$$;
