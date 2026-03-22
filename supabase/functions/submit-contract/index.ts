// ============================================================================
// Edge Function: submit-contract
// Secure contract signing endpoint with Turnstile + subscription validation.
// Replaces direct anonymous INSERT into signed_contracts.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') || ''
const TURNSTILE_ENABLED = TURNSTILE_SECRET_KEY.length > 0
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

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

async function verifyTurnstileToken(
  token: string,
  ip: string | null
): Promise<{ success: boolean; errorCodes: string[] }> {
  const body = new URLSearchParams()
  body.append('secret', TURNSTILE_SECRET_KEY)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)

  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const result = await res.json()
  return {
    success: result.success === true,
    errorCodes: result['error-codes'] || [],
  }
}

function sanitizeString(val: string): string {
  return val.replace(/<[^>]*>/g, '').trim()
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const {
      subscription_id,
      signer_name,
      signer_id_number,
      signer_phone,
      signature_data,
      turnstileToken,
    } = body

    // ---- Validate required fields ----
    if (!signer_name || !signer_id_number || !signer_phone || !signature_data) {
      return new Response(
        JSON.stringify({ error: 'חסרים שדות חובה.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---- Turnstile verification ----
    if (TURNSTILE_ENABLED) {
      if (!turnstileToken || typeof turnstileToken !== 'string' || turnstileToken.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'טוקן אימות לא תקין.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const clientIp = req.headers.get('cf-connecting-ip') ||
                       req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                       null

      const verification = await verifyTurnstileToken(turnstileToken, clientIp)
      if (!verification.success) {
        return new Response(
          JSON.stringify({ error: 'אימות נכשל. רענן את הדף ונסה שוב.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ---- Init Supabase (service role) ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ---- Validate subscription_id exists (if provided) ----
    if (subscription_id) {
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('id', subscription_id)
        .single()

      if (subErr || !sub) {
        return new Response(
          JSON.stringify({ error: 'קישור למנוי לא תקין.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ---- Get client IP ----
    const clientIp = req.headers.get('cf-connecting-ip') ||
                     req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     null

    // ---- Insert signed contract ----
    const { data: saved, error: insertError } = await supabase
      .from('signed_contracts')
      .insert({
        subscription_id: subscription_id || null,
        signer_name: sanitizeString(signer_name),
        signer_id_number: sanitizeString(signer_id_number),
        signer_phone: sanitizeString(signer_phone),
        signature_data: signature_data,
        contract_version: '1.0',
        ip_address: clientIp,
        signed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Contract insert error:', insertError.message)
      return new Response(
        JSON.stringify({ error: 'שגיאה בשמירת החוזה. נסה שוב.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---- Link contract to subscription ----
    if (subscription_id && saved?.id) {
      const signerNameClean = sanitizeString(signer_name)
      const signerIdClean = sanitizeString(signer_id_number)
      const dateStr = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem' }).format(new Date())

      await supabase
        .from('subscriptions')
        .update({
          contract_url: `signed:${saved.id}`,
          notes: `חוזה נחתם ע״י ${signerNameClean} (ת.ז. ${signerIdClean}) ב-${dateStr}`,
        })
        .eq('id', subscription_id)
    }

    return new Response(
      JSON.stringify({ success: true, contractId: saved?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('submit-contract error:', err)
    return new Response(
      JSON.stringify({ error: 'שגיאה פנימית בשרת.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
