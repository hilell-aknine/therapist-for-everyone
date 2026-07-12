// ============================================================================
// Edge Function: submit-lead (v2 — lead_intake unified table)
// Cloudflare Turnstile-protected lead capture endpoint.
//
// Accepts BOTH request shapes:
//   New:    { intake_type, core, payload, pipeline? }
//   Legacy: { table: 'contact_requests'|'patients'|..., data: {...} }
// Legacy shape is auto-translated → writes to public.lead_intake.
//
// Replaces the v1 submit-lead which routed to 5 separate tables (3 of which
// are now _archive_*). See docs/specs/lead-intake-v1/00-overview.md.
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
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// ===== intake_type vocabulary (matches lead_intake CHECK constraint) =========
const ALLOWED_INTAKE_TYPES = [
  'portal_signup',
  'contact_form',
  'patient_application',
  'therapist_application',
  'sales_inquiry',
] as const
type IntakeType = typeof ALLOWED_INTAKE_TYPES[number]

// ===== Legacy table → intake_type translation (BC layer) ====================
// Lets old frontend code keep submitting `{ table: 'contact_requests', ... }`
// while we migrate it. Remove after 04-frontend-diffs.md checklist is 100% done.
const LEGACY_TABLE_TO_INTAKE: Record<string, IntakeType> = {
  contact_requests:          'contact_form',
  portal_questionnaires:     'portal_signup',
  patients:                  'patient_application',
  therapists:                'therapist_application',
  sales_leads:               'sales_inquiry',
  questionnaire_submissions: 'sales_inquiry',
}

// ===== Per-type field allow-lists ============================================
const CORE_FIELDS = ['full_name', 'phone', 'email', 'city'] as const
type CoreField = typeof CORE_FIELDS[number]
const CORE_FIELD_SET = new Set<string>(CORE_FIELDS as readonly string[])

const PAYLOAD_SCHEMA: Record<IntakeType, string[]> = {
  portal_signup: [
    'gender', 'birth_date', 'occupation',
    'why_nlp', 'study_time', 'digital_challenge', 'knew_ram',
    'motivation_tip', 'main_challenge', 'vision_one_year', 'how_found',
  ],
  contact_form: [
    'message', 'request_type', 'data',
  ],
  patient_application: [
    'birth_date', 'gender', 'marital_status', 'occupation',
    'therapy_type', 'therapist_gender_preference',
    'main_concern', 'health_declaration', 'military_role',
    'military_service', 'referral_source', 'session_style',
    'is_minor', 'parent_consent',
    'photo_url', 'photo_base64', 'social_link',
    'questionnaire',
    'signature_data', 'legal_consent_date',
    'age_confirmed', 'health_declaration_confirmed', 'terms_confirmed',
    'truth_confirmed', 'commitment_confirmed', 'id_verified',
  ],
  therapist_application: [
    'birth_date', 'gender', 'specialization', 'specializations',
    'experience_years', 'license_number', 'education_details',
    'academic_degrees', 'therapy_methods', 'target_populations',
    'works_online', 'works_in_person', 'available_hours_per_week',
    'questionnaire', 'signature_data', 'agreement_signature', 'social_link',
    'age_confirmed', 'terms_confirmed', 'documents_verified',
  ],
  sales_inquiry: [
    'occupation', 'questionnaire_id',
  ],
}

// ===== CORS ==================================================================
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

// ===== Turnstile =============================================================
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

// ===== IP → geo (best-effort, never blocks the lead) =========================
async function fetchGeo(ip: string): Promise<{
  country_code?: string; country_name?: string; region?: string; city?: string;
} | null> {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip === '::1') return null
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

// ===== Attribution row builder ==============================================
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
  }
}

// ===== Input sanitization ===================================================
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = value.replace(/<[^>]*>/g, '').trim()
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeData(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ===== Request normalization (legacy → new shape) ===========================
type NormalizedRequest = {
  intake_type: IntakeType
  core: Record<string, unknown>
  payload: Record<string, unknown>
  pipeline?: { status?: string; pipeline_stage?: string }
}

function normalizeRequest(body: any): NormalizedRequest {
  // New shape
  if (body.intake_type) {
    return {
      intake_type: body.intake_type,
      core:        body.core || {},
      payload:     body.payload || {},
      pipeline:    body.pipeline,
    }
  }

  // Legacy shape: { table: 'contact_requests', data: {...} }
  if (body.table && LEGACY_TABLE_TO_INTAKE[body.table]) {
    const intakeType = LEGACY_TABLE_TO_INTAKE[body.table]
    const data = body.data || {}
    const core: Record<string, unknown> = {}
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (CORE_FIELD_SET.has(k)) core[k] = v
      else payload[k] = v
    }
    // contact_requests sometimes sends `name` instead of `full_name`
    if (!core.full_name && (data as any).name) core.full_name = (data as any).name
    return { intake_type: intakeType, core, payload }
  }

  throw new Error('Request missing intake_type (or legacy table) field')
}

// ===== Whitelist payload to schema-allowed keys =============================
function whitelistPayload(intakeType: IntakeType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(PAYLOAD_SCHEMA[intakeType])
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.has(k)) result[k] = v
    // silently drop unknown keys
  }
  return result
}

// ============================================================================
// Handler
// ============================================================================
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const body = await req.json()
    const { turnstileToken, attribution } = body

    // ---- Normalize request shape ----
    let norm: NormalizedRequest
    try {
      norm = normalizeRequest(body)
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ---- Validate intake_type ----
    if (!ALLOWED_INTAKE_TYPES.includes(norm.intake_type as IntakeType)) {
      return new Response(JSON.stringify({ error: `intake_type לא מורשה: ${norm.intake_type}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ---- Turnstile ----
    if (TURNSTILE_ENABLED) {
      if (!turnstileToken || typeof turnstileToken !== 'string' || turnstileToken.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'טוקן Turnstile לא תקין.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const clientIp = req.headers.get('cf-connecting-ip') ||
                       req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      const verification = await verifyTurnstileToken(turnstileToken, clientIp)
      if (!verification.success) {
        return new Response(JSON.stringify({
          error: 'אימות Turnstile נכשל. רענן את הדף ונסה שוב.',
          codes: verification.errorCodes,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ---- Sanitize ----
    const cleanCore    = sanitizeData(norm.core)    as Record<string, unknown>
    const cleanPayload = sanitizeData(whitelistPayload(norm.intake_type, norm.payload)) as Record<string, unknown>

    // ---- Phone normalization (Israeli or international, 9-15 digits) ----
    if (cleanCore.phone && typeof cleanCore.phone === 'string') {
      const stripped = (cleanCore.phone as string).replace(/[\s\-()]/g, '')
      if (!/^\+?\d{9,15}$/.test(stripped)) {
        return new Response(JSON.stringify({ error: 'מספר טלפון לא תקין. יש להזין 9-15 ספרות.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      cleanCore.phone = stripped
    }

    // ---- UTM from attribution.last (consolidated into top-level cols) ----
    const last = (attribution?.last && typeof attribution.last === 'object') ? attribution.last : {}
    const utmCols = {
      utm_source:      last.utm_source      || null,
      utm_medium:      last.utm_medium      || null,
      utm_campaign:    last.utm_campaign    || null,
      utm_term:        last.utm_term        || null,
      utm_content:     last.utm_content     || null,
      referrer_domain: last.referrer_domain || null,
      landing_url:     last.landing_url     || null,
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } })

    // ---- Dedup: same intake_type + phone in last 24h returns existing row ----
    if (cleanCore.phone) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: dup } = await supabase
        .from('lead_intake')
        .select('id')
        .eq('intake_type', norm.intake_type)
        .eq('phone', cleanCore.phone as string)
        .gte('created_at', since)
        .limit(1)
      if (dup && dup.length > 0) {
        return new Response(JSON.stringify({ success: true, id: dup[0].id, duplicate: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ---- Insert into lead_intake ----
    const row: Record<string, unknown> = {
      intake_type:   norm.intake_type,
      intake_source: 'website',
      ...cleanCore,
      payload: cleanPayload,
      payload_version: 1,
      status: norm.pipeline?.status || 'new',
      pipeline_stage: norm.pipeline?.pipeline_stage || null,
      ...utmCols,
    }

    const { data: inserted, error } = await supabase
      .from('lead_intake')
      .insert(row)
      .select('id')

    if (error) {
      console.error('lead_intake insert error:', error.message, error.details)
      return new Response(JSON.stringify({ error: `שגיאה בשמירה: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const newId = inserted?.[0]?.id || null

    // ---- lead_attribution (best-effort, never fails the lead) ----
    if (attribution && typeof attribution === 'object') {
      try {
        const clientIp = req.headers.get('cf-connecting-ip') || null
        const geo = clientIp ? await fetchGeo(clientIp) : null
        const attrRow = buildAttributionRow(attribution, 'lead_intake', newId, cleanCore, geo)
        await supabase.from('lead_attribution').insert(attrRow)
      } catch (e) {
        console.warn('attribution write skipped:', e)
      }
    }

    return new Response(JSON.stringify({ success: true, id: newId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e: any) {
    console.error('submit-lead unhandled error:', e?.message || e)
    return new Response(JSON.stringify({ error: 'שגיאה כללית בשרת.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
