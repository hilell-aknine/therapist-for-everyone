-- Fix: add ALL missing columns that patient-step4 form sends
-- These fields are submitted by the inline script in patient-step4.html
-- but were never added to the patients table schema.

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS military_role TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS session_style TEXT DEFAULT 'any';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS photo_base64 TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS legal_consent_date TIMESTAMPTZ;

-- Also notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
