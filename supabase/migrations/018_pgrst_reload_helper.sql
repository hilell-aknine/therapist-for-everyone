-- Migration 018: PostgREST schema reload helper
-- Creates a callable function to refresh PostgREST schema cache
-- after adding new tables via migrations.

CREATE OR REPLACE FUNCTION public.reload_pgrst()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  NOTIFY pgrst, 'reload schema';
$$;

GRANT EXECUTE ON FUNCTION public.reload_pgrst() TO anon, authenticated, service_role;

-- Immediately reload
SELECT public.reload_pgrst();
