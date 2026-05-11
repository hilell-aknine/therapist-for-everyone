-- ============================================================================
-- תיקון באג: אוטומציות "לא מילאת שאלון" שולחות גם ללידים שלא נרשמו לפורטל
--
-- הבעיה:
--   2 כללים ב-automation_rules סוננו לפי `filled_questionnaire = false`
--   בלבד. כיוון שהתנאי "לא מילא" אמת לכל מי שלא נמצא ב-portal_questionnaires,
--   גם משתמשים ב-profiles ללא role תקף (מ-OAuth/staging/admin manual)
--   נכנסו לאוכלוסייה.
--
-- התיקון:
--   להוסיף תנאי `role = 'student_lead'` ל-audience_filter של 2 הכללים.
--   זה האוכלוסייה הנכונה — המי שנרשם לפורטל ועוד לא מילא שאלון.
--
-- בטוח להריץ פעמיים (idempotent — לא יוסיף את התנאי אם כבר קיים).
-- ============================================================================

-- שלב 1: מציג מצב לפני (לתיעוד)
SELECT id, name, is_enabled, audience_filter
FROM public.automation_rules
WHERE name IN (
    'מי שלא מילא שאלון פורטל',
    'תזכורת 30 דק׳ אחרי הרשמה למי שלא מילא שאלון'
);

-- שלב 2: התיקון — הוספת תנאי role = student_lead לסינון
UPDATE public.automation_rules
SET audience_filter = jsonb_set(
        audience_filter,
        '{all}',
        (audience_filter->'all') || '[{"field":"role","op":"=","value":"student_lead"}]'::jsonb
    ),
    updated_at = now()
WHERE name IN (
    'מי שלא מילא שאלון פורטל',
    'תזכורת 30 דק׳ אחרי הרשמה למי שלא מילא שאלון'
)
AND NOT (audience_filter->'all' @> '[{"field":"role","op":"=","value":"student_lead"}]'::jsonb);

-- שלב 3: מציג מצב אחרי (אימות)
SELECT id, name, is_enabled, audience_filter
FROM public.automation_rules
WHERE name IN (
    'מי שלא מילא שאלון פורטל',
    'תזכורת 30 דק׳ אחרי הרשמה למי שלא מילא שאלון'
);

-- צפוי: בכל אחת מהרשומות יופיע בסוף ה-audience_filter:
--   {"field":"role","op":"=","value":"student_lead"}
-- והסינון יסתנן רק לאוכלוסיית ה-student_lead.
