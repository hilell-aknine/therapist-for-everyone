-- ============================================================================
-- RPC: admin_get_all_attributions
--
-- Returns ALL rows from lead_attribution for admin/sales_rep UI.
-- Used by admin to render per-lead source chips in patients/therapists/leads
-- /pipeline/portal-q tables. Loaded once into a client-side Map keyed by
-- (linked_table, linked_id).
--
-- The lead_attribution table is service-role-only (RLS), so we expose this
-- SECURITY DEFINER RPC with an explicit role check.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_all_attributions()
RETURNS SETOF public.lead_attribution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'sales_rep')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT * FROM public.lead_attribution
    ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_attributions() TO authenticated;
