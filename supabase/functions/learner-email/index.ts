// ============================================================================
// Edge Function: learner-email
// Drains public.learner_emails. Called by pg_cron every 10 minutes.
// Two service emails only: 'welcome' and 'inactive'. See migration
// 20261102120000_learner_emails.sql for who gets what and why.
//
// Sends from the PROJECT mailbox (terapyistforeveryone@gmail.com) through its own
// Apps Script (gmail-api-portal, gmail.send scope only), never from Hillel's personal
// Gmail. Uses its own secrets (LEARNER_GMAIL_API_*) so the older functions that still
// read GMAIL_API_URL are not affected by this one.
//
// Guards, in order:
//   1. caller must hold a service_role token (verify_jwt ON + role claim)
//   2. learner_email_settings.enabled kill switch (off at ship)
//   3. 09:00-20:00 Asia/Jerusalem
//   4. daily cap (inside learner_emails_batch)
//   5. excluded / opted-out / came back before we sent → row 'skipped'
//   6. paced sends, small batch (Apps Script ≈10/min)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAILER_URL = Deno.env.get('LEARNER_GMAIL_API_URL') || ''
const MAILER_TOKEN = Deno.env.get('LEARNER_GMAIL_API_TOKEN') || ''
const UNSUB_SECRET = Deno.env.get('EMAIL_UNSUB_SECRET') || ''

const SITE = 'https://www.therapist-home.com'
const CONTINUE_LINK = `${SITE}/pages/course-library-v2.html#continue`
const BATCH_SIZE = 8
const SEND_DELAY_MS = 6500
// Low on purpose: Apps Script can send and still return an error, so every retry
// risks a duplicate in a learner's inbox (seen with the monthly email, Aug 2026).
const MAX_ATTEMPTS = 2

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function israelHour(): number {
  return parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
  }).format(new Date()), 10)
}

function validEmail(raw: string): string {
  const e = String(raw || '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

function firstName(full: string): string {
  const f = String(full || '').trim().split(/\s+/)[0] || ''
  // An email-local-part fallback name ("david123") reads as a bug in a greeting.
  return /[@\d_]/.test(f) ? '' : f
}

// Gendered copy. Unknown gender → the slash form, never a guess.
type G = 'm' | 'f' | 'x'
const genderOf = (g: string): G => (g === 'גבר' ? 'm' : g === 'אישה' ? 'f' : 'x')
const pick = (g: G, m: string, f: string, x: string) => (g === 'm' ? m : g === 'f' ? f : x)

async function unsubLink(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(UNSUB_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId)))
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${SITE}/pages/unsubscribe.html?u=${userId}&s=${hex}`
}

interface Mail { subject: string; text: string; cta: string }

function buildMail(kind: string, name: string, g: G, lessonsDone: number): Mail {
  const hi = name ? `היי ${name},` : 'היי,'

  if (kind === 'welcome') {
    if (lessonsDone >= 1) {
      return {
        subject: pick(g, 'ברוך הבא לבית המטפלים', 'ברוכה הבאה לבית המטפלים', 'ברוכים הבאים לבית המטפלים'),
        cta: 'להמשיך ללמוד',
        text: `${hi}

${pick(g, 'ברוך הבא', 'ברוכה הבאה', 'ברוך/ה הבא/ה')} לבית המטפלים.
כבר התחלת ללמוד, וזה הצעד הכי חשוב.

השיעור הבא שמור לך בפורטל בדיוק מהמקום שעצרת.
${pick(g, 'כשתרצה להמשיך', 'כשתרצי להמשיך', 'כשרוצים להמשיך')}, זה כאן:

יש שאלה? אפשר פשוט להשיב למייל הזה.`,
      }
    }
    return {
      subject: pick(g, 'ברוך הבא לבית המטפלים', 'ברוכה הבאה לבית המטפלים', 'ברוכים הבאים לבית המטפלים'),
      cta: 'לשיעור הראשון',
      text: `${hi}

${pick(g, 'ברוך הבא', 'ברוכה הבאה', 'ברוך/ה הבא/ה')} לבית המטפלים.
הקורס החינמי כבר פתוח בשבילך בפורטל.

הכי טוב להתחיל את השיעור הראשון עוד היום.
ככה הכי קל להפוך את הלמידה להרגל.

יש שאלה? אפשר פשוט להשיב למייל הזה.`,
    }
  }

  // inactive
  const progress = lessonsDone === 1
    ? `סיימת כבר את השיעור הראשון בקורס.`
    : `סיימת כבר ${lessonsDone} שיעורים בקורס.`
  return {
    subject: name ? `${name}, השיעור הבא שלך מחכה` : 'השיעור הבא שלך מחכה',
    cta: 'להמשיך מאיפה שעצרתי',
    text: `${hi}

${progress}
הפורטל שמר בדיוק את המקום שבו עצרת.

מספיקות עשר דקות כדי לחזור לקצב.
${pick(g, 'אתה כבר בדרך', 'את כבר בדרך', 'כבר התחלת את הדרך')}, חבל לעצור עכשיו.

יש שאלה או משהו שתקע? אפשר פשוט להשיב למייל הזה.`,
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(mail: Mail, unsub: string, isTest: boolean): string {
  const head = isTest ? '<p style="background:#fff4d6;padding:8px 12px;border-radius:6px;">[בדיקה] הודעת בדיקה. לא נשלחה לאף לומד.</p>' : ''
  return `<div dir="rtl" style="text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#123;max-width:560px;margin:0 auto;padding:18px;">
${head}<div style="border-top:3px solid #D4AF37;padding-top:16px;">${esc(mail.text).replace(/\n/g, '<br>')}</div>
<p style="margin:26px 0;"><a href="${CONTINUE_LINK}" style="background:#003B46;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:bold;">${esc(mail.cta)}</a></p>
<p style="font-size:12px;color:#667;margin-top:28px;line-height:1.6;">בית המטפלים · פורטל הלמידה<br>
קיבלת את המייל כי נרשמת לפורטל. <a href="${unsub}" style="color:#667;">להפסקת המיילים האלה</a></p>
</div>`
}

function buildText(mail: Mail, unsub: string, isTest: boolean): string {
  return (isTest ? '[בדיקה] הודעת בדיקה. לא נשלחה לאף לומד.\n\n' : '') +
    `${mail.text}\n\n${mail.cta}: ${CONTINUE_LINK}\n\n` +
    `להפסקת המיילים האלה: ${unsub}`
}

// POST form-encoded: no URL-length ceiling (GET broke the monthly email at ~7.4K chars).
async function sendEmail(to: string, subject: string, text: string, html: string):
    Promise<{ ok: boolean; error?: string }> {
  if (!MAILER_URL || !MAILER_TOKEN) return { ok: false, error: 'mailer_not_configured' }
  try {
    const res = await fetch(MAILER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: MAILER_TOKEN, action: 'send', to, subject, body: text, html, name: 'בית המטפלים' }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    })
    const raw = await res.text()
    let r: { success?: boolean; error?: string } = {}
    try { r = JSON.parse(raw) } catch { /* non-JSON = Apps Script error page */ }
    if (res.ok && r.success === true) return { ok: true }
    return { ok: false, error: (r.error || `http_${res.status}:${raw.slice(0, 100)}`) }
  } catch (_) {
    return { ok: false, error: 'mailer_unreachable' }
  }
}

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Guard 1 — role claim (gateway verify_jwt has already checked the signature).
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  let role = ''
  if (token && token === SUPABASE_SERVICE_ROLE_KEY) role = 'service_role'
  else {
    try { role = String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || '') }
    catch (_) { role = '' }
  }
  if (role !== 'service_role') return json({ error: 'forbidden' }, 403)
  if (!UNSUB_SECRET) return json({ error: 'unsubscribe secret missing' }, 503)

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') { try { body = await req.json() } catch (_) { /* empty ok */ } }

  // Test path: one marked sample to a given address. Touches no queue rows.
  if (body.test_email) {
    const to = validEmail(String(body.test_email))
    if (!to) return json({ error: 'invalid email' }, 400)
    const kind = body.test_kind === 'inactive' ? 'inactive' : 'welcome'
    const g = genderOf(String(body.test_gender || ''))
    const mail = buildMail(kind, String(body.test_name || 'הילל'), g, Number(body.test_lessons ?? (kind === 'inactive' ? 3 : 0)))
    const unsub = await unsubLink(String(body.test_user_id || '00000000-0000-0000-0000-000000000000'))
    const r = await sendEmail(to, '[בדיקה] ' + mail.subject, buildText(mail, unsub, true), buildHtml(mail, unsub, true))
    return json({ test: true, kind, to, ...r })
  }

  // Guard 2 — kill switch.
  const { data: s } = await db.from('learner_email_settings').select('*').eq('id', true).single()
  if (!s?.enabled) return json({ skipped: 'disabled' })

  // Guard 3 — send window. Enqueue still runs, rows wait for morning.
  const { data: enq, error: enqErr } = await db.rpc('learner_emails_enqueue')
  if (enqErr) return json({ error: enqErr.message }, 500)
  const hour = israelHour()
  if (hour < (s.send_hour_start ?? 9) || hour >= (s.send_hour_end ?? 20)) {
    return json({ enqueued: enq, skipped: 'outside_send_window', israel_hour: hour })
  }

  const { data: rows, error } = await db.rpc('learner_emails_batch', { p_limit: BATCH_SIZE })
  if (error) return json({ error: error.message }, 500)
  if (!rows?.length) return json({ enqueued: enq, processed: 0 })

  const dryRun = body.dry_run === true
  let sent = 0, skipped = 0, failed = 0
  const log: unknown[] = []

  for (const row of rows as Array<Record<string, unknown>>) {
    const id = String(row.id)
    const to = validEmail(String(row.email || ''))
    if (row.still_relevant !== true || !to) {
      const reason = !to ? 'no_email' : (row.kind === 'inactive' ? 'not_relevant_anymore' : 'excluded')
      if (!dryRun) await db.from('learner_emails').update({ status: 'skipped', skip_reason: reason }).eq('id', id)
      skipped++; log.push({ id, skipped: reason }); continue
    }

    const mail = buildMail(String(row.kind), firstName(String(row.full_name || '')),
                           genderOf(String(row.gender || '')), Number(row.lessons_done || 0))
    if (dryRun) { log.push({ id, would_send_to: to, kind: row.kind, subject: mail.subject }); continue }

    const unsub = await unsubLink(String(row.user_id))
    const r = await sendEmail(to, mail.subject, buildText(mail, unsub, false), buildHtml(mail, unsub, false))
    if (r.ok) {
      await db.from('learner_emails').update({ status: 'sent', sent_at: new Date().toISOString(), provider: 'gmail_portal' }).eq('id', id)
      sent++; log.push({ id, sent: true })
    } else {
      const attempts = Number(row.attempts ?? 0) + 1
      await db.from('learner_emails').update({
        attempts, last_error: String(r.error).slice(0, 500),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      }).eq('id', id)
      failed++; log.push({ id, error: r.error })
    }
    await sleep(SEND_DELAY_MS)
  }

  return json({ enqueued: enq, processed: rows.length, sent, skipped, failed, dry_run: dryRun, log })
})
