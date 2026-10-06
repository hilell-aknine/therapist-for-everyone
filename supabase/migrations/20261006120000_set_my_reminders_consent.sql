-- Reminder consent from the questionnaire success screen was never saved:
-- owners have INSERT + SELECT on portal_questionnaires but no UPDATE policy
-- (deliberately — the row also carries caller notes / heat level), so the
-- client-side .update() matched 0 rows silently. 671/671 rows stayed NULL.
--
-- Fix: a narrow SECURITY DEFINER RPC that writes only the consent columns of
-- the caller's own row, and records when + where consent was given.

ALTER TABLE public.portal_questionnaires
  ADD COLUMN IF NOT EXISTS whatsapp_reminders_consent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_reminders_consent_source TEXT;

CREATE OR REPLACE FUNCTION public.set_my_reminders_consent(
  p_questionnaire_id UUID,
  p_consent          BOOLEAN
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF auth.uid() IS NULL OR p_consent IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.portal_questionnaires
     SET whatsapp_reminders_consent        = p_consent,
         whatsapp_reminders_consent_at     = now(),
         whatsapp_reminders_consent_source = 'portal-questionnaire'
   WHERE id = p_questionnaire_id
     AND user_id = auth.uid();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_reminders_consent(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_reminders_consent(UUID, BOOLEAN) TO authenticated;
