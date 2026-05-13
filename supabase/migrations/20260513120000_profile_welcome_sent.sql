-- ============================================================================
-- profiles.whatsapp_welcome_sent_at
-- Single source of truth for "did this signup already get the welcome WhatsApp".
-- Mirrors the portal_questionnaires.welcome_sent_at pattern (migration
-- 20260512200000): the send-welcome-whatsapp Edge Function reads this at the
-- start of every {profile_id} request and refuses to double-send. Idempotency
-- lives in the DB, not in request handling logic.
--
-- Forward-only rollout: every existing profile is marked as "already received"
-- by this migration. The audience for the new automation is anyone created
-- AFTER this migration runs.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS whatsapp_welcome_sent_at TIMESTAMPTZ;

UPDATE profiles
  SET whatsapp_welcome_sent_at = NOW()
  WHERE whatsapp_welcome_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_welcome_pending
  ON profiles (created_at DESC)
  WHERE whatsapp_welcome_sent_at IS NULL;

COMMENT ON COLUMN profiles.whatsapp_welcome_sent_at IS
  'Timestamp the transactional signup welcome WhatsApp was sent. NULL = eligible. Set by send-welcome-whatsapp Edge Function with profile_id payload.';
