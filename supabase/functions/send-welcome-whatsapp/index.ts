// ============================================================================
// Edge Function: send-welcome-whatsapp
// Transactional one-shot welcome WhatsApp after portal questionnaire submit.
//
// Called fire-and-forget from pages/portal-questionnaire.html immediately
// after the INSERT into portal_questionnaires succeeds. Idempotent — the
// `welcome_sent_at` column on portal_questionnaires is the lock.
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

async function sendWhatsApp(phone972: string, message: string): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`
  const payload = JSON.stringify({ chatId: `${phone972}@c.us`, message })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Buffer-encoded for UTF-8 Hebrew safety (mirrors crm-bot/src/whatsapp.js)
    body: new TextEncoder().encode(payload),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text }
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const questionnaire_id = body?.questionnaire_id
    if (!questionnaire_id || typeof questionnaire_id !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_questionnaire_id' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Lookup row — must exist + not already sent
    const { data: q, error: qErr } = await db
      .from('portal_questionnaires')
      .select('id, user_id, phone, welcome_sent_at')
      .eq('id', questionnaire_id)
      .maybeSingle()

    if (qErr) throw qErr
    if (!q) {
      return new Response(JSON.stringify({ sent: false, reason: 'not_found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (q.welcome_sent_at) {
      return new Response(JSON.stringify({ sent: false, reason: 'already_sent' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 2. Resolve phone + name + opt-out from profile (if user_id present)
    let phoneRaw = q.phone || ''
    let fullName: string | null = null
    let optedOut = false
    if (q.user_id) {
      const { data: p } = await db
        .from('profiles')
        .select('phone, full_name, whatsapp_opt_out')
        .eq('id', q.user_id)
        .maybeSingle()
      if (p) {
        if (!phoneRaw) phoneRaw = p.phone || ''
        fullName = p.full_name || null
        optedOut = p.whatsapp_opt_out === true
      }
    }

    if (optedOut) {
      // Mark as sent so we don't keep retrying on every page reload
      await db.from('portal_questionnaires').update({ welcome_sent_at: new Date().toISOString() }).eq('id', q.id)
      return new Response(JSON.stringify({ sent: false, reason: 'opt_out' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const phone972 = normalizePhone(phoneRaw)
    if (!phone972 || phone972.length < 11) {
      return new Response(JSON.stringify({ sent: false, reason: 'invalid_phone' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 3. Send
    const message = WELCOME_TEMPLATE(firstName(fullName))
    const result = await sendWhatsApp(phone972, message)

    if (!result.ok) {
      console.error('Green API send failed', { status: result.status, body: result.body, phone: phone972 })
      return new Response(JSON.stringify({ sent: false, reason: 'green_api_error', status: result.status }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 4. Mark sent — only on confirmed Green API success
    await db.from('portal_questionnaires').update({ welcome_sent_at: new Date().toISOString() }).eq('id', q.id)

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('send-welcome-whatsapp unhandled error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
