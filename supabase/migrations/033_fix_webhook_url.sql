-- Migration 033: Fix webhook URL to point to actual CRM bot on Fly.io
-- Updates the trigger function from placeholder to real endpoint

CREATE OR REPLACE FUNCTION public.notify_crm_on_phone_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _webhook_url text := 'https://crm-bot-hillel.fly.dev/api/lead-webhook';
    _payload jsonb;
    _should_fire boolean := false;
BEGIN
    -- INSERT: fire if phone is not null
    IF TG_OP = 'INSERT' AND NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
        _should_fire := true;
    END IF;

    -- UPDATE: fire only if phone changed from null/empty to a value
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.phone IS NOT NULL AND NEW.phone <> '')
           AND (OLD.phone IS NULL OR OLD.phone = '') THEN
            _should_fire := true;
        END IF;
    END IF;

    IF NOT _should_fire THEN
        RETURN NEW;
    END IF;

    -- Build payload
    _payload := jsonb_build_object(
        'full_name', COALESCE(NEW.full_name, ''),
        'email',     COALESCE(NEW.email, ''),
        'phone',     NEW.phone,
        'user_id',   NEW.id,
        'source',    'NLP Practitioner Free Portal',
        'event',     TG_OP,
        'timestamp', now()
    );

    -- Fire async HTTP POST via pg_net (non-blocking)
    PERFORM net.http_post(
        url     := _webhook_url,
        body    := _payload::text,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Source', 'supabase-beit-vmetaplim'
        )
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_crm_on_phone_capture() IS
    'Sends lead data to CRM bot webhook (crm-bot-hillel.fly.dev) when a user provides their phone number.';
