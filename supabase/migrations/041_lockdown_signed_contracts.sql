-- ============================================================================
-- Migration 041: Lockdown signed_contracts anonymous INSERT
-- ============================================================================
-- PROBLEM: anon_insert_signed_contracts had WITH CHECK (true) — anyone could
-- insert fake contracts with arbitrary subscription_ids.
-- FIX: Drop the open policy. All inserts now go through the submit-contract
-- Edge Function which validates Turnstile + subscription_id.
-- ============================================================================

DROP POLICY IF EXISTS "anon_insert_signed_contracts" ON signed_contracts;
