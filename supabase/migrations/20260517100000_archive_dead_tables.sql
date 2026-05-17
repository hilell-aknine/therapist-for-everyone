-- ============================================================================
-- Archive 18 dead / legacy tables in beit-vmetaplim Supabase
-- ============================================================================
-- Approach: RENAME with `_archive_` prefix. Fully reversible via the rollback
-- file at sql/rollback/20260517100000_archive_dead_tables.rollback.sql.
--
-- Why each table is archived (validated via REST API audit on 2026-05-17):
--
--   GROUP A — 0 rows ever, no live writers:
--     questionnaire_submissions  (legacy app form, never went live)
--     matches                    (marketplace patient-therapist pairing)
--     appointments               (marketplace scheduling)
--     subscriptions              (no paid customer yet — uses signed_contracts when live)
--     signed_contracts           (no contract signed digitally yet)
--     ad_campaigns               (table built, never populated)
--     crm_notes                  (CRM bot feature never activated)
--     crm_payments               (CRM bot feature never activated)
--
--   GROUP B — community feature dead (1-4 rows, last write 2026-04 to 2026-05):
--     community_likes
--     community_comments
--     community_posts
--     community_members
--     community_categories
--
--   GROUP C — marketplace pivoted away (1-2 rows each, last write 2026-04):
--     patients
--     therapists
--     sales_leads
--
-- RLS policies and FK constraints follow the rename automatically in Postgres.
-- No data is lost. Rows remain queryable as public._archive_<name>.
-- ============================================================================

BEGIN;

-- GROUP A — empty tables
ALTER TABLE IF EXISTS public.questionnaire_submissions RENAME TO _archive_questionnaire_submissions;
ALTER TABLE IF EXISTS public.matches                   RENAME TO _archive_matches;
ALTER TABLE IF EXISTS public.appointments              RENAME TO _archive_appointments;
ALTER TABLE IF EXISTS public.subscriptions             RENAME TO _archive_subscriptions;
ALTER TABLE IF EXISTS public.signed_contracts          RENAME TO _archive_signed_contracts;
ALTER TABLE IF EXISTS public.ad_campaigns              RENAME TO _archive_ad_campaigns;
ALTER TABLE IF EXISTS public.crm_notes                 RENAME TO _archive_crm_notes;
ALTER TABLE IF EXISTS public.crm_payments              RENAME TO _archive_crm_payments;

-- GROUP B — community feature dead
ALTER TABLE IF EXISTS public.community_likes      RENAME TO _archive_community_likes;
ALTER TABLE IF EXISTS public.community_comments   RENAME TO _archive_community_comments;
ALTER TABLE IF EXISTS public.community_posts      RENAME TO _archive_community_posts;
ALTER TABLE IF EXISTS public.community_members    RENAME TO _archive_community_members;
ALTER TABLE IF EXISTS public.community_categories RENAME TO _archive_community_categories;

-- GROUP C — marketplace legacy
ALTER TABLE IF EXISTS public.patients    RENAME TO _archive_patients;
ALTER TABLE IF EXISTS public.therapists  RENAME TO _archive_therapists;
ALTER TABLE IF EXISTS public.sales_leads RENAME TO _archive_sales_leads;

COMMIT;

-- ============================================================================
-- NOT done in this migration (intentionally — separate change later):
--   * profiles.role CHECK constraint still allows 'patient' | 'therapist' | 'sales_rep'.
--     We leave it because existing profile rows may still carry these values.
--     A follow-up migration will: update those rows → 'student_lead',
--     then ALTER the CHECK to drop the unused values.
--   * Code references in admin-*.js / Edge Functions to the archived tables
--     are not changed here. Frontend continues to read 0 rows (same as today),
--     no user-visible behavior changes.
--   * Backup script (scripts/backup-supabase.py) TABLES list still contains the
--     old names. Update separately so daily backup keeps capturing _archive_ tables.
-- ============================================================================
