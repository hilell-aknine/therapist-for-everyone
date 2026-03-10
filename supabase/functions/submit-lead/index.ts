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

// When TURNSTILE_SECRET_KEY is empty, Turnstile verification is skipped.
// This allows forms to work before Turnstile is configured.
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
    const { table, data, turnstileToken } = body

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

    // ---- Insert via service role (bypasses RLS) ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { error: insertError } = await supabase
      .from(table)
      .insert(cleanData)

    if (insertError) {
      console.error(`Insert error [${table}]:`, insertError.message)
      return new Response(
        JSON.stringify({ error: 'שגיאה בשמירת הנתונים. נסה שוב.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
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
