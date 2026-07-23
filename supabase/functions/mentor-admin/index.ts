import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Admin-only analytics for the AI mentor. Two actions:
//   ?action=cost&month=YYYY-MM   → monthly Sonnet spend (₪) vs the 100₪ cap.
//   ?action=insights&days=N[&refresh=1] → recurring student questions mined into
//        marketing angles + automation opportunities (voice-of-customer).
// Runs with the service role (bypasses RLS) but is gated to role='admin', because
// ai_chat_usage / ai_chat_messages are not readable by admins via normal RLS.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

const SONNET_MODEL = 'claude-sonnet-4-6'
const SONNET_IN_USD = Number(Deno.env.get('SONNET_IN_USD')) || 3
const SONNET_OUT_USD = Number(Deno.env.get('SONNET_OUT_USD')) || 15
const USD_ILS = Number(Deno.env.get('USD_ILS')) || 3.8
const AI_MONTHLY_CAP_ILS = Number(Deno.env.get('AI_MONTHLY_CAP_ILS')) || 100

const INSIGHTS_BUCKET = 'workbooks'
const INSIGHTS_PATH = 'mentor-insights/latest.json'
const SONNET_SOURCES = ['chat-sonnet', 'mentor-sonnet']

// Weekly WhatsApp digest (action=digest) — reuses the project's existing Green API
// secrets. Secret-gated so a scheduler can call it without an admin login.
const GREEN_API_URL = Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('GREEN_API_TOKEN') || ''
const ALERT_PHONE = Deno.env.get('ALERT_PHONE') || '972549116092'
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
  // FIX-ENGINE F-011 (2026-07-23): local dev origins were missing — preflight failed on
  // localhost and the "עלויות AI" tab showed "Failed to fetch". Added to match the other
  // Edge Functions (submit-lead, get-lessons, etc.). לבקשת הלל.
  'http://localhost:8770',
  'http://localhost:3000',
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

function israelMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date())
}

// 'YYYY-MM' → ['YYYY-MM-01', 'YYYY-(MM+1)-01'] (next-month exclusive bound)
function monthBounds(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`
  return [start, end]
}

// deno-lint-ignore no-explicit-any
async function costSummary(db: any, month: string) {
  const ym = /^\d{4}-\d{2}$/.test(month) ? month : israelMonth()
  const [start, end] = monthBounds(ym)

  const { data: rows } = await db
    .from('ai_chat_usage')
    .select('user_id, date, source, message_count, prompt_tokens, completion_tokens')
    .in('source', SONNET_SOURCES)
    .gte('date', start)
    .lt('date', end)

  let totPt = 0, totCt = 0, totMsgs = 0
  const byDay: Record<string, { msgs: number; pt: number; ct: number }> = {}
  const byUser: Record<string, { msgs: number; pt: number; ct: number }> = {}
  const userIds = new Set<string>()
  for (const r of (rows || [])) {
    const pt = Number(r.prompt_tokens) || 0, ct = Number(r.completion_tokens) || 0, mc = Number(r.message_count) || 0
    totPt += pt; totCt += ct; totMsgs += mc
    if (r.user_id) userIds.add(r.user_id)
    const d = byDay[r.date] || (byDay[r.date] = { msgs: 0, pt: 0, ct: 0 })
    d.msgs += mc; d.pt += pt; d.ct += ct
    if (r.user_id) {
      const u = byUser[r.user_id] || (byUser[r.user_id] = { msgs: 0, pt: 0, ct: 0 })
      u.msgs += mc; u.pt += pt; u.ct += ct
    }
  }

  // Names for the active users
  const names: Record<string, string> = {}
  if (userIds.size) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', [...userIds])
    for (const p of (profs || [])) names[p.id] = p.full_name || ''
  }

  const spent = ils(totPt, totCt)
  return {
    month: ym,
    cap_ils: AI_MONTHLY_CAP_ILS,
    spent_ils: spent,
    pct_used: AI_MONTHLY_CAP_ILS ? Math.round((spent / AI_MONTHLY_CAP_ILS) * 1000) / 10 : 0,
    remaining_ils: Math.max(0, Math.round((AI_MONTHLY_CAP_ILS - spent) * 100) / 100),
    messages: totMsgs,
    active_users: userIds.size,
    prompt_tokens: totPt,
    completion_tokens: totCt,
    pricing: { in_usd: SONNET_IN_USD, out_usd: SONNET_OUT_USD, usd_ils: USD_ILS },
    by_day: Object.entries(byDay).sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map(([date, v]) => ({ date, messages: v.msgs, prompt_tokens: v.pt, completion_tokens: v.ct, ils: ils(v.pt, v.ct) })),
    by_user: Object.entries(byUser).sort((a, b) => ils(b[1].pt, b[1].ct) - ils(a[1].pt, a[1].ct))
      .map(([uid, v]) => ({ name: names[uid] || ('…' + uid.slice(-4)), messages: v.msgs, prompt_tokens: v.pt, completion_tokens: v.ct, ils: ils(v.pt, v.ct) })),
  }
}

const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          count: { type: 'integer' },
          marketing_tag: { type: 'string', enum: ['pain', 'desire', 'objection', 'confusion'] },
          examples: { type: 'array', items: { type: 'string' } },
          marketing_angle: { type: 'string' },
          automation_opportunity: { type: 'string' },
        },
        required: ['title', 'count', 'marketing_tag', 'examples', 'marketing_angle', 'automation_opportunity'],
      },
    },
    off_course_topics: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'themes', 'off_course_topics'],
}

// deno-lint-ignore no-explicit-any
async function runInsights(db: any, days: number) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString()
  const { data: msgs } = await db
    .from('ai_chat_messages')
    .select('content, created_at')
    .eq('role', 'user')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(2000)

  const questions = (msgs || []).map((m: { content?: string }) => (m.content || '').trim()).filter(Boolean)
  if (!questions.length) {
    return { generated_at: new Date().toISOString(), window_days: days, total_questions: 0, summary: 'אין מספיק שאלות בחלון הזמן שנבחר.', themes: [], off_course_topics: [] }
  }

  const system = `אתה אנליסט שיווק ומוצר עבור "בית המטפלים" (קורס NLP בעברית). לפניך שאלות אמיתיות שתלמידים שאלו את המורה החכם. נתח אותן ל-voice-of-customer: זהה את הנושאים החוזרים, דרג לפי תדירות, ולכל נושא תן: כותרת קצרה, מספר מופעים מוערך, תיוג (pain/desire/objection/confusion), 2-3 ציטוטים מייצגים בשפת התלמיד, זווית שיווקית/הוק מוכן למודעה, והזדמנות אוטומציה (FAQ/פופאפ/שיפור לחומר הקורס). בנוסף ציין נושאים שחזרו אך הם מחוץ לתוכן הקורס (סימן לביקוש למוצר/תוכן הבא). הכל בעברית. החזר JSON בלבד לפי הסכמה.`
  const userMsg = `סך הכל ${questions.length} שאלות (${days} ימים אחרונים). השאלות:\n` + questions.slice(0, 1200).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      system,
      output_config: { format: { type: 'json_schema', schema: INSIGHTS_SCHEMA } },
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Sonnet insights ${res.status}: ${await res.text()}`)
  const data = await res.json()
  // deno-lint-ignore no-explicit-any
  const txt = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('')
  const parsed = JSON.parse(txt)

  const result = { generated_at: new Date().toISOString(), window_days: days, total_questions: questions.length, ...parsed }

  // Cache to Storage (best-effort) so the panel and the weekly digest can read it instantly.
  try {
    await db.storage.from(INSIGHTS_BUCKET).upload(INSIGHTS_PATH, new Blob([JSON.stringify(result)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
  } catch (e) { console.error('[insights] cache write failed', e) }
  return result
}

// deno-lint-ignore no-explicit-any
async function readCachedInsights(db: any) {
  try {
    const { data } = await db.storage.from(INSIGHTS_BUCKET).download(INSIGHTS_PATH)
    if (!data) return null
    return JSON.parse(await data.text())
  } catch { return null }
}

async function sendWhatsApp(phone: string, message: string): Promise<{ ok: boolean; status: number }> {
  if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) return { ok: false, status: 0 }
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: `${phone}@c.us`, message }) })
    return { ok: res.ok, status: res.status }
  } catch { return { ok: false, status: 0 } }
}

// deno-lint-ignore no-explicit-any
function buildDigest(ins: any, days: number): string {
  const themes = (ins.themes || []).slice(0, 3)
  const TAG: Record<string, string> = { pain: 'כאב', desire: 'רצון', objection: 'התנגדות', confusion: 'בלבול' }
  const lines = [
    '📊 תובנות מהמורה — סיכום שבועי',
    `${ins.total_questions || 0} שאלות ב-${days} הימים האחרונים.`,
    '',
    '🔥 השאלות שחוזרות:',
  ]
  themes.forEach((t: { title?: string; marketing_tag?: string; count?: number }, i: number) => {
    lines.push(`${i + 1}. ${t.title} (${TAG[t.marketing_tag || ''] || t.marketing_tag || ''} · ${t.count || 0})`)
  })
  const angle = themes[0]?.marketing_angle
  if (angle) { lines.push('', '💡 זווית מוכנה למודעה:', `"${angle}"`) }
  const off = (ins.off_course_topics || [])[0]
  if (off) lines.push('', `🧭 ביקוש מחוץ-לקורס: ${off}`)
  lines.push('', 'לפירוט מלא: דשבורד ← מורה AI ← תובנות מהמורה.')
  return lines.join('\n')
}

serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'cost'

    // Scheduled weekly digest: secret-gated (no admin JWT) so a cron job can call it.
    if (action === 'digest') {
      const key = url.searchParams.get('key') || req.headers.get('x-cron-secret') || ''
      if (!CRON_SECRET || key !== CRON_SECRET) return json({ error: 'forbidden' }, 403)
      const sdb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days')) || 7))
      const insights = await runInsights(sdb, days)
      const sent = await sendWhatsApp(ALERT_PHONE, buildDigest(insights, days))
      return json({ ok: sent.ok, status: sent.status, sent_to: ALERT_PHONE, themes: (insights.themes || []).length })
    }

    // Everything else is admin-only.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user) return json({ error: 'Invalid token' }, 401)

    const { data: roleRow } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (roleRow?.role !== 'admin') return json({ error: 'Admin only' }, 403)

    if (action === 'cost') {
      const month = url.searchParams.get('month') || israelMonth()
      return json(await costSummary(db, month))
    }

    if (action === 'insights') {
      const refresh = url.searchParams.get('refresh') === '1'
      const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days')) || 30))
      if (!refresh) {
        const cached = await readCachedInsights(db)
        if (cached) return json({ cached: true, ...cached })
      }
      if (!ANTHROPIC_API_KEY) return json({ error: 'מפתח Anthropic לא מוגדר' }, 500)
      return json({ cached: false, ...(await runInsights(db, days)) })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('[mentor-admin] error:', error)
    return json({ error: String((error as Error)?.message || error) }, 500)
  }
})
