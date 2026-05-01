-- Add utm_content + utm_term columns to lead-capture tables.
-- Until now only utm_source/medium/campaign were stored on these tables;
-- utm_content (ad variant id, e.g. var_a/var_b) and utm_term (image id) were
-- silently dropped at form submit, breaking A/B test attribution for the new
-- "Copy Variations Test" Meta ad set.

-- profiles: free-portal signup
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT;

-- portal_questionnaires: portal questionnaire submissions
ALTER TABLE portal_questionnaires
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT;

-- contact_requests: lead form submissions
ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT;

-- patients: patient intake form (step4)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT;

-- therapists: therapist intake form (step4)
ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term    TEXT;

-- Indexes for filtering by ad variant in admin dashboard
CREATE INDEX IF NOT EXISTS idx_profiles_utm_content              ON profiles(utm_content) WHERE utm_content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_questionnaires_utm_content ON portal_questionnaires(utm_content) WHERE utm_content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_requests_utm_content      ON contact_requests(utm_content) WHERE utm_content IS NOT NULL;

-- ─── Update lead_attribution triggers to propagate utm_content + utm_term ───
-- Triggers from 20260430090000 only handled source/medium/campaign. Extend
-- them so future ad-variant data flows into lead_attribution as well.

CREATE OR REPLACE FUNCTION public.tg_portal_q_to_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.utm_source   IS NULL
       AND NEW.utm_medium   IS NULL
       AND NEW.utm_campaign IS NULL
       AND NEW.utm_content  IS NULL
       AND NEW.utm_term     IS NULL
       AND NEW.how_found    IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.lead_attribution
        WHERE linked_table = 'portal_questionnaires' AND linked_id = NEW.id
    ) THEN
        UPDATE public.lead_attribution
           SET last_utm_source      = COALESCE(last_utm_source,      NEW.utm_source),
               last_utm_medium      = COALESCE(last_utm_medium,      NEW.utm_medium),
               last_utm_campaign    = COALESCE(last_utm_campaign,    NEW.utm_campaign),
               last_utm_content     = COALESCE(last_utm_content,     NEW.utm_content),
               last_utm_term        = COALESCE(last_utm_term,        NEW.utm_term),
               self_reported_source = COALESCE(self_reported_source, NEW.how_found)
         WHERE linked_table = 'portal_questionnaires' AND linked_id = NEW.id;
    ELSE
        INSERT INTO public.lead_attribution (
            linked_table, linked_id, phone,
            last_utm_source, last_utm_medium, last_utm_campaign,
            last_utm_content, last_utm_term,
            self_reported_source, created_at
        ) VALUES (
            'portal_questionnaires', NEW.id, NEW.phone,
            NEW.utm_source, NEW.utm_medium, NEW.utm_campaign,
            NEW.utm_content, NEW.utm_term,
            NEW.how_found, NEW.created_at
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_contact_request_to_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.utm_source   IS NULL
       AND NEW.utm_medium   IS NULL
       AND NEW.utm_campaign IS NULL
       AND NEW.utm_content  IS NULL
       AND NEW.utm_term     IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.lead_attribution
        WHERE linked_table = 'contact_requests' AND linked_id = NEW.id
    ) THEN
        UPDATE public.lead_attribution
           SET last_utm_source   = COALESCE(last_utm_source,   NEW.utm_source),
               last_utm_medium   = COALESCE(last_utm_medium,   NEW.utm_medium),
               last_utm_campaign = COALESCE(last_utm_campaign, NEW.utm_campaign),
               last_utm_content  = COALESCE(last_utm_content,  NEW.utm_content),
               last_utm_term     = COALESCE(last_utm_term,     NEW.utm_term)
         WHERE linked_table = 'contact_requests' AND linked_id = NEW.id;
    ELSE
        INSERT INTO public.lead_attribution (
            linked_table, linked_id, phone, email,
            last_utm_source, last_utm_medium, last_utm_campaign,
            last_utm_content, last_utm_term,
            created_at
        ) VALUES (
            'contact_requests', NEW.id, NEW.phone, NEW.email,
            NEW.utm_source, NEW.utm_medium, NEW.utm_campaign,
            NEW.utm_content, NEW.utm_term,
            NEW.created_at
        );
    END IF;

    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
