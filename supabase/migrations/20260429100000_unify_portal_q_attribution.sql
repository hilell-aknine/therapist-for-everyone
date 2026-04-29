-- ============================================================================
-- Unify portal_questionnaires source data into lead_attribution
--
-- Phase 1 audit (2026-04-29) revealed: portal_questionnaires holds the only
-- meaningful UTM/how_found data in the system (291 of 299 rows), but only 136
-- of 240 attribution rows linked to portal_questionnaires actually have UTM
-- copied over. ~59 questionnaires don't have an attribution row at all.
--
-- This migration:
--   1. Adds self_reported_source column to lead_attribution (for how_found)
--   2. UPDATE: backfills missing UTM + how_found into existing attribution rows
--   3. INSERT: creates attribution rows for questionnaires that have any source
--      signal but no attribution row yet
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─── 1. Add self_reported_source column ──────────────────────────────────────
ALTER TABLE public.lead_attribution
    ADD COLUMN IF NOT EXISTS self_reported_source TEXT;

COMMENT ON COLUMN public.lead_attribution.self_reported_source
    IS 'Self-reported "how did you hear about us" answer from portal questionnaire (Hebrew free text). Distinct from UTM which is technical.';

-- ─── 2. Backfill UPDATE — fill missing UTM/how_found into existing rows ──────
-- For attribution rows linked to portal_questionnaires that have NULL fields
-- but the source questionnaire has data, copy it over.
UPDATE public.lead_attribution la
SET
    last_utm_source       = COALESCE(la.last_utm_source,       pq.utm_source),
    last_utm_medium       = COALESCE(la.last_utm_medium,       pq.utm_medium),
    last_utm_campaign     = COALESCE(la.last_utm_campaign,     pq.utm_campaign),
    self_reported_source  = COALESCE(la.self_reported_source,  pq.how_found)
FROM public.portal_questionnaires pq
WHERE la.linked_table = 'portal_questionnaires'
  AND la.linked_id    = pq.id
  AND (
      (la.last_utm_source      IS NULL AND pq.utm_source   IS NOT NULL) OR
      (la.last_utm_medium      IS NULL AND pq.utm_medium   IS NOT NULL) OR
      (la.last_utm_campaign    IS NULL AND pq.utm_campaign IS NOT NULL) OR
      (la.self_reported_source IS NULL AND pq.how_found    IS NOT NULL)
  );

-- ─── 3. Backfill INSERT — create rows for questionnaires that have no
--       attribution row yet (only if they actually have source data to record) ─
INSERT INTO public.lead_attribution (
    linked_table, linked_id, phone,
    last_utm_source, last_utm_medium, last_utm_campaign,
    self_reported_source, created_at
)
SELECT
    'portal_questionnaires',
    pq.id,
    pq.phone,
    pq.utm_source,
    pq.utm_medium,
    pq.utm_campaign,
    pq.how_found,
    pq.created_at
FROM public.portal_questionnaires pq
WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_attribution la
    WHERE la.linked_table = 'portal_questionnaires'
      AND la.linked_id    = pq.id
)
  AND (pq.utm_source IS NOT NULL OR pq.how_found IS NOT NULL);
