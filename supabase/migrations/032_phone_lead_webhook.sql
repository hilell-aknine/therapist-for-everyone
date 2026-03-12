-- Migration 032: Auto-push leads to CRM webhook when phone is captured
-- Trigger: AFTER INSERT or UPDATE on profiles, ONLY when phone IS NOT NULL
-- Uses pg_net (built into Supabase) for async HTTP POST — no Edge Function needed

-- 1. Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.notify_crm_on_phone_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _webhook_url text := 'https://YOUR-WEBHOOK-URL-HERE.com';
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

    -- Fire async HTTP POST via pg_net (non-blocking, won't slow down the transaction)
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

-- 3. Create the trigger (drop first to make idempotent)
DROP TRIGGER IF EXISTS trg_phone_lead_webhook ON public.profiles;

CREATE TRIGGER trg_phone_lead_webhook
    AFTER INSERT OR UPDATE OF phone
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_crm_on_phone_capture();

-- 4. Verify
COMMENT ON FUNCTION public.notify_crm_on_phone_capture() IS
    'Sends lead data to CRM webhook when a user provides their phone number. Webhook URL must be updated before production use.';
