-- ============================================================================
-- Migration: Add phone + how_found columns to portal_questionnaires
-- Phone is collected in questionnaire for Google OAuth users who skip signup form
-- ============================================================================

ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE portal_questionnaires ADD COLUMN IF NOT EXISTS how_found TEXT;
