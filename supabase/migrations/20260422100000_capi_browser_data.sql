-- Add Meta CAPI browser-side fields to lead_attribution.
-- These are captured from the browser during form submission so that
-- a server-side Database Webhook can fire CAPI events without AdBlock risk.

ALTER TABLE public.lead_attribution
  ADD COLUMN IF NOT EXISTS meta_fbc  TEXT,
  ADD COLUMN IF NOT EXISTS meta_fbp  TEXT,
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- Also create a lightweight table to queue CAPI events from DB triggers.
-- A pg_net webhook or Edge Function cron processes these rows.
CREATE TABLE IF NOT EXISTS public.capi_event_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_name      TEXT NOT NULL,
    event_id        TEXT NOT NULL,
    event_source_url TEXT,
    user_data       JSONB NOT NULL DEFAULT '{}',
    custom_data     JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    error           TEXT,
    sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_capi_queue_pending ON public.capi_event_queue(status) WHERE status = 'pending';

-- RLS: service role only (Edge Functions use service_role key)
ALTER TABLE public.capi_event_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON public.capi_event_queue;
CREATE POLICY "service role only" ON public.capi_event_queue FOR ALL USING (false) WITH CHECK (false);

-- Function: called by DB trigger when portal_questionnaires gets an INSERT.
-- Enqueues a QualifiedLead CAPI event using PII + browser data from lead_attribution.
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
    -- Find the lead_attribution row by email or user_id
    SELECT meta_fbc, meta_fbp, raw_ua, client_ip, first_fbclid
    INTO v_attr
    FROM public.lead_attribution
    WHERE (NEW.user_id IS NOT NULL AND linked_id = NEW.user_id AND linked_table = 'profiles')
       OR (NEW.email IS NOT NULL AND email = NEW.email)
    ORDER BY created_at DESC
    LIMIT 1;

    -- Find profile for email
    IF NEW.user_id IS NOT NULL THEN
        SELECT email, phone, full_name INTO v_profile
        FROM public.profiles WHERE id = NEW.user_id;
    END IF;

    v_event_id := gen_random_uuid()::TEXT;

    INSERT INTO public.capi_event_queue (event_name, event_id, event_source_url, user_data, custom_data)
    VALUES (
        'QualifiedLead',
        v_event_id,
        'https://www.therapist-home.com/pages/portal-questionnaire.html',
        jsonb_build_object(
            'email', COALESCE(v_profile.email, NEW.email),
            'phone', COALESCE(NEW.phone, v_profile.phone),
            'first_name', COALESCE(split_part(v_profile.full_name, ' ', 1), ''),
            'last_name', COALESCE(nullif(substring(v_profile.full_name from position(' ' in v_profile.full_name) + 1), v_profile.full_name), ''),
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

-- Trigger: fire on every new questionnaire submission
DROP TRIGGER IF EXISTS trg_enqueue_qualified_lead ON public.portal_questionnaires;
CREATE TRIGGER trg_enqueue_qualified_lead
    AFTER INSERT ON public.portal_questionnaires
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_qualified_lead();
