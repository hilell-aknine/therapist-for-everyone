-- Backfill: Copy phone numbers from auth.users metadata to profiles
-- The phone was stored in raw_user_meta_data during signup but never
-- reached profiles due to the broken trg_phone_lead_webhook trigger.

UPDATE public.profiles p
SET phone = (au.raw_user_meta_data ->> 'phone')
FROM auth.users au
WHERE p.id = au.id
  AND p.phone IS NULL
  AND au.raw_user_meta_data ->> 'phone' IS NOT NULL
  AND au.raw_user_meta_data ->> 'phone' <> '';
