-- 036: Add caller/SDR fields to portal_questionnaires
-- Supports the caller workflow: call tracking, heat level, notes

ALTER TABLE portal_questionnaires
    ADD COLUMN IF NOT EXISTS heat_level TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS caller_notes TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS assigned_caller TEXT DEFAULT NULL;

-- Index for caller queries (filter by heat + sort by last called)
CREATE INDEX IF NOT EXISTS idx_portal_q_heat ON portal_questionnaires(heat_level);
CREATE INDEX IF NOT EXISTS idx_portal_q_caller ON portal_questionnaires(assigned_caller);
