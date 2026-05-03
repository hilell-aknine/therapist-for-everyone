// ============================================================================
// Edge Function: retention-run
// Triggered from the admin dashboard "Retention" tab. Scans Supabase for
// inactive students (3+ days without progress in NLP-Practitioner course
// MVP, which is module 1 lessons 1-5), generates personalized Hebrew
// WhatsApp drafts via Claude Sonnet 4.6 (prompt caching), and inserts
// each as status='draft' in retention_messages.
//
// Direct port of nlp-retention/run.py + supabase_reader.py + personalize.py
// + sync_to_supabase.py. Lessons map and prompt are embedded so the function
// is self-contained.
//
// Hard limit: 30 students per call (Edge Function 150-second timeout safety).
// If more inactive students remain, the response includes `remaining > 0`
// and the admin clicks again to process the next batch.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const COURSE_TYPE = 'nlp-practitioner'
const INACTIVITY_DAYS = 3
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 30
const PARALLEL_BATCH = 3
const DEDUP_WINDOW_DAYS = 14
const MODEL_SONNET = 'claude-sonnet-4-6'
const SEND_WINDOW_START = 9
const SEND_WINDOW_END = 20
const DEFAULT_SEND_HOUR = 19

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// ---------------------------------------------------------------------------
// Lessons map (mirror of nlp-retention/data/lessons_map.json) — embedded so
// the function is self-contained and the system block can be cached as one
// stable text blob (prompt caching gives ~90% token savings after warm-up).
// ---------------------------------------------------------------------------

interface Lesson {
  lesson_index: number
  module: number
  youtube_id: string
  title: string
  duration: string
  lesson_url: string
  insight_oneline: string
  what_student_learns: string[]
  why_for: { career: string; relationships: string; confidence: string }
}

const LESSONS_MAP: Record<string, Lesson> = {
  lesson_1: {
    lesson_index: 1,
    module: 1,
    youtube_id: 'HdJTrqV-8kw',
    title: 'איך NLP יכול לשנות את חייך?',
    duration: '20:20',
    lesson_url: 'https://www.therapist-home.com/pages/course-library.html#m1-l1',
    insight_oneline: 'NLP מלמד איך מוחך עובד כדי שתוכל לשנות מחשבות, הרגלים ואמונות מגבילות בפועל.',
    what_student_learns: [
      'להבין ש-NLP הוא כלי לשינוי נוירונים באמצעות שפה — לא תיאוריה אלא שיטה פרקטית',
      'לזהות שאמונות ומחשבות שצברנו מהילדות הן שכבות שניתן לקלף ולשנות',
      'להבחין בין מחשבות אפקטיביות (מקדמות) לדפקטיביות (מעכבות) ולבחור באיזה להאמין',
      'להבין שהתמסרות מלאה לתהליך — לא ידע פסיבי — היא מה שמייצר שינוי אמיתי',
      "להכיר את עקרון הבסיס: 'תאמין לשקר שעושה לך טוב' כמנוף לשינוי אמונות מגבילות",
    ],
    why_for: {
      career: 'מי שמאמין שהוא יכול להצליח עסקית מגיע לתוצאות מהר יותר — NLP מלמד לבנות את האמונה הזאת במכוון.',
      relationships: 'קליפת שכבות האמונות שצברנו מהילדות מאפשרת לתקשר עם אנשים קרובים מתוך בחירה ולא מתוך תגובה אוטומטית.',
      confidence: 'הבנת מערכת ההפעלה של המוח שלך נותנת שליטה אמיתית על מחשבות עצמיות ומפסיקה את השתלטות הקול הפנימי המגביל.',
    },
  },
  lesson_2: {
    lesson_index: 2,
    module: 1,
    youtube_id: 'I4r3oERlZpc',
    title: 'מהן האמונות שמסתתרות בתת המודע?',
    duration: '21:40',
    lesson_url: 'https://www.therapist-home.com/pages/course-library.html#m1-l2',
    insight_oneline: 'אמונות מגבילות מהילדות חיות בתת-מודע ומונעות מאיתנו לפעול — וניתן לזהות ולפרק אותן.',
    what_student_learns: [
      'לזהות שפחד הוא השורש המרכזי שמונע השגת מטרות בחיים',
      'להבחין בין אמונות מגבילות לאמונות מקדמות לפי המטרות האישיות שלך',
      'להבין שאמונות מגבילות נוצרות מאירועי ילדות ונסחבות שנים ללא מודעות',
      'להגדיר אמונה כתחושת וודאות — גם אם היא אינה אמת אובייקטיבית',
      'להכיר שלכולם יש אמונות מגבילות, וה-NLP מאפשר לפרק אותן',
    ],
    why_for: {
      career: 'בן אדם שמהסס להעלות תוכן, לעשות שיחות מכירה או להקים עסק — כנראה מחזיק אמונות מגבילות מהילדות שניתן לפרק בקורס.',
      relationships: 'הפחד מדחייה רומנטית שנולד מאירוע אחד בחטיבה יכול למנוע זוגיות לשנים — זיהוי האמונה הוא הצעד הראשון לשנות את זה.',
      confidence: "כשמבינים שהביקורת העצמית היא אמונה שנבנתה — לא עובדה — מתחיל תהליך של הקלה אמיתית מה'שקים' שסוחבים על הגב.",
    },
  },
  lesson_3: {
    lesson_index: 3,
    module: 1,
    youtube_id: 'zGuxyfbYdUY',
    title: "מה זה (תכל'ס) NLP?",
    duration: '22:10',
    lesson_url: 'https://www.therapist-home.com/pages/course-library.html#m1-l3',
    insight_oneline: 'NLP מחליף נתיבים נוירולוגיים ישנים בחדשים דרך שפה, כדי לשנות הרגלים ורגשות אוטומטיים.',
    what_student_learns: [
      'להסביר מה זה NLP בשפה פשוטה: כלי לשינוי מחשבות, רגשות והרגלים אוטומטיים דרך שפה',
      'להבין כיצד נתיבים נוירולוגיים נוצרים ומתחזקים עם חזרה, ולמה קשה לשבור הרגלים',
      'להבחין בין חסימת נתיב ישן לבין יצירת נתיב חלופי שמגיע לאותה מטרה',
      "לזהות את 'רגש הבית' האישי שלהם — הרגש האוטומטי שחוזר בסיטואציות לחץ",
      'לזהות שמאחורי הרס עצמי או הרגל גרוע מסתתרת כוונה חיובית עמוקה',
    ],
    why_for: {
      career: 'מי שנתקע בשיחות מכירה מחמת אמונה שמכירה = ניצול — יבין מה הקוד הפגום וכיצד לשנותו.',
      relationships: "מי שמגיב בכעס או עצב אוטומטי כלפי בן הזוג — ילמד לזהות את 'רגש הבית' שלו ולבחור תגובה אחרת.",
      confidence: 'מי שחוזר שוב ושוב להרגלים מזיקים ומרגיש חוסר אונים — יבין שזה נתיב נוירולוגי שניתן לשנות, לא כשל אישיותי.',
    },
  },
  lesson_4: {
    lesson_index: 4,
    module: 1,
    youtube_id: 'fo90wrXPJjQ',
    title: 'שלוש הנחות יסוד משנות חיים',
    duration: '27:23',
    lesson_url: 'https://www.therapist-home.com/pages/course-library.html#m1-l4',
    insight_oneline: 'שלוש הנחות יסוד של NLP שמשנות איך אתה מפרש אנשים, מאמן גוף ומשיג ביצועים.',
    what_student_learns: [
      'להבין שכל אדם פועל לפי מפת תפיסה אישית — ולהפסיק לשפוט אחרים שלא תומכים בך',
      'לזהות שהמוח לא מבחין בין דמיון לזיכרון למציאות — ולהשתמש בדמיון מכוון לשיפור ביצועים',
      'לתרגל כלים חדשים בסבלנות עם חזרות, כי כל מיומנות הופכת לא-מודעת עם זמן',
      'לבצע תרגיל גופני מוכח שמראה שיפור של 20-50% בטווח תנועה רק דרך דמיון מנטלי',
    ],
    why_for: {
      career: 'מי שמנהל שיחות מכירה או פגישות עסקיות ישתמש בהנחת המפה כדי להבין לקוחות ולא לפרש התנגדות כאישית.',
      relationships: 'הבנה שלכל אדם יש מפת תפיסה שונה מאפשרת לסלוח ולהבין בן-זוג או הורה שלא תמך — גם כשכאב.',
      confidence: 'תרגול דמיון מנטלי מכוון לפני אתגר (הרצאה, דייט, ראיון) מוכח שמשפר ביצועים בפועל.',
    },
  },
  lesson_5: {
    lesson_index: 5,
    module: 1,
    youtube_id: 'kccllbuObhs',
    title: 'מודע, תת מודע ומודל התקשורת',
    duration: '24:28',
    lesson_url: 'https://www.therapist-home.com/pages/course-library.html#m1-l5',
    insight_oneline: 'המוח מסנן 2 מיליון ביט למיצג פנימי אישי דרך עיוותים, הכללות והשמטות — וזה מה שיוצר את המציאות שלך.',
    what_student_learns: [
      'להבדיל בין תפקידי המודע (לוגיקה, ביקורתיות, רציונליזציה) לתת-מודע (רגשות, זיכרון ארוך-טווח, החלטות אוטומטיות)',
      'לזהות את שלושת המסננים הנפשיים: עיוותים, הכללות והשמטות — ואיך הם יוצרים תפיסת מציאות שונה אצל כל אדם',
      'להבין שהמוח אינו מבחין בין דמיון למציאות, ולכן מה שמחשבים עליו — המוח עובד לקראתו',
      'להשתמש בחוק ההגשמה בפועל: הצבת מטרות ספציפיות ומדידות מגדילה את הסיכוי להשגתן',
      'לזהות את מודל התקשורת: אירוע ← מסננים ← מיצג פנימי ← רגש ← תגובה — ולהבין איפה NLP מתערב',
    ],
    why_for: {
      career: 'כשמטרה עסקית מנוסחת ספציפית ומדידה, המוח מכוון אוטומטית אליה — כמו וויז עם כתובת מדויקת.',
      relationships: 'הכרת מסנני ההכללה וההשמטה מסבירה למה בני זוג רואים את אותו ויכוח אחרת לגמרי, ומאפשרת להפסיק לריב על מי צודק.',
      confidence: 'הבנה שרגשות שליליים נובעים ממיצג פנימי ולא מהמציאות עצמה פותחת אפשרות לשנות את הפרשנות ולא רק לסבול מהתגובה.',
    },
  },
}

const MVP_VIDEO_IDS = Object.values(LESSONS_MAP).map(l => l.youtube_id)
const LAST_MVP_VIDEO_ID = MVP_VIDEO_IDS[MVP_VIDEO_IDS.length - 1]
const VID_TO_INDEX: Record<string, number> = Object.fromEntries(
  Object.values(LESSONS_MAP).map(l => [l.youtube_id, l.lesson_index]),
)

// ---------------------------------------------------------------------------
// Why classification — deterministic (no LLM), mirror of personalize.classify_why
// ---------------------------------------------------------------------------

const WHY_TO_CATEGORY: Record<string, string> = {
  'התפתחות אישית': 'confidence',
  'שילוב בעסק': 'career',
  'קליניקה': 'career',
}

const RELATIONSHIP_KEYWORDS = [
  'נשוא', 'זוגיות', 'בן זוג', 'בת זוג', 'אהבה', 'אהוב', 'מערכת יחסים',
  'ילדים שלי', 'משפחה שלי', 'להתחתן',
]

function classifyWhy(whyNlp: string | null, visionOneYear: string | null): 'career' | 'relationships' | 'confidence' {
  if (visionOneYear) {
    const v = visionOneYear.trim()
    if (RELATIONSHIP_KEYWORDS.some(k => v.includes(k))) return 'relationships'
  }
  const cat = WHY_TO_CATEGORY[(whyNlp || '').trim()]
  return (cat as 'career' | 'confidence') || 'confidence'
}

// ---------------------------------------------------------------------------
// Phone normalization — mirror of supabase_reader._normalize_phone +
// crm-bot/src/whatsapp.js:97-108 (972... international format).
// ---------------------------------------------------------------------------

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  if (digits.length === 9) return '972' + digits
  return digits
}

// ---------------------------------------------------------------------------
// Send-hour heuristic — mirror of supabase_reader._compute_preferred_hour.
// Returns [hour, sample_count]. Hour clipped to [9, 20]. Falls back to 19
// when fewer than 3 data points.
// ---------------------------------------------------------------------------

function computePreferredHour(completedAts: string[]): [number, number] {
  if (!completedAts || completedAts.length === 0) return [DEFAULT_SEND_HOUR, 0]
  const israelOffsetMs = 3 * 60 * 60 * 1000  // Asia/Jerusalem is UTC+3 (DST). We approximate.
  const hours: number[] = []
  for (const s of completedAts) {
    const dt = new Date(s)
    if (isNaN(dt.getTime())) continue
    const localHour = new Date(dt.getTime() + israelOffsetMs).getUTCHours()
    hours.push(localHour)
  }
  if (hours.length < 3) return [DEFAULT_SEND_HOUR, hours.length]
  const counts = new Map<number, number>()
  for (const h of hours) counts.set(h, (counts.get(h) || 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  let h = sorted[0][0]
  if (h < SEND_WINDOW_START) h = SEND_WINDOW_START
  if (h > SEND_WINDOW_END) h = SEND_WINDOW_END
  return [h, hours.length]
}

// ---------------------------------------------------------------------------
// Find inactive students — port of supabase_reader.find_inactive_students.
// Service-role read so RLS doesn't block the joins.
// ---------------------------------------------------------------------------

interface Student {
  user_id: string
  full_name: string
  phone: string
  why_nlp: string
  gender: string | null
  motivation_tip: string | null
  vision_one_year: string | null
  last_completed_video_id: string
  last_completed_at: string
  last_lesson_index: number
  next_lesson_index: number
  days_inactive: number
  recommended_send_hour: number
  activity_samples: number
}

async function findInactiveStudents(
  supabase: any,
  inactivityDays: number,
): Promise<Student[]> {
  // 1. All completed MVP video rows
  const { data: progress } = await supabase
    .from('course_progress')
    .select('user_id, video_id, completed_at, lesson_number')
    .eq('course_type', COURSE_TYPE)
    .eq('completed', true)
    .in('video_id', MVP_VIDEO_IDS)
    .order('completed_at', { ascending: false })

  if (!progress || progress.length === 0) return []

  // 2. Group per user — keep highest lesson_index completed
  const perUser = new Map<string, { lesson_index: number; video_id: string; completed_at: string }>()
  for (const row of progress) {
    const idx = VID_TO_INDEX[row.video_id]
    if (idx === undefined) continue
    const cur = perUser.get(row.user_id)
    if (!cur || idx > cur.lesson_index) {
      perUser.set(row.user_id, {
        lesson_index: idx,
        video_id: row.video_id,
        completed_at: row.completed_at,
      })
    }
  }

  // 3. Filter — inactive AND next lesson still in MVP scope
  const now = Date.now()
  const cutoff = now - inactivityDays * 86400 * 1000
  const candidates: Array<{ uid: string; lesson_index: number; video_id: string; completed_at: string; completed_at_ms: number }> = []
  for (const [uid, p] of perUser.entries()) {
    if (p.video_id === LAST_MVP_VIDEO_ID) continue  // already finished MVP
    const completedMs = new Date(p.completed_at).getTime()
    if (isNaN(completedMs) || completedMs >= cutoff) continue
    candidates.push({ uid, ...p, completed_at_ms: completedMs })
  }
  if (candidates.length === 0) return []

  const userIds = candidates.map(c => c.uid)

  // 3b. Full activity history per candidate (for preferred-hour heuristic)
  const { data: activity } = await supabase
    .from('course_progress')
    .select('user_id, completed_at')
    .eq('course_type', COURSE_TYPE)
    .eq('completed', true)
    .in('user_id', userIds)
  const historyByUser = new Map<string, string[]>()
  for (const row of activity || []) {
    if (!row.completed_at) continue
    const arr = historyByUser.get(row.user_id) || []
    arr.push(row.completed_at)
    historyByUser.set(row.user_id, arr)
  }

  // 4a. Profiles — full_name, phone
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', userIds)
  const profileById = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]))

  // 4b. Questionnaires — most recent per user
  const { data: questionnaires } = await supabase
    .from('portal_questionnaires')
    .select('user_id, why_nlp, gender, motivation_tip, vision_one_year, phone, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
  const questByUser = new Map<string, any>()
  for (const q of questionnaires || []) {
    if (!questByUser.has(q.user_id)) questByUser.set(q.user_id, q)
  }

  // 5. Build records, skip rows without name/phone/why_nlp
  const students: Student[] = []
  for (const c of candidates) {
    const prof = profileById.get(c.uid)
    const quest = questByUser.get(c.uid)
    if (!prof || !quest) continue
    if (!(quest.why_nlp || '').trim()) continue
    const phone = normalizePhone(prof.phone || quest.phone)
    if (!phone) continue
    const days = Math.floor((now - c.completed_at_ms) / 86400000)
    const [sendHour, samples] = computePreferredHour(historyByUser.get(c.uid) || [])
    students.push({
      user_id: c.uid,
      full_name: (prof.full_name || '').trim() || 'תלמיד',
      phone,
      why_nlp: quest.why_nlp,
      gender: quest.gender,
      motivation_tip: quest.motivation_tip,
      vision_one_year: quest.vision_one_year,
      last_completed_video_id: c.video_id,
      last_completed_at: c.completed_at,
      last_lesson_index: c.lesson_index,
      next_lesson_index: c.lesson_index + 1,
      days_inactive: days,
      recommended_send_hour: sendHour,
      activity_samples: samples,
    })
  }

  students.sort((a, b) => b.days_inactive - a.days_inactive)
  return students
}

// ---------------------------------------------------------------------------
// Anthropic prompt — verbatim copy of personalize.SYSTEM_PROMPT.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `אתה רם ענבי, מנחה NLP בפורטל החינמי בבית המטפלים. אתה כותב הודעת WhatsApp קצרה לתלמיד שהתחיל את הקורס שלך, סיים שיעור או שניים, ועצר. אתה לא מוכר כלום, הקורס חינמי. אתה רק רוצה שהוא יחזור כי אתה יודע שזה ישנה לו.

טון:
- אישי, חם, ישיר. כמו ידיד שכבר מכיר אותו.
- לא מכירתי, לא רגשני יתר על המידה, לא קלישאתי.
- בלי ביטויים שחוקים: "אל תוותר על עצמך", "החיים שלך מחכים לך", "השינוי מתחיל בך".
- בלי "החמצת", "אכזבת", "פספסת". לא לגרום לאשמה.

מבנה ההודעה (4 חלקים, 75 עד 115 מילים סה"כ):
1. פתיחה: שם פרטי, ואז משפט שמשקף ב-1 או 2 קטעים שאתה זוכר אותו ספציפית. הזכר את ה-vision_1y שלו במילים קרובות לשלו (לא ציטוט מילולי שייראה מלאכותי). 1 או 2 משפטים.
2. גשר: ספר לו שהשיעור הבא בתור (שם השיעור) פותח בדיוק את החלק שהוא צריך עכשיו כדי להתקדם לשם. תהיה ספציפי על תוכן השיעור: מה הוא ילמד שמשרת ספציפית את החזון שלו. 2 או 3 משפטים.
3. CTA: הזמנה רכה ומעשית. שורה ריקה ואז הקישור על שורה משלו.
4. שורת opt-out: שורה ריקה אחת, ואז משפט קצר ומכבד שמציע אופציה לעצור. למשל: "אם זה לא הזמן הנכון, תוכל להגיב 'הסר' ואני אעצור." או וריאציה רכה דומה. חובה.

כללים מחמירים:
- עברית בלבד. לשון זכר/נקבה לפי שדה gender ('גבר'=זכר, 'אישה'=נקבה).
- אל תכתוב "כלי NLP" סתם, תכתוב מה ספציפית.
- אל תזכיר שיעורים אחרים שהוא לא ראה.
- אל תשתמש בסמיילי או אימוג'י.
- אל תקרא לעצמך "אני רם", דבר ישירות.
- אסור להשתמש בקו מפריד באורך כלשהו ('—' או '–' או '-' או '−') כדי להפריד רעיונות או משפטים. במקומו: או שבור למשפט נפרד עם נקודה, או השתמש בפסיק או נקודתיים. קו מקף מותר רק בתוך מילה מורכבת ('תת-מודע', 'אי-וודאות', 'בני-זוג', 'NLP-Practitioner'). עבור על ההודעה לפני שאתה מחזיר אותה ותוודא שאין אפילו קו אחד שמפריד בין רעיונות. אם מצאת, החלף לנקודה או פסיק.

החזר JSON בלבד במבנה: {"message": "..."}`

// ---------------------------------------------------------------------------
// Generate one personalized message via Sonnet 4.6 with prompt caching.
// ---------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/, '')
    t = t.replace(/\s*```$/, '')
  }
  return t
}

async function generateMessage(
  client: Anthropic,
  student: Student,
  lesson: Lesson,
  category: string,
): Promise<string> {
  const userPayload = {
    student: {
      first_name: (student.full_name.split(' ')[0]) || 'תלמיד',
      gender: student.gender,
      why_nlp_dropdown: student.why_nlp,
      vision_one_year: student.vision_one_year,
      motivation_tip: student.motivation_tip,
      days_inactive: student.days_inactive,
      last_lesson_completed: student.last_lesson_index,
    },
    next_lesson: {
      title: lesson.title,
      insight: lesson.insight_oneline,
      what_student_learns: lesson.what_student_learns,
      framing_for_this_student: lesson.why_for[category as 'career' | 'relationships' | 'confidence'],
    },
    lesson_link: lesson.lesson_url,
  }

  const resp: any = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 600,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: 'מפת השיעורים המלאה ל-MVP:\n' + JSON.stringify(LESSONS_MAP, null, 2),
        cache_control: { type: 'ephemeral' },
      },
    ] as any,
    messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
  })

  const raw = stripCodeFences((resp.content?.[0]?.text || '') as string)
  let payload: { message?: string } = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = { message: raw }
  }
  return (payload.message || '').trim()
}

// ---------------------------------------------------------------------------
// Dedup check — port of sync_to_supabase._existing_pending_or_recent.
// Skip if (user_id, next_lesson_video_id) already has a non-rejected row in
// the last 14 days.
// ---------------------------------------------------------------------------

async function existingDraft(
  supabase: any,
  userId: string,
  videoId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400 * 1000).toISOString()
  const { data } = await supabase
    .from('retention_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('next_lesson_video_id', videoId)
    .neq('status', 'rejected')
    .gte('generated_at', cutoff)
    .limit(1)
  return !!(data && data.length > 0)
}

// ---------------------------------------------------------------------------
// Process one student — generate + insert. Returns 'inserted' | 'skipped' | 'failed'.
// ---------------------------------------------------------------------------

async function processStudent(
  supabase: any,
  anthropic: Anthropic,
  s: Student,
): Promise<{ status: 'inserted' | 'skipped' | 'failed'; error?: string }> {
  try {
    const nextKey = `lesson_${s.next_lesson_index}`
    const lesson = LESSONS_MAP[nextKey]
    if (!lesson) return { status: 'skipped', error: 'next_lesson outside MVP' }

    if (await existingDraft(supabase, s.user_id, lesson.youtube_id)) {
      return { status: 'skipped' }
    }

    const category = classifyWhy(s.why_nlp, s.vision_one_year)
    const message = await generateMessage(anthropic, s, lesson, category)
    if (!message) return { status: 'failed', error: 'empty message' }

    // Re-check dedup right before insert (race-safe)
    if (await existingDraft(supabase, s.user_id, lesson.youtube_id)) {
      return { status: 'skipped' }
    }

    const row = {
      user_id: s.user_id,
      phone: s.phone,
      full_name: s.full_name,
      why_category: category,
      next_lesson_index: s.next_lesson_index,
      next_lesson_video_id: lesson.youtube_id,
      next_lesson_title: lesson.title,
      message_text: message,
      recommended_send_hour: s.recommended_send_hour,
      activity_samples: s.activity_samples,
      status: 'draft',
      why_nlp: s.why_nlp,
      vision_one_year: s.vision_one_year,
      days_inactive_at_send: s.days_inactive,
    }
    const { error: insertError } = await supabase.from('retention_messages').insert(row)
    if (insertError) return { status: 'failed', error: insertError.message }

    return { status: 'inserted' }
  } catch (err) {
    return { status: 'failed', error: String(err?.message || err) }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ---- Auth: admin only ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Parse body ----
    let body: { limit?: number } = {}
    try {
      body = await req.json()
    } catch { /* empty body is fine */ }
    const requestedLimit = Math.max(1, Math.min(MAX_LIMIT, body.limit || DEFAULT_LIMIT))

    // ---- Find inactive students ----
    const allInactive = await findInactiveStudents(supabase, INACTIVITY_DAYS)
    const scanned = allInactive.length
    const toProcess = allInactive.slice(0, requestedLimit)
    const remaining = Math.max(0, scanned - toProcess.length)

    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ scanned: 0, processed: 0, inserted: 0, skipped: 0, failed: 0, remaining: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---- Generate + insert in parallel batches ----
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    let inserted = 0, skipped = 0, failed = 0
    const errors: string[] = []

    for (let i = 0; i < toProcess.length; i += PARALLEL_BATCH) {
      const batch = toProcess.slice(i, i + PARALLEL_BATCH)
      const results = await Promise.all(batch.map(s => processStudent(supabase, anthropic, s)))
      for (const r of results) {
        if (r.status === 'inserted') inserted++
        else if (r.status === 'skipped') skipped++
        else { failed++; if (r.error) errors.push(r.error) }
      }
    }

    return new Response(
      JSON.stringify({
        scanned,
        processed: toProcess.length,
        inserted,
        skipped,
        failed,
        remaining,
        errors: errors.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('retention-run error:', err)
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
