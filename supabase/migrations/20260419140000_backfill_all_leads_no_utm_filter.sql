-- ============================================================================
-- Backfill ALL leads into lead_attribution (not just those with UTM)
-- Records without UTM will show as (direct) in the dashboard.
-- This gives the full picture for campaign ROI analysis.
-- ============================================================================

-- portal_questionnaires (no email column)
INSERT INTO lead_attribution (linked_table, linked_id, phone,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'portal_questionnaires', id, phone,
    utm_source, utm_medium, utm_campaign, created_at
FROM portal_questionnaires
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'portal_questionnaires' AND la.linked_id = portal_questionnaires.id
);

-- profiles
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'profiles', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM profiles
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'profiles' AND la.linked_id = profiles.id
);

-- patients
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'patients', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM patients
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'patients' AND la.linked_id = patients.id
);

-- therapists
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'therapists', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM therapists
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'therapists' AND la.linked_id = therapists.id
);

-- contact_requests
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'contact_requests', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM contact_requests
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'contact_requests' AND la.linked_id = contact_requests.id
);

-- sales_leads
INSERT INTO lead_attribution (linked_table, linked_id, phone, email,
    last_utm_source, last_utm_medium, last_utm_campaign, created_at)
SELECT 'sales_leads', id, phone, email,
    utm_source, utm_medium, utm_campaign, created_at
FROM sales_leads
WHERE NOT EXISTS (
    SELECT 1 FROM lead_attribution la
    WHERE la.linked_table = 'sales_leads' AND la.linked_id = sales_leads.id
);
