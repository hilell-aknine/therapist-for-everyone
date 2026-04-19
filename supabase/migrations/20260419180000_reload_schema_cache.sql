-- Force PostgREST to reload schema cache
-- This resolves 466 errors when functions exist but PostgREST doesn't see them
NOTIFY pgrst, 'reload schema';
