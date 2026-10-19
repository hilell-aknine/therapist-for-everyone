-- =============================================================================
-- ai_chat_usage: writes are server-only.
--
-- ⚠️ PREPARED, NOT APPLIED. Written by security-hardener 19.10.2026. Hillel runs
-- it (Management API, one transaction with the ledger row). Do NOT `db push
-- --include-all`.
--
-- Why: ai_chat_usage is the ledger behind the shared monthly AI ceiling and the
-- mentors' daily message limit. Learner-facing write policies left over from the
-- mentor era let a row owner edit those counters. Details are in the private gate
-- certificate (gate-security-hardening-2026-10-19.md, not committed: public repo).
--
-- Every legitimate writer is an Edge Function using service_role, which bypasses
-- RLS. No page writes this table (grep 19.10.2026: js/, pages/ — none).
-- This migration only TIGHTENS: it removes the two write policies and refuses
-- negative values. The learner's own SELECT policy stays.
-- =============================================================================

begin;

drop policy if exists "Users can insert own usage" on public.ai_chat_usage;
drop policy if exists "Users can update own usage" on public.ai_chat_usage;

-- Belt and braces: even a service-role bug cannot store a negative counter.
-- Pre-check 19.10.2026: zero rows with a negative value, so VALIDATE is safe.
alter table public.ai_chat_usage
  add constraint ai_chat_usage_nonnegative
  check (coalesce(prompt_tokens, 0) >= 0
     and coalesce(completion_tokens, 0) >= 0
     and coalesce(message_count, 0) >= 0);

commit;

-- Verify after applying (expected: only the SELECT policy remains):
--   select policyname, cmd from pg_policies where tablename = 'ai_chat_usage';
-- Live check with a student JWT: POST /rest/v1/ai_chat_usage → 403 (42501).
-- Flow check: one mentor message + one sandbox turn still log a usage row.
