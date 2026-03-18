-- Add UTM tracking columns to profiles and portal_questionnaires
-- so we know which users registered via Instagram (or other UTM sources)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
