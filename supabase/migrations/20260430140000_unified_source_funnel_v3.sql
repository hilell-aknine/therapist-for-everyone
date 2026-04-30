-- ============================================================================
-- Migration: admin_unified_source_funnel v3 — proper subset conversion math
--
-- v2 fixed the bug where registrations was a strict subset of leads. But
-- it left the conversion percentages computed as raw ratios:
--   L→R = registrations / leads
-- which can exceed 100% when stages are independent counts (e.g. 41 regs /
-- 27 leads = 152%). The numbers are mathematically correct as count ratios
-- but conceptually misleading — they look like funnel conversion but aren't.
--
-- v3 adds proper SUBSET counts so conversions can be computed as bounded
-- ratios:
--   * lead_and_reg = people who are BOTH leads AND registered (in window)
--   * lead_and_paid = people who are BOTH leads AND paid
--   * reg_and_paid = people who are BOTH registered AND paid
--
-- Now conversion can be computed in JS as:
--   L→R = lead_and_reg / leads        (always ≤ 100%, true funnel conversion)
--   R→P = reg_and_paid / registrations (always ≤ 100%)
--   V→L = leads / visitors            (still anonymous, may exceed 100% if
--                                       GA4 undercounts — display caps it)
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
    attr_window AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text))
            COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text) AS person_key,
            la.phone,
            la.email,
            la.created_at,
            NULLIF(LOWER(COALESCE(la.last_utm_source, la.first_utm_source, '')), '') AS utm_canonical,
            la.last_utm_medium,
            la.last_utm_campaign,
            la.self_reported_source AS how_found_raw
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
        ORDER BY COALESCE(NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text),
                 (NULLIF(la.last_utm_source,'') IS NULL) ASC,
                 la.created_at DESC
    ),
    profile_window AS (
        SELECT
            COALESCE(NULLIF(p.phone,''), NULLIF(p.email,''), p.id::text) AS person_key,
            p.id AS profile_id,
            p.phone,
            p.email,
            p.created_at,
            NULLIF(LOWER(p.utm_source), '') AS prof_utm_canonical
        FROM public.profiles p
        WHERE p.created_at >= cutoff
    ),
    union_window AS (
        SELECT
            person_key, phone, email, created_at,
            utm_canonical, last_utm_medium, last_utm_campaign, how_found_raw,
            NULL::UUID AS profile_id, NULL::TEXT AS prof_utm_canonical,
            TRUE  AS is_lead_window,
            FALSE AS is_registered_window
        FROM attr_window
        UNION ALL
        SELECT
            person_key, phone, email, created_at,
            NULL AS utm_canonical, NULL AS last_utm_medium, NULL AS last_utm_campaign,
            NULL AS how_found_raw,
            profile_id, prof_utm_canonical,
            FALSE AS is_lead_window,
            TRUE  AS is_registered_window
        FROM profile_window
    ),
    deduped AS (
        SELECT
            person_key,
            MAX(phone) FILTER (WHERE phone IS NOT NULL AND phone <> '')                       AS phone,
            MAX(email) FILTER (WHERE email IS NOT NULL AND email <> '')                       AS email,
            MAX(created_at)                                                                    AS latest_event_at,
            MAX(utm_canonical)                                                                 AS attr_utm_canonical,
            MAX(last_utm_medium)                                                               AS last_utm_medium,
            MAX(last_utm_campaign)                                                             AS last_utm_campaign,
            MAX(how_found_raw)                                                                 AS how_found_raw,
            (ARRAY_AGG(profile_id) FILTER (WHERE profile_id IS NOT NULL))[1]                   AS profile_id,
            MAX(prof_utm_canonical)                                                            AS prof_utm_canonical,
            BOOL_OR(is_lead_window)                                                            AS is_lead,
            BOOL_OR(is_registered_window)                                                      AS is_registered
        FROM union_window
        GROUP BY person_key
    ),
    with_any_profile AS (
        SELECT
            d.*,
            COALESCE(
                d.profile_id,
                (SELECT p.id FROM public.profiles p
                 WHERE (p.phone IS NOT NULL AND p.phone <> '' AND p.phone = d.phone)
                    OR (p.email IS NOT NULL AND p.email <> '' AND p.email = d.email)
                 LIMIT 1)
            ) AS resolved_profile_id
        FROM deduped d
    ),
    with_paid AS (
        SELECT
            wap.*,
            EXISTS (
                SELECT 1 FROM public.subscriptions s
                WHERE s.user_id = wap.resolved_profile_id AND s.status = 'active'
            ) AS is_paid
        FROM with_any_profile wap
    ),
    with_canonicals AS (
        SELECT
            wp.*,
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
        FROM with_paid wp
    ),
    final AS (
        SELECT
            wc.*,
            COALESCE(
                wc.attr_utm_canonical,
                wc.prof_utm_canonical,
                wc.how_found_canonical,
                'unknown'
            ) AS source,
            (wc.attr_utm_canonical IS NOT NULL
             AND wc.how_found_canonical IS NOT NULL
             AND wc.attr_utm_canonical <> wc.how_found_canonical) AS is_mismatch
        FROM with_canonicals wc
    ),

    -- v3 CHANGE: per_source now exposes proper SUBSET counts in addition to
    -- the independent counts. JS divides subset/independent for true conversion.
    per_source AS (
        SELECT
            source,
            -- Independent counts (used for "raw size" display)
            COUNT(*) FILTER (WHERE is_lead)                                  AS leads,
            COUNT(*) FILTER (WHERE is_registered)                            AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                                  AS paid,
            -- Subset counts (used for conversion math) — always ≤ corresponding independent count
            COUNT(*) FILTER (WHERE is_lead AND is_registered)                AS lead_and_reg,
            COUNT(*) FILTER (WHERE is_lead AND is_paid)                      AS lead_and_paid,
            COUNT(*) FILTER (WHERE is_registered AND is_paid)                AS reg_and_paid,
            -- Source-quality counts
            COUNT(*) FILTER (WHERE attr_utm_canonical IS NOT NULL)           AS utm_count,
            COUNT(*) FILTER (WHERE how_found_canonical IS NOT NULL)          AS how_found_count,
            COUNT(*) FILTER (WHERE is_mismatch)                              AS mismatch_count
        FROM final
        GROUP BY source
        ORDER BY GREATEST(
            COUNT(*) FILTER (WHERE is_lead),
            COUNT(*) FILTER (WHERE is_registered)
        ) DESC
    ),
    totals AS (
        SELECT
            COUNT(*) FILTER (WHERE is_lead)                       AS leads,
            COUNT(*) FILTER (WHERE is_registered)                 AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                       AS paid,
            COUNT(*) FILTER (WHERE is_lead AND is_registered)     AS lead_and_reg,
            COUNT(*) FILTER (WHERE is_registered AND is_paid)     AS reg_and_paid,
            COUNT(*) FILTER (WHERE is_mismatch)                   AS mismatches
        FROM final
    ),
    mismatches AS (
        SELECT
            phone,
            email,
            attr_utm_canonical AS utm_canonical,
            how_found_canonical,
            how_found_raw,
            latest_event_at AS created_at
        FROM final
        WHERE is_mismatch
        ORDER BY latest_event_at DESC
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

NOTIFY pgrst, 'reload schema';
