import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SHEETS_API_URL = Deno.env.get('SHEETS_API_URL')
const SHEETS_API_TOKEN = Deno.env.get('SHEETS_API_TOKEN')

if (!SHEETS_API_URL || !SHEETS_API_TOKEN) {
  console.error('CRITICAL: SHEETS_API_URL or SHEETS_API_TOKEN not configured')
}

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // Auth check — admin only
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (!SHEETS_API_URL || !SHEETS_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Sheets API not configured' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body — expects { action, sheet, rows }
    const { action, sheet, rows } = await req.json()

    if (action === 'appendRow' && rows && Array.isArray(rows)) {
      // Send rows sequentially to Apps Script (GET with URL params)
      let successCount = 0
      for (const row of rows) {
        const params = new URLSearchParams({
          token: SHEETS_API_TOKEN,
          action: 'appendRow',
          sheet: sheet || 'לקוחות משלמים',
          data: JSON.stringify(row),
        })
        const res = await fetch(`${SHEETS_API_URL}?${params}`)
        if (res.ok) successCount++
      }
      return new Response(
        JSON.stringify({ success: true, synced: successCount, total: rows.length }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[sheets-sync] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
