-- ============================================================================
-- Migration: AFTER INSERT triggers + gap-window backfill for lead_attribution
--
-- Bug fixed:
--   The 2026-04-29 attribution unification (20260429100000_unify_portal_q_attribution.sql)
--   was a one-shot UPDATE+INSERT backfill. No trigger was added for future inserts.
--   Result: every portal_questionnaire / contact_request created after 2026-04-29
--   has no matching lead_attribution row, so the admin source chip falls all the
--   way through to "ישיר / לא ידוע" even when utm_source/how_found are populated.
--
-- Fix:
--   1. AFTER INSERT trigger on portal_questionnaires — auto-creates (or fills)
--      a lead_attribution row from new.utm_*/how_found.
--   2. AFTER INSERT trigger on contact_requests — same pattern (no how_found
--      column on contact_requests; that's expected).
--   3. Final idempotent backfill block to catch the gap window (2026-04-29 → now)
--      for rows that already exist without a lead_attribution counterpart.
--
-- Notes:
--   * lead_attribution has no UNIQUE on (linked_table, linked_id) — guard with
--     EXISTS check inside the function instead of ON CONFLICT.
--   * SECURITY DEFINER + SET search_path = '' — same pattern as other admin DDL.
--   * Triggers do NOT touch row.email — portal_questionnaires has no email column,
--     and contact_requests email is captured separately by lead_attribution.email
--     when submit-lead Edge Function path is used (we don't override it here).
-- ============================================================================

-- ─── 1. Trigger function: portal_questionnaires AFTER INSERT ─────────────────

CREATE OR REPLACE FUNCTION public.tg_portal_q_to_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Skip if nothing meaningful to record
    IF NEW.utm_source   IS NULL
       AND NEW.utm_medium   IS NULL
       AND NEW.utm_campaign IS NULL
       AND NEW.how_found    IS NULL THEN
        RETURN NEW;
    END IF;

    -- Existing row (e.g. created earlier by submit-lead Edge Function for the
    -- profile/contact_request path) — fill in any NULL fields, don't overwrite.
    IF EXISTS (
        SELECT 1 FROM public.lead_attribution
        WHERE linked_table = 'portal_questionnaires' AND linked_id = NEW.id
    ) THEN
        UPDATE public.lead_attribution
           SET last_utm_source      = COALESCE(last_utm_source,      NEW.utm_source),
               last_utm_medium      = COALESCE(last_utm_medium,      NEW.utm_medium),
               last_utm_campaign    = COALESCE(last_utm_campaign,    NEW.utm_campaign),
               self_reported_source = COALESCE(self_reported_source, NEW.how_found)
         WHERE linked_table = 'portal_questionnaires' AND linked_id = NEW.id;
    ELSE
        INSERT INTO public.lead_attribution (
            linked_table, linked_id, phone,
            last_utm_source, last_utm_medium, last_utm_campaign,
            self_reported_source, created_at
        ) VALUES (
            'portal_questionnaires', NEW.id, NEW.phone,
            NEW.utm_source, NEW.utm_medium, NEW.utm_campaign,
            NEW.how_found, NEW.created_at
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_q_to_attribution ON public.portal_questionnaires;
CREATE TRIGGER portal_q_to_attribution
    AFTER INSERT ON public.portal_questionnaires
    FOR EACH ROW EXECUTE FUNCTION public.tg_portal_q_to_attribution();

-- ─── 2. Trigger function: contact_requests AFTER INSERT ──────────────────────

CREATE OR REPLACE FUNCTION public.tg_contact_request_to_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Skip if no UTM signal at all (contact_requests has no how_found)
    IF NEW.utm_source   IS NULL
       AND NEW.utm_medium   IS NULL
       AND NEW.utm_campaign IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.lead_attribution
        WHERE linked_table = 'contact_requests' AND linked_id = NEW.id
    ) THEN
        UPDATE public.lead_attribution
           SET last_utm_source   = COALESCE(last_utm_source,   NEW.utm_source),
               last_utm_medium   = COALESCE(last_utm_medium,   NEW.utm_medium),
               last_utm_campaign = COALESCE(last_utm_campaign, NEW.utm_campaign)
         WHERE linked_table = 'contact_requests' AND linked_id = NEW.id;
    ELSE
        INSERT INTO public.lead_attribution (
            linked_table, linked_id, phone, email,
            last_utm_source, last_utm_medium, last_utm_campaign,
            created_at
        ) VALUES (
            'contact_requests', NEW.id, NEW.phone, NEW.email,
            NEW.utm_source, NEW.utm_medium, NEW.utm_campaign,
            NEW.created_at
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_request_to_attribution ON public.contact_requests;
CREATE TRIGGER contact_request_to_attribution
    AFTER INSERT ON public.contact_requests
    FOR EACH ROW EXECUTE FUNCTION public.tg_contact_request_to_attribution();

-- ─── 3. Gap-window backfill (2026-04-29 → now) ───────────────────────────────
-- Idempotent via NOT EXISTS guards. Same pattern as 20260429100000.

-- portal_questionnaires
INSERT INTO public.lead_attribution (
    linked_table, linked_id, phone,
    last_utm_source, last_utm_medium, last_utm_campaign,
    self_reported_source, created_at
)
SELECT
    'portal_questionnaires', pq.id, pq.phone,
    pq.utm_source, pq.utm_medium, pq.utm_campaign,
    pq.how_found, pq.created_at
FROM public.portal_questionnaires pq
WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_attribution la
    WHERE la.linked_table = 'portal_questionnaires' AND la.linked_id = pq.id
)
  AND (pq.utm_source IS NOT NULL
       OR pq.utm_medium   IS NOT NULL
       OR pq.utm_campaign IS NOT NULL
       OR pq.how_found    IS NOT NULL);

-- contact_requests
INSERT INTO public.lead_attribution (
    linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign,
    created_at
)
SELECT
    'contact_requests', cr.id, cr.phone, cr.email,
    cr.utm_source, cr.utm_medium, cr.utm_campaign,
    cr.created_at
FROM public.contact_requests cr
WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_attribution la
    WHERE la.linked_table = 'contact_requests' AND la.linked_id = cr.id
)
  AND (cr.utm_source IS NOT NULL
       OR cr.utm_medium   IS NOT NULL
       OR cr.utm_campaign IS NOT NULL);

-- Also UPDATE existing portal_q attribution rows whose self_reported_source/utm_*
-- is NULL but the source row has data (covers rows created between trigger
-- registration and backfill of stale fields).
UPDATE public.lead_attribution la
SET last_utm_source      = COALESCE(la.last_utm_source,      pq.utm_source),
    last_utm_medium      = COALESCE(la.last_utm_medium,      pq.utm_medium),
    last_utm_campaign    = COALESCE(la.last_utm_campaign,    pq.utm_campaign),
    self_reported_source = COALESCE(la.self_reported_source, pq.how_found)
FROM public.portal_questionnaires pq
WHERE la.linked_table = 'portal_questionnaires'
  AND la.linked_id    = pq.id
  AND (
      (la.last_utm_source      IS NULL AND pq.utm_source   IS NOT NULL) OR
      (la.last_utm_medium      IS NULL AND pq.utm_medium   IS NOT NULL) OR
      (la.last_utm_campaign    IS NULL AND pq.utm_campaign IS NOT NULL) OR
      (la.self_reported_source IS NULL AND pq.how_found    IS NOT NULL)
  );

UPDATE public.lead_attribution la
SET last_utm_source   = COALESCE(la.last_utm_source,   cr.utm_source),
    last_utm_medium   = COALESCE(la.last_utm_medium,   cr.utm_medium),
    last_utm_campaign = COALESCE(la.last_utm_campaign, cr.utm_campaign)
FROM public.contact_requests cr
WHERE la.linked_table = 'contact_requests'
  AND la.linked_id    = cr.id
  AND (
      (la.last_utm_source   IS NULL AND cr.utm_source   IS NOT NULL) OR
      (la.last_utm_medium   IS NULL AND cr.utm_medium   IS NOT NULL) OR
      (la.last_utm_campaign IS NULL AND cr.utm_campaign IS NOT NULL)
  );
