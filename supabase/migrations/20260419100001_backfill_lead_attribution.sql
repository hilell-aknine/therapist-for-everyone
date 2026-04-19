-- ============================================================================
-- Backfill lead_attribution from existing UTM columns in lead tables
-- One-time migration — idempotent via ON CONFLICT DO NOTHING
-- Only backfills records that have at least one UTM value
-- ============================================================================

-- patients
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'patients', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM patients
WHERE (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'patients' AND la.linked_id = patients.id
  );

-- therapists
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'therapists', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM therapists
WHERE (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'therapists' AND la.linked_id = therapists.id
  );

-- contact_requests
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'contact_requests', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM contact_requests
WHERE (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'contact_requests' AND la.linked_id = contact_requests.id
  );

-- profiles (have utm columns from migration 20260318120000)
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'profiles', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM profiles
WHERE (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'profiles' AND la.linked_id = profiles.id
  );

-- portal_questionnaires (no email column in this table)
INSERT INTO lead_attribution (linked_table, linked_id, phone,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'portal_questionnaires', id, phone,
    utm_source, utm_medium, utm_campaign, created_at
FROM portal_questionnaires
WHERE (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'portal_questionnaires' AND la.linked_id = portal_questionnaires.id
  );
