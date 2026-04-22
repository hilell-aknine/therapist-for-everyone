-- Add capi_event_id to lead_attribution for browser↔server dedup.
-- The browser generates the UUID, saves it here, and the DB trigger
-- uses the SAME ID when enqueuing to capi_event_queue.

ALTER TABLE public.lead_attribution
  ADD COLUMN IF NOT EXISTS capi_event_id TEXT;

-- Update the trigger to use the stored event_id (browser-generated)
-- instead of creating a new one. Falls back to gen_random_uuid() if missing.
CREATE OR REPLACE FUNCTION public.enqueue_qualified_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attr   RECORD;
    v_profile RECORD;
    v_event_id TEXT;
BEGIN
    -- Find the lead_attribution row by user_id or email
    SELECT meta_fbc, meta_fbp, raw_ua, client_ip, capi_event_id
    INTO v_attr
    FROM public.lead_attribution
    WHERE (NEW.user_id IS NOT NULL AND linked_id = NEW.user_id AND linked_table = 'profiles')
       OR (NEW.email IS NOT NULL AND email = NEW.email)
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
            'email', COALESCE(v_profile.email, NEW.email),
            'phone', COALESCE(NEW.phone, v_profile.phone),
            'first_name', COALESCE(split_part(COALESCE(v_profile.full_name, ''), ' ', 1), ''),
            'last_name', COALESCE(
                NULLIF(
                    substring(COALESCE(v_profile.full_name, '') from position(' ' in COALESCE(v_profile.full_name, '')) + 1),
                    COALESCE(v_profile.full_name, '')
                ), ''),
            'external_id', COALESCE(NEW.user_id::TEXT, ''),
            'fbc', COALESCE(v_attr.meta_fbc, ''),
            'fbp', COALESCE(v_attr.meta_fbp, ''),
            'client_user_agent', COALESCE(v_attr.raw_ua, ''),
            'client_ip_address', COALESCE(v_attr.client_ip, '')
        ),
        jsonb_build_object(
            'content_name', 'questionnaire_complete',
            'source', 'portal_questionnaire_db_trigger'
        )
    );

    RETURN NEW;
END;
$$;
