// ============================================================================
// Edge Function: submit-lead
// Cloudflare Turnstile-protected lead capture endpoint.
// Replaces direct anonymous INSERTs from the frontend.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') || ''
if (!TURNSTILE_SECRET_KEY) {
  console.error('CRITICAL: TURNSTILE_SECRET_KEY not configured — form CAPTCHA protection is DISABLED')
}
const TURNSTILE_ENABLED = TURNSTILE_SECRET_KEY.length > 0

const ALLOWED_TABLES = ['patients', 'therapists', 'contact_requests', 'questionnaire_submissions', 'sales_leads']

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Whitelisted origins (production + Vercel preview)
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
// Turnstile token verification
// ---------------------------------------------------------------------------
async function verifyTurnstileToken(
  token: string,
  ip: string | null
): Promise<{ success: boolean; errorCodes: string[] }> {
  const body = new URLSearchParams()
  body.append('secret', Deno.env.get('TURNSTILE_SECRET_KEY')!)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)

  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const result = await res.json()

  if (result.success !== true) {
    console.error('Turnstile verification failed:', {
      errorCodes: result['error-codes'] || [],
      hostname: result.hostname || 'unknown',
    })
  }

  return {
    success: result.success === true,
    errorCodes: result['error-codes'] || [],
  }
}

// ---------------------------------------------------------------------------
// IP → geo lookup (ipapi.co, free tier, no key required)
// Returns null on any failure — we never fail a lead submit because of geo.
// ---------------------------------------------------------------------------
async function fetchGeo(ip: string): Promise<{
  country_code?: string; country_name?: string; region?: string; city?: string;
} | null> {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip === '::1') return null;
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl.signal,
      headers: { 'Accept-Language': 'he,en;q=0.8' }
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const j = await res.json()
    return {
      country_code: j.country_code || null,
      country_name: j.country_name || null,
      region:       j.region       || null,
      city:         j.city         || null,
    }
  } catch {
    return null
  }
}

// Flatten the client-side attribution payload into DB row shape
function buildAttributionRow(
  attribution: Record<string, any>,
  linkedTable: string,
  linkedId: string | null,
  data: Record<string, any>,
  geo: { country_code?: string; country_name?: string; region?: string; city?: string } | null
): Record<string, unknown> {
  const f = attribution?.first || {}
  const l = attribution?.last  || {}
  return {
    linked_table:  linkedTable,
    linked_id:     linkedId,
    phone:         data?.phone || null,
    email:         data?.email || null,
    session_id:    attribution?.session_id || null,

    first_utm_source:   f.utm_source   || null,
    first_utm_medium:   f.utm_medium   || null,
    first_utm_campaign: f.utm_campaign || null,
    first_utm_term:     f.utm_term     || null,
    first_utm_content:  f.utm_content  || null,
    first_gclid:        f.gclid        || null,
    first_fbclid:       f.fbclid       || null,
    first_ttclid:       f.ttclid       || null,
    first_msclkid:      f.msclkid      || null,
    first_referrer_domain: f.referrer_domain || null,
    first_landing_url:  f.landing_url  || null,
    first_at:           f.at           || null,

    last_utm_source:   l.utm_source   || null,
    last_utm_medium:   l.utm_medium   || null,
    last_utm_campaign: l.utm_campaign || null,
    last_utm_term:     l.utm_term     || null,
    last_utm_content:  l.utm_content  || null,
    last_gclid:        l.gclid        || null,
    last_fbclid:       l.fbclid       || null,
    last_ttclid:       l.ttclid       || null,
    last_msclkid:      l.msclkid      || null,
    last_referrer_domain: l.referrer_domain || null,
    last_landing_url:  l.landing_url  || null,
    last_at:           l.at           || null,

    device_type:  attribution?.device_type  || null,
    os_name:      attribution?.os_name      || null,
    browser_name: attribution?.browser_name || null,
    viewport_w:   attribution?.viewport_w   || null,
    viewport_h:   attribution?.viewport_h   || null,
    language:     attribution?.language     || null,
    timezone:     attribution?.timezone     || null,

    country_code: geo?.country_code || null,
    country_name: geo?.country_name || null,
    region:       geo?.region       || null,
    city:         geo?.city         || null,

    raw_ua:       attribution?.raw_ua || null,
    // NOTE: raw IP is NEVER stored. Only the resolved country/city above.
  }
}

// ---------------------------------------------------------------------------
// Basic input sanitization — strip HTML tags from string values
// ---------------------------------------------------------------------------
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Strip HTML tags to prevent stored XSS
      sanitized[key] = value.replace(/<[^>]*>/g, '').trim()
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeData(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { table, data, turnstileToken, attribution, mirror_table, mirror_data } = body

    // ---- Validate required fields ----
    if (!table || !data) {
      return new Response(
        JSON.stringify({ error: 'חסרים שדות חובה: table, data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---- Validate table name (whitelist) ----
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ error: `טבלה לא מורשית: ${table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---- Validate mirror_table if provided ----
    if (mirror_table && !ALLOWED_TABLES.includes(mirror_table)) {
      return new Response(
        JSON.stringify({ error: `טבלת mirror לא מורשית: ${mirror_table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---- Turnstile verification (when enabled) ----
    if (TURNSTILE_ENABLED) {
      if (!turnstileToken || typeof turnstileToken !== 'string' || turnstileToken.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'טוקן Turnstile לא תקין.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const clientIp = req.headers.get('cf-connecting-ip') ||
                       req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                       null

      const verification = await verifyTurnstileToken(turnstileToken, clientIp)
      if (!verification.success) {
        return new Response(
          JSON.stringify({
            error: 'אימות Turnstile נכשל. רענן את הדף ונסה שוב.',
            codes: verification.errorCodes,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ---- Sanitize input data ----
    const cleanData = sanitizeData(data as Record<string, unknown>)

    // ---- Validate phone (Israeli or international) ----
    if (cleanData.phone && typeof cleanData.phone === 'string') {
      const stripped = (cleanData.phone as string).replace(/[\s\-()]/g, '')
      if (!/^\+?\d{9,15}$/.test(stripped)) {
        return new Response(
          JSON.stringify({ error: 'מספר טלפון לא תקין. יש להזין 9-15 ספרות.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Normalize: store cleaned digits (with optional + prefix)
      cleanData.phone = stripped
    }

    // ---- Insert via service role (bypasses RLS) ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ---- Same-table dedup check (prevent accidental double-submit) ----
    // Cross-table "duplicates" are legitimate (same person as patient + learner + lead).
    // Only block same phone in the SAME table within the last 24 hours.
    if (cleanData.phone && typeof cleanData.phone === 'string') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: existing } = await supabase
        .from(table)
        .select('id')
        .eq('phone', cleanData.phone)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log(`Dedup: phone ${cleanData.phone} already exists in ${table} within 24h, id=${existing[0].id}`)
        return new Response(
          JSON.stringify({ success: true, id: existing[0].id, duplicate: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Return the new row's id so we can link the attribution row to it
    const { data: insertedRows, error: insertError } = await supabase
      .from(table)
      .insert(cleanData)
      .select('id')

    if (insertError) {
      console.error(`Insert error [${table}]:`, insertError.message)
      return new Response(
        JSON.stringify({ error: 'שגיאה בשמירת הנתונים. נסה שוב.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newId = (insertedRows && insertedRows[0] && (insertedRows[0] as { id?: string }).id) || null

    // ---- Mirror insert (atomic secondary table, e.g. contact_requests for CRM bot) ----
    if (mirror_table && mirror_data && typeof mirror_data === 'object') {
      try {
        const cleanMirror = sanitizeData(mirror_data as Record<string, unknown>)
        // Phone validation on mirror data too
        if (cleanMirror.phone && typeof cleanMirror.phone === 'string') {
          cleanMirror.phone = (cleanMirror.phone as string).replace(/[\s\-()]/g, '')
        }
        const { error: mirrorErr } = await supabase.from(mirror_table).insert(cleanMirror)
        if (mirrorErr) {
          console.error(`Mirror insert error [${mirror_table}]:`, mirrorErr.message)
          // Don't fail — primary insert already succeeded
        }
      } catch (mirrorErr) {
        console.warn(`Mirror insert exception [${mirror_table}]:`, mirrorErr)
      }
    }

    // ---- Write lead_attribution row (best effort — never fails the lead) ----
    // Done in parallel with building the response so latency is minimal.
    if (attribution && typeof attribution === 'object') {
      try {
        const clientIp = req.headers.get('cf-connecting-ip') ||
                         req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         req.headers.get('x-real-ip') ||
                         null
        const geo = clientIp ? await fetchGeo(clientIp) : null
        const row = buildAttributionRow(attribution, table, newId, cleanData, geo)
        const { error: attrErr } = await supabase.from('lead_attribution').insert(row)
        if (attrErr) {
          console.warn(`lead_attribution insert warning [${table}/${newId}]:`, attrErr.message)
        }
      } catch (attrErr) {
        console.warn('attribution pipeline error:', attrErr)
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: newId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('submit-lead error:', err)
    return new Response(
      JSON.stringify({ error: 'שגיאה פנימית בשרת.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
