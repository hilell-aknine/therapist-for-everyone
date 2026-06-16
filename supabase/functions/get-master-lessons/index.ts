import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ===== Master course modules (paid-only payload) =====
// Moved server-side (2026-06-10) so the paid Master course YouTube IDs are no
// longer hardcoded client-side in course-library-v2.html. Returned ONLY to
// authenticated paid_customer / admin users. Copied VERBATIM from the page.
const MASTER_MODULES = [
            {
                lessonNumber: 1,
                lessonTitle: 'מפגש 1 — רמות לוגיות וזהות',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: 'I3qjx4Xi62s', title: 'רמות לוגיות — מבוא ושינוי זהות', duration: '29:42' },
                    { id: 'wTRmW4IEYf8', title: 'חזרת פרקטישנר ואמונות הקורס', duration: '29:33' },
                    { id: 'a1uXGOBBYV4', title: 'רמות לוגיות בפירוט והרחבת זהות', duration: '19:41' },
                    { id: '2jamFOJnaho', title: 'חזון ואפקט הפרפר', duration: '29:20' },
                    { id: 'geV3tqupFWs', title: 'דמיון מודרך וצריבת מטרה חלק 1', duration: '17:31' },
                    { id: 'dy7xtarGHpw', title: 'דמיון מודרך וצריבת מטרה חלק 2', duration: '17:31' },
                    { id: 'kpXzcUXRccA', title: 'מבנה אמונות וגורמי יצירה', duration: '26:56' },
                    { id: 'gXfXBKO9-Es', title: 'תשאול סיבובי וסיכום חלק 1', duration: '19:04' },
                    { id: 'XcMlUtWkLho', title: 'תשאול סיבובי וסיכום חלק 2', duration: '19:09' },
                ]
            },
            {
                lessonNumber: 2,
                lessonTitle: 'מפגש 2 — חילוץ ערכים',
                color: 'var(--dusty-aqua)',
                chapters: [
                    { id: 'UKmnK3vdklo', title: 'חזרה ותשאול סיבובי', duration: '20:46' },
                    { id: 'I1gx9rL9bTM', title: 'עבודה עם מטפל וכלים לשינוי', duration: '28:59' },
                    { id: 'a7rT1c70GZw', title: 'מהם ערכים הגדרה ומבנה', duration: '19:42' },
                    { id: 'n6jt05lDEe0', title: 'כוח הערכים בחיים ובעסק', duration: '21:26' },
                    { id: 'HviGXHuuLKk', title: 'ערכים בזוגיות ושינוי ערכים חלק 1', duration: '15:56' },
                    { id: '7QhmpnIU7j0', title: 'ערכים בזוגיות ושינוי ערכים חלק 2', duration: '18:20' },
                    { id: '-EVfpe66xVo', title: 'איך מחלצים ערכים', duration: '25:33' },
                    { id: 'J0EdFm6vYLM', title: 'הדגמה חילוץ ערכים איגל', duration: '24:12' },
                    { id: 'wP6w2FFgBms', title: 'יישום עסקי והדגמה עם עודיה חלק 1', duration: '14:48' },
                    { id: '-AT4h12avP0', title: 'יישום עסקי והדגמה עם עודיה חלק 2', duration: '26:20' },
                    { id: 'HrXn9ehhS14', title: 'הדגמה אדיר וקריטריונים חלק 1', duration: '22:34' },
                    { id: 'uwyaF4AqizY', title: 'הדגמה אדיר וקריטריונים חלק 2', duration: '21:20' },
                ]
            },
            {
                lessonNumber: 3,
                lessonTitle: 'מפגש 3 — טראנס וטראומה',
                color: 'var(--gold)',
                chapters: [
                    { id: 'QZNye_7nYiA', title: 'ערכים רגשות וסטייט', duration: '30:23' },
                    { id: 'ES3NkLUdOy0', title: 'טראומה ותיבת פנדורה', duration: '25:43' },
                    { id: 'MK71JvjG3zM', title: 'מודל המוח והגורם הביקורתי', duration: '26:42' },
                    { id: 'BY8nU5LOX-Y', title: 'תיאוריית טראנס', duration: '30:20' },
                    { id: 'BDUkeI780cg', title: 'תרגול טראנס ומשולש הטראנס חלק 1', duration: '19:45' },
                    { id: 'V5r6pOa8fIA', title: 'תרגול טראנס ומשולש הטראנס חלק 2', duration: '18:24' },
                    { id: 'MPO4I-J07BA', title: 'הדגמת טראנס חיה חלק 1', duration: '21:30' },
                    { id: '4dWvnGHJuGo', title: 'הדגמת טראנס חיה חלק 2', duration: '21:17' },
                    { id: 'h_kmCVhX2K4', title: 'רגרסיה וציר זמן', duration: '27:42' },
                    { id: 'PbKwKWJ6ZP8', title: 'ריפוי ילד פנימי וסיכום', duration: '24:56' },
                ]
            },
            {
                lessonNumber: 4,
                lessonTitle: 'מפגש 4 — ציר זמן וקליניקה',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: 'Af3k2Po547c', title: 'חזרה רמות לוגיות ומדלינג', duration: '34:31' },
                    { id: 'IxHq7KCWCvM', title: 'בריף טראומה טראנס ומשולש', duration: '21:35' },
                    { id: 'gt__JCnt9pI', title: 'הדגמת אינדוקציה מלאה', duration: '26:59' },
                    { id: 'OpUy6q5g7DU', title: 'עבודה בקליניקה מצוי לרצוי', duration: '28:25' },
                    { id: 'ZC3sAzRMPJw', title: 'אמנות השאלה ודיקנס', duration: '22:19' },
                    { id: 'T2ZXFunoVdk', title: 'ציר זמן מציאת הרגש', duration: '26:02' },
                    { id: '5ZXmV4NWRVE', title: 'ציר זמן מציאת האירוע ורגרסיה', duration: '20:29' },
                    { id: 'vXDxDkW7JCQ', title: 'ציר זמן כיתתי תהליך מלא', duration: '34:12' },
                ]
            },
            {
                lessonNumber: 5,
                lessonTitle: 'מפגש 5 — רגשות והדחקה',
                color: 'var(--dusty-aqua)',
                chapters: [
                    { id: 'qFXlosy7wHw', title: 'רגש כפרשנות', duration: '24:55' },
                    { id: 'L5OsZ0GTM4E', title: 'מודע ותת-מודע, שלוש אסטרטגיות ותרגיל', duration: '32:56' },
                    { id: '-CyiG0LAM8I', title: 'חמשת נזיקי ההדחקה', duration: '35:15' },
                    { id: 'WdqfpDNuCW8', title: 'פחד מסרים וידע', duration: '23:40' },
                    { id: 'JjhvhSPiCfM', title: 'תרגיל פחד והתחייבויות חלק 1', duration: '20:16' },
                    { id: 'ZEdfxIn6G1A', title: 'תרגיל פחד והתחייבויות חלק 2', duration: '20:16' },
                    { id: 't9xzUkBcC0Y', title: 'חרדה ועצב חלק 1', duration: '21:19' },
                    { id: 'ejAmAafO9Oc', title: 'חרדה ועצב חלק 2', duration: '17:03' },
                    { id: 'LjeZxUEMAh4', title: 'תרגיל הכבוד ומסרי עצב', duration: '18:52' },
                    { id: 'zEiVW7ewZLA', title: 'שליטה במחשבות וסיכום חלק 1', duration: '20:05' },
                    { id: 'EopREmfFhAU', title: 'שליטה במחשבות וסיכום חלק 2', duration: '20:05' },
                ]
            },
            {
                lessonNumber: 6,
                lessonTitle: 'מפגש 6 — קבלת החלטות ומידול',
                color: 'var(--gold)',
                chapters: [
                    { id: 'R2FQSxZWx88', title: 'פרשנות ושאלות מעצימות', duration: '7:08' },
                    { id: '4fDsS8Nrp5Y', title: 'מתכונים לקבלת החלטות VAK', duration: '33:28' },
                    { id: '2CFJgGgoLBQ', title: 'שלושת הצעדים לשינוי', duration: '24:53' },
                    { id: '_-RZgPNoB5c', title: 'טופס שאלות ותחקור עסקי', duration: '23:55' },
                    { id: 'p1WhCqOHT8M', title: 'מודל TOTE ומידול דנה', duration: '31:32' },
                    { id: '_CsFIuWybFI', title: 'כלי שינוי Six Step וסאב מודליטי', duration: '28:36' },
                    { id: 'GcNcnwEZYdQ', title: 'תרגול מידול TOTE וסיכום חלק 1', duration: '21:59' },
                    { id: '9UCARJOolXA', title: 'תרגול מידול TOTE וסיכום חלק 2', duration: '19:07' },
                ]
            },
            {
                lessonNumber: 7,
                lessonTitle: 'מפגש 7 — שחרור טינה ורגשות',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: 'Ya5w7XQKy88', title: 'סטייט, חמישה רגשות ושליטה', duration: '30:45' },
                    { id: 'Vji9rdoGOtk', title: 'פוקוס קריטריונים ופיזיולוגיה', duration: '27:32' },
                    { id: 'Oj__DbdRZ_8', title: 'כעס, טינה, ערכים ושחרור', duration: '36:18' },
                    { id: 'YUff3iYAOeI', title: 'כוונה חיובית והכנה לסליחה', duration: '27:17' },
                    { id: 'Nl0E0vP4Moo', title: 'אמונות מגבילות וטכניקת שחרור חלק 1', duration: '24:13' },
                    { id: 'eC_BEF_MVnE', title: 'אמונות מגבילות וטכניקת שחרור חלק 2', duration: '23:59' },
                    { id: '0zd4I4gDCCU', title: 'הדגמה חיה שחרור טינה חלק 1', duration: '26:12' },
                    { id: '4KQHQJzjby8', title: 'הדגמה חיה שחרור טינה חלק 2', duration: '25:51' },
                    { id: 'DYZmhLaKcLA', title: 'תרגול כיתתי וסיכום', duration: '31:25' },
                ]
            },
            {
                lessonNumber: 8,
                lessonTitle: 'מפגש 8 — רגשות, זריזות לשון וסום',
                color: 'var(--dusty-aqua)',
                chapters: [
                    { id: 'WV-qX1HUAFg', title: 'רגשות · עצב, פחד והתמודדות', duration: '27:18' },
                    { id: 'ZAGPI7Cvtjg', title: 'כעס, אשמה, זהות וטכניקות לפחד', duration: '32:39' },
                    { id: 'NK4iF_wf2bM', title: 'ריקנות, תשוקה, מבוא לזריזות לשון והיררכיית ערכים', duration: '33:27' },
                    { id: 'HRnubwHc_B0', title: 'זריזות לשון · היררכיית מטרות וכוונה חיובית', duration: '23:27' },
                ]
            },
            {
                lessonNumber: 9,
                lessonTitle: 'מפגש 9 — סוויש, דיקנס ושיבוש',
                color: 'var(--gold)',
                chapters: [
                    { id: 'RzkFmMWL6FM', title: 'סוויש תיאוריה', duration: '19:11' },
                    { id: '24QYOZTYF6w', title: 'סוויש הדגמה עם לילי', duration: '18:48' },
                    { id: 'D-OP0dixpDs', title: 'סוויש סיכום ושאלות', duration: '21:56' },
                    { id: 'jfpAWgRKU0g', title: 'דיקנס תיאוריה', duration: '24:01' },
                    { id: 'SS4f0kB6pKk', title: 'דיקנס הדגמה עם ליאל', duration: '24:09' },
                    { id: 'oWqPhfy4XAA', title: 'שיבוש אסטרטגיה, הדגמה וסיכום', duration: '34:01' },
                ]
            },
            {
                lessonNumber: 10,
                lessonTitle: 'מפגש 10 — סיכום ומחולל התנהגות',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: 'pwVC8IXNsvA', title: 'פתיחה וסקירת הכלים', duration: '8:39' },
                    { id: '60h9pua0RKY', title: 'הדגמת מחולל ההתנהגות', duration: '33:24' },
                    { id: 'lA88Ngkt2oQ', title: 'חזרה אמונות וערכים', duration: '18:36' },
                    { id: 'V31347V9k1I', title: 'חזרה טראומה טראנס וציר זמן', duration: '26:37' },
                    { id: '5MnuxXvY0GU', title: 'חזרה רגשות אסטרטגיות טינה וסומים', duration: '32:46' },
                ]
            },
            {
                lessonNumber: 11,
                lessonTitle: 'סדנת רגשות — הבנת מסרים מרגשות',
                color: 'var(--gold)',
                isBonus: true,
                chapters: [
                    { id: 'xVN1XcyIaGU', title: 'רגשות ומודל מרפת — למה יש לנו רגשות', duration: '22:40' },
                    { id: 'QRrEA0ExxFA', title: 'הרגש כמסר מתת-המודע — פוקוס, הכרת תודה ומילים', duration: '23:53' },
                    { id: 'Osueu110FHg', title: 'שפה, פיזיולוגיה וסטייט — איך הגוף קובע את הרגש', duration: '23:50' },
                    { id: 'LSjXRr3l6gQ', title: 'פחד וחשיפה הדרגתית — לפרוץ חסמים צעד-צעד', duration: '23:27' },
                    { id: 'd5VSLAQKR-8', title: 'שינוי זהות, עצב, כעס ואשמה', duration: '22:53' },
                    { id: 'XvynUFtXzn8', title: 'מטראומה לתשוקה — רגשות חיוביים וסיכום', duration: '24:27' },
                ]
            },
            {
                lessonNumber: 12,
                lessonTitle: 'סדנת סגנונות תקשורת — איך לתקשר עם כל אחד',
                color: 'var(--accent-gold-hover)',
                isBonus: true,
                // Single full-workshop video (KryXIuiM57Y) split into chapters by timestamp via `start` (seconds).
                chapters: [
                    { id: 'KryXIuiM57Y', title: 'למה להכיר את עצמך לפני שאתה משפיע על אחרים', duration: '10:25', start: 7 },
                    { id: 'KryXIuiM57Y', title: 'ארבעת סגנונות התקשורת — מבוא ותמונה כללית', duration: '5:27', start: 632 },
                    { id: 'KryXIuiM57Y', title: 'מילוי השאלון וחישוב הסגנון הראשי שלך', duration: '31:24', start: 959 },
                    { id: 'KryXIuiM57Y', title: 'לאתר את הסגנון שלך על המפה ולא להיכבל לזהות', duration: '8:40', start: 2843 },
                    { id: 'KryXIuiM57Y', title: 'פרופיל מלא של ארבעת הסגנונות: משימתי, מקדם, תומך, מנתח', duration: '19:22', start: 3363 },
                    { id: 'KryXIuiM57Y', title: 'גילוי הסגנון המשני שלך וסיכום ראשוני', duration: '6:45', start: 4525 },
                    { id: 'KryXIuiM57Y', title: 'רפור — הכלי החזק ביותר ליצירת חיבור לא-מודע', duration: '24:07', start: 4930 },
                    { id: 'KryXIuiM57Y', title: 'מרכיבי הרפור בפועל: שפת גוף, טונציה ומילים — ומשימות לדרך', duration: '28:05', start: 6377 },
                ]
            },
        ]

// ===== Practitioner technique demos (paid catalog) =====
// Moved server-side (2026-06-10) so the paid practitioner technique YouTube IDs are
// no longer hardcoded client-side in course-library-v2.html. Returned ONLY to
// authenticated paid_customer / admin users. Copied VERBATIM from the page.
const TECHNIQUES_MODULES = [
    { lessonNumber: 2, lessonTitle: 'שיעור 2 · עמדות תפיסה', color: 'var(--dusty-aqua)', chapters: [
      { id: 'J3-E2b9zi9E', title: 'טכניקת טיול בין עמדות · הדגמה חיה', duration: '1:03:41' },
    ]},
    { lessonNumber: 4, lessonTitle: 'שיעור 4 · מערכות ייצוג והרגלים', color: 'var(--muted-teal)', chapters: [
      { id: 'H1Vy9X6oZh4', title: 'טכניקת מערכות ייצוג · הדגמה חיה', duration: '4:46' },
      { id: 'YbGJry_hEdU', title: 'טכניקת דרייבר · הדגמה חיה', duration: '2:48' },
      { id: 'pLhVfzEPxcQ', title: 'טכניקת MAP ACROSS · הדגמה חיה', duration: '1:02:36' },
      { id: 'yc8FagzPaMA', title: 'טכניקת סוויש · הדגמה חיה', duration: '34:34' },
    ]},
    { lessonNumber: 6, lessonTitle: 'שיעור 6 · רגשות ומשאבים', color: 'var(--gold)', chapters: [
      { id: 'w3WXQZjVFbw', title: 'טכניקת 6 שלבים · הדגמה חיה', duration: '38:08' },
    ]},
    { lessonNumber: 7, lessonTitle: 'שיעור 7 · אמונות ועוגנים', color: 'var(--dusty-aqua)', chapters: [
      { id: 'Zw4CrM7sYA4', title: 'טכניקת יצירת עוגן · הדגמה חיה', duration: '9:04' },
    ]},
    { lessonNumber: 8, lessonTitle: 'שיעור 8 · ציר הזמן (קבוצתי)', color: 'var(--muted-teal)', chapters: [
      { id: 'u4zrb0JtDCg', title: 'טכניקת ציר זמן · הדגמה קבוצתית', duration: '31:52' },
    ]},
    { lessonNumber: 9, lessonTitle: 'שיעור 9 · ציר הזמן', color: 'var(--gold)', chapters: [
      { id: 'pVE6_ERar2Y', title: 'טכניקת ציר זמן · הדגמה חיה', duration: '32:00' },
    ]},
  ]

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'לא מחובר. התחבר כדי לצפות בקורס המאסטר.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'אימות נכשל. נסה להתחבר מחדש.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Paid-only gate ---
    // The Master course content (YouTube IDs) is a paid benefit. This is the
    // authoritative server-side enforcement so the IDs can't be reached by
    // bypassing the browser. Only paid_customer / admin pass.
    const { data: roleRow } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = roleRow?.role
    if (role !== 'paid_customer' && role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'קורס המאסטר זמין לחברי הקורס בלבד 👑', paidOnly: true }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Authorized: return the full master modules payload ---
    return new Response(
      JSON.stringify({ modules: MASTER_MODULES, techniques: TECHNIQUES_MODULES }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'שגיאה זמנית. נסו שוב בעוד כמה שניות.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
