// ============================================================================
// Edge Function: send-welcome-whatsapp
// Transactional one-shot welcome WhatsApp on signup OR portal questionnaire.
//
// Accepts EITHER:
//   { questionnaire_id }  → reads portal_questionnaires, locks via welcome_sent_at
//   { profile_id }        → reads profiles, locks via whatsapp_welcome_sent_at
//
// Called fire-and-forget from:
//   - pages/portal-questionnaire.html  (after INSERT into portal_questionnaires)
//   - pages/free-portal.html           (after profile upsert with phone)
//   - pages/login-v2.html              (after savePendingProfile with phone)
//   - js/supabase-client.js            (ensureProfile when phone present)
//
// Idempotent in two ways:
//   1. Per-row lock — refuses to send if welcome_sent_at is already set.
//   2. Cross-row dedup — questionnaire path checks profile.whatsapp_welcome_sent_at
//      first; if profile already got the welcome, marks questionnaire sent and skips.
//      This prevents a double-send when a user signs up (→ profile welcome) and
//      then fills the questionnaire (→ would have been a second welcome).
//
// Does NOT enforce quiet hours: Hillel asked for an immediate transactional
// send regardless of time of day. Reminders/promo automations continue to
// respect 21:00–08:00 (handled in crm-bot/automation-engine.js).
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GREEN_API_URL = Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('GREEN_API_TOKEN') || ''

if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) {
  console.error('CRITICAL: GREEN_API_INSTANCE / GREEN_API_TOKEN not configured — welcome messages will fail')
}

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// Israeli 05X / +972 / bare digits → 972XXXXXXXXX (Green API chatId format)
function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = '972' + digits.slice(1)
  else if (digits.startsWith('5') && digits.length === 9) digits = '972' + digits
  return digits
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'חבר/ה'
  const tok = String(full).trim().split(/\s+/)[0]
  return tok || 'חבר/ה'
}

const WELCOME_TEMPLATE = (name: string) => `היי ${name} 👋

הצעד שעשית עכשיו, ההרשמה לפורטל, הוא משמעותי יותר ממה שנדמה לך.

אתה לא רק תקבל ידע. אתה תקבל כלים שמשנים את הדרך שבה אתה חושב, מגיב ומתקשר. אנשים שעוברים את התהליך הזה ברצינות מספרים שזה אחד הדברים הכי משמעותיים שעשו לעצמם.

יש דרך אחת להפוך את הלמידה הזאת לאמיתית. הקהילה השקטה שלנו:
https://chat.whatsapp.com/Lp3MNZ7fmGu8dmUzaUluyx

בפנים יש:
• זומים חודשיים עם אלעזר, מטפל מקצועי שעובד עם המתודה ויודע איך היא נראית בשטח
• חלל שקט לשתף תובנות, לשאול שאלות אמיתיות, ולקבל פידבק
• בלי ספאם. רק תוכן

מחכים לראות אותך מעבר לקלעים.

צוות בית המטפלים

לביטול הודעות, ענה הסר`

// Resolve phone → real WhatsApp chatId.
// Critical: many Israeli numbers register with WhatsApp Business and return
// `@lid` chat IDs (e.g. "73701722706116@lid") that differ from the raw phone.
// Sending to "972XXXXXXXXX@c.us" for those numbers returns HTTP 466.
// Mirrors crm-bot/src/whatsapp.js which already does this resolution.
async function resolveChatId(phone972: string): Promise<{ chatId: string | null; existsOnWA: boolean; checkOk: boolean }> {
  try {
    const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/checkWhatsapp/${GREEN_API_TOKEN}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: parseInt(phone972, 10) }),
    })
    const data = await res.json().catch(() => ({}))
    // Green API returns { invokeStatus: { status: 'QUOTE_EXCEEDED', ... } } when monthly quota is hit.
    // In that case existsWhatsapp is missing entirely — we MUST NOT mark these as "not_on_whatsapp"
    // because we genuinely don't know. Return checkOk=false so the caller can fail loudly instead.
    if (data?.invokeStatus?.status && data.invokeStatus.status !== 'ok') {
      console.error('checkWhatsapp blocked:', data.invokeStatus)
      return { chatId: null, existsOnWA: false, checkOk: false }
    }
    if (!data?.existsWhatsapp) return { chatId: null, existsOnWA: false, checkOk: true }
    return { chatId: data.chatId || `${phone972}@c.us`, existsOnWA: true, checkOk: true }
  } catch (e) {
    console.error('checkWhatsapp error:', e)
    return { chatId: null, existsOnWA: false, checkOk: false }
  }
}

async function sendWhatsApp(chatId: string, message: string): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`
  const payload = JSON.stringify({ chatId, message })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Buffer-encoded for UTF-8 Hebrew safety (mirrors crm-bot/src/whatsapp.js)
    body: new TextEncoder().encode(payload),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text }
}

// Rollout cutoffs — historical rows from before launch are permanently excluded.
const QUESTIONNAIRE_ROLLOUT_CUTOFF = new Date('2026-05-11T21:00:00Z') // 2026-05-12 00:00 Asia/Jerusalem
const PROFILE_ROLLOUT_CUTOFF = new Date('2026-05-13T00:00:00Z')        // 2026-05-13 03:00 Asia/Jerusalem (rough — exact value doesn't matter; the migration UPDATEs all pre-existing profiles to NOW() anyway)

// Source description for a welcome send. The handler builds one of these from
// the request payload, then runs the shared opt-out/send/mark-sent pipeline.
type SendSource = {
  rowId: string
  phoneRaw: string
  fullName: string | null
  optedOut: boolean
  markSent: () => Promise<void>
}

function jsonResponse(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors)

  try {
    const body = await req.json().catch(() => ({}))
    const questionnaire_id = typeof body?.questionnaire_id === 'string' ? body.questionnaire_id : null
    const profile_id = typeof body?.profile_id === 'string' ? body.profile_id : null
    if (!questionnaire_id && !profile_id) return jsonResponse({ error: 'missing_id' }, 400, cors)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Step 1: Resolve a SendSource from one of the two payload shapes.
    // Each branch handles: lookup, exists check, already-sent lock, rollout
    // cutoff, and prepares the markSent closure that the shared pipeline
    // will invoke after a confirmed Green API send.
    let source: SendSource | null = null

    if (profile_id) {
      const { data: p, error: pErr } = await db
        .from('profiles')
        .select('id, phone, full_name, whatsapp_opt_out, whatsapp_welcome_sent_at, created_at')
        .eq('id', profile_id)
        .maybeSingle()
      if (pErr) throw pErr
      if (!p) return jsonResponse({ sent: false, reason: 'not_found' }, 404, cors)
      if (p.whatsapp_welcome_sent_at) return jsonResponse({ sent: false, reason: 'already_sent' }, 200, cors)
      if (p.created_at && new Date(p.created_at) < PROFILE_ROLLOUT_CUTOFF) {
        await db.from('profiles').update({ whatsapp_welcome_sent_at: new Date().toISOString() }).eq('id', p.id)
        return jsonResponse({ sent: false, reason: 'pre_rollout' }, 200, cors)
      }
      source = {
        rowId: p.id,
        phoneRaw: p.phone || '',
        fullName: p.full_name || null,
        optedOut: p.whatsapp_opt_out === true,
        markSent: async () => {
          await db.from('profiles').update({ whatsapp_welcome_sent_at: new Date().toISOString() }).eq('id', p.id)
        },
      }
    } else if (questionnaire_id) {
      const { data: q, error: qErr } = await db
        .from('portal_questionnaires')
        .select('id, user_id, phone, welcome_sent_at, created_at')
        .eq('id', questionnaire_id)
        .maybeSingle()
      if (qErr) throw qErr
      if (!q) return jsonResponse({ sent: false, reason: 'not_found' }, 404, cors)
      if (q.welcome_sent_at) return jsonResponse({ sent: false, reason: 'already_sent' }, 200, cors)
      if (new Date(q.created_at) < QUESTIONNAIRE_ROLLOUT_CUTOFF) {
        await db.from('portal_questionnaires').update({ welcome_sent_at: new Date().toISOString() }).eq('id', q.id)
        return jsonResponse({ sent: false, reason: 'pre_rollout' }, 200, cors)
      }

      // Phone + name + opt-out come from the profile when available, falling
      // back to questionnaire fields if there's no user_id (anonymous case).
      let phoneRaw = q.phone || ''
      let fullName: string | null = null
      let optedOut = false
      if (q.user_id) {
        const { data: p } = await db
          .from('profiles')
          .select('phone, full_name, whatsapp_opt_out, whatsapp_welcome_sent_at')
          .eq('id', q.user_id)
          .maybeSingle()
        if (p) {
          // Cross-row dedup: if the profile already received the signup welcome,
          // the questionnaire would be a second copy of the same message. Mark
          // the questionnaire sent and exit silently.
          if (p.whatsapp_welcome_sent_at) {
            await db.from('portal_questionnaires').update({ welcome_sent_at: new Date().toISOString() }).eq('id', q.id)
            return jsonResponse({ sent: false, reason: 'profile_already_welcomed' }, 200, cors)
          }
          if (!phoneRaw) phoneRaw = p.phone || ''
          fullName = p.full_name || null
          optedOut = p.whatsapp_opt_out === true
        }
      }

      source = {
        rowId: q.id,
        phoneRaw,
        fullName,
        optedOut,
        markSent: async () => {
          await db.from('portal_questionnaires').update({ welcome_sent_at: new Date().toISOString() }).eq('id', q.id)
          // Also mark the profile, so the user is permanently excluded from
          // any future signup-side welcome attempts (e.g. ensureProfile retry).
          if (q.user_id) {
            await db.from('profiles').update({ whatsapp_welcome_sent_at: new Date().toISOString() }).eq('id', q.user_id)
          }
        },
      }
    }

    if (!source) return jsonResponse({ error: 'unresolved_source' }, 500, cors)

    // ── Step 2: Shared pipeline — opt-out → normalize → resolveChatId → send → mark sent.
    if (source.optedOut) {
      // Mark as sent so we don't keep retrying on every page reload
      await source.markSent()
      return jsonResponse({ sent: false, reason: 'opt_out' }, 200, cors)
    }

    const phone972 = normalizePhone(source.phoneRaw)
    if (!phone972 || phone972.length < 11) {
      return jsonResponse({ sent: false, reason: 'invalid_phone' }, 200, cors)
    }

    // checkWhatsapp resolves @lid (WhatsApp Business) chat IDs.
    const { chatId, existsOnWA, checkOk } = await resolveChatId(phone972)
    if (!checkOk) {
      // Green API itself errored (e.g. quota). DO NOT mark sent — unknown state, retryable.
      return jsonResponse({ sent: false, reason: 'check_unavailable' }, 503, cors)
    }
    if (!existsOnWA || !chatId) {
      // Confirmed not on WhatsApp — mark sent so we don't keep retrying.
      await source.markSent()
      return jsonResponse({ sent: false, reason: 'not_on_whatsapp' }, 200, cors)
    }

    const message = WELCOME_TEMPLATE(firstName(source.fullName))
    const result = await sendWhatsApp(chatId, message)

    if (!result.ok) {
      console.error('Green API send failed', { status: result.status, body: result.body, chatId })
      return jsonResponse({ sent: false, reason: 'green_api_error', status: result.status }, 502, cors)
    }

    // Mark sent — only on confirmed Green API success.
    await source.markSent()
    return jsonResponse({ sent: true }, 200, cors)
  } catch (e) {
    console.error('send-welcome-whatsapp unhandled error:', e)
    return jsonResponse({ error: 'internal_error' }, 500, cors)
  }
})
