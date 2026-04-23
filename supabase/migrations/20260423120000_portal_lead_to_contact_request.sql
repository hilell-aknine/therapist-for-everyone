-- ============================================
-- Migration: Auto-create contact_request from portal questionnaire
-- Purpose: CRM bot needs contact_requests rows to trigger WhatsApp follow-up.
--          Portal questionnaire submissions were only creating portal_questionnaires
--          rows, leaving the CRM bot blind to new leads.
-- ============================================

CREATE OR REPLACE FUNCTION public.portal_questionnaire_to_contact_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if no existing contact_request with same email
  INSERT INTO public.contact_requests (full_name, email, phone, request_type, status, data, created_at)
  SELECT
    p.full_name,
    p.email,
    p.phone,
    'portal_questionnaire',
    'new',
    jsonb_build_object(
      'how_found', NEW.how_found,
      'why_nlp', NEW.why_nlp,
      'utm_source', NEW.utm_source,
      'utm_medium', NEW.utm_medium,
      'utm_campaign', NEW.utm_campaign
    ),
    NOW()
  FROM public.profiles p
  WHERE p.id = NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.contact_requests cr
      WHERE cr.email = p.email
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_questionnaire_to_contact_request ON public.portal_questionnaires;

CREATE TRIGGER trg_questionnaire_to_contact_request
AFTER INSERT ON public.portal_questionnaires
FOR EACH ROW
EXECUTE FUNCTION public.portal_questionnaire_to_contact_request();
