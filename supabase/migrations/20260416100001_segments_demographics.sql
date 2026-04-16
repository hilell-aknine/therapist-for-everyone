-- ============================================================================
-- Migration 067: admin_segments_overview — demographic breakdowns
--
-- Extends the existing function (from migration 063) to add 4 new breakdowns
-- sourced from portal_questionnaires: gender, age range, purpose (why_nlp),
-- and top cities. All data already collected — just never surfaced.
--
-- Full CREATE OR REPLACE — byte-identical to 063 except:
--   1. profiles_enriched CTE now pulls pq.gender, pq.birth_date, pq.why_nlp, pq.city
--   2. Four new CTEs: by_gender, by_age_range, by_purpose, by_city
--   3. Four new keys in the returned JSONB blob
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

    WITH registrations AS (
        SELECT id, created_at, utm_source, NULL::TEXT AS how_found, 'patients'::TEXT AS channel
          FROM public.patients
        UNION ALL
        SELECT id, created_at, utm_source, NULL::TEXT, 'therapists'
          FROM public.therapists
        UNION ALL
        SELECT id, created_at, utm_source, NULL::TEXT, 'contact_requests'
          FROM public.contact_requests
        UNION ALL
        SELECT id, created_at, utm_source, NULL::TEXT, 'profiles'
          FROM public.profiles
        UNION ALL
        SELECT id, created_at, utm_source, how_found, 'portal_questionnaires'
          FROM public.portal_questionnaires
    ),
    lesson_counts AS (
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
            p.phone,
            p.created_at,
            COALESCE(lc.lessons, 0) AS lessons,
            (pq.id IS NOT NULL) AS has_questionnaire,
            pq.gender,
            pq.birth_date,
            pq.why_nlp,
            pq.city AS q_city
        FROM public.profiles p
        LEFT JOIN lesson_counts lc ON lc.user_id = p.id
        LEFT JOIN public.portal_questionnaires pq ON pq.user_id = p.id
    ),
    reg_kpis AS (
        SELECT
            COUNT(*) FILTER (WHERE created_at >= today_start)::INT                                     AS signups_today,
            COUNT(*) FILTER (WHERE created_at >= yesterday_start AND created_at < today_start)::INT    AS signups_yesterday,
            COUNT(*) FILTER (WHERE created_at >= week_start)::INT                                      AS signups_7d,
            COUNT(*) FILTER (WHERE created_at >= month_start)::INT                                     AS signups_30d,
            COUNT(*)::INT                                                                              AS total_registrations,
            COUNT(*) FILTER (
                WHERE utm_source ILIKE 'facebook%' OR how_found ILIKE '%פייסבוק%'
            )::INT                                                                                     AS from_facebook,
            COUNT(*) FILTER (
                WHERE utm_source ILIKE 'instagram%' OR how_found ILIKE '%אינסטגרם%'
            )::INT                                                                                     AS from_instagram
        FROM registrations
    ),
    profile_kpis AS (
        SELECT
            COUNT(*) FILTER (WHERE lessons > 5)::INT    AS lessons_gt5,
            COUNT(*) FILTER (WHERE lessons >= 10)::INT  AS lessons_gte10,
            COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::INT AS with_phone,
            COUNT(*) FILTER (WHERE phone IS NULL OR phone = '')::INT       AS without_phone,
            COUNT(*) FILTER (WHERE has_questionnaire = false)::INT         AS abandoned_total,
            COUNT(*) FILTER (WHERE has_questionnaire = false
                              AND created_at >= week_start)::INT           AS abandoned_recent,
            COUNT(*) FILTER (WHERE has_questionnaire = false
                              AND created_at >= today_start)::INT          AS abandoned_today
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
        FROM registrations
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 12
    ),
    by_channel AS (
        SELECT channel, COUNT(*)::INT AS count
        FROM registrations
        GROUP BY channel
        ORDER BY count DESC
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
    ),
    -- ─── NEW: Demographic breakdowns from portal_questionnaires ───
    by_gender AS (
        SELECT gender, COUNT(*)::INT AS count
        FROM profiles_enriched
        WHERE gender IS NOT NULL AND gender <> ''
        GROUP BY gender
        ORDER BY count DESC
    ),
    by_age_range AS (
        SELECT age_range, COUNT(*)::INT AS count FROM (
            SELECT CASE
                WHEN age BETWEEN 18 AND 24 THEN '18-24'
                WHEN age BETWEEN 25 AND 34 THEN '25-34'
                WHEN age BETWEEN 35 AND 44 THEN '35-44'
                WHEN age BETWEEN 45 AND 54 THEN '45-54'
                WHEN age BETWEEN 55 AND 64 THEN '55-64'
                WHEN age >= 65 THEN '65+'
                ELSE NULL
            END AS age_range
            FROM (
                SELECT EXTRACT(YEAR FROM AGE(birth_date::DATE))::INT AS age
                FROM profiles_enriched
                WHERE birth_date IS NOT NULL
                  AND birth_date <> ''
                  AND birth_date ~ '^\d{4}-\d{2}-\d{2}$'
            ) ages
        ) buckets
        WHERE age_range IS NOT NULL
        GROUP BY age_range
        ORDER BY CASE age_range
            WHEN '18-24' THEN 0 WHEN '25-34' THEN 1 WHEN '35-44' THEN 2
            WHEN '45-54' THEN 3 WHEN '55-64' THEN 4 WHEN '65+' THEN 5
        END
    ),
    by_purpose AS (
        SELECT why_nlp AS purpose, COUNT(*)::INT AS count
        FROM profiles_enriched
        WHERE why_nlp IS NOT NULL AND why_nlp <> ''
        GROUP BY why_nlp
        ORDER BY count DESC
    ),
    by_city AS (
        SELECT q_city AS city, COUNT(*)::INT AS count
        FROM profiles_enriched
        WHERE q_city IS NOT NULL AND q_city <> ''
        GROUP BY q_city
        ORDER BY count DESC
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'kpis', (
            SELECT jsonb_build_object(
                'signups_today',      rk.signups_today,
                'signups_yesterday',  rk.signups_yesterday,
                'signups_7d',         rk.signups_7d,
                'signups_30d',        rk.signups_30d,
                'total_registrations',rk.total_registrations,
                'from_facebook',      rk.from_facebook,
                'from_instagram',     rk.from_instagram,
                'lessons_gt5',        pk.lessons_gt5,
                'lessons_gte10',      pk.lessons_gte10,
                'with_phone',         pk.with_phone,
                'without_phone',      pk.without_phone,
                'abandoned_total',    pk.abandoned_total,
                'abandoned_recent',   pk.abandoned_recent,
                'abandoned_today',    pk.abandoned_today
            )
            FROM reg_kpis rk, profile_kpis pk
        ),
        'by_source',     COALESCE((SELECT jsonb_agg(row_to_json(by_source))    FROM by_source),    '[]'::jsonb),
        'by_channel',    COALESCE((SELECT jsonb_agg(row_to_json(by_channel))   FROM by_channel),   '[]'::jsonb),
        'by_role',       COALESCE((SELECT jsonb_agg(row_to_json(by_role))      FROM by_role),      '[]'::jsonb),
        'by_stage',      COALESCE((SELECT jsonb_agg(row_to_json(by_stage))     FROM by_stage),     '[]'::jsonb),
        'by_lessons',    COALESCE((SELECT jsonb_agg(row_to_json(by_lessons))   FROM by_lessons),   '[]'::jsonb),
        'by_gender',     COALESCE((SELECT jsonb_agg(row_to_json(by_gender))    FROM by_gender),    '[]'::jsonb),
        'by_age_range',  COALESCE((SELECT jsonb_agg(row_to_json(by_age_range)) FROM by_age_range), '[]'::jsonb),
        'by_purpose',    COALESCE((SELECT jsonb_agg(row_to_json(by_purpose))   FROM by_purpose),   '[]'::jsonb),
        'by_city',       COALESCE((SELECT jsonb_agg(row_to_json(by_city))      FROM by_city),      '[]'::jsonb),
        'active_paying', (SELECT active_paying FROM paying),
        'pipeline_open', (SELECT open_count    FROM pipeline_open),
        'generated_at', now()
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_segments_overview() TO authenticated;
