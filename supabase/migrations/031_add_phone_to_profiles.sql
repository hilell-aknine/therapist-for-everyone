-- Migration 031: Add phone column to profiles table
-- Required for Hard Gate (Step 2) — mandatory phone on registration

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Index for quick lookups (e.g., CRM bot matching by phone)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.profiles.phone IS 'User phone number — required for course portal access';
