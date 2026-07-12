-- Demo sessions for AI Studio landing page bot demo
-- Stores conversation state for visitors who message the bot via "דמו" trigger.
-- Phone is PK because each visitor's conversation is uniquely tied to their number.
-- 24h TTL means abandoned demos auto-clean.

CREATE TABLE IF NOT EXISTS demo_sessions (
  phone        text PRIMARY KEY,
  step         text NOT NULL,
  sender_name  text,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_sessions_expires_idx ON demo_sessions (expires_at);

-- Service-role bypasses RLS. No public access needed.
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;

-- Cleanup function (optional — service can call this from a cron, or the
-- table can be pruned via Supabase scheduled function later).
CREATE OR REPLACE FUNCTION cleanup_expired_demo_sessions()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM demo_sessions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE demo_sessions IS 'Conversation state for AI Studio demo bot visitors. 24h TTL.';
