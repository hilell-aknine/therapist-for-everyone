-- ============================================================================
-- Update admin_traffic_overview to include utm_medium in source data
-- This lets the dashboard differentiate paid vs organic traffic
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_traffic_overview(days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
    cutoff TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    cutoff := now() - (days || ' days')::INTERVAL;

    WITH attr AS (
        SELECT * FROM public.lead_attribution WHERE created_at >= cutoff
    ),
    kpis AS (
        SELECT
            COUNT(*)                                                          AS total_leads,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')) AS today,
            COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')   AS last_7d,
            COUNT(*) FILTER (WHERE device_type = 'mobile')                    AS mobile_count,
            COUNT(*) FILTER (WHERE device_type = 'desktop')                   AS desktop_count,
            COUNT(*) FILTER (WHERE device_type = 'tablet')                    AS tablet_count
        FROM attr
    ),
    first_touch AS (
        SELECT COALESCE(NULLIF(first_utm_source,''), first_referrer_domain, '(direct)') AS source,
               COALESCE(NULLIF(first_utm_medium,''), '') AS medium,
               COUNT(*) AS n
        FROM attr
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    last_touch AS (
        SELECT COALESCE(NULLIF(last_utm_source,''), last_referrer_domain, '(direct)') AS source,
               COALESCE(NULLIF(last_utm_medium,''), '') AS medium,
               COUNT(*) AS n
        FROM attr
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    device AS (
        SELECT COALESCE(device_type,'unknown') AS device_type, COUNT(*) AS n
        FROM attr GROUP BY 1
    ),
    geo AS (
        SELECT COALESCE(NULLIF(city,''), '(unknown)') AS city,
               COALESCE(NULLIF(country_name,''), '') AS country,
               COUNT(*) AS n
        FROM attr GROUP BY 1, 2 ORDER BY n DESC LIMIT 15
    ),
    landing AS (
        SELECT COALESCE(NULLIF(last_landing_url,''), '(unknown)') AS url, COUNT(*) AS n
        FROM attr GROUP BY 1 ORDER BY n DESC LIMIT 10
    ),
    referrers AS (
        SELECT COALESCE(NULLIF(last_referrer_domain,''), '(direct)') AS domain, COUNT(*) AS n
        FROM attr
        WHERE last_utm_source IS NULL OR last_utm_source = ''
        GROUP BY 1 ORDER BY n DESC LIMIT 10
    )
    SELECT jsonb_build_object(
        'days',         days,
        'kpis',         (SELECT row_to_json(kpis)              FROM kpis),
        'first_touch',  COALESCE((SELECT jsonb_agg(row_to_json(first_touch)) FROM first_touch), '[]'::jsonb),
        'last_touch',   COALESCE((SELECT jsonb_agg(row_to_json(last_touch))  FROM last_touch),  '[]'::jsonb),
        'device',       COALESCE((SELECT jsonb_agg(row_to_json(device))      FROM device),      '[]'::jsonb),
        'geo',          COALESCE((SELECT jsonb_agg(row_to_json(geo))         FROM geo),         '[]'::jsonb),
        'landing',      COALESCE((SELECT jsonb_agg(row_to_json(landing))     FROM landing),     '[]'::jsonb),
        'referrers',    COALESCE((SELECT jsonb_agg(row_to_json(referrers))   FROM referrers),   '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

-- Also update funnel to include medium for paid/organic differentiation
DROP FUNCTION IF EXISTS public.admin_traffic_funnel(INT);
CREATE OR REPLACE FUNCTION public.admin_traffic_funnel(days INT DEFAULT 30)
RETURNS TABLE (
    source TEXT,
    medium TEXT,
    leads BIGINT,
    questionnaires BIGINT,
    signups BIGINT,
    paid BIGINT
)
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
            COALESCE(NULLIF(la.last_utm_source,''), la.last_referrer_domain, '(direct)') AS src,
            COALESCE(NULLIF(la.last_utm_medium,''), '') AS med
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
    )
    SELECT
        attr.src AS source,
        attr.med AS medium,
        COUNT(DISTINCT attr.id)                                                AS leads,
        COUNT(DISTINCT pq.id)                                                  AS questionnaires,
        COUNT(DISTINCT p.id)                                                   AS signups,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active')                AS paid
    FROM attr
    LEFT JOIN public.portal_questionnaires pq ON pq.phone = attr.phone AND pq.phone IS NOT NULL AND pq.phone != ''
    LEFT JOIN public.profiles p               ON p.phone  = attr.phone AND p.phone  IS NOT NULL AND p.phone != ''
    LEFT JOIN public.subscriptions s          ON s.user_id = p.id
    GROUP BY attr.src, attr.med
    ORDER BY leads DESC
    LIMIT 15;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_funnel(INT) TO authenticated;
