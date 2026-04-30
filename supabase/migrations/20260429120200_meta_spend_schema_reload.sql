-- PostgREST schema cache must be reloaded after adding tables/RPCs in another
-- migration; otherwise REST + RPC endpoints return PGRST202/PGRST205 until
-- the next idle period.

NOTIFY pgrst, 'reload schema';
