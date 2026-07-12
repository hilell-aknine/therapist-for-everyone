-- Demo bot: store conversation history + permanent handoff records
-- Built from Gemini-designed bot logic (qualification flow + handoff).

-- 1) Add history column to demo_sessions for multi-turn conversation memory
ALTER TABLE demo_sessions
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Permanent record of every handoff (qualified lead)
CREATE TABLE IF NOT EXISTS demo_handoffs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  sender_name   text,
  conversation  jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  notified_at   timestamptz,
  contacted_at  timestamptz,
  notes         text
);

CREATE INDEX IF NOT EXISTS demo_handoffs_phone_idx   ON demo_handoffs (phone);
CREATE INDEX IF NOT EXISTS demo_handoffs_created_idx ON demo_handoffs (created_at DESC);

ALTER TABLE demo_handoffs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE demo_handoffs IS 'Qualified leads from AI Studio demo bot. Each row = visitor who reached handoff stage.';
