-- Fix: add missing columns that patient-step4 form sends
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS commitment_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS truth_confirmed BOOLEAN DEFAULT false;
