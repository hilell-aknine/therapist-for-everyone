-- ============================================================================
-- Fix: source bars must not double-count people across groups.
-- Pick ONE source per person: prefer the non-direct source (campaign value).
-- If all sources are direct, count as direct.
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
    -- One row per person: pick the best (non-direct) source
    person_best AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text))
            COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS person_key,
            COALESCE(NULLIF(first_utm_source,''), first_referrer_domain, '(direct)') AS first_source,
            COALESCE(NULLIF(first_utm_medium,''), '') AS first_medium,
            COALESCE(NULLIF(last_utm_source,''), last_referrer_domain, '(direct)') AS last_source,
            COALESCE(NULLIF(last_utm_medium,''), '') AS last_medium,
            device_type,
            created_at
        FROM attr
        -- Prefer rows with a real UTM source over (direct)
        ORDER BY COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text),
                 CASE WHEN NULLIF(last_utm_source,'') IS NOT NULL THEN 0 ELSE 1 END,
                 created_at DESC
    ),
    unique_today AS (
        SELECT DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS pk
        FROM attr
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')
    ),
    unique_7d AS (
        SELECT DISTINCT COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text) AS pk
        FROM attr
        WHERE created_at >= now() - interval '7 days'
    ),
    kpis AS (
        SELECT
            (SELECT COUNT(*) FROM person_best)                                             AS total_leads,
            (SELECT COUNT(*) FROM unique_today)                                            AS today,
            (SELECT COUNT(*) FROM unique_7d)                                               AS last_7d,
            COUNT(*) FILTER (WHERE device_type = 'mobile')                                 AS mobile_count,
            COUNT(*) FILTER (WHERE device_type = 'desktop')                                AS desktop_count,
            COUNT(*) FILTER (WHERE device_type = 'tablet')                                 AS tablet_count
        FROM person_best
        WHERE device_type IS NOT NULL
    ),
    first_touch AS (
        SELECT first_source AS source, first_medium AS medium, COUNT(*) AS n
        FROM person_best
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    last_touch AS (
        SELECT last_source AS source, last_medium AS medium, COUNT(*) AS n
        FROM person_best
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 10
    ),
    device AS (
        SELECT COALESCE(device_type,'unknown') AS device_type, COUNT(*) AS n
        FROM person_best WHERE device_type IS NOT NULL
        GROUP BY 1
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
