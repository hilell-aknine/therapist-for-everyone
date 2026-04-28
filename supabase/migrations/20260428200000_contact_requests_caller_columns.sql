-- ============================================================================
-- Migration: contact_requests caller columns
-- Purpose: Bring contact_requests into parity with portal_questionnaires for
--          caller-workflow tracking, so admin "התקשרתי / סמן חום / שינוי
--          סטטוס" actions on contact_form leads are persisted (today they're
--          silent no-ops because the JS targets portal_questionnaires only).
--
-- Reuses existing columns where possible:
--   - status              (already exists with CHECK constraint)
--   - last_contacted_at   (already exists, written by crm-bot)
--   - contacted_by        (already exists, written by crm-bot)
-- New columns:
--   - heat_level          (admin caller view sets hot/warm/cold)
--   - call_count          (number of admin/bot call attempts)
--   - caller_notes        (free-text per call notes)
-- ============================================================================

ALTER TABLE public.contact_requests
    ADD COLUMN IF NOT EXISTS heat_level  TEXT,
    ADD COLUMN IF NOT EXISTS call_count  INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS caller_notes TEXT;

-- Optional check on heat_level values (matches portal_questionnaires convention)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contact_requests_heat_level_check'
    ) THEN
        ALTER TABLE public.contact_requests
            ADD CONSTRAINT contact_requests_heat_level_check
            CHECK (heat_level IS NULL OR heat_level IN ('hot', 'warm', 'cold'));
    END IF;
END $$;
