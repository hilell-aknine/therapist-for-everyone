-- ============================================================================
-- Migration 060: Professional Traffic Source Attribution
--
-- Adds a central lead_attribution table that captures EVERY signal we can
-- get about where a lead came from — first-touch + last-touch + click IDs +
-- referrer + landing page + device + geo. Joinable to any lead table via
-- (linked_table, linked_id).
--
-- Also backfills sales_leads with the basic UTM columns it was missing
-- entirely (the worst gap in the original audit).
--
-- Privacy: raw IP is NEVER stored. Only the geocoded country/city.
-- ============================================================================

-- ─── MAIN TABLE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_attribution (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Link back to whichever lead row this attribution belongs to
    linked_table  TEXT NOT NULL CHECK (linked_table IN
                  ('patients','therapists','contact_requests',
                   'portal_questionnaires','sales_leads','profiles',
                   'questionnaire_submissions')),
    linked_id     UUID,
    phone         TEXT,
    email         TEXT,
    session_id    TEXT,

    -- First-touch (the user's very first encounter, persisted in client localStorage)
    first_utm_source      TEXT,
    first_utm_medium      TEXT,
    first_utm_campaign    TEXT,
    first_utm_term        TEXT,
    first_utm_content     TEXT,
    first_gclid           TEXT,
    first_fbclid          TEXT,
    first_ttclid          TEXT,
    first_msclkid         TEXT,
    first_referrer_domain TEXT,
    first_landing_url     TEXT,
    first_at              TIMESTAMPTZ,

    -- Last-touch (the visit that produced the form submit)
    last_utm_source      TEXT,
    last_utm_medium      TEXT,
    last_utm_campaign    TEXT,
    last_utm_term        TEXT,
    last_utm_content     TEXT,
    last_gclid           TEXT,
    last_fbclid          TEXT,
    last_ttclid          TEXT,
    last_msclkid         TEXT,
    last_referrer_domain TEXT,
    last_landing_url     TEXT,
    last_at              TIMESTAMPTZ,

    -- Device (parsed from user agent client-side)
    device_type   TEXT CHECK (device_type IN ('mobile','tablet','desktop','unknown')),
    os_name       TEXT,
    browser_name  TEXT,
    viewport_w    INT,
    viewport_h    INT,
    language      TEXT,
    timezone      TEXT,

    -- Geo (server-enriched in submit-lead from ipapi.co; raw IP NEVER stored)
    country_code  TEXT,
    country_name  TEXT,
    region        TEXT,
    city          TEXT,

    -- Diagnostic only — kept so we can fix our device parser if it misclassifies
    raw_ua        TEXT
);

CREATE INDEX IF NOT EXISTS idx_attr_linked       ON public.lead_attribution(linked_table, linked_id);
CREATE INDEX IF NOT EXISTS idx_attr_phone        ON public.lead_attribution(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attr_first_source ON public.lead_attribution(first_utm_source);
CREATE INDEX IF NOT EXISTS idx_attr_last_source  ON public.lead_attribution(last_utm_source);
CREATE INDEX IF NOT EXISTS idx_attr_created      ON public.lead_attribution(created_at DESC);

-- Lock to service role only — admin UI reaches via SECURITY DEFINER RPCs
ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.lead_attribution;
CREATE POLICY "service role only" ON public.lead_attribution FOR ALL USING (false) WITH CHECK (false);

-- ─── BACKFILL: sales_leads finally gets UTM ──────────────────────────────
ALTER TABLE public.sales_leads
    ADD COLUMN IF NOT EXISTS utm_source   TEXT,
    ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
    ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS utm_term     TEXT,
    ADD COLUMN IF NOT EXISTS utm_content  TEXT,
    ADD COLUMN IF NOT EXISTS landing_url  TEXT;

-- ─── ADMIN RPCs (SECURITY DEFINER, role check inside) ────────────────────

-- One round-trip overview for the dashboard's KPI strip + first/last
-- breakdowns + device + geo. Returns one JSONB so the UI can render in
-- one render pass without 8 separate selects.
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
               COUNT(*) AS n
        FROM attr
        GROUP BY 1 ORDER BY n DESC LIMIT 10
    ),
    last_touch AS (
        SELECT COALESCE(NULLIF(last_utm_source,''), last_referrer_domain, '(direct)') AS source,
               COUNT(*) AS n
        FROM attr
        GROUP BY 1 ORDER BY n DESC LIMIT 10
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

-- Channel funnel: source → leads → questionnaire → signup → paid.
-- Joins lead_attribution to portal_questionnaires + profiles + subscriptions
-- by phone (most reliable cross-table key in this schema).
CREATE OR REPLACE FUNCTION public.admin_traffic_funnel(days INT DEFAULT 30)
RETURNS TABLE (
    source TEXT,
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
            COALESCE(NULLIF(la.last_utm_source,''), la.last_referrer_domain, '(direct)') AS src
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
    )
    SELECT
        attr.src AS source,
        COUNT(DISTINCT attr.id)                                                                            AS leads,
        COUNT(DISTINCT pq.id)                                                                              AS questionnaires,
        COUNT(DISTINCT p.id)                                                                               AS signups,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active')                                            AS paid
    FROM attr
    LEFT JOIN public.portal_questionnaires pq ON pq.email = attr.email AND pq.email IS NOT NULL
    LEFT JOIN public.profiles p               ON p.email  = attr.email AND p.email  IS NOT NULL
    LEFT JOIN public.subscriptions s          ON s.user_id = p.id
    GROUP BY attr.src
    ORDER BY leads DESC
    LIMIT 15;
END;
$$;

-- Recent rows for spot-checking + debugging
CREATE OR REPLACE FUNCTION public.admin_traffic_recent(max_rows INT DEFAULT 20)
RETURNS SETOF public.lead_attribution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    RETURN QUERY
    SELECT * FROM public.lead_attribution
    ORDER BY created_at DESC
    LIMIT max_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_overview(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_traffic_funnel(INT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_traffic_recent(INT)   TO authenticated;
