-- Migration: ai_chat_usage token columns — efficiency monitoring
-- Date: 2026-06-01
--
-- Context (audit-2026-06-01.md, AI token bloat #2): ai_chat_usage logged only
-- message_count — zero token/cost visibility, so there was no way to confirm
-- that knowledge-scoping actually reduced input cost.
--
-- The ai-chat Edge Function now reads OpenRouter's response `usage` and
-- accumulates per (user_id, date, source='chat') totals into these columns.
-- BIGINT because daily totals across many turns can exceed INT range over time.
--
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.

ALTER TABLE public.ai_chat_usage
    ADD COLUMN IF NOT EXISTS prompt_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completion_tokens BIGINT DEFAULT 0;

COMMENT ON COLUMN public.ai_chat_usage.prompt_tokens IS
    'Cumulative input tokens for this user/date/source (efficiency monitoring).';
COMMENT ON COLUMN public.ai_chat_usage.completion_tokens IS
    'Cumulative output tokens for this user/date/source (efficiency monitoring).';
