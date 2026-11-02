// ============================================================================
// Edge Function: email-unsubscribe   (deployed with --no-verify-jwt)
// Called by pages/unsubscribe.html with { u, s } from the link in every learner
// email. `s` is an HMAC of the user id (EMAIL_UNSUB_SECRET, shared with
// learner-email), so a link cannot be forged for someone else's account.
// Writes only learner_email_optouts. Idempotent.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UNSUB_SECRET = Deno.env.get('EMAIL_UNSUB_SECRET') || ''

const ALLOWED = ['https://www.therapist-home.com', 'https://therapist-home.com']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0],
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function sign(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(UNSUB_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId)))
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: h })
  if (!UNSUB_SECRET) return new Response(JSON.stringify({ ok: false, error: 'not_configured' }), { status: 503, headers: h })

  let body: { u?: string; s?: string } = {}
  try { body = await req.json() } catch (_) { /* fallthrough */ }
  const u = String(body.u || '')
  const s = String(body.s || '').toLowerCase()
  if (!UUID.test(u) || !/^[0-9a-f]{32}$/.test(s) || !safeEqual(s, await sign(u))) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_link' }), { status: 400, headers: h })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { error } = await db.rpc('learner_email_optout', { p_user: u, p_source: 'unsubscribe_link' })
  if (error) {
    // FK violation = the account no longer exists. Nothing left to mail, so say done.
    if (String(error.code) === '23503') return new Response(JSON.stringify({ ok: true }), { headers: h })
    return new Response(JSON.stringify({ ok: false, error: 'server' }), { status: 500, headers: h })
  }
  return new Response(JSON.stringify({ ok: true }), { headers: h })
})
