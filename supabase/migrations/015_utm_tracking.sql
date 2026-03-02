-- Migration 015: UTM Tracking Columns
-- Adds utm_source, utm_medium, utm_campaign to lead/registration tables
-- for end-to-end attribution from UTM-tagged links.

ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

ALTER TABLE therapists ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
