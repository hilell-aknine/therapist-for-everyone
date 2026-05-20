-- ============================================================================
-- Migration: admin_unified_source_funnel v5
--
-- WHY v5:
--   1. PROPER PERSON RESOLUTION. v4 keyed every profile-linked attribution row
--      by the attribution row's own id (because lead_attribution.phone/email are
--      NULL on those rows). So one person showed up as many "leads". Even after
--      the 20260520120000 dedup, v4 still counted anyone who had BOTH a
--      profile-linked row AND a questionnaire/contact row as two people.
--      v5 resolves every attribution row to a real profile (via linked_id for
--      'profiles' rows, via phone/email for the rest) and collapses the person,
--      that person's profile, and all their form rows into ONE record.
--   2. NEW `per_campaign` array — source -> campaign breakdown — so the admin
--      "מקור הלקוחות" screen can drill into a source and see each UTM campaign
--      (e.g. facebook -> community-groups vs facebook -> a paid campaign).
--
-- Same name + signature as v4, so js/admin/admin-sources.js keeps calling
-- db.rpc('admin_unified_source_funnel', { days }). All v4 output fields are
-- preserved; `per_campaign` is added.
--
-- NOTE: after this migration the dashboard numbers DROP to their true values
-- (v4 was inflated by the duplicate-rows bug + the double-counting above). This
-- is the intended correction, not a regression.
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
    -- attribution rows in window, each resolved to a real person -------------
    attr AS (
        SELECT
            la.id AS attr_id,
            la.created_at,
            COALESCE(
                CASE WHEN la.linked_table = 'profiles' THEN la.linked_id END,
                (SELECT p.id FROM public.profiles p
                  WHERE (NULLIF(la.phone,'') IS NOT NULL AND p.phone = la.phone)
                     OR (NULLIF(la.email,'') IS NOT NULL AND p.email = la.email)
                  LIMIT 1)
            ) AS resolved_profile_id,
            NULLIF(la.phone,'') AS phone,
            NULLIF(la.email,'') AS email,
            NULLIF(LOWER(COALESCE(la.last_utm_source,   la.first_utm_source,   '')), '') AS utm_source,
            NULLIF(LOWER(COALESCE(la.last_utm_campaign, la.first_utm_campaign, '')), '') AS utm_campaign,
            NULLIF(LOWER(COALESCE(la.last_utm_medium,   la.first_utm_medium,   '')), '') AS utm_medium,
            la.self_reported_source AS how_found_raw
        FROM public.lead_attribution la
        WHERE la.created_at >= cutoff
    ),
    attr_keyed AS (
        SELECT
            COALESCE(resolved_profile_id::text, phone, email, attr_id::text) AS person_key,
            *
        FROM attr
    ),
    -- one representative attribution row per person (prefer one with a UTM) --
    attr_person AS (
        SELECT DISTINCT ON (person_key)
            person_key, resolved_profile_id, phone, email,
            utm_source, utm_campaign, utm_medium, how_found_raw, created_at
        FROM attr_keyed
        ORDER BY person_key, (utm_source IS NULL) ASC, created_at DESC
    ),
    -- registered people: profiles created in window -------------------------
    prof AS (
        SELECT
            p.id            AS profile_id,
            p.id::text      AS person_key,
            p.created_at,
            NULLIF(LOWER(p.utm_source),   '') AS prof_utm_source,
            NULLIF(LOWER(p.utm_campaign), '') AS prof_utm_campaign
        FROM public.profiles p
        WHERE p.created_at >= cutoff
    ),
    all_keys AS (
        SELECT person_key FROM attr_person
        UNION
        SELECT person_key FROM prof
    ),
    combined AS (
        SELECT
            ak.person_key,
            (a.person_key  IS NOT NULL) AS is_lead,
            (pr.person_key IS NOT NULL) AS is_registered,
            COALESCE(a.resolved_profile_id, pr.profile_id) AS profile_id,
            a.phone, a.email, a.created_at,
            a.utm_source, a.utm_campaign, a.utm_medium, a.how_found_raw,
            pr.prof_utm_source, pr.prof_utm_campaign
        FROM all_keys ak
        LEFT JOIN attr_person a  ON a.person_key  = ak.person_key
        LEFT JOIN prof        pr ON pr.person_key = ak.person_key
    ),
    with_paid AS (
        SELECT
            c.*,
            EXISTS (
                SELECT 1 FROM public.subscriptions s
                WHERE s.user_id = c.profile_id AND s.status = 'active'
            ) AS is_paid
        FROM combined c
    ),
    with_canon AS (
        SELECT
            wp.*,
            CASE
                WHEN how_found_raw ILIKE '%אינסטגרם%' OR how_found_raw ILIKE '%instagram%' OR how_found_raw ILIKE '%insta%' THEN 'instagram'
                WHEN how_found_raw ILIKE '%פייסבוק%'  OR how_found_raw ILIKE '%facebook%'                                    THEN 'facebook'
                WHEN how_found_raw ILIKE '%יוטיוב%'   OR how_found_raw ILIKE '%youtube%'                                     THEN 'youtube'
                WHEN how_found_raw ILIKE '%גוגל%'     OR how_found_raw ILIKE '%google%'    OR how_found_raw ILIKE '%חיפוש%' THEN 'google'
                WHEN how_found_raw ILIKE '%טיקטוק%'   OR how_found_raw ILIKE '%tiktok%'                                      THEN 'tiktok'
                WHEN how_found_raw ILIKE '%וואטסאפ%'  OR how_found_raw ILIKE '%whatsapp%'  OR how_found_raw ILIKE '%ווטסאפ%' THEN 'whatsapp'
                WHEN how_found_raw ILIKE '%חבר%'      OR how_found_raw ILIKE '%המלצה%'     OR how_found_raw ILIKE '%הפניה%'  THEN 'referral'
                WHEN how_found_raw ILIKE '%פודקאסט%'  OR how_found_raw ILIKE '%podcast%'                                     THEN 'podcast'
                WHEN how_found_raw ILIKE '%הרצאה%'    OR how_found_raw ILIKE '%אירוע%'      OR how_found_raw ILIKE '%כנס%'    THEN 'event'
                WHEN how_found_raw ILIKE '%פרסומת%'   OR how_found_raw ILIKE '%מודעה%'     OR how_found_raw ILIKE '%ממומן%'  THEN 'ad'
                WHEN how_found_raw IS NOT NULL AND btrim(how_found_raw) <> '' THEN 'other'
                ELSE NULL
            END AS how_found_canonical
        FROM with_paid wp
    ),
    -- normalize utm_source into the same canonical buckets the JS UI labels --
    final AS (
        SELECT
            wc.*,
            CASE
                WHEN utm_source IS NULL                                            THEN NULL
                WHEN utm_source LIKE '%instagram%' OR utm_source IN ('ig','insta')  THEN 'instagram'
                WHEN utm_source LIKE '%facebook%'  OR utm_source IN ('fb','meta')   THEN 'facebook'
                WHEN utm_source LIKE 'google%'     OR utm_source LIKE '%google.%'   THEN 'google'
                WHEN utm_source LIKE '%youtube%'   OR utm_source = 'yt'             THEN 'youtube'
                WHEN utm_source LIKE '%tiktok%'                                     THEN 'tiktok'
                WHEN utm_source LIKE '%whatsapp%'  OR utm_source = 'wa.me'          THEN 'whatsapp'
                ELSE utm_source
            END AS utm_canonical,
            CASE
                WHEN prof_utm_source IS NULL                                                   THEN NULL
                WHEN prof_utm_source LIKE '%instagram%' OR prof_utm_source IN ('ig','insta')    THEN 'instagram'
                WHEN prof_utm_source LIKE '%facebook%'  OR prof_utm_source IN ('fb','meta')     THEN 'facebook'
                WHEN prof_utm_source LIKE 'google%'     OR prof_utm_source LIKE '%google.%'     THEN 'google'
                WHEN prof_utm_source LIKE '%youtube%'                                           THEN 'youtube'
                WHEN prof_utm_source LIKE '%tiktok%'                                            THEN 'tiktok'
                WHEN prof_utm_source LIKE '%whatsapp%'                                          THEN 'whatsapp'
                ELSE prof_utm_source
            END AS prof_utm_canonical
        FROM with_canon wc
    ),
    resolved AS (
        SELECT
            f.*,
            COALESCE(f.utm_canonical, f.prof_utm_canonical, f.how_found_canonical, 'unknown') AS source,
            COALESCE(f.utm_campaign, f.prof_utm_campaign)                                     AS campaign,
            (f.utm_canonical IS NOT NULL
             AND f.how_found_canonical IS NOT NULL
             AND f.utm_canonical <> f.how_found_canonical) AS is_mismatch
        FROM final f
    ),
    per_source AS (
        SELECT
            source,
            COUNT(*) FILTER (WHERE is_lead)                         AS leads,
            COUNT(*) FILTER (WHERE is_registered)                   AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                         AS paid,
            COUNT(*) FILTER (WHERE is_lead AND is_registered)       AS lead_and_reg,
            COUNT(*) FILTER (WHERE is_registered AND is_paid)       AS reg_and_paid,
            COUNT(*) FILTER (WHERE utm_canonical IS NOT NULL)       AS utm_count,
            COUNT(*) FILTER (WHERE how_found_canonical IS NOT NULL) AS how_found_count,
            COUNT(*) FILTER (WHERE is_mismatch)                     AS mismatch_count
        FROM resolved
        GROUP BY source
        ORDER BY GREATEST(COUNT(*) FILTER (WHERE is_lead),
                          COUNT(*) FILTER (WHERE is_registered)) DESC
    ),
    -- NEW: per-source -> per-campaign breakdown -----------------------------
    per_campaign AS (
        SELECT
            source,
            campaign,
            MAX(utm_medium)                                  AS medium,
            COUNT(*) FILTER (WHERE is_lead)                  AS leads,
            COUNT(*) FILTER (WHERE is_registered)            AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                  AS paid,
            COUNT(*) FILTER (WHERE is_lead AND is_registered) AS lead_and_reg
        FROM resolved
        GROUP BY source, campaign
        ORDER BY source, COUNT(*) FILTER (WHERE is_lead) DESC
    ),
    totals AS (
        SELECT
            COUNT(*) FILTER (WHERE is_lead)                   AS leads,
            COUNT(*) FILTER (WHERE is_registered)             AS registrations,
            COUNT(*) FILTER (WHERE is_paid)                   AS paid,
            COUNT(*) FILTER (WHERE is_lead AND is_registered) AS lead_and_reg,
            COUNT(*) FILTER (WHERE is_registered AND is_paid) AS reg_and_paid,
            COUNT(*) FILTER (WHERE is_mismatch)               AS mismatches
        FROM resolved
    ),
    all_time AS (
        SELECT
            (SELECT COUNT(DISTINCT COALESCE(
                  CASE WHEN la.linked_table = 'profiles' THEN la.linked_id::text END,
                  NULLIF(la.phone,''), NULLIF(la.email,''), la.id::text))
             FROM public.lead_attribution la)                                       AS leads_total,
            (SELECT COUNT(*) FROM public.profiles)                                  AS registrations_total,
            (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active')     AS paid_total
    ),
    mismatches AS (
        SELECT
            phone, email,
            utm_canonical          AS utm_canonical,
            how_found_canonical,
            how_found_raw,
            created_at
        FROM resolved
        WHERE is_mismatch
        ORDER BY created_at DESC NULLS LAST
        LIMIT 50
    )
    SELECT jsonb_build_object(
        'days',             days,
        'cutoff',           cutoff,
        'historical_floor', historical_floor_text,
        'totals_per_stage', (SELECT row_to_json(totals)   FROM totals),
        'all_time_totals',  (SELECT row_to_json(all_time) FROM all_time),
        'per_source',       COALESCE((SELECT jsonb_agg(row_to_json(per_source))   FROM per_source),   '[]'::jsonb),
        'per_campaign',     COALESCE((SELECT jsonb_agg(row_to_json(per_campaign)) FROM per_campaign), '[]'::jsonb),
        'mismatches',       COALESCE((SELECT jsonb_agg(row_to_json(mismatches))   FROM mismatches),   '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unified_source_funnel(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
