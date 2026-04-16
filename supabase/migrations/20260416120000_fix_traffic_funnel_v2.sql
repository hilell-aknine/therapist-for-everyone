-- ============================================================================
-- Fix v2: admin_traffic_funnel() — simplify joins, avoid OR join ambiguity
-- portal_questionnaires: join via phone
-- profiles: join via email (primary), UNION with phone-only matches
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
    ),
    matched_profiles AS (
        SELECT attr.id AS attr_id, p.id AS profile_id
        FROM attr
        JOIN public.profiles p ON p.email = attr.email
        WHERE attr.email IS NOT NULL AND attr.email <> ''
        UNION
        SELECT attr.id, p.id
        FROM attr
        JOIN public.profiles p ON p.phone = attr.phone
        WHERE attr.phone IS NOT NULL AND attr.phone <> ''
          AND (attr.email IS NULL OR attr.email = '')
    )
    SELECT
        attr.src                                                                    AS source,
        COUNT(DISTINCT attr.id)                                                      AS leads,
        COUNT(DISTINCT pq.id)                                                        AS questionnaires,
        COUNT(DISTINCT mp.profile_id)                                                AS signups,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active')                      AS paid
    FROM attr
    LEFT JOIN public.portal_questionnaires pq
        ON pq.phone = attr.phone AND attr.phone IS NOT NULL AND attr.phone <> ''
    LEFT JOIN matched_profiles mp ON mp.attr_id = attr.id
    LEFT JOIN public.subscriptions s ON s.user_id = mp.profile_id
    GROUP BY attr.src
    ORDER BY leads DESC
    LIMIT 15;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_funnel(INT) TO authenticated;
