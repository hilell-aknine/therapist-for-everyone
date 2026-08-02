// ============================================================================
// Edge Function: buddy-notify
// Drains study_buddy_notifications and sends the two study-buddy WhatsApp
// messages via Green API. Intended to be called by pg_cron every few minutes.
//
// Only two messages exist, on purpose:
//   'request'  → "someone asked to study with you"   (the time-sensitive one)
//   'accepted' → "they said yes, details are inside" (both sides)
// No digests, no re-engagement nudges. The matching feature earns its messages
// or it does not send any.
//
// Shipping state: OFF. study_buddy_settings.notifications_enabled starts false,
// so this returns {skipped:'disabled'} and delivers nothing until it is flipped.
//
// Guards, in the order they are applied:
//   1. caller must present the service-role key           (no public drain)
//   2. global kill switch                                 (study_buddy_settings)
//   3. Asia/Jerusalem send window, default 09:00-20:00     (no night pings)
//   4. per-recipient 24h cap                              (enforced in buddy_notify_batch)
//   5. profiles.whatsapp_opt_out                          (row → 'skipped')
//   6. ~1.2s spacing, small batch                          (Green API spam-ban ceiling)
//
// Contact details are NEVER put in the message. Both templates link into the
// portal, so a forwarded WhatsApp cannot leak someone's phone number.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Dedicated line for study-buddy messages, falling back to the shared project secrets.
// Deliberately NOT reusing GREEN_API_INSTANCE directly: those secrets are shared with
// send-welcome-whatsapp and paid-reminders, so repointing them would silently move every
// other outbound message in the project onto a different WhatsApp number too.
const GREEN_API_URL = Deno.env.get('BUDDY_GREEN_API_URL')
  || Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('BUDDY_GREEN_API_INSTANCE')
  || Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('BUDDY_GREEN_API_TOKEN')
  || Deno.env.get('GREEN_API_TOKEN') || ''

const PORTAL_LINK = 'https://www.therapist-home.com/pages/course-library-v2.html#buddy'
const BATCH_SIZE = 20
const SEND_DELAY_MS = 1200
const MAX_ATTEMPTS = 4

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Israel local hour. Edge Functions run in UTC — never use getHours() here.
function israelHour(): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
  }).format(new Date())
  return parseInt(s, 10)
}

// Israeli 05X / +972 / bare digits → 972XXXXXXXXX (Green API chatId format).
// Same normalisation as send-welcome-whatsapp.
function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) d = '972' + d.slice(1)
  else if (d.startsWith('5') && d.length === 9) d = '972' + d
  return d
}

const OPT_OUT_LINE = '\n\nלא רוצה לקבל הודעות כאלה? השב/י "הסר" ונפסיק.'

function buildMessage(kind: string, me: string, other: string, isTest = false): string {
  const name = me || 'חבר/ה'
  const buddy = other || 'אחד הלומדים'
  const head = isTest ? '🧪 הודעת בדיקה, לא נשלחה לאף לומד\n\n' : ''

  if (kind === 'request') {
    return head +
`היי ${name},

${buddy}, שנמצא/ת בערך באותו מקום כמוך בקורס, ביקש/ה ללמוד איתך.

עדיין לא העברנו לאף אחד שום פרט. אם תאשר/י, תקבלו אחד את הפרטים של השני ותוכלו לתאם ביניכם. אם לא, פשוט תתעלם/י מההודעה.

לראות ולהחליט:
${PORTAL_LINK}` + OPT_OUT_LINE
  }

  return head +
`היי ${name},

${buddy} אישר/ה, ואתם מחוברים.

הפרטים של שניכם מחכים לכם באזור "ללמוד עם חבר" בפורטל, עם כפתור שפותח שיחה ישירות.

${PORTAL_LINK}` + OPT_OUT_LINE
}

async function sendWhatsApp(phone972: string, message: string) {
  const url = `${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`
  // linkPreview:false — Green API's preview prefetch has burned one-time links here
  // before (2026-06-11). Keep it off.
  const payload = JSON.stringify({ chatId: `${phone972}@c.us`, message, linkPreview: false })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new TextEncoder().encode(payload),   // UTF-8 safe for Hebrew
  })
  return { ok: res.ok, status: res.status, body: await res.text() }
}

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'not configured' }), { status: 503 })
  }

  // Guard 1: service-role only. This drains a queue and sends real messages; it must
  // not be reachable with the public anon key.
  //
  // Checks the token's `role` CLAIM rather than string-comparing against
  // SUPABASE_SERVICE_ROLE_KEY: the injected env value and the key an operator holds can
  // legitimately differ (key rotation, legacy vs. new API keys), and a string compare
  // then rejects the real service key — which is exactly what happened on first test.
  // Safe to read the claim without verifying the signature here because the platform
  // gateway (verify_jwt, left ON for this function) has already rejected anything that
  // is not a validly signed project token before it reaches this code.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  let callerRole = ''
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    callerRole = 'service_role'
  } else {
    try {
      const part = token.split('.')[1]
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      callerRole = String(JSON.parse(json).role || '')
    } catch (_) { callerRole = '' }
  }
  if (callerRole !== 'service_role') {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') { try { body = await req.json() } catch (_) { /* empty body ok */ } }

  // Test path: send one clearly-marked sample to a given number. Touches no queue rows
  // and no learner data, so it is safe to run while the feature is still switched off.
  if (body.test_phone) {
    if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) {
      return new Response(JSON.stringify({ error: 'green api not configured' }), { status: 503 })
    }
    const phone = normalizePhone(String(body.test_phone))
    const kind = body.test_kind === 'accepted' ? 'accepted' : 'request'
    const msg = buildMessage(kind, String(body.test_name || 'הילל'), String(body.test_other || 'דנה'), true)
    const r = await sendWhatsApp(phone, msg)
    return new Response(JSON.stringify({ test: true, kind, phone, ok: r.ok, status: r.status, body: r.body }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  // Guard 2: kill switch.
  const { data: settings } = await db.from('study_buddy_settings').select('*').eq('id', true).single()
  if (!settings?.notifications_enabled) {
    const { count } = await db.from('study_buddy_notifications')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending')
    return new Response(JSON.stringify({ skipped: 'disabled', pending: count ?? 0 }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  // Guard 3: send window. Outside it, rows stay pending and go out in the morning —
  // a 2am "someone wants to study with you" is how people mute you.
  const hour = israelHour()
  const start = settings.send_hour_start ?? 9
  const end = settings.send_hour_end ?? 20
  if (hour < start || hour >= end) {
    return new Response(JSON.stringify({ skipped: 'outside_send_window', israel_hour: hour, window: [start, end] }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'green api not configured' }), { status: 503 })
  }

  // Guard 4 lives inside buddy_notify_batch (per-recipient 24h cap).
  const { data: rows, error } = await db.rpc('buddy_notify_batch', { p_limit: BATCH_SIZE })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  if (!rows?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  const dryRun = body.dry_run === true
  let sent = 0, skipped = 0, failed = 0
  const log: unknown[] = []

  for (const row of rows as Array<Record<string, string | boolean>>) {
    const id = String(row.id)
    const phone = normalizePhone(String(row.recipient_phone || ''))

    // Guard 5: opted out, or no usable number → terminal skip, never retried.
    if (row.opted_out === true || !phone) {
      const reason = row.opted_out === true ? 'whatsapp_opt_out' : 'no_phone'
      if (!dryRun) {
        await db.from('study_buddy_notifications')
          .update({ status: 'skipped', skip_reason: reason }).eq('id', id)
      }
      skipped++; log.push({ id, skipped: reason })
      continue
    }

    const msg = buildMessage(String(row.kind), String(row.recipient_name || ''), String(row.other_first_name || ''))
    if (dryRun) { log.push({ id, would_send_to: phone, kind: row.kind, preview: msg.slice(0, 80) }); continue }

    const r = await sendWhatsApp(phone, msg)
    if (r.ok) {
      await db.from('study_buddy_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
      sent++; log.push({ id, sent: true })
    } else {
      // Retry a few times, then give up. Left 'pending' in between so the next cron
      // run picks it up; only a persistent failure becomes terminal.
      const attempts = Number(row.attempts ?? 0) + 1
      await db.from('study_buddy_notifications').update({
        attempts,
        last_error: `${r.status}: ${r.body}`.slice(0, 500),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      }).eq('id', id)
      failed++; log.push({ id, error: r.status })
    }
    await sleep(SEND_DELAY_MS)
  }

  return new Response(JSON.stringify({ processed: rows.length, sent, skipped, failed, dry_run: dryRun, log }),
    { headers: { 'Content-Type': 'application/json' } })
})
