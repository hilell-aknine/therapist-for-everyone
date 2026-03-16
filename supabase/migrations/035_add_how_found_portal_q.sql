-- 035: Add how_found column to portal_questionnaires
ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS how_found TEXT;
