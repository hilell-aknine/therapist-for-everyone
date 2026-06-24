import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// admin-agent — in-dashboard AI operations agent for "בית המטפלים".
//
// A Hebrew natural-language agent that lets the admin do from one chat box
// everything the dashboard does by hand: pull lists (who learned the most,
// who logged in last, filtered user segments, paid customers), and trigger
// the existing manual actions (open access, WhatsApp, email, CRM note, sales
// stage, build an automation).
//
// Two endpoints (?action=):
//   chat    (default) — runs Claude Sonnet with tool-use. READ tools execute
//                       immediately and return rich "cards" for the UI. A WRITE
//                       tool NEVER mutates here: it is validated into a
//                       `pending_action` returned to the client for explicit
//                       admin confirmation.
//   execute           — the client posts back the exact pending_action after the
//                       admin clicks "אשר ובצע". Only here does a write happen,
//                       and it is audited to crm_activity_log. No LLM call → 0 cost.
//
// Admin-gated (profiles.role==='admin'), service-role for cross-user reads.
// SECURITY DEFINER RPCs (admin_segments_overview, admin_get_all_leads,
// admin_automations_upsert) are called with a USER-scoped client so auth.uid()
// resolves to the admin — the service role has no auth.uid() and would be
// rejected by those functions' internal admin check.
// Reuses the project's existing Sonnet + cost + CORS + Green-API patterns
// (ai-chat / mentor-admin / admin-paid).
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

const SONNET_MODEL = 'claude-sonnet-4-6'
const SONNET_IN_USD = Number(Deno.env.get('SONNET_IN_USD')) || 3
const SONNET_OUT_USD = Number(Deno.env.get('SONNET_OUT_USD')) || 15
const USD_ILS = Number(Deno.env.get('USD_ILS')) || 3.8
// Independent monthly ceiling for THIS owner tool (separate from the customer-facing
// mentor cap). Generous — it only guards against a runaway loop, not normal use.
const AGENT_MONTHLY_CAP_ILS = Number(Deno.env.get('AGENT_MONTHLY_CAP_ILS')) || 150
const AGENT_SOURCE = 'admin-agent'

const GREEN_API_URL = Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('GREEN_API_TOKEN') || ''
const BOT_URL = Deno.env.get('BOT_URL') || 'https://crm-bot-hillel.fly.dev'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const LIFETIME_END_DATE = '2099-01-01T00:00:00.000Z'
const MAX_TOOL_ITERS = 6

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

function ils(pt: number, ct: number): number {
  return Math.round(((pt * SONNET_IN_USD + ct * SONNET_OUT_USD) / 1_000_000) * USD_ILS * 100) / 100
}

function monthStartIsrael(): string {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${ym}-01`
}

function todayIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Israeli phone → international digits (e.g. 054-123-4567 → 972541234567).
function intlPhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('972')) return d
  if (d.startsWith('0')) return '972' + d.slice(1)
  if (d.length === 9) return '972' + d   // missing leading 0
  return d
}

function isValidPhone(raw: string): boolean {
  const d = intlPhone(raw)
  return d.startsWith('972') && d.length >= 11 && d.length <= 13
}

// ===== Cost guard (this tool only) =====
// deno-lint-ignore no-explicit-any
async function agentMonthlyCostShekel(admin: any): Promise<number> {
  const { data } = await admin
    .from('ai_chat_usage')
    .select('prompt_tokens, completion_tokens')
    .eq('source', AGENT_SOURCE)
    .gte('date', monthStartIsrael())
  let pt = 0, ct = 0
  for (const r of (data || []) as Array<{ prompt_tokens?: number; completion_tokens?: number }>) {
    pt += Number(r.prompt_tokens) || 0; ct += Number(r.completion_tokens) || 0
  }
  return ils(pt, ct)
}

// deno-lint-ignore no-explicit-any
async function logAgentUsage(admin: any, userId: string, pt: number, ct: number) {
  const date = todayIsrael()
  const { data: prev } = await admin
    .from('ai_chat_usage')
    .select('message_count, prompt_tokens, completion_tokens')
    .eq('user_id', userId).eq('date', date).eq('source', AGENT_SOURCE)
    .maybeSingle()
  await admin.from('ai_chat_usage').upsert({
    user_id: userId,
    date,
    source: AGENT_SOURCE,
    message_count: (Number(prev?.message_count) || 0) + 1,
    prompt_tokens: (Number(prev?.prompt_tokens) || 0) + pt,
    completion_tokens: (Number(prev?.completion_tokens) || 0) + ct,
  }, { onConflict: 'user_id,date,source' })
}

async function greenSendWhatsApp(phone: string, message: string): Promise<{ ok: boolean; status: number }> {
  if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) return { ok: false, status: 0 }
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // linkPreview:false — a Green-API link preview prefetch once consumed one-time
      // magic links (see hindsight 2026-06-11). Safe default for every send.
      body: JSON.stringify({ chatId: `${intlPhone(phone)}@c.us`, message, linkPreview: false }),
    })
    return { ok: res.ok, status: res.status }
  } catch { return { ok: false, status: 0 } }
}

// ============================================================================
// SHARED DATA HELPERS (service role)
// ============================================================================

// Map user_id → { name, email, phone } for a set of ids.
// deno-lint-ignore no-explicit-any
async function profileMap(admin: any, ids: string[]): Promise<Record<string, { name: string; email: string; phone: string }>> {
  const out: Record<string, { name: string; email: string; phone: string }> = {}
  if (!ids.length) return out
  const { data } = await admin.from('profiles').select('id, full_name, email, phone').in('id', [...new Set(ids)])
  for (const p of (data || [])) out[p.id] = { name: p.full_name || '', email: p.email || '', phone: p.phone || '' }
  return out
}

// Completed-lesson count + last activity per user from course_progress.
// deno-lint-ignore no-explicit-any
async function learningStats(admin: any, courseType?: string) {
  let q = admin.from('course_progress').select('user_id, completed, watched_seconds, completed_at, course_type')
  if (courseType && courseType !== 'all') q = q.eq('course_type', courseType)
  const { data } = await q
  const stats: Record<string, { completed: number; seconds: number; last: string | null }> = {}
  for (const r of (data || [])) {
    const s = stats[r.user_id] || (stats[r.user_id] = { completed: 0, seconds: 0, last: null })
    if (r.completed) s.completed += 1
    s.seconds += Number(r.watched_seconds) || 0
    if (r.completed_at && (!s.last || r.completed_at > s.last)) s.last = r.completed_at
  }
  return stats
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
  } catch { return String(d) }
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
  } catch { return String(d) }
}

// ============================================================================
// TOOL DEFINITIONS (Anthropic tool-use)
// ============================================================================
const TOOLS = [
  {
    name: 'query_learners',
    description: 'מי למד הכי הרבה — דירוג לומדים מובילים לפי שיעורים שהושלמו / זמן צפייה / נקודות משחק (XP).',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['lessons', 'watch_time', 'xp'], description: 'lessons=שיעורים שהושלמו, watch_time=זמן צפייה, xp=נקודות במשחק' },
        course_type: { type: 'string', enum: ['all', 'nlp-practitioner', 'master'], description: 'סינון לפי קורס (רק ל-lessons/watch_time)' },
        limit: { type: 'integer', description: 'כמה להחזיר (ברירת מחדל 10)' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'query_recent_activity',
    description: 'מי היה פעיל / התחבר אחרון. basis=login (התחברות אחרונה), learning (שיעור אחרון), game (פעילות אחרונה במשחק).',
    input_schema: {
      type: 'object',
      properties: {
        basis: { type: 'string', enum: ['login', 'learning', 'game'] },
        limit: { type: 'integer', description: 'ברירת מחדל 15' },
      },
      required: ['basis'],
    },
  },
  {
    name: 'query_users',
    description: 'סינון משתמשים/לידים לפי תפקיד, מקור, שלב מכירה, כמות שיעורים, האם משלם, עיר, האם יש טלפון.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: "admin/therapist/patient/student_lead/student/sales_rep/paid_customer" },
        source: { type: 'string', description: 'utm_source (למשל facebook/instagram)' },
        sales_stage: { type: 'string' },
        min_lessons: { type: 'integer' },
        max_lessons: { type: 'integer' },
        is_paying: { type: 'boolean' },
        city: { type: 'string' },
        has_phone: { type: 'boolean' },
        limit: { type: 'integer', description: 'ברירת מחדל 50' },
      },
    },
  },
  {
    name: 'get_user_detail',
    description: 'כל המידע על משתמש בודד לפי שם / טלפון / אימייל: פרופיל, שאלון, מנוי, התקדמות בקורס, משחק.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'שם / טלפון / אימייל' } },
      required: ['query'],
    },
  },
  {
    name: 'list_paid_customers',
    description: 'רשימת הלקוחות המשלמים הפעילים: שם, טלפון, מחיר, תוקף, הכנסה כוללת.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'segments_overview',
    description: 'תמונת מצב כללית: KPIs של הרשמות (היום/7/30 יום), פילוחים לפי מקור/מגדר/גיל/מטרה/עיר/שיעורים/שלב/תפקיד, לקוחות משלמים, נטישת שאלון.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'audience_count',
    description: 'כמה משתמשים תואמים לתנאי סינון (כמו בבונה האוטומציות). filter.all = רשימת תנאים {field,op,value}.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: { all: { type: 'array', items: { type: 'object' } } },
        },
      },
      required: ['filter'],
    },
  },
  {
    name: 'ai_cost',
    description: 'עלות ה-AI החודשית בשקלים (המורה החכם + סוכן הניהול).',
    input_schema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM (ברירת מחדל: החודש)' } } },
  },
  // ---- WRITE tools (return pending_action, never mutate in chat) ----
  {
    name: 'open_access',
    description: 'פתיחת גישת לקוח משלם (מאסטר). דורש אישור. months=null => לכל החיים.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        months: { type: ['integer', 'null'], description: 'מספר חודשים, או null ללכל החיים' },
        price: { type: 'number', description: 'ברירת מחדל 1900' },
        notes: { type: 'string' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'שליחת הודעת וואטסאפ ללקוח. דורש אישור.',
    input_schema: {
      type: 'object',
      properties: { phone: { type: 'string' }, message: { type: 'string' } },
      required: ['phone', 'message'],
    },
  },
  {
    name: 'send_email',
    description: 'שליחת מייל ללקוח (תבנית ממותגת). דורש אישור.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'אימייל ישיר או שם/טלפון לזיהוי המשתמש' },
        subject: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['query', 'subject', 'message'],
    },
  },
  {
    name: 'add_crm_note',
    description: 'הוספת הערת CRM. דורש אישור.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        entity_type: { type: 'string', description: 'ברירת מחדל general' },
        entity_id: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_sales_stage',
    description: 'עדכון שלב מכירה למשתמש. דורש אישור.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'שם/טלפון/אימייל' },
        stage: { type: 'string', enum: ['new', 'contacted', 'follow_up', 'presentation', 'negotiation', 'won', 'lost'] },
        note: { type: 'string' },
      },
      required: ['query', 'stage'],
    },
  },
  {
    name: 'create_automation',
    description: 'יצירת כלל אוטומציה חדש (תזמון + סינון קהל + הודעה). נשמר תמיד כבוי + במצב תרגול לבדיקה. דורש אישור.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        cron: { type: 'string', description: "פורמט cron 5 שדות, למשל '0 14 * * *'" },
        audience_filter: { type: 'object', properties: { all: { type: 'array', items: { type: 'object' } } } },
        message_template: { type: 'string', description: 'תומך ב-{{first_name}}, {{full_name}}, {{lessons_completed}}, {{role}}' },
        daily_cap: { type: 'integer', description: 'ברירת מחדל 100' },
        cooldown_days: { type: 'integer', description: 'ברירת מחדל 9999 (לא לשלוח שוב)' },
      },
      required: ['name', 'cron', 'audience_filter', 'message_template'],
    },
  },
]

const WRITE_TOOLS = new Set(['open_access', 'send_whatsapp', 'send_email', 'add_crm_note', 'update_sales_stage', 'create_automation'])

const SYSTEM_PROMPT = `אתה "סוכן הניהול" של פורטל "בית המטפלים" — עוזר תפעולי חכם לבעלים (הלל) בתוך דשבורד הניהול. אתה עונה בעברית, קצר וענייני, כמו אנליסט תפעול בכיר.

## מה אתה עושה
- שליפות וניתוחים: מי למד הכי הרבה, מי התחבר/היה פעיל אחרון, סינון משתמשים ולידים, פרטי לקוח, לקוחות משלמים, תמונת-מצב/פילוחים, ספירת קהל לפי תנאים, עלות AI.
- פעולות: פתיחת גישה ללקוח משלם, שליחת וואטסאפ/מייל, הוספת הערת CRM, עדכון שלב מכירה, יצירת אוטומציה.

## כללי עבודה
1. תמיד השתמש בכלים כדי לקבל נתונים אמיתיים — לעולם אל תמציא מספרים, שמות או נתונים.
2. כלי שליפה (READ) רצים מיד. אחרי שליפה — תן סיכום קצר ומועיל במילים; הטבלה עצמה תוצג למשתמש על ידי הממשק, אז אל תשכפל את כל השורות בטקסט.
3. פעולות כתיבה (open_access / send_whatsapp / send_email / add_crm_note / update_sales_stage / create_automation) **לעולם לא מבוצעות על ידך** — הקריאה לכלי רק מכינה את הפעולה, והמערכת תציג למנהל כרטיס אישור. אחרי שקראת לכלי כתיבה, אמור במשפט קצר מה עומד לקרות ושזה ממתין לאישורו. אל תקרא ליותר מכלי כתיבה אחד באותו תור.
4. כשמבקשים לבנות אוטומציה — תרגם את הבקשה לתנאי סינון (audience_filter.all) ולתזמון cron, ונסח הודעה. הכלל יישמר כבוי ובמצב תרגול כדי שהלל יבדוק לפני הפעלה.
5. אם חסר מידע קריטי לפעולה (למשל טלפון) — בקש אותו לפני שאתה קורא לכלי הכתיבה.
6. היה תמציתי. בלי הקדמות ארוכות.`

// ============================================================================
// READ HANDLERS — return { model: <compact text for the LLM>, card: <rich UI> }
// ============================================================================
// deno-lint-ignore no-explicit-any
async function handleRead(name: string, input: any, ctx: { admin: any; userClient: any; token: string }) {
  const { admin, userClient, token } = ctx
  switch (name) {
    case 'query_learners': {
      const limit = Math.min(50, Number(input.limit) || 10)
      if (input.metric === 'xp') {
        const { data } = await admin.from('nlp_game_leaderboard')
          .select('display_name, total_xp, level, lessons_completed, current_streak, last_active')
          .order('total_xp', { ascending: false }).limit(limit)
        const rows = (data || []).map((r: any, i: number) => ({
          '#': i + 1, שם: r.display_name || '—', XP: r.total_xp || 0, רמה: r.level || 0,
          שיעורים: r.lessons_completed || 0, רצף: r.current_streak || 0, 'פעיל לאחרונה': fmtDateTime(r.last_active),
        }))
        return {
          model: `Top ${rows.length} by XP: ` + rows.map((r: any) => `${r.שם}=${r.XP}`).join(', '),
          card: { kind: 'table', title: `🏆 מובילים לפי נקודות (XP)`, columns: ['#', 'שם', 'XP', 'רמה', 'שיעורים', 'רצף', 'פעיל לאחרונה'], rows },
        }
      }
      const stats = await learningStats(admin, input.course_type)
      const entries = Object.entries(stats)
        .map(([uid, s]) => ({ uid, ...s }))
        .sort((a, b) => input.metric === 'watch_time' ? b.seconds - a.seconds : b.completed - a.completed)
        .slice(0, limit)
      const names = await profileMap(admin, entries.map(e => e.uid))
      const rows = entries.map((e, i) => ({
        '#': i + 1,
        שם: names[e.uid]?.name || '—',
        טלפון: names[e.uid]?.phone || '—',
        'שיעורים שהושלמו': e.completed,
        'זמן צפייה': `${Math.round(e.seconds / 60)} דק׳`,
        'פעיל לאחרונה': fmtDate(e.last),
      }))
      const label = input.metric === 'watch_time' ? 'זמן צפייה' : 'שיעורים שהושלמו'
      return {
        model: `Top ${rows.length} by ${label}: ` + rows.map((r: any) => `${r.שם}=${input.metric === 'watch_time' ? r['זמן צפייה'] : r['שיעורים שהושלמו']}`).join(', '),
        card: { kind: 'table', title: `📚 מובילים לפי ${label}${input.course_type && input.course_type !== 'all' ? ` (${input.course_type})` : ''}`, columns: ['#', 'שם', 'טלפון', 'שיעורים שהושלמו', 'זמן צפייה', 'פעיל לאחרונה'], rows },
      }
    }

    case 'query_recent_activity': {
      const limit = Math.min(50, Number(input.limit) || 15)
      if (input.basis === 'login') {
        // auth.users isn't exposed via PostgREST — use the admin API and sort in memory.
        const collected: any[] = []
        for (let page = 1; page <= 3; page++) {
          const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
          const users = data?.users || []
          collected.push(...users)
          if (users.length < 1000) break
        }
        const sorted = collected
          .filter(u => u.last_sign_in_at)
          .sort((a, b) => (a.last_sign_in_at < b.last_sign_in_at ? 1 : -1))
          .slice(0, limit)
        const names = await profileMap(admin, sorted.map(u => u.id))
        const rows = sorted.map((u, i) => ({
          '#': i + 1, שם: names[u.id]?.name || '—', אימייל: u.email || '—', 'התחברות אחרונה': fmtDateTime(u.last_sign_in_at),
        }))
        return {
          model: `Last logins: ` + rows.map((r: any) => `${r.שם} (${r['התחברות אחרונה']})`).join(', '),
          card: { kind: 'table', title: '🔓 מי התחבר אחרון', columns: ['#', 'שם', 'אימייל', 'התחברות אחרונה'], rows },
        }
      }
      if (input.basis === 'game') {
        const { data } = await admin.from('nlp_game_leaderboard')
          .select('display_name, last_active, total_xp, current_streak')
          .order('last_active', { ascending: false }).limit(limit)
        const rows = (data || []).map((r: any, i: number) => ({
          '#': i + 1, שם: r.display_name || '—', 'פעיל לאחרונה': fmtDateTime(r.last_active), XP: r.total_xp || 0, רצף: r.current_streak || 0,
        }))
        return {
          model: `Recent game activity: ` + rows.map((r: any) => `${r.שם} (${r['פעיל לאחרונה']})`).join(', '),
          card: { kind: 'table', title: '🎮 פעילות אחרונה במשחק', columns: ['#', 'שם', 'פעיל לאחרונה', 'XP', 'רצף'], rows },
        }
      }
      // learning
      const { data } = await admin.from('course_progress')
        .select('user_id, completed_at, course_type, lesson_number')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false }).limit(limit * 3)
      const seen = new Set<string>()
      const uniq: any[] = []
      for (const r of (data || [])) { if (!seen.has(r.user_id)) { seen.add(r.user_id); uniq.push(r) } if (uniq.length >= limit) break }
      const names = await profileMap(admin, uniq.map(u => u.user_id))
      const rows = uniq.map((r, i) => ({
        '#': i + 1, שם: names[r.user_id]?.name || '—', קורס: r.course_type || '—', 'שיעור אחרון': r.lesson_number ?? '—', מתי: fmtDateTime(r.completed_at),
      }))
      return {
        model: `Recent learning: ` + rows.map((r: any) => `${r.שם} (${r.מתי})`).join(', '),
        card: { kind: 'table', title: '📖 מי למד לאחרונה', columns: ['#', 'שם', 'קורס', 'שיעור אחרון', 'מתי'], rows },
      }
    }

    case 'query_users': {
      const limit = Math.min(200, Number(input.limit) || 50)
      const { data: leads, error } = await userClient.rpc('admin_get_all_leads')
      if (error) return { model: `Error: ${error.message}`, card: null }
      const stats = await learningStats(admin)
      let list = (leads || []).map((l: any) => ({
        ...l,
        lessons: stats[l.profile_id]?.completed || 0,
      }))
      if (input.role) list = list.filter((l: any) => l.user_role === input.role)
      if (input.source) list = list.filter((l: any) => (l.utm_source || '').toLowerCase().includes(String(input.source).toLowerCase()))
      if (input.sales_stage) list = list.filter((l: any) => l.q_status === input.sales_stage)
      if (input.city) list = list.filter((l: any) => (l.city || '').includes(input.city))
      if (typeof input.min_lessons === 'number') list = list.filter((l: any) => l.lessons >= input.min_lessons)
      if (typeof input.max_lessons === 'number') list = list.filter((l: any) => l.lessons <= input.max_lessons)
      if (input.has_phone === true) list = list.filter((l: any) => (l.phone || l.user_phone))
      if (input.has_phone === false) list = list.filter((l: any) => !(l.phone || l.user_phone))
      if (input.is_paying === true) list = list.filter((l: any) => l.user_role === 'paid_customer')
      if (input.is_paying === false) list = list.filter((l: any) => l.user_role !== 'paid_customer')
      const total = list.length
      const shown = list.slice(0, limit)
      const rows = shown.map((l: any) => ({
        שם: l.full_name || '—',
        טלפון: l.phone || l.user_phone || '—',
        תפקיד: l.user_role || 'ליד',
        מקור: l.utm_source || '—',
        שיעורים: l.lessons,
        עיר: l.city || '—',
        נרשם: fmtDate(l.profile_created_at),
      }))
      return {
        model: `Matched ${total} users (showing ${rows.length}).`,
        card: { kind: 'table', title: `👥 ${total} משתמשים תואמים${total > rows.length ? ` (מוצגים ${rows.length})` : ''}`, columns: ['שם', 'טלפון', 'תפקיד', 'מקור', 'שיעורים', 'עיר', 'נרשם'], rows },
      }
    }

    case 'get_user_detail': {
      const q = String(input.query || '').trim()
      const cleaned = q.replace(/[-\s]/g, '')
      let prof: any = null
      if (/@/.test(q)) {
        const { data } = await admin.from('profiles').select('*').ilike('email', `%${q}%`).limit(1)
        prof = data?.[0]
      } else if (/\d{6,}/.test(cleaned)) {
        const { data } = await admin.from('profiles').select('*').ilike('phone', `%${cleaned}%`).limit(1)
        prof = data?.[0]
      } else {
        const { data } = await admin.from('profiles').select('*').ilike('full_name', `%${q}%`).limit(1)
        prof = data?.[0]
      }
      if (!prof) return { model: `No user found for "${q}".`, card: { kind: 'detail', title: 'לא נמצא משתמש', fields: [{ label: 'חיפוש', value: q }] } }

      const [{ data: pq }, { data: sub }, { data: lb }] = await Promise.all([
        admin.from('portal_questionnaires').select('*').eq('user_id', prof.id).order('created_at', { ascending: false }).limit(1),
        admin.from('subscriptions').select('*').eq('user_id', prof.id).order('created_at', { ascending: false }).limit(1),
        admin.from('nlp_game_leaderboard').select('total_xp, level, current_streak, last_active').eq('user_id', prof.id).maybeSingle(),
      ])
      const stats = await learningStats(admin)
      const ls = stats[prof.id] || { completed: 0, seconds: 0, last: null }
      const s = sub?.[0]
      const qq = pq?.[0]
      const fields = [
        { label: 'שם', value: prof.full_name || '—' },
        { label: 'טלפון', value: prof.phone || '—' },
        { label: 'אימייל', value: prof.email || '—' },
        { label: 'תפקיד', value: prof.role || '—' },
        { label: 'נרשם', value: fmtDate(prof.created_at) },
        { label: 'שיעורים שהושלמו', value: String(ls.completed) },
        { label: 'זמן צפייה', value: `${Math.round(ls.seconds / 60)} דק׳` },
        { label: 'פעיל בלמידה', value: fmtDate(ls.last) },
        { label: 'מנוי', value: s ? `${s.status} · ${s.price}₪ · עד ${new Date(s.end_date).getFullYear() >= 2099 ? 'לכל החיים' : fmtDate(s.end_date)}` : 'אין' },
        { label: 'משחק', value: lb ? `XP ${lb.total_xp} · רמה ${lb.level} · רצף ${lb.current_streak}` : 'לא שיחק' },
        { label: 'מקור', value: qq?.utm_source || prof.utm_source || '—' },
        { label: 'שלב מכירה', value: qq?.status || prof.sales_stage || '—' },
        { label: 'חזון (שאלון)', value: qq?.vision_one_year || '—' },
      ]
      return {
        model: `User ${prof.full_name}: role=${prof.role}, lessons=${ls.completed}, sub=${s ? s.status : 'none'}, phone=${prof.phone || 'none'}.`,
        card: { kind: 'detail', title: `👤 ${prof.full_name || 'משתמש'}`, fields },
      }
    }

    case 'list_paid_customers': {
      const { data } = await admin.from('subscriptions')
        .select('*, profiles:user_id(full_name, phone, email)')
        .eq('status', 'active').order('created_at', { ascending: false })
      const active = data || []
      const revenue = active.reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0)
      const rows = active.map((s: any) => {
        const p = s.profiles || {}
        const lifetime = new Date(s.end_date).getFullYear() >= 2099
        return {
          שם: p.full_name || '—', טלפון: p.phone || '—', מחיר: `${parseFloat(s.price).toLocaleString()}₪`,
          תוקף: lifetime ? 'לכל החיים' : fmtDate(s.end_date), התחיל: fmtDate(s.start_date),
        }
      })
      return {
        model: `${active.length} active paid customers, total revenue ${revenue.toLocaleString()}₪.`,
        card: { kind: 'table', title: `👑 ${active.length} לקוחות משלמים · הכנסה ${revenue.toLocaleString()}₪`, columns: ['שם', 'טלפון', 'מחיר', 'תוקף', 'התחיל'], rows },
      }
    }

    case 'segments_overview': {
      const { data, error } = await userClient.rpc('admin_segments_overview')
      if (error) return { model: `Error: ${error.message}`, card: null }
      const k = data?.kpis || {}
      const items = [
        { label: 'נרשמו היום', value: k.signups_today ?? 0 },
        { label: '7 ימים', value: k.signups_7d ?? 0 },
        { label: '30 ימים', value: k.signups_30d ?? 0 },
        { label: 'מפייסבוק', value: k.from_facebook ?? 0, sub: `אינסטגרם ${k.from_instagram ?? 0}` },
        { label: 'למדו 5+', value: k.lessons_gt5 ?? 0, sub: `10+ : ${k.lessons_gte10 ?? 0}` },
        { label: 'לקוחות משלמים', value: data?.active_paying ?? 0, sub: `בפייפליין ${data?.pipeline_open ?? 0}` },
        { label: 'נרשמו ולא מילאו שאלון', value: k.abandoned_recent ?? 0, sub: `סה"כ ${k.abandoned_total ?? 0}` },
      ]
      return {
        model: `KPIs: today=${k.signups_today}, 7d=${k.signups_7d}, 30d=${k.signups_30d}, paying=${data?.active_paying}, abandoned(week)=${k.abandoned_recent}.`,
        card: { kind: 'kpis', title: '📊 תמונת מצב', items },
      }
    }

    case 'audience_count': {
      try {
        const res = await fetch(BOT_URL + '/api/automations/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ rule: { name: '__agent_preview__', audience_filter: input.filter, action_type: 'whatsapp', action_config: { message_template: ' ' } } }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return { model: `Preview error: ${data.error || res.status}`, card: null }
        const sample = (data.sample || []).slice(0, 8).map((u: any) => ({ שם: u.full_name || '—', טלפון: u.phone_masked || '—', שיעורים: u.lessons_completed ?? 0 }))
        return {
          model: `${data.total ?? 0} users match the filter.`,
          card: { kind: 'table', title: `🎯 ${data.total ?? 0} משתמשים תואמים`, columns: ['שם', 'טלפון', 'שיעורים'], rows: sample },
        }
      } catch (e) { return { model: `Preview failed: ${e}`, card: null } }
    }

    case 'ai_cost': {
      const ym = /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date())
      const start = `${ym}-01`
      const [y, m] = ym.split('-').map(Number)
      const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
      const { data } = await admin.from('ai_chat_usage').select('source, prompt_tokens, completion_tokens').gte('date', start).lt('date', end)
      let mentorPt = 0, mentorCt = 0, agentPt = 0, agentCt = 0
      for (const r of (data || [])) {
        const pt = Number(r.prompt_tokens) || 0, ct = Number(r.completion_tokens) || 0
        if (r.source === 'chat-sonnet' || r.source === 'mentor-sonnet') { mentorPt += pt; mentorCt += ct }
        else if (r.source === AGENT_SOURCE) { agentPt += pt; agentCt += ct }
      }
      const mentorIls = ils(mentorPt, mentorCt), agentIls = ils(agentPt, agentCt)
      return {
        model: `AI cost ${ym}: mentor=${mentorIls}₪, agent=${agentIls}₪.`,
        card: { kind: 'kpis', title: `💰 עלות AI · ${ym}`, items: [
          { label: 'מורה חכם', value: `${mentorIls}₪` },
          { label: 'סוכן ניהול', value: `${agentIls}₪` },
          { label: 'סה"כ', value: `${Math.round((mentorIls + agentIls) * 100) / 100}₪` },
        ] },
      }
    }
  }
  return { model: `Unknown read tool ${name}`, card: null }
}

// ============================================================================
// WRITE PREP — validate input → pending_action (NO mutation)
// ============================================================================
// deno-lint-ignore no-explicit-any
async function prepareWrite(name: string, input: any, admin: any): Promise<{ pending?: any; error?: string }> {
  switch (name) {
    case 'open_access': {
      if (!isValidPhone(input.phone)) return { error: 'מספר טלפון לא תקין.' }
      const cleaned = String(input.phone).replace(/[-\s]/g, '')
      const { data } = await admin.from('profiles').select('id, full_name, role, phone').ilike('phone', `%${cleaned}%`).limit(1)
      const user = data?.[0]
      if (!user) return { error: 'משתמש לא נמצא — צריך שיירשם לאתר קודם.' }
      if (user.role === 'paid_customer') return { error: `${user.full_name} כבר לקוח משלם פעיל.` }
      const lifetime = input.months === null || input.months === undefined
      const months = lifetime ? null : (parseInt(input.months) || 12)
      const price = parseFloat(input.price) || 1900
      return { pending: {
        type: 'open_access', user_id: user.id, full_name: user.full_name, phone: user.phone,
        lifetime, months, price, notes: input.notes || null,
        summary: `פתיחת גישת מאסטר ל-${user.full_name} (${user.phone}) ${lifetime ? 'לכל החיים' : `ל-${months} חודשים`} במחיר ${price.toLocaleString()}₪`,
      } }
    }
    case 'send_whatsapp': {
      if (!isValidPhone(input.phone)) return { error: 'מספר טלפון לא תקין.' }
      if (!input.message?.trim()) return { error: 'חסרה הודעה.' }
      return { pending: { type: 'send_whatsapp', phone: intlPhone(input.phone), message: input.message,
        summary: `שליחת וואטסאפ ל-${intlPhone(input.phone)}:\n"${input.message}"` } }
    }
    case 'send_email': {
      const q = String(input.query || '').trim()
      let email = ''
      let nameHint = ''
      if (/@/.test(q)) { email = q }
      else {
        const cleaned = q.replace(/[-\s]/g, '')
        const col = /\d{6,}/.test(cleaned) ? 'phone' : 'full_name'
        const val = col === 'phone' ? cleaned : q
        const { data } = await admin.from('profiles').select('email, full_name').ilike(col, `%${val}%`).limit(1)
        email = data?.[0]?.email || ''
        nameHint = data?.[0]?.full_name || ''
      }
      if (!email) return { error: 'לא נמצאה כתובת מייל למשתמש הזה.' }
      if (!input.subject?.trim() || !input.message?.trim()) return { error: 'חסר נושא או תוכן.' }
      return { pending: { type: 'send_email', to: email, subject: input.subject, message: input.message,
        summary: `שליחת מייל ל-${nameHint ? nameHint + ' · ' : ''}${email}\nנושא: ${input.subject}` } }
    }
    case 'add_crm_note': {
      if (!input.content?.trim()) return { error: 'חסר תוכן להערה.' }
      return { pending: { type: 'add_crm_note', content: input.content, entity_type: input.entity_type || 'general', entity_id: input.entity_id || null,
        summary: `הוספת הערת CRM (${input.entity_type || 'general'}): "${input.content}"` } }
    }
    case 'update_sales_stage': {
      const q = String(input.query || '').trim()
      const cleaned = q.replace(/[-\s]/g, '')
      const col = /@/.test(q) ? 'email' : (/\d{6,}/.test(cleaned) ? 'phone' : 'full_name')
      const val = col === 'phone' ? cleaned : q
      const { data } = await admin.from('profiles').select('id, full_name').ilike(col, `%${val}%`).limit(1)
      const user = data?.[0]
      if (!user) return { error: 'משתמש לא נמצא.' }
      return { pending: { type: 'update_sales_stage', user_id: user.id, full_name: user.full_name, stage: input.stage, note: input.note || null,
        summary: `עדכון שלב מכירה של ${user.full_name} ל-"${input.stage}"${input.note ? ` (הערה: ${input.note})` : ''}` } }
    }
    case 'create_automation': {
      if (!input.name?.trim()) return { error: 'חסר שם לכלל.' }
      const CRON_RE = /^([\*0-9,\-\/]+)\s+([\*0-9,\-\/]+)\s+([\*0-9,\-\/]+)\s+([\*0-9,\-\/]+)\s+([\*0-9,\-\/]+)$/
      if (!CRON_RE.test(String(input.cron || '').trim())) return { error: 'תזמון cron לא תקין (5 שדות).' }
      if (!input.message_template?.trim()) return { error: 'חסרה הודעה.' }
      if (!input.audience_filter?.all?.length) return { error: 'חסרים תנאי סינון קהל.' }
      const rule = {
        name: input.name,
        description: input.description || '',
        is_enabled: false,   // always created OFF — Hillel flips it live himself
        dry_run: true,       // always test mode first
        trigger_type: 'schedule',
        trigger_config: { cron: String(input.cron).trim() },
        audience_filter: input.audience_filter,
        action_type: 'whatsapp',
        action_config: { message_template: input.message_template },
        daily_cap: Number(input.daily_cap) || 100,
        cooldown_days: Number.isFinite(Number(input.cooldown_days)) ? Number(input.cooldown_days) : 9999,
      }
      const conds = input.audience_filter.all.map((c: any) => `${c.field} ${c.op} ${c.value ?? ''}`).join(' · ')
      return { pending: { type: 'create_automation', rule,
        summary: `כלל אוטומציה חדש "${input.name}" · תזמון ${input.cron} · תנאים: ${conds} · נשמר כבוי + מצב תרגול לבדיקה.` } }
    }
  }
  return { error: `Unknown write tool ${name}` }
}

// ============================================================================
// EXECUTE — run a confirmed pending_action (the ONLY place writes happen)
// ============================================================================
// deno-lint-ignore no-explicit-any
async function executeAction(pa: any, ctx: { admin: any; userClient: any; token: string; actorName: string; actorPhone: string }): Promise<{ ok: boolean; message: string }> {
  const { admin, userClient, token, actorName, actorPhone } = ctx
  // deno-lint-ignore no-explicit-any
  const audit = async (action: string, entity_type: string, entity_id: string | null, details: any) => {
    try { await admin.from('crm_activity_log').insert({ actor_phone: actorPhone, actor_name: actorName, action, entity_type, entity_id, details }) } catch (_e) { /* best-effort */ }
  }

  switch (pa?.type) {
    case 'open_access': {
      // Re-validate freshly (avoid acting on a stale card).
      const { data: u } = await admin.from('profiles').select('id, full_name, role').eq('id', pa.user_id).maybeSingle()
      if (!u) return { ok: false, message: 'המשתמש לא נמצא יותר.' }
      if (u.role === 'paid_customer') return { ok: false, message: `${u.full_name} כבר לקוח משלם.` }
      let endIso = LIFETIME_END_DATE
      if (!pa.lifetime) { const d = new Date(); d.setMonth(d.getMonth() + (pa.months || 12)); endIso = d.toISOString() }
      const { error: sErr } = await admin.from('subscriptions').insert({
        user_id: pa.user_id, plan: 'master_course', price: pa.price || 1900,
        start_date: new Date().toISOString(), end_date: endIso,
        activated_by: 'admin_agent', notes: pa.notes || null, status: 'active',
      })
      if (sErr) return { ok: false, message: 'שגיאה ביצירת מנוי: ' + sErr.message }
      await admin.from('profiles').update({ role: 'paid_customer' }).eq('id', pa.user_id)
      await audit('agent_open_access', 'subscription', pa.user_id, { price: pa.price, lifetime: pa.lifetime, months: pa.months })
      return { ok: true, message: `✅ גישת מאסטר נפתחה ל-${pa.full_name} ${pa.lifetime ? 'לכל החיים' : `ל-${pa.months} חודשים`}.` }
    }
    case 'send_whatsapp': {
      const r = await greenSendWhatsApp(pa.phone, pa.message)
      await audit('agent_send_whatsapp', 'whatsapp', null, { phone: pa.phone, ok: r.ok })
      return r.ok ? { ok: true, message: `✅ הודעת וואטסאפ נשלחה ל-${pa.phone}.` } : { ok: false, message: 'שליחת הוואטסאפ נכשלה (בדוק שהבוט מחובר).' }
    }
    case 'send_email': {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ to: pa.to, subject: pa.subject, message: pa.message }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.success === false) return { ok: false, message: 'שליחת המייל נכשלה: ' + (data.error || res.status) }
        return { ok: true, message: `✅ מייל נשלח ל-${pa.to}.` }   // send-email already audits
      } catch (e) { return { ok: false, message: 'שגיאה בשליחת מייל: ' + e } }
    }
    case 'add_crm_note': {
      const { error } = await admin.from('crm_notes').insert({
        entity_type: pa.entity_type || 'general', entity_id: pa.entity_id || null,
        content: pa.content, author_phone: actorPhone, author_name: actorName,
      })
      if (error) return { ok: false, message: 'שגיאה בהוספת הערה: ' + error.message }
      await audit('agent_add_note', pa.entity_type || 'general', pa.entity_id || null, { content: pa.content })
      return { ok: true, message: '✅ ההערה נוספה.' }
    }
    case 'update_sales_stage': {
      const { error } = await admin.from('profiles').update({
        sales_stage: pa.stage,
        sales_last_contact: new Date().toISOString(),
        ...(pa.note ? { sales_notes: pa.note } : {}),
      }).eq('id', pa.user_id)
      if (error) return { ok: false, message: 'שגיאה בעדכון: ' + error.message }
      await audit('agent_update_stage', 'lead', pa.user_id, { stage: pa.stage, note: pa.note })
      return { ok: true, message: `✅ שלב המכירה של ${pa.full_name} עודכן ל-"${pa.stage}".` }
    }
    case 'create_automation': {
      // Must run as the admin user (RPC checks auth.uid()=admin); service role has none.
      const { error } = await userClient.rpc('admin_automations_upsert', { rule: pa.rule })
      if (error) return { ok: false, message: 'שגיאה ביצירת האוטומציה: ' + error.message }
      await audit('agent_create_automation', 'automation', null, { name: pa.rule?.name, cron: pa.rule?.trigger_config?.cron })
      return { ok: true, message: `✅ הכלל "${pa.rule?.name}" נוצר — כבוי ובמצב תרגול. עבור לטאב "אוטומציות" לבדוק ולהפעיל.` }
    }
  }
  return { ok: false, message: 'סוג פעולה לא מוכר.' }
}

// ============================================================================
// Sonnet tool-use loop
// ============================================================================
// deno-lint-ignore no-explicit-any
async function callSonnetTools(messages: any[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 4096,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    }),
  })
  if (!res.ok) throw new Error(`Sonnet ${res.status}: ${await res.text()}`)
  return await res.json()
}

// deno-lint-ignore no-explicit-any
function usageTokens(u: any): { pt: number; ct: number } {
  return {
    pt: (Number(u?.input_tokens) || 0) + (Number(u?.cache_creation_input_tokens) || 0) + (Number(u?.cache_read_input_tokens) || 0),
    ct: Number(u?.output_tokens) || 0,
  }
}

serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'לא מחובר.' }, 401)
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: 'אימות נכשל.' }, 401)

    const { data: roleRow } = await admin.from('profiles').select('role, email, phone, full_name').eq('id', user.id).maybeSingle()
    if (roleRow?.role !== 'admin') return json({ error: 'הסוכן זמין למנהלים בלבד.' }, 403)

    // User-scoped client for SECURITY DEFINER RPCs (auth.uid() must be the admin).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const actorName = roleRow.email || user.email || 'admin'
    const actorPhone = roleRow.phone || 'admin-agent'

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'chat'
    const body = await req.json().catch(() => ({}))

    // ---- EXECUTE a confirmed action (no LLM) ----
    if (action === 'execute') {
      const pa = body.pending_action
      if (!pa || !pa.type) return json({ error: 'חסרה פעולה לאישור.' }, 400)
      const result = await executeAction(pa, { admin, userClient, token, actorName, actorPhone })
      return json(result)
    }

    // ---- CHAT (tool-use loop) ----
    if (!ANTHROPIC_API_KEY) return json({ error: 'מפתח Anthropic לא מוגדר.' }, 500)
    if (await agentMonthlyCostShekel(admin) >= AGENT_MONTHLY_CAP_ILS) {
      return json({ reply: `הגעת לתקרת העלות החודשית של הסוכן (${AGENT_MONTHLY_CAP_ILS}₪). אפשר להעלות אותה בהגדרות.`, cards: [], pending_action: null })
    }

    const message = String(body.message || '').trim()
    if (!message) return json({ error: 'חסרה הודעה.' }, 400)

    // Rebuild conversation from client-sent history (text only).
    // deno-lint-ignore no-explicit-any
    const messages: any[] = []
    for (const m of (body.history || [])) {
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()) {
        messages.push({ role: m.role, content: m.content })
      }
    }
    messages.push({ role: 'user', content: message })

    const cards: any[] = []
    let pendingAction: any = null
    let totalPt = 0, totalCt = 0
    let replyText = ''

    for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
      const data = await callSonnetTools(messages)
      const u = usageTokens(data.usage); totalPt += u.pt; totalCt += u.ct
      const content = data.content || []
      const textBlocks = content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('').trim()
      if (textBlocks) replyText = textBlocks
      const toolUses = content.filter((b: any) => b.type === 'tool_use')

      if (!toolUses.length || data.stop_reason !== 'tool_use') break

      messages.push({ role: 'assistant', content })

      // A write tool: prepare a pending_action, do NOT execute, then ask the model
      // for a one-line closing message and stop.
      const writeUse = toolUses.find((t: any) => WRITE_TOOLS.has(t.name))
      if (writeUse) {
        const prep = await prepareWrite(writeUse.name, writeUse.input, admin)
        const toolResults = toolUses.map((t: any) => {
          if (t.id === writeUse.id) {
            return { type: 'tool_result', tool_use_id: t.id, content: prep.error
              ? `שגיאה: ${prep.error}`
              : `הפעולה הוכנה והוצגה למנהל לאישור: ${prep.pending.summary}. אל תקרא לעוד כלים — אמור במשפט אחד מה ימתין לאישור.` }
          }
          return { type: 'tool_result', tool_use_id: t.id, content: 'דולג (טופלה פעולת כתיבה).' }
        })
        messages.push({ role: 'user', content: toolResults })
        if (!prep.error) pendingAction = prep.pending
        // Final no-tools call for the closing sentence.
        const final = await callSonnetTools(messages)   // tools still allowed but model instructed to stop
        const fu = usageTokens(final.usage); totalPt += fu.pt; totalCt += fu.ct
        const ft = (final.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('').trim()
        if (ft) replyText = ft
        break
      }

      // Read tools: execute all, feed results back, loop.
      const toolResults: any[] = []
      for (const t of toolUses) {
        try {
          const r = await handleRead(t.name, t.input, { admin, userClient, token })
          if (r.card) cards.push(r.card)
          toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: r.model })
        } catch (e) {
          toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: `שגיאה בכלי: ${e}` })
        }
      }
      messages.push({ role: 'user', content: toolResults })
    }

    if (!replyText) replyText = cards.length ? 'הנה הנתונים:' : 'לא הצלחתי לעבד את הבקשה — נסה לנסח אחרת.'

    await logAgentUsage(admin, user.id, totalPt, totalCt)

    return json({ reply: replyText, cards, pending_action: pendingAction })
  } catch (error) {
    console.error('[admin-agent] error:', error)
    return json({ error: String((error as Error)?.message || error) }, 500)
  }
})
