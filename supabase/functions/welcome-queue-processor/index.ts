// ============================================================================
// Edge Function: welcome-queue-processor
// Drains pending welcome WhatsApp jobs from the welcome_queue table.
// Called via Supabase cron (pg_cron) every minute, or manually via POST.
//
// Rate-limit safety: Green API tolerates roughly 1 message/second before
// raising the spam-ban risk. This drainer spaces sends ~1.2s apart and caps
// each run at BATCH_SIZE rows, so a burst of 1000 sign-ups drains gradually
// (~35/min → ~25 min for 1000) instead of hammering Green API at once.
//
// For EACH pending row it REUSES the existing send-welcome-whatsapp function
// (POSTing the row's profile_id/questionnaire_id) — the Green API send logic
// lives there and is NOT duplicated here.
//
// On success  → status='sent', sent_at=now().
// On failure  → attempts++, last_error set; marked 'failed' only after
//               attempts>=MAX_ATTEMPTS, otherwise left 'pending' to retry.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Batch sizing — fits a 1-minute cron window at ~1.2s spacing.
// 35 rows * 1.2s ≈ 42s per run, comfortably under the cron interval and under
// Green API's ~1 msg/sec ceiling.
const BATCH_SIZE = 35
const SEND_DELAY_MS = 1200
const MAX_ATTEMPTS = 5

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

serve(async (req) => {
  // Allow GET (cron) or POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required secrets')
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 503 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch the oldest pending jobs (FIFO).
  const { data: rows, error: fetchErr } = await supabase
    .from('welcome_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr) {
    console.error('Queue fetch error:', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
  }

  let sent = 0
  let failed = 0
  let retried = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      // Reuse the existing, proven sender. It is idempotent server-side, so
      // even a retry of an already-sent id is safe.
      const payload = row.profile_id
        ? { profile_id: row.profile_id }
        : { questionnaire_id: row.questionnaire_id }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-welcome-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json().catch(() => ({}))

      // send-welcome-whatsapp returns 200 for every terminal outcome
      // (sent / opt_out / not_on_whatsapp / already_sent / invalid_phone /
      // pre_rollout). All of those mean "done, stop retrying" → mark sent.
      // Only a non-200 (e.g. 503 check_unavailable, 502 green_api_error,
      // 500 internal) is a real, retryable failure.
      if (res.ok) {
        await supabase.from('welcome_queue').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).eq('id', row.id)
        sent++
      } else {
        const errMsg = (result && (result.reason || result.error)) || `http_${res.status}`
        const attempts = (row.attempts || 0) + 1
        await supabase.from('welcome_queue').update({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          last_error: String(errMsg).slice(0, 500),
        }).eq('id', row.id)
        if (attempts >= MAX_ATTEMPTS) { failed++ } else { retried++ }
        console.error(JSON.stringify({ level: 'error', id: row.id, attempts, error: errMsg }))
      }
    } catch (err) {
      const attempts = (row.attempts || 0) + 1
      await supabase.from('welcome_queue').update({
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      }).eq('id', row.id)
      if (attempts >= MAX_ATTEMPTS) { failed++ } else { retried++ }
    }

    // Space sends out to stay under Green API's ~1 msg/sec ceiling.
    // Skip the wait after the last row.
    if (i < rows.length - 1) await sleep(SEND_DELAY_MS)
  }

  return new Response(JSON.stringify({ processed: rows.length, sent, failed, retried }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
