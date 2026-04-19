-- ============================================================================
-- Fix: Count unique PEOPLE, not rows, in traffic dashboard
-- One person can have rows in profiles + portal_questionnaires + patients etc.
-- Use COALESCE(phone, email) as the unique identifier.
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
    -- Unique person = distinct phone (or email if no phone, or id as fallback)
    unique_people AS (
        SELECT DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS person_key
        FROM attr
    ),
    unique_today AS (
        SELECT DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS person_key
        FROM attr
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')
    ),
    unique_7d AS (
        SELECT DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS person_key
        FROM attr
        WHERE created_at >= now() - interval '7 days'
    ),
    device_unique AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text))
            COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS person_key,
            device_type
        FROM attr
        WHERE device_type IS NOT NULL
        ORDER BY COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text), created_at DESC
    ),
    kpis AS (
        SELECT
            (SELECT COUNT(*) FROM unique_people)                                          AS total_leads,
            (SELECT COUNT(*) FROM unique_today)                                           AS today,
            (SELECT COUNT(*) FROM unique_7d)                                              AS last_7d,
            (SELECT COUNT(*) FILTER (WHERE device_type = 'mobile')  FROM device_unique)   AS mobile_count,
            (SELECT COUNT(*) FILTER (WHERE device_type = 'desktop') FROM device_unique)   AS desktop_count,
            (SELECT COUNT(*) FILTER (WHERE device_type = 'tablet')  FROM device_unique)   AS tablet_count,
            COUNT(*)                                                                      AS total_rows
        FROM attr
    ),
    first_touch AS (
        SELECT COALESCE(NULLIF(first_utm_source,''), first_referrer_domain, '(direct)') AS source,
               COALESCE(NULLIF(first_utm_medium,''), '') AS medium,
               COUNT(DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)) AS n
        FROM attr
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    last_touch AS (
        SELECT COALESCE(NULLIF(last_utm_source,''), last_referrer_domain, '(direct)') AS source,
               COALESCE(NULLIF(last_utm_medium,''), '') AS medium,
               COUNT(DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)) AS n
        FROM attr
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    device AS (
        SELECT COALESCE(device_type,'unknown') AS device_type, COUNT(*) AS n
        FROM device_unique GROUP BY 1
    ),
    geo AS (
        SELECT COALESCE(NULLIF(city,''), '(unknown)') AS city,
               COALESCE(NULLIF(country_name,''), '') AS country,
               COUNT(DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)) AS n
        FROM attr GROUP BY 1, 2 ORDER BY n DESC LIMIT 15
    ),
    landing AS (
        SELECT COALESCE(NULLIF(last_landing_url,''), '(unknown)') AS url,
               COUNT(DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)) AS n
        FROM attr GROUP BY 1 ORDER BY n DESC LIMIT 10
    ),
    referrers AS (
        SELECT COALESCE(NULLIF(last_referrer_domain,''), '(direct)') AS domain,
               COUNT(DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)) AS n
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

-- Also fix funnel to count unique people
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
        SELECT DISTINCT ON (COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text))
            la.id,
            COALESCE(NULLIF(la.phone,''), '') AS phone,
            COALESCE(NULLIF(la.email,''), '') AS email,
            COALESCE(NULLIF(la.last_utm_source,''), la.last_referrer_domain, '(direct)') AS src,
            COALESCE(NULLIF(la.last_utm_medium,''), '') AS med
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
        ORDER BY COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text), la.created_at ASC
    )
    SELECT
        attr.src AS source,
        attr.med AS medium,
        COUNT(*)                                                               AS leads,
        COUNT(DISTINCT pq.id)                                                  AS questionnaires,
        COUNT(DISTINCT p.id)                                                   AS signups,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active')                AS paid
    FROM attr
    LEFT JOIN public.portal_questionnaires pq ON pq.phone = attr.phone AND attr.phone != ''
    LEFT JOIN public.profiles p               ON p.phone  = attr.phone AND attr.phone != ''
    LEFT JOIN public.subscriptions s          ON s.user_id = p.id
    GROUP BY attr.src, attr.med
    ORDER BY leads DESC
    LIMIT 15;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_funnel(INT) TO authenticated;
