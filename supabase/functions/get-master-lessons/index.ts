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
                // Re-cut 2026-09-03 from the source recording. The previous nine
                // chapters were split on a stopwatch: they opened and closed
                // mid-sentence, repeated material, and 41 of the 88 durations
                // across the course did not match the video that actually played.
                // These eight are cut only where a subject ends and another
                // begins, never inside an exercise or a live demonstration, and
                // 15:14 of breaks and logistics are gone. Durations below are
                // measured from YouTube, not hand-written.
                lessonNumber: 1,
                lessonTitle: 'מפגש 1 — רמות לוגיות, חזון ואמונות',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: '_W3r2-8dUu8', title: 'ציפיות מהקורס ומודל הרמות הלוגיות', duration: '34:58' },
                    { id: '2Bu_VjQQQos', title: 'חזרה על נושאי קורס הפרקטישנר', duration: '21:46' },
                    { id: 'Z3HsQ2otyXo', title: 'תרגיל כתיבה — למה אני כאן ומה המטרות שלי', duration: '32:29' },
                    { id: '4ujh3kzwzFc', title: 'רמת החזון', duration: '35:37' },
                    { id: 'LzZ3yIgse5w', title: 'תרגיל צריבת מטרה בנוירונים', duration: '28:36' },
                    { id: 'ff5blwndxJM', title: 'שיתופים לאחר התרגיל ומבוא לאמונות', duration: '29:45' },
                    { id: 'LiNhHpu5PWU', title: 'שלושת הגורמים ליצירת אמונות', duration: '18:39' },
                    { id: 'u5JOMbtCtiU', title: 'תשאול סיבובי וסיכום המפגש', duration: '32:55' },
                ]
            },
            {
                // Re-cut 2026-09-03, same method as session 1. Twelve ruler-cut
                // chapters (with a measured 14:49 of material published beyond the
                // length of the recording itself) become ten cut on subject
                // boundaries, with 8:18 of breaks and logistics removed.
                lessonNumber: 2,
                lessonTitle: 'מפגש 2 — ערכים, חילוץ ומדרג',
                color: 'var(--dusty-aqua)',
                chapters: [
                    { id: 'z4zt9Mua3yM', title: 'מבוא לערכים', duration: '25:13' },
                    { id: 'Gfyp9YsJUOI', title: 'סקאלת העבודה עם אנשים', duration: '29:20' },
                    { id: 'truEMARTZDQ', title: 'דיון כיתתי — פגיעות כערך', duration: '33:48' },
                    { id: '7VebmuQTXSA', title: 'ערכי אמצעי, ערכי מטרה ומבנה העומק', duration: '19:46' },
                    { id: 'vVqZusk9LH4', title: 'שינוי ערכים וקונפליקטים', duration: '25:01' },
                    { id: 'VF6ymX-mhB4', title: 'איך מפיקים ערכים מאירועי עבר', duration: '25:29' },
                    { id: '12qWAgQ3qrk', title: 'הדגמה — חילוץ ערכים מסיפור', duration: '25:25' },
                    { id: '9C4gRD_pNiQ', title: 'הדגמה — תרגול הפקת ערכים', duration: '20:53' },
                    { id: 'I1My6xLf9c0', title: 'הדגמה — חילוץ ודירוג ערכים', duration: '29:25' },
                    { id: '_MPc73J3TD4', title: 'קריטריונים להגשמת ערכים', duration: '29:57' },
                ]
            },
            {
                // Re-cut 2026-09-03, same method as sessions 1-2. Ten ruler-cut
                // chapters become nine cut on subject boundaries, with 19:48 of
                // breaks and logistics removed — the largest removal so far.
                lessonNumber: 3,
                lessonTitle: 'מפגש 3 — טראומה, טראנס וריפוי',
                color: 'var(--gold)',
                chapters: [
                    { id: 'bSG4Wrgu-M0', title: 'חזרה על שיעורי הבית — ערכים', duration: '35:08' },
                    { id: 'Y62xPVOKqy8', title: 'מהי טראומה ואיך היא נוצרת', duration: '25:21' },
                    { id: 'uTizzNnmrqc', title: 'הגורם הביקורתי', duration: '31:13' },
                    { id: 'HpN1Cn8A104', title: 'מצב טראנס', duration: '31:33' },
                    { id: 'cYtpks8IcOE', title: 'תיאוריית הטראנס — סיכום', duration: '29:36' },
                    { id: 's1aLUtp_GrY', title: 'משולש הטראנס', duration: '25:10' },
                    { id: '96qWw9yk-co', title: 'הדגמה — אינדוקציית דייב אלמן', duration: '25:44' },
                    { id: 'Oe4LSX9khaQ', title: 'רגרסיה וציר זמן — שאלות ותשובות', duration: '24:09' },
                    { id: '0TPbpP85_aw', title: 'ריפוי הילד הפנימי וסיכום', duration: '18:42' },
                ]
            },
            {
                // Re-cut 2026-09-04, same method as sessions 1-3.
                lessonNumber: 4,
                lessonTitle: 'מפגש 4 — קליניקה, דיקנס וציר זמן',
                color: 'var(--muted-teal)',
                chapters: [
                    { id: 'JuUqTI0muSM', title: 'מטרת השיעור — פרקטיקה ותרגול', duration: '30:30' },
                    { id: 'l0EFf1UD6R4', title: 'חזרה — טראומה, מודל המוח וטראנס', duration: '30:22' },
                    { id: 'vc8qXkT4AfI', title: 'אינדוקציית דייב אלמן', duration: '32:15' },
                    { id: 'ZMheHLVOn5c', title: 'המבנה הטכני של תהליך NLP', duration: '34:12' },
                    { id: 'E9XzS6I6yrE', title: 'טכניקת דיקנס — כאב ועונג', duration: '31:23' },
                    { id: 'avE-xKh7BYA', title: 'תרגיל מודרך — איתור רגש לפני פעולה', duration: '34:07' },
                    { id: 'w1Q0WvUywXw', title: 'תרגיל מודרך — ציר זמן', duration: '33:49' },
                ]
            },
            {
                lessonNumber: 5,
                lessonTitle: 'מפגש 5 — רגשות והדחקה',
                color: 'var(--dusty-aqua)',
                chapters: [
                    { id: 'HTVAJyAFJDA', title: 'רגש כפרשנות', duration: '24:55' },
                    { id: 'NsfmQYJ_LcY', title: 'מודע ותת-מודע, שלוש אסטרטגיות ותרגיל', duration: '32:56' },
                    { id: 'Q3l-xJ6GJ1I', title: 'חמשת נזיקי ההדחקה', duration: '35:15' },
                    { id: '4LgCzl8AJN8', title: 'פחד מסרים וידע', duration: '23:40' },
                    { id: 'JjhvhSPiCfM', title: 'תרגיל פחד והתחייבויות חלק 1', duration: '20:16' },
                    { id: 'ZEdfxIn6G1A', title: 'תרגיל פחד והתחייבויות חלק 2', duration: '20:16' },
                    { id: 'YrP8Kjgc-6Y', title: 'חרדה ועצב חלק 1', duration: '21:19' },
                    { id: '5y7oDBWiVck', title: 'חרדה ועצב חלק 2', duration: '17:03' },
                    { id: 'LjeZxUEMAh4', title: 'תרגיל הכבוד ומסרי עצב', duration: '18:52' },
                    { id: 'akA6XRr2Nz0', title: 'שליטה במחשבות וסיכום חלק 1', duration: '20:05' },
                    { id: 'AC4Di9XBrws', title: 'שליטה במחשבות וסיכום חלק 2', duration: '20:05' },
                ]
            },
            {
                lessonNumber: 6,
                lessonTitle: 'מפגש 6 — קבלת החלטות ומידול',
                color: 'var(--gold)',
                chapters: [
                    { id: 'T8bHNeIGYJg', title: 'פרשנות ושאלות מעצימות', duration: '7:08' },
                    { id: '16KH-IMBcgc', title: 'מתכונים לקבלת החלטות VAK', duration: '33:28' },
                    { id: 'G_I6HAYopzs', title: 'שלושת הצעדים לשינוי', duration: '24:53' },
                    { id: '852CVGNQug4', title: 'טופס שאלות ותחקור עסקי', duration: '23:55' },
                    { id: 'p1WhCqOHT8M', title: 'מודל TOTE ומידול דנה', duration: '31:32' },
                    { id: 'IXETzhdM5TE', title: 'כלי שינוי Six Step וסאב מודליטי', duration: '28:36' },
                    { id: 'qiPy4o6RKrk', title: 'תרגול מידול TOTE וסיכום חלק 1', duration: '21:59' },
                    { id: 'FnXlqfnT4ng', title: 'תרגול מידול TOTE וסיכום חלק 2', duration: '19:07' },
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
                    { id: 'sCR0gGyTMGU', title: 'רגשות · עצב, פחד והתמודדות', duration: '27:18' },
                    { id: 'tPYUZ6pnkY0', title: 'כעס, אשמה, זהות וטכניקות לפחד', duration: '32:39' },
                    { id: 'qfcUQcfck8M', title: 'ריקנות, תשוקה, מבוא לזריזות לשון והיררכיית ערכים', duration: '33:27' },
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
                    { id: 'Arxq-rS-rXU', title: 'סוויש סיכום ושאלות', duration: '21:56' },
                    { id: 'yEopD-V9i8U', title: 'דיקנס תיאוריה', duration: '24:01' },
                    { id: 'SS4f0kB6pKk', title: 'דיקנס הדגמה עם ליאל', duration: '24:09' },
                    { id: 'cRzoVWXUOW8', title: 'שיבוש אסטרטגיה, הדגמה וסיכום', duration: '34:01' },
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
