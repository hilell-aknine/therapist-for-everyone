-- ============================================================================
-- Fix: admin_traffic_funnel() — portal_questionnaires has no email column
-- Join via phone instead (added in migration 20260318100000).
-- Also join profiles via phone as fallback when email is null.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_traffic_funnel(days INT DEFAULT 30)
RETURNS TABLE(source TEXT, leads BIGINT, questionnaires BIGINT, signups BIGINT, paid BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    cutoff TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    cutoff := now() - (days || ' days')::INTERVAL;

    RETURN QUERY
    WITH attr AS (
        SELECT
            la.id,
            la.phone,
            la.email,
            COALESCE(NULLIF(la.last_utm_source,''), la.last_referrer_domain, '(direct)') AS src
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
    )
    SELECT
        attr.src                                                                              AS source,
        COUNT(DISTINCT attr.id)                                                               AS leads,
        COUNT(DISTINCT pq.id)                                                                 AS questionnaires,
        COUNT(DISTINCT p.id)                                                                  AS signups,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active')                               AS paid
    FROM attr
    LEFT JOIN public.portal_questionnaires pq
        ON (pq.phone = attr.phone AND attr.phone IS NOT NULL AND attr.phone <> '')
    LEFT JOIN public.profiles p
        ON (p.email = attr.email AND attr.email IS NOT NULL AND attr.email <> '')
        OR (p.phone = attr.phone AND attr.phone IS NOT NULL AND attr.phone <> '' AND (attr.email IS NULL OR attr.email = ''))
    LEFT JOIN public.subscriptions s ON s.user_id = p.id
    GROUP BY attr.src
    ORDER BY leads DESC
    LIMIT 15;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_funnel(INT) TO authenticated;
