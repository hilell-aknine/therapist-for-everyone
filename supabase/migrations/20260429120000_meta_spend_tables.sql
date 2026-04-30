-- Meta Ads daily spend tracking.
-- Edge Function `fetch-meta-ads-spend` calls Meta Marketing API once per day
-- and upserts campaign-level metrics into meta_campaign_spend_daily.
-- meta_campaign_to_utm bridges Meta campaign IDs to the utm_campaign values
-- used in ad destination URLs (which are joined to lead_attribution).

-- ---------------------------------------------------------------------------
-- Table 1: daily campaign spend snapshot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_campaign_spend_daily (
    id              BIGSERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    account_id      TEXT NOT NULL,
    campaign_id     TEXT NOT NULL,
    campaign_name   TEXT,
    utm_campaign    TEXT,
    spend           NUMERIC(12, 2) NOT NULL DEFAULT 0,
    impressions     BIGINT NOT NULL DEFAULT 0,
    clicks          BIGINT NOT NULL DEFAULT 0,
    reach           BIGINT NOT NULL DEFAULT 0,
    ctr             NUMERIC(8, 4) NOT NULL DEFAULT 0,
    cpm             NUMERIC(10, 2) NOT NULL DEFAULT 0,
    leads           INT NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'ILS',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_spend_date          ON public.meta_campaign_spend_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_spend_utm_campaign  ON public.meta_campaign_spend_daily(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_meta_spend_campaign_id   ON public.meta_campaign_spend_daily(campaign_id);

ALTER TABLE public.meta_campaign_spend_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only — meta spend" ON public.meta_campaign_spend_daily;
CREATE POLICY "service role only — meta spend" ON public.meta_campaign_spend_daily
    FOR ALL USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Table 2: campaign-id → utm_campaign mapping
-- Hillel can populate this manually if Meta campaign names ≠ utm_campaign values
-- in his ad URLs. The Edge Function fills utm_campaign at insert time using
-- COALESCE(mapping.utm_campaign, lower-slugged campaign_name).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_campaign_to_utm (
    campaign_id     TEXT PRIMARY KEY,
    campaign_name   TEXT,
    utm_campaign    TEXT NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_map_utm_campaign ON public.meta_campaign_to_utm(utm_campaign);

ALTER TABLE public.meta_campaign_to_utm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only — meta map" ON public.meta_campaign_to_utm;
CREATE POLICY "service role only — meta map" ON public.meta_campaign_to_utm
    FOR ALL USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Admin-only RPC: read daily spend rows for a date range.
-- Avoids exposing the underlying tables directly while supporting the
-- ROI dashboard work in Phase 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_meta_spend(
    p_start DATE DEFAULT (current_date - INTERVAL '30 days')::date,
    p_end   DATE DEFAULT current_date
)
RETURNS TABLE (
    date            DATE,
    campaign_id     TEXT,
    campaign_name   TEXT,
    utm_campaign    TEXT,
    spend           NUMERIC(12, 2),
    impressions     BIGINT,
    clicks          BIGINT,
    reach           BIGINT,
    ctr             NUMERIC(8, 4),
    cpm             NUMERIC(10, 2),
    leads           INT,
    currency        TEXT,
    fetched_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Forbidden: admin role required';
    END IF;

    RETURN QUERY
    SELECT
        s.date, s.campaign_id, s.campaign_name, s.utm_campaign,
        s.spend, s.impressions, s.clicks, s.reach,
        s.ctr, s.cpm, s.leads, s.currency, s.fetched_at
    FROM public.meta_campaign_spend_daily s
    WHERE s.date >= p_start AND s.date <= p_end
    ORDER BY s.date DESC, s.spend DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_meta_spend(DATE, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin-only RPC: read/write the campaign → utm mapping.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_meta_campaign_map()
RETURNS SETOF public.meta_campaign_to_utm
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Forbidden: admin role required';
    END IF;

    RETURN QUERY SELECT * FROM public.meta_campaign_to_utm ORDER BY campaign_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_meta_campaign_map() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_meta_campaign_map(
    p_campaign_id   TEXT,
    p_utm_campaign  TEXT,
    p_campaign_name TEXT DEFAULT NULL,
    p_notes         TEXT DEFAULT NULL
)
RETURNS public.meta_campaign_to_utm
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row public.meta_campaign_to_utm;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Forbidden: admin role required';
    END IF;

    INSERT INTO public.meta_campaign_to_utm (campaign_id, utm_campaign, campaign_name, notes)
    VALUES (p_campaign_id, p_utm_campaign, p_campaign_name, p_notes)
    ON CONFLICT (campaign_id) DO UPDATE SET
        utm_campaign  = EXCLUDED.utm_campaign,
        campaign_name = COALESCE(EXCLUDED.campaign_name, public.meta_campaign_to_utm.campaign_name),
        notes         = COALESCE(EXCLUDED.notes,         public.meta_campaign_to_utm.notes),
        updated_at    = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_meta_campaign_map(TEXT, TEXT, TEXT, TEXT) TO authenticated;
