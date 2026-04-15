// ============================================================================
// Edge Function: meta-capi
// Server-side Meta Conversions API handler.
// Mirrors browser-pixel events with a reliable server signal so the Meta
// algorithm can optimize on lead quality (QualifiedLead = questionnaire done).
// Events are deduplicated with browser pixel via shared event_id.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || ''
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') || ''
const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE') || ''
const META_API_VERSION = 'v21.0'

if (!META_ACCESS_TOKEN) {
  console.error('CRITICAL: META_ACCESS_TOKEN not configured — CAPI is DISABLED')
}
if (!META_PIXEL_ID) {
  console.error('CRITICAL: META_PIXEL_ID not configured — CAPI is DISABLED')
}

// Whitelisted events — prevents abuse of our function to spam Meta
const ALLOWED_EVENTS = new Set([
  'CompleteRegistration',
  'Lead',
  'QualifiedLead',
  'SubmitApplication',
  'ViewContent',
  'StartTrial',
])

// Whitelisted origins (matches submit-lead)
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

// ---------------------------------------------------------------------------
// SHA-256 via Web Crypto (built into Deno, no imports needed)
// ---------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// Meta PII normalization
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
// ---------------------------------------------------------------------------
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function normalizePhone(raw: string): string {
  // Digits only
  let digits = raw.replace(/\D/g, '')
  // Israeli numbers: "054..." or "54..." → prepend 972
  if (digits.startsWith('0')) {
    digits = '972' + digits.slice(1)
  } else if (digits.startsWith('5') && digits.length === 9) {
    digits = '972' + digits
  }
  return digits
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    // Strip punctuation and any non-letter chars (preserve Unicode letters)
    .replace(/[^\p{L}]/gu, '')
}

async function hashEmail(raw?: string): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null
  const norm = normalizeEmail(raw)
  if (!norm) return null
  return await sha256Hex(norm)
}

async function hashPhone(raw?: string): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null
  const norm = normalizePhone(raw)
  if (!norm) return null
  return await sha256Hex(norm)
}

async function hashName(raw?: string): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null
  const norm = normalizeName(raw)
  if (!norm) return null
  return await sha256Hex(norm)
}

// Strip undefined/null fields so Meta doesn't reject the payload
function pruneObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v
    }
  }
  return out as Partial<T>
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
    return new Response(
      JSON.stringify({ error: 'CAPI not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const event_name = String(body.event_name || '')
  const event_id = String(body.event_id || '')
  const event_source_url = String(body.event_source_url || '')
  const user_data = (body.user_data || {}) as Record<string, string | undefined>
  const custom_data = (body.custom_data || {}) as Record<string, unknown>

  if (!event_name || !ALLOWED_EVENTS.has(event_name)) {
    return new Response(
      JSON.stringify({ error: `Event not allowed: ${event_name}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!event_id) {
    return new Response(
      JSON.stringify({ error: 'Missing event_id (required for browser↔server deduplication)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Extract IP + UA from the request itself — more reliable than trusting the client
  const client_user_agent = req.headers.get('user-agent') || undefined
  const client_ip_address =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined

  try {
    // Hash PII in parallel
    const [em, ph, fn, ln] = await Promise.all([
      hashEmail(user_data.email),
      hashPhone(user_data.phone),
      hashName(user_data.first_name),
      hashName(user_data.last_name),
    ])

    // Build user_data block — arrays per Meta spec, pruned of nulls
    const rawUserData: Record<string, unknown> = {
      em: em ? [em] : undefined,
      ph: ph ? [ph] : undefined,
      fn: fn ? [fn] : undefined,
      ln: ln ? [ln] : undefined,
      client_user_agent,
      client_ip_address,
      fbc: user_data.fbc || undefined,
      fbp: user_data.fbp || undefined,
      external_id: user_data.external_id || undefined,
    }
    const cleanUserData = pruneObject(rawUserData)

    const metaEvent: Record<string, unknown> = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url: event_source_url || undefined,
      action_source: 'website',
      user_data: cleanUserData,
      custom_data,
    }

    const metaPayload: Record<string, unknown> = {
      data: [pruneObject(metaEvent)],
    }
    if (META_TEST_EVENT_CODE) {
      metaPayload.test_event_code = META_TEST_EVENT_CODE
    }

    // POST to Meta Graph API
    const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`
    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload),
    })

    const metaJson = await metaRes.json().catch(() => ({}))
    const metaOk = metaRes.ok && typeof metaJson.events_received === 'number'

    // Structured logging — visible in `supabase functions logs meta-capi`
    console.log(
      JSON.stringify({
        level: metaOk ? 'info' : 'error',
        event_name,
        event_id,
        events_received: metaJson.events_received ?? 0,
        fbtrace_id: metaJson.fbtrace_id ?? null,
        meta_error: metaJson.error?.message ?? null,
        meta_error_code: metaJson.error?.code ?? null,
        test_mode: Boolean(META_TEST_EVENT_CODE),
      }),
    )

    if (!metaOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: metaJson.error?.message || 'Meta rejected event',
          fbtrace_id: metaJson.fbtrace_id ?? null,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_received: metaJson.events_received,
        fbtrace_id: metaJson.fbtrace_id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('meta-capi error:', err instanceof Error ? err.message : err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
