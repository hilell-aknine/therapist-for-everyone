-- Fix: Drop broken phone webhook trigger that prevents phone from being saved
-- The trigger calls net.http_post (pg_net) which is not available,
-- causing ALL phone updates/inserts on profiles to fail silently.

DROP TRIGGER IF EXISTS trg_phone_lead_webhook ON public.profiles;
DROP FUNCTION IF EXISTS public.notify_crm_on_phone_capture();
