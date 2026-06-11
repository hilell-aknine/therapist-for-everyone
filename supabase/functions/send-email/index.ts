// ============================================================================
// Edge Function: send-email
// Sends a branded Hebrew (RTL) email. Admin-JWT gated (same gate as
// admin-delete-user) — the delivery credentials never reach the browser.
//
// Accepts: { to, subject, message }
//   to      — recipient email address
//   subject — plain text, max 200 chars
//   message — plain text, max 2000 chars (newlines become <br>)
//
// Delivery (provider chain):
//   1. Resend (if RESEND_API_KEY secret is set) — sends from the verified
//      domain (no-reply@therapist-home.com), replies go to REPLY_TO.
//   2. Gmail Apps Script web app — automatic fallback if Resend is not
//      configured or returns an error (e.g. domain not verified yet).
//      GET only — POST to Apps Script breaks on Google's redirect
//      (documented project lesson). Action contract: action=send + html
//      param (see hindsight 2026-06-11).
//
// Quota awareness: Resend free tier = 3,000/month, 100/day. Gmail fallback
// ≈ 100 recipients/day, ~10 sends/min. CRM/transactional use — NOT broadcast.
// Every send is audited in crm_activity_log with the provider used.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_API_URL = Deno.env.get('GMAIL_API_URL')!
const GMAIL_API_TOKEN = Deno.env.get('GMAIL_API_TOKEN')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'בית המטפלים <no-reply@therapist-home.com>'
const REPLY_TO = Deno.env.get('EMAIL_REPLY_TO') || 'htjewelry.a474@gmail.com'

const SENDER_NAME = 'בית המטפלים'
const MAX_SUBJECT = 200
const MAX_MESSAGE = 2000

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Lean branded wrapper — kept small on purpose (the Gmail fallback carries the
// whole email in a GET URL). Brand: deep-petrol header, gold accent.
function buildBrandedHtml(message: string): string {
  const body = escapeHtml(message).replace(/\r?\n/g, '<br>')
  return `<div dir="rtl" style="background:#E8F1F2;padding:24px 12px;font-family:'Heebo',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d7e3e5;">
<div style="background:#003B46;padding:18px 24px;border-bottom:3px solid #D4AF37;">
<span style="color:#E8F1F2;font-size:20px;font-weight:700;">בית המטפלים</span>
</div>
<div style="padding:24px;color:#1f2d30;font-size:16px;line-height:1.7;">${body}</div>
<div style="padding:14px 24px;background:#f4f8f9;color:#5b7177;font-size:12px;border-top:1px solid #e2ecee;">
נשלח מצוות בית המטפלים · <a href="https://www.therapist-home.com" style="color:#00606B;">www.therapist-home.com</a>
</div>
</div>
</div>`
}

async function sendViaResend(to: string, subject: string, message: string, html: string):
    Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        text: message,
        html,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) return { ok: true }
    const detail = await res.text()
    console.error('Resend send failed:', res.status, detail.slice(0, 300))
    return { ok: false, error: `resend_${res.status}` }
  } catch (e) {
    console.error('Resend send threw:', e)
    return { ok: false, error: 'resend_unreachable' }
  }
}

async function sendViaGmail(to: string, subject: string, message: string, html: string):
    Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    token: GMAIL_API_TOKEN,
    action: 'send',
    to,
    subject,
    body: message,
    html,
    name: SENDER_NAME,
  })
  try {
    const res = await fetch(`${GMAIL_API_URL}?${params.toString()}`, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    })
    const text = await res.text()
    let result: { success?: boolean; error?: string } = {}
    try { result = JSON.parse(text) } catch { /* non-JSON = Apps Script error page */ }
    if (res.ok && result.success) return { ok: true }
    console.error('Gmail Apps Script send failed:', res.status, text.slice(0, 300))
    return { ok: false, error: result.error || 'gmail_send_failed' }
  } catch (e) {
    console.error('Gmail send threw:', e)
    return { ok: false, error: 'gmail_unreachable' }
  }
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors)

  try {
    // ── Caller must be a logged-in admin ──
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401, cors)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await db.auth.getUser(token)
    if (authError || !caller) return jsonResponse({ error: 'invalid_token' }, 401, cors)

    const { data: callerProfile } = await db
      .from('profiles')
      .select('role, email, phone')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.role !== 'admin') return jsonResponse({ error: 'admin_only' }, 403, cors)

    // ── Validate input ──
    const body = await req.json().catch(() => ({}))
    const to = typeof body?.to === 'string' ? body.to.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return jsonResponse({ error: 'invalid_to' }, 400, cors)
    if (!subject || subject.length > MAX_SUBJECT) return jsonResponse({ error: 'invalid_subject' }, 400, cors)
    if (!message || message.length > MAX_MESSAGE) return jsonResponse({ error: 'invalid_message' }, 400, cors)

    // ── Send: Resend first (when configured), Gmail as automatic fallback ──
    const html = buildBrandedHtml(message)
    let provider = ''
    let sendResult: { ok: boolean; error?: string } = { ok: false }

    if (RESEND_API_KEY) {
      provider = 'resend'
      sendResult = await sendViaResend(to, subject, message, html)
    }
    if (!sendResult.ok) {
      const resendError = sendResult.error
      provider = 'gmail'
      sendResult = await sendViaGmail(to, subject, message, html)
      if (sendResult.ok && resendError) {
        console.warn(`Resend failed (${resendError}) — delivered via Gmail fallback`)
      }
    }

    if (!sendResult.ok) {
      return jsonResponse({ success: false, error: sendResult.error || 'send_failed' }, 502, cors)
    }

    // ── Audit ──
    await db.from('crm_activity_log').insert({
      actor_phone: callerProfile?.phone || caller.email || 'admin-dashboard',
      actor_name: callerProfile?.email || caller.email || null,
      action: 'admin_send_email',
      entity_type: 'email',
      entity_id: null,
      details: { to, subject, provider },
    })

    return jsonResponse({ success: true, to, subject, provider }, 200, cors)
  } catch (e) {
    console.error('send-email unhandled error:', e)
    return jsonResponse({ error: 'internal_error', detail: e instanceof Error ? e.message : String(e) }, 500, cors)
  }
})
