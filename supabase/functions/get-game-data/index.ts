// ============================================================================
// Edge Function: get-game-data
// Serves the MASTER practice-game data (paid product) to paying customers only.
// The data lived as public static JS (js/nlp-game-data-master-*.js) — anyone
// could download the whole 1,900₪ course content with one URL and no account.
// Now: JSON in the PRIVATE `game-data` Storage bucket, returned only after a
// JWT + profiles.role check (paid_customer / admin).
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BUCKET = 'game-data'
const OBJECT = 'master-modules.json'
const PAID_ROLES = ['paid_customer', 'admin']

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
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

serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'Missing authorization header' })

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return json(401, { error: 'Invalid or expired token' })

    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!PAID_ROLES.includes(prof?.role || '')) {
      return json(403, { error: 'Paid access required' })
    }

    const { data: file, error: dlError } = await supabaseAdmin.storage.from(BUCKET).download(OBJECT)
    if (dlError || !file) {
      console.error('[get-game-data] storage download failed', dlError)
      return json(500, { error: 'Content unavailable' })
    }

    return new Response(await file.text(), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[get-game-data] error', err)
    return json(500, { error: 'Internal error' })
  }
})
