-- ============================================================================
-- ROLLBACK for 20260517100000_archive_dead_tables.sql
-- ============================================================================
-- Run this in SQL Editor if anything breaks after the archive migration.
-- Inverse of all RENAME operations from the original migration.
-- ============================================================================

BEGIN;

-- GROUP A — empty tables
ALTER TABLE IF EXISTS public._archive_questionnaire_submissions RENAME TO questionnaire_submissions;
ALTER TABLE IF EXISTS public._archive_matches                   RENAME TO matches;
ALTER TABLE IF EXISTS public._archive_appointments              RENAME TO appointments;
ALTER TABLE IF EXISTS public._archive_subscriptions             RENAME TO subscriptions;
ALTER TABLE IF EXISTS public._archive_signed_contracts          RENAME TO signed_contracts;
ALTER TABLE IF EXISTS public._archive_ad_campaigns              RENAME TO ad_campaigns;
ALTER TABLE IF EXISTS public._archive_crm_notes                 RENAME TO crm_notes;
ALTER TABLE IF EXISTS public._archive_crm_payments              RENAME TO crm_payments;

-- GROUP B — community feature
ALTER TABLE IF EXISTS public._archive_community_likes      RENAME TO community_likes;
ALTER TABLE IF EXISTS public._archive_community_comments   RENAME TO community_comments;
ALTER TABLE IF EXISTS public._archive_community_posts      RENAME TO community_posts;
ALTER TABLE IF EXISTS public._archive_community_members    RENAME TO community_members;
ALTER TABLE IF EXISTS public._archive_community_categories RENAME TO community_categories;

-- GROUP C — marketplace
ALTER TABLE IF EXISTS public._archive_patients    RENAME TO patients;
ALTER TABLE IF EXISTS public._archive_therapists  RENAME TO therapists;
ALTER TABLE IF EXISTS public._archive_sales_leads RENAME TO sales_leads;

COMMIT;
