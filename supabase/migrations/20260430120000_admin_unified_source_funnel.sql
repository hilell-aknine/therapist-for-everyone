-- ============================================================================
-- Migration: admin_unified_source_funnel — Phase 3 ROI initiative
--
-- Replaces the dual "סטטיסטיקות האתר" (GA4) + "טראפיק"/"אינסטגרם" (lead_attribution)
-- dashboards with one unified RPC powering "מקור הלקוחות". Returns one JSONB
-- response so the UI does a single round-trip and merges with GA4 visitors
-- client-side.
--
-- The funnel: leads → registrations → paid customers, broken down per source.
-- Visitors (top of funnel) come from GA4 client-side, NOT from this RPC.
--
-- Data-quality rules baked in (per hindsight.md):
--   * COUNT(DISTINCT person_key) — never COUNT(*). Same person can appear
--     across patients/portal_questionnaires/profiles in lead_attribution
--     (rule from "lead_attribution rows ≠ unique people", 2026-04-19).
--   * Source resolution: UTM canonical → how_found canonical → 'unknown'.
--     Matches the existing JS canonical helper formatLeadSource() at
--     js/admin/admin-utils.js:298-317 so backend and frontend agree.
--   * Mismatch detection: when UTM and how_found map to DIFFERENT canonical
--     sources for the same lead, surface for admin review.
--   * Pre-2026-04-19 leads have no lead_attribution row → those leads are
--     bucketed as 'unknown'. Frontend shows a transparency banner.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_unified_source_funnel(INT);

CREATE FUNCTION public.admin_unified_source_funnel(days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
    cutoff TIMESTAMPTZ;
    historical_floor_text TEXT := '2026-04-19';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    cutoff := now() - (days || ' days')::INTERVAL;

    WITH
    -- Step 1: dedupe lead_attribution rows down to one row per unique person.
    -- Same person can have multiple attribution rows (profile + questionnaire +
    -- patient). Person key: phone → email → row id (always unique fallback).
    -- Within a person, prefer rows that HAVE a UTM source (more informative)
    -- and break ties by most-recent created_at.
    one_per_person AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text))
            la.id                                                       AS attr_id,
            la.phone,
            la.email,
            la.created_at,
            NULLIF(LOWER(COALESCE(la.last_utm_source,
                                  la.first_utm_source,
                                  '')), '')                             AS utm_canonical,
            la.last_utm_medium,
            la.last_utm_campaign,
            la.self_reported_source                                     AS how_found_raw
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
        ORDER BY COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text),
                 (NULLIF(la.last_utm_source,'') IS NULL) ASC,
                 la.created_at DESC
    ),
    -- Step 2: bucket free-text how_found into canonical sources via ILIKE.
    -- Hebrew + English variants both map to the same lowercase canonical name.
    -- Anything non-empty that doesn't match a known bucket → 'other'.
    with_canonicals AS (
        SELECT
            *,
            CASE
                WHEN how_found_raw ILIKE '%אינסטגרם%' OR how_found_raw ILIKE '%instagram%' OR how_found_raw ILIKE '%insta%' THEN 'instagram'
                WHEN how_found_raw ILIKE '%פייסבוק%'  OR how_found_raw ILIKE '%facebook%'                                    THEN 'facebook'
                WHEN how_found_raw ILIKE '%יוטיוב%'   OR how_found_raw ILIKE '%youtube%'                                     THEN 'youtube'
                WHEN how_found_raw ILIKE '%גוגל%'     OR how_found_raw ILIKE '%google%'    OR how_found_raw ILIKE '%חיפוש%' THEN 'google'
                WHEN how_found_raw ILIKE '%טיקטוק%'   OR how_found_raw ILIKE '%tiktok%'                                      THEN 'tiktok'
                WHEN how_found_raw ILIKE '%וואטסאפ%'  OR how_found_raw ILIKE '%whatsapp%'  OR how_found_raw ILIKE '%ווטסאפ%' THEN 'whatsapp'
                WHEN how_found_raw ILIKE '%חבר%'      OR how_found_raw ILIKE '%חברה%'      OR how_found_raw ILIKE '%המלצה%'  OR how_found_raw ILIKE '%הפניה%' THEN 'referral'
                WHEN how_found_raw ILIKE '%פודקאסט%'  OR how_found_raw ILIKE '%podcast%'                                     THEN 'podcast'
                WHEN how_found_raw ILIKE '%הרצאה%'    OR how_found_raw ILIKE '%אירוע%'      OR how_found_raw ILIKE '%כנס%'    THEN 'event'
                WHEN how_found_raw ILIKE '%פרסומת%'   OR how_found_raw ILIKE '%מודעה%'     OR how_found_raw ILIKE '%ממומן%'  THEN 'ad'
                WHEN how_found_raw IS NOT NULL AND btrim(how_found_raw) <> ''               THEN 'other'
                ELSE NULL
            END AS how_found_canonical
        FROM one_per_person
    ),
    -- Step 3: pick the lead's canonical source. UTM beats how_found beats unknown.
    -- Track utm_count / how_found_count / mismatch_count for transparency.
    with_source AS (
        SELECT
            *,
            COALESCE(utm_canonical, how_found_canonical, 'unknown') AS source,
            (utm_canonical IS NOT NULL
             AND how_found_canonical IS NOT NULL
             AND utm_canonical <> how_found_canonical)              AS is_mismatch
        FROM with_canonicals
    ),
    -- Step 4: which leads converted to a registered profile? Match by phone or email.
    -- LEFT JOIN — leads that never registered keep profile_id = NULL.
    with_profile AS (
        SELECT
            l.*,
            p.id AS profile_id
        FROM with_source l
        LEFT JOIN public.profiles p
            ON (p.phone IS NOT NULL AND p.phone <> '' AND p.phone = l.phone)
            OR (p.email IS NOT NULL AND p.email <> '' AND p.email = l.email)
    ),
    -- Step 5: which registered profiles have an active paid subscription?
    with_paid AS (
        SELECT
            l.*,
            (s.id IS NOT NULL) AS is_paid
        FROM with_profile l
        LEFT JOIN public.subscriptions s
            ON s.user_id = l.profile_id AND s.status = 'active'
    ),
    -- Step 6: aggregate per source.
    per_source AS (
        SELECT
            source,
            COUNT(*)                                                AS leads,
            COUNT(*) FILTER (WHERE profile_id IS NOT NULL)          AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                         AS paid,
            COUNT(*) FILTER (WHERE utm_canonical IS NOT NULL)       AS utm_count,
            COUNT(*) FILTER (WHERE how_found_canonical IS NOT NULL) AS how_found_count,
            COUNT(*) FILTER (WHERE is_mismatch)                     AS mismatch_count
        FROM with_paid
        GROUP BY source
        ORDER BY leads DESC
    ),
    totals AS (
        SELECT
            COUNT(*)                                                AS leads,
            COUNT(*) FILTER (WHERE profile_id IS NOT NULL)          AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                         AS paid,
            COUNT(*) FILTER (WHERE is_mismatch)                     AS mismatches
        FROM with_paid
    ),
    mismatches AS (
        SELECT
            phone,
            email,
            utm_canonical,
            how_found_canonical,
            how_found_raw,
            created_at
        FROM with_paid
        WHERE is_mismatch
        ORDER BY created_at DESC
        LIMIT 50
    )
    SELECT jsonb_build_object(
        'days',             days,
        'cutoff',           cutoff,
        'historical_floor', historical_floor_text,
        'totals_per_stage', (SELECT row_to_json(totals) FROM totals),
        'per_source',       COALESCE((SELECT jsonb_agg(row_to_json(per_source)) FROM per_source), '[]'::jsonb),
        'mismatches',       COALESCE((SELECT jsonb_agg(row_to_json(mismatches)) FROM mismatches), '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unified_source_funnel(INT) TO authenticated;

-- ============================================================================
-- Weekly reconciliation report — separate RPC so the dashboard can show it
-- as a modal on demand without recomputing the funnel each time.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_source_reconciliation_weekly();

CREATE FUNCTION public.admin_source_reconciliation_weekly()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    WITH
    one_per_person AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text))
            la.id,
            la.created_at,
            NULLIF(LOWER(COALESCE(la.last_utm_source, la.first_utm_source, '')), '') AS utm_canonical,
            la.self_reported_source AS how_found_raw,
            -- Bucket window: this week vs prior 30 days
            CASE
                WHEN la.created_at >= now() - interval '7 days'  THEN 'this_week'
                WHEN la.created_at >= now() - interval '30 days' THEN 'last_30d'
                ELSE NULL
            END AS bucket
        FROM public.lead_attribution la
        WHERE la.created_at >= now() - interval '30 days'
        ORDER BY COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text),
                 (NULLIF(la.last_utm_source,'') IS NULL) ASC,
                 la.created_at DESC
    ),
    sums AS (
        SELECT
            bucket,
            COUNT(*)                                                                AS total,
            COUNT(*) FILTER (WHERE utm_canonical IS NOT NULL
                               AND how_found_raw IS NOT NULL)                       AS both,
            COUNT(*) FILTER (WHERE utm_canonical IS NOT NULL
                               AND (how_found_raw IS NULL OR btrim(how_found_raw)='')) AS utm_only,
            COUNT(*) FILTER (WHERE utm_canonical IS NULL
                               AND how_found_raw IS NOT NULL
                               AND btrim(how_found_raw) <> '')                      AS how_found_only,
            COUNT(*) FILTER (WHERE utm_canonical IS NULL
                               AND (how_found_raw IS NULL OR btrim(how_found_raw)='')) AS neither
        FROM one_per_person
        WHERE bucket IS NOT NULL
        GROUP BY bucket
    )
    SELECT jsonb_build_object(
        'this_week', (SELECT row_to_json(s) FROM sums s WHERE bucket = 'this_week'),
        'last_30d',  (SELECT row_to_json(s) FROM sums s WHERE bucket = 'last_30d'),
        'generated_at', now()
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_source_reconciliation_weekly() TO authenticated;

-- Schema cache reload so PostgREST picks up the new functions immediately
NOTIFY pgrst, 'reload schema';
