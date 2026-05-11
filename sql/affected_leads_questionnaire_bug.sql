-- ============================================================================
-- שליפת רשימת לידים שקיבלו את הודעת ה"לא מילאת שאלון" השגויה
--
-- מטרה: לזהות מי בטעות קיבל הודעה למרות שלא נרשם לפורטל / לא היה אמור.
--
-- האסטרטגיה:
--   1. מוצא את 2 הכללים השגויים ב-automation_rules
--   2. שולף את כל ה-runs שלהם ב-30 ימים האחרונים שסטטוס = sent
--   3. מצליב עם profiles להראות role נוכחי
--   4. מסמן "נפגעים" = role שונה מ-student_lead (כלומר לא היו אמורים לקבל)
-- ============================================================================

WITH bad_rules AS (
    SELECT id, name
    FROM public.automation_rules
    WHERE name IN (
        'מי שלא מילא שאלון פורטל',
        'תזכורת 30 דק׳ אחרי הרשמה למי שלא מילא שאלון'
    )
),
sent_runs AS (
    SELECT
        r.fired_at,
        r.user_id,
        r.phone,
        r.message_text,
        br.name AS rule_name
    FROM public.automation_runs r
    JOIN bad_rules br ON r.rule_id = br.id
    WHERE r.status = 'sent'
      AND r.fired_at >= now() - interval '30 days'
)
SELECT
    sr.fired_at::timestamp(0)        AS sent_at,
    sr.phone                         AS phone,
    p.full_name                      AS name,
    p.email                          AS email,
    COALESCE(p.role, '(אין role)')   AS current_role,
    -- האם זה ליד נפגע = role שונה מ-student_lead
    CASE WHEN p.role IS NULL OR p.role <> 'student_lead'
         THEN '⚠️ נפגע' ELSE 'לגיטימי' END  AS status,
    sr.rule_name                     AS rule,
    LEFT(sr.message_text, 80)        AS message_preview
FROM sent_runs sr
LEFT JOIN public.profiles p ON p.id = sr.user_id
ORDER BY sr.fired_at DESC;

-- אם רוצים רק את הנפגעים:
-- הוסף בסוף: WHERE p.role IS NULL OR p.role <> 'student_lead'

-- אם הטבלה ריקה — כנראה שעדיין לא נוצרו כללים מהתבניות,
-- או שאף אחד לא קיבל הודעה ב-30 הימים האחרונים. במקרה כזה, תריץ:
SELECT COUNT(*) AS total_runs_ever
FROM public.automation_runs r
JOIN public.automation_rules ar ON r.rule_id = ar.id
WHERE ar.name LIKE '%שאלון%';
