// ============================================================================
// Edge Function: capi-queue-processor
// Processes pending CAPI events from the capi_event_queue table.
// Called via Supabase cron (pg_cron) every minute, or manually via POST.
// This is the TRUE server-side path — no browser involved, AdBlock-proof.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || ''
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') || ''
const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE') || ''
const META_API_VERSION = 'v21.0'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ── PII Hashing (same as meta-capi) ────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function normalizeEmail(e: string): string { return e.trim().toLowerCase() }
function normalizePhone(p: string): string {
  let d = p.replace(/\D/g, '')
  if (d.startsWith('0') && d.length === 10) d = '972' + d.substring(1)
  return d
}
function normalizeName(n: string): string { return n.trim().toLowerCase().replace(/[^a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]/g, '') }

async function hashEmail(v?: string): Promise<string | null> { return v ? sha256(normalizeEmail(v)) : null }
async function hashPhone(v?: string): Promise<string | null> { return v ? sha256(normalizePhone(v)) : null }
async function hashName(v?: string): Promise<string | null> { return v && v.trim() ? sha256(normalizeName(v)) : null }

// ── Prune nulls/undefined/empty strings ────────────────────────────────────

function pruneObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out as Partial<T>
}

// ── Main ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Allow GET (cron) or POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!META_ACCESS_TOKEN || !META_PIXEL_ID || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required secrets')
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 503 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch up to 10 pending events
  const { data: events, error: fetchErr } = await supabase
    .from('capi_event_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (fetchErr) {
    console.error('Queue fetch error:', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
  }

  let sent = 0
  let failed = 0

  for (const evt of events) {
    try {
      const ud = evt.user_data || {}

      // Hash PII
      const [em, ph, fn, ln] = await Promise.all([
        hashEmail(ud.email),
        hashPhone(ud.phone),
        hashName(ud.first_name),
        hashName(ud.last_name),
      ])

      const userData = pruneObject({
        em: em ? [em] : undefined,
        ph: ph ? [ph] : undefined,
        fn: fn ? [fn] : undefined,
        ln: ln ? [ln] : undefined,
        client_user_agent: ud.client_user_agent || undefined,
        client_ip_address: ud.client_ip_address || undefined,
        fbc: ud.fbc || undefined,
        fbp: ud.fbp || undefined,
        external_id: ud.external_id || undefined,
      })

      const metaEvent = pruneObject({
        event_name: evt.event_name,
        event_time: Math.floor(new Date(evt.created_at).getTime() / 1000),
        event_id: evt.event_id,
        event_source_url: evt.event_source_url || undefined,
        action_source: 'website',
        user_data: userData,
        custom_data: evt.custom_data || undefined,
      })

      const payload: Record<string, unknown> = { data: [metaEvent] }
      if (META_TEST_EVENT_CODE) payload.test_event_code = META_TEST_EVENT_CODE

      const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`
      const metaRes = await fetch(metaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const metaJson = await metaRes.json().catch(() => ({}))

      if (metaRes.ok && metaJson.events_received > 0) {
        await supabase.from('capi_event_queue').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).eq('id', evt.id)
        sent++
        console.log(JSON.stringify({ level: 'info', event: evt.event_name, event_id: evt.event_id, fbtrace_id: metaJson.fbtrace_id }))
      } else {
        const errMsg = metaJson.error?.message || 'Meta rejected'
        await supabase.from('capi_event_queue').update({
          status: 'failed',
          error: errMsg,
        }).eq('id', evt.id)
        failed++
        console.error(JSON.stringify({ level: 'error', event: evt.event_name, event_id: evt.event_id, error: errMsg }))
      }
    } catch (err) {
      await supabase.from('capi_event_queue').update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }).eq('id', evt.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: events.length, sent, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
