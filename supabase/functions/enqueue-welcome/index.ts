// ============================================================================
// Edge Function: enqueue-welcome
// Thin enqueuer for the rate-limited welcome WhatsApp flow.
//
// Accepts EITHER:
//   { profile_id }        → queues a welcome for a profile
//   { questionnaire_id }  → queues a welcome for a portal questionnaire
//
// Inserts ONE pending row into welcome_queue using the service-role key and
// returns 200 fast. NEVER sends a WhatsApp here — the welcome-queue-processor
// (driven by pg_cron) drains the queue at a safe ~1.2s/msg pace and reuses
// send-welcome-whatsapp for the actual send.
//
// Called fire-and-forget from the same 5 sign-up call sites that previously
// hit send-welcome-whatsapp directly:
//   - js/supabase-client.js            (ensureProfile when phone present)
//   - pages/portal-questionnaire.html  (after INSERT into portal_questionnaires)
//   - pages/free-portal.html           (after profile upsert with phone)
//   - pages/login-v2.html              (after savePendingProfile with phone)
//   - pages/login.html                 (after savePendingProfile with phone)
//
// Dedup nicety: if a pending row already exists for the same id, skip the
// insert so a double-submit / page reload does not pile up duplicate rows.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

function jsonResponse(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors)

  try {
    const body = await req.json().catch(() => ({}))
    const questionnaire_id = typeof body?.questionnaire_id === 'string' ? body.questionnaire_id : null
    const profile_id = typeof body?.profile_id === 'string' ? body.profile_id : null
    if (!questionnaire_id && !profile_id) return jsonResponse({ error: 'missing_id' }, 400, cors)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Dedup: a welcome is sent once per person, ever — so any existing row (pending,
    // sent or failed) means we are done. The old check looked at 'pending' only, so a
    // second sign-up call after the first was already sent queued a second welcome.
    const dedupCol = profile_id ? 'profile_id' : 'questionnaire_id'
    const dedupVal = profile_id || questionnaire_id
    const { data: existing } = await db
      .from('welcome_queue')
      .select('id')
      .eq(dedupCol, dedupVal)
      .limit(1)
      .maybeSingle()
    if (existing) return jsonResponse({ queued: false, reason: 'already_queued' }, 200, cors)

    const { error: insErr } = await db
      .from('welcome_queue')
      .insert({ profile_id, questionnaire_id })
    if (insErr) {
      // 23505 = unique violation on welcome_queue_{profile,questionnaire}_uniq. Two
      // calls raced past the SELECT above; the index is the real guard. Not an error.
      if (insErr.code === '23505') {
        return jsonResponse({ queued: false, reason: 'already_queued' }, 200, cors)
      }
      console.error('enqueue-welcome insert error:', insErr.message)
      return jsonResponse({ queued: false, error: 'insert_failed' }, 500, cors)
    }

    return jsonResponse({ queued: true }, 200, cors)
  } catch (e) {
    console.error('enqueue-welcome unhandled error:', e)
    return jsonResponse({ error: 'internal_error' }, 500, cors)
  }
})
