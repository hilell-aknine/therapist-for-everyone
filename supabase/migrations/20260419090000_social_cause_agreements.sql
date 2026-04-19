-- ============================================================================
-- Migration: Social cause agreement tracking
--
-- Add agreement_signed_at to patients and therapists tables.
-- Add agreement_signature (base64) to therapists (they sign with canvas).
-- ============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMPTZ;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMPTZ;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS agreement_signature TEXT;
