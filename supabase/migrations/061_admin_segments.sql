-- ============================================================================
-- Migration 061: Admin Segments — KPI overview + pre-built breakdowns
--
-- Powers the "פילוח ופילטרים" admin tab. One SECURITY DEFINER RPC returns
-- everything the dashboard needs in a single round-trip:
--   - signups today/yesterday/7d/30d (Israel timezone)
--   - breakdown by source (utm_source ∪ portal_questionnaires.how_found)
--   - breakdown by role
--   - breakdown by sales_stage
--   - breakdown by lesson buckets (0, 1-4, 5-9, 10-19, 20+)
--   - has_phone split
--   - active paying customers
--   - open pipeline count
--   - "from facebook" shortcut (utm_source ILIKE 'facebook%' OR how_found ILIKE '%פייסבוק%')
--   - "lessons > 5" shortcut
--
-- Admin-only via role check inside the function — same pattern as
-- migration 058 (admin_automations_*).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_segments_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
    today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
    yesterday_start TIMESTAMPTZ := today_start - interval '1 day';
    week_start TIMESTAMPTZ := today_start - interval '7 days';
    month_start TIMESTAMPTZ := today_start - interval '30 days';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    WITH lesson_counts AS (
        SELECT user_id, COUNT(*)::INT AS lessons
        FROM public.course_progress
        WHERE completed = true
          AND (video_id IS NULL OR video_id NOT LIKE 'last_watched_%')
        GROUP BY user_id
    ),
    profiles_enriched AS (
        SELECT
            p.id,
            p.role,
            p.sales_stage,
            p.created_at,
            p.phone,
            p.utm_source,
            pq.how_found,
            COALESCE(lc.lessons, 0) AS lessons
        FROM public.profiles p
        LEFT JOIN public.portal_questionnaires pq ON pq.user_id = p.id
        LEFT JOIN lesson_counts lc ON lc.user_id = p.id
    ),
    kpis AS (
        SELECT
            COUNT(*) FILTER (WHERE created_at >= today_start)::INT     AS signups_today,
            COUNT(*) FILTER (WHERE created_at >= yesterday_start
                              AND created_at <  today_start)::INT       AS signups_yesterday,
            COUNT(*) FILTER (WHERE created_at >= week_start)::INT       AS signups_7d,
            COUNT(*) FILTER (WHERE created_at >= month_start)::INT      AS signups_30d,
            COUNT(*)::INT                                                AS total_users,
            COUNT(*) FILTER (
                WHERE utm_source ILIKE 'facebook%' OR how_found ILIKE '%פייסבוק%'
            )::INT                                                       AS from_facebook,
            COUNT(*) FILTER (
                WHERE utm_source ILIKE 'instagram%' OR how_found ILIKE '%אינסטגרם%'
            )::INT                                                       AS from_instagram,
            COUNT(*) FILTER (WHERE lessons > 5)::INT                     AS lessons_gt5,
            COUNT(*) FILTER (WHERE lessons >= 10)::INT                   AS lessons_gte10,
            COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::INT AS with_phone,
            COUNT(*) FILTER (WHERE phone IS NULL OR phone = '')::INT     AS without_phone
        FROM profiles_enriched
    ),
    by_source AS (
        SELECT
            COALESCE(
                NULLIF(utm_source, ''),
                NULLIF(how_found, ''),
                'ישיר / לא ידוע'
            ) AS source,
            COUNT(*)::INT AS count
        FROM profiles_enriched
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 12
    ),
    by_role AS (
        SELECT COALESCE(role, 'ללא תפקיד') AS role, COUNT(*)::INT AS count
        FROM profiles_enriched
        GROUP BY 1
        ORDER BY count DESC
    ),
    by_stage AS (
        SELECT COALESCE(sales_stage, 'ללא שלב') AS stage, COUNT(*)::INT AS count
        FROM profiles_enriched
        GROUP BY 1
        ORDER BY count DESC
    ),
    by_lessons AS (
        SELECT bucket, COUNT(*)::INT AS count FROM (
            SELECT CASE
                WHEN lessons = 0 THEN '0'
                WHEN lessons BETWEEN 1 AND 4 THEN '1-4'
                WHEN lessons BETWEEN 5 AND 9 THEN '5-9'
                WHEN lessons BETWEEN 10 AND 19 THEN '10-19'
                ELSE '20+'
            END AS bucket
            FROM profiles_enriched
        ) b
        GROUP BY bucket
        ORDER BY CASE bucket
            WHEN '0' THEN 0 WHEN '1-4' THEN 1 WHEN '5-9' THEN 2
            WHEN '10-19' THEN 3 WHEN '20+' THEN 4
        END
    ),
    paying AS (
        SELECT COUNT(*)::INT AS active_paying
        FROM public.subscriptions
        WHERE status = 'active'
    ),
    pipeline_open AS (
        SELECT COUNT(*)::INT AS open_count
        FROM public.profiles
        WHERE sales_stage IS NOT NULL
          AND sales_stage NOT IN ('won','lost','closed_won','closed_lost')
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(kpis) FROM kpis),
        'by_source', COALESCE((SELECT jsonb_agg(row_to_json(by_source)) FROM by_source), '[]'::jsonb),
        'by_role',   COALESCE((SELECT jsonb_agg(row_to_json(by_role))   FROM by_role),   '[]'::jsonb),
        'by_stage',  COALESCE((SELECT jsonb_agg(row_to_json(by_stage))  FROM by_stage),  '[]'::jsonb),
        'by_lessons',COALESCE((SELECT jsonb_agg(row_to_json(by_lessons))FROM by_lessons),'[]'::jsonb),
        'active_paying', (SELECT active_paying FROM paying),
        'pipeline_open', (SELECT open_count    FROM pipeline_open),
        'generated_at', now()
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_segments_overview() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_utm_source ON public.profiles(utm_source) WHERE utm_source IS NOT NULL;
