-- ============================================================================
-- Migration 048: Ad campaigns tracking + performance view
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'instagram', 'google', 'tiktok', 'other')),
    utm_campaign TEXT,
    budget NUMERIC(10,2) DEFAULT 0,
    spend_to_date NUMERIC(10,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    target_audience_description TEXT,
    ad_copy TEXT,
    creative_urls JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to ad_campaigns"
    ON public.ad_campaigns FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_utm ON public.ad_campaigns (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns (status);

-- Performance view: auto-joins campaigns with lead counts from all tables
CREATE OR REPLACE VIEW public.campaign_performance AS
SELECT
    ac.id, ac.name, ac.platform, ac.utm_campaign,
    ac.budget, ac.spend_to_date, ac.start_date, ac.end_date, ac.status,
    ac.target_audience_description, ac.ad_copy, ac.notes,
    COALESCE(p.cnt, 0) AS patient_leads,
    COALESCE(t.cnt, 0) AS therapist_leads,
    COALESCE(cr.cnt, 0) AS contact_leads,
    COALESCE(pr.cnt, 0) AS signups,
    COALESCE(pq.cnt, 0) AS questionnaires,
    (COALESCE(p.cnt,0) + COALESCE(t.cnt,0) + COALESCE(cr.cnt,0)) AS total_leads,
    CASE WHEN ac.spend_to_date > 0
        THEN ROUND(ac.spend_to_date / NULLIF(COALESCE(p.cnt,0)+COALESCE(t.cnt,0)+COALESCE(cr.cnt,0), 0), 2)
        ELSE NULL
    END AS cost_per_lead,
    ac.created_at, ac.updated_at
FROM public.ad_campaigns ac
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.patients WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) p ON p.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.therapists WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) t ON t.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.contact_requests WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) cr ON cr.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.profiles WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) pr ON pr.utm_campaign = ac.utm_campaign
LEFT JOIN (SELECT utm_campaign, COUNT(*) AS cnt FROM public.portal_questionnaires WHERE utm_campaign IS NOT NULL GROUP BY utm_campaign) pq ON pq.utm_campaign = ac.utm_campaign;

GRANT SELECT ON public.campaign_performance TO authenticated;
