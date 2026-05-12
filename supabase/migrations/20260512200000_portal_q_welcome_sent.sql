-- ============================================================================
-- portal_questionnaires.welcome_sent_at
-- Single source of truth for "did this user already get the welcome WhatsApp".
-- The send-welcome-whatsapp Edge Function reads this at the start of every
-- request and refuses to double-send. Idempotency lives in the DB, not in
-- request handling logic.
-- ============================================================================

ALTER TABLE portal_questionnaires
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

-- Partial index for "still owed a welcome" scans (used by future backfill
-- cron if we ever build one). Partial keeps it tiny since most rows will be
-- non-NULL within hours of insert.
CREATE INDEX IF NOT EXISTS idx_portal_q_welcome_pending
  ON portal_questionnaires (created_at DESC)
  WHERE welcome_sent_at IS NULL;

COMMENT ON COLUMN portal_questionnaires.welcome_sent_at IS
  'Timestamp the transactional welcome WhatsApp was sent. NULL = not yet sent. Set by send-welcome-whatsapp Edge Function.';
