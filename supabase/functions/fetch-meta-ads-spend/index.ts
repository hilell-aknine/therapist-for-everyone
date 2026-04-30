// ============================================================================
// Edge Function: fetch-meta-ads-spend
// Pulls daily campaign-level insights from the Meta Marketing API and upserts
// them into meta_campaign_spend_daily. Called by pg_cron at 03:00 UTC (06:00
// Israel) for "yesterday" by default; supports ?days=N for backfill.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const META_ACCESS_TOKEN   = Deno.env.get('META_ACCESS_TOKEN')   || ''
const META_AD_ACCOUNT_ID  = Deno.env.get('META_AD_ACCOUNT_ID')  || ''
const META_API_VERSION    = Deno.env.get('META_API_VERSION')    || 'v21.0'
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')        || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const INSIGHTS_FIELDS = [
  'campaign_id',
  'campaign_name',
  'spend',
  'impressions',
  'clicks',
  'reach',
  'ctr',
  'cpm',
  'actions',
  'account_currency',
].join(',')

// Meta returns the same lead under multiple action_types (`lead`, `offsite_conversion.fb_pixel_lead`,
// `onsite_web_lead`, `complete_registration`, ...). Using only `lead` avoids double-counting —
// it's Meta's deduplicated aggregate across all lead sources (Pixel + on-platform forms + Click-to-WA).
const LEAD_ACTION_TYPE = 'lead'

interface MetaAction {
  action_type: string
  value: string
}

interface MetaCampaignRow {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  reach?: string
  ctr?: string
  cpm?: string
  actions?: MetaAction[]
  account_currency?: string
  date_start: string
  date_stop: string
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function israelDate(offsetDays = 0): string {
  // Calculate "today" in Asia/Jerusalem timezone, then offset.
  const now = new Date()
  const israelStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  // israelStr is YYYY-MM-DD already
  const base = new Date(israelStr + 'T00:00:00Z')
  base.setUTCDate(base.getUTCDate() + offsetDays)
  return isoDate(base)
}

function sumLeadActions(actions: MetaAction[] | undefined): number {
  if (!actions || !Array.isArray(actions)) return 0
  for (const a of actions) {
    if (a.action_type === LEAD_ACTION_TYPE) {
      const n = parseInt(a.value, 10)
      return Number.isNaN(n) ? 0 : n
    }
  }
  return 0
}

function slugifyCampaignName(name: string | undefined | null): string {
  if (!name) return 'unknown'
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    // Allow Hebrew + Latin + digits + hyphens
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 80) || 'unknown'
}

async function fetchInsightsForDate(
  accountId: string,
  isoDay: string,
): Promise<MetaCampaignRow[]> {
  const params = new URLSearchParams({
    access_token: META_ACCESS_TOKEN,
    fields: INSIGHTS_FIELDS,
    level: 'campaign',
    time_range: JSON.stringify({ since: isoDay, until: isoDay }),
    time_increment: '1',
    limit: '500',
  })

  const out: MetaCampaignRow[] = []
  let url: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights?${params}`

  while (url) {
    const res = await fetch(url)
    const json = await res.json()

    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      throw new Error(`Meta API error for ${isoDay}: ${msg}`)
    }

    if (Array.isArray(json.data)) {
      for (const row of json.data) out.push(row as MetaCampaignRow)
    }

    url = json.paging?.next || null
  }

  return out
}

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const missing: string[] = []
  if (!META_ACCESS_TOKEN)   missing.push('META_ACCESS_TOKEN')
  if (!META_AD_ACCOUNT_ID)  missing.push('META_AD_ACCOUNT_ID')
  if (!SUPABASE_URL)        missing.push('SUPABASE_URL')
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) {
    console.error('Missing secrets:', missing.join(', '))
    return new Response(
      JSON.stringify({ error: 'Not configured', missing }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const accountId = META_AD_ACCOUNT_ID.startsWith('act_')
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`

  // Parse ?days=N (default 1 = yesterday only). Cap at 90 to avoid runaway calls.
  const url = new URL(req.url)
  const daysParam = parseInt(url.searchParams.get('days') || '1', 10)
  const days = Math.min(Math.max(Number.isNaN(daysParam) ? 1 : daysParam, 1), 90)

  // Build list of dates: yesterday, day-before, ..., back N days
  const dates: string[] = []
  for (let i = 1; i <= days; i++) dates.push(israelDate(-i))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load mapping once
  const { data: mappingRows } = await supabase
    .from('meta_campaign_to_utm')
    .select('campaign_id, utm_campaign')

  const mapping = new Map<string, string>()
  for (const row of mappingRows ?? []) {
    if (row.campaign_id && row.utm_campaign) mapping.set(row.campaign_id, row.utm_campaign)
  }

  const summary: Record<string, unknown> = {
    account_id: accountId,
    days_processed: 0,
    rows_upserted: 0,
    errors: [] as string[],
    dates,
  }

  for (const day of dates) {
    try {
      const rows = await fetchInsightsForDate(accountId, day)

      if (rows.length === 0) {
        summary.days_processed = (summary.days_processed as number) + 1
        continue
      }

      const records = rows.map((r) => {
        const utmFromMap = mapping.get(r.campaign_id)
        const utmCampaign = utmFromMap || slugifyCampaignName(r.campaign_name)
        return {
          date: day,
          account_id: accountId,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          utm_campaign: utmCampaign,
          spend: parseFloat(r.spend || '0') || 0,
          impressions: parseInt(r.impressions || '0', 10) || 0,
          clicks: parseInt(r.clicks || '0', 10) || 0,
          reach: parseInt(r.reach || '0', 10) || 0,
          ctr: parseFloat(r.ctr || '0') || 0,
          cpm: parseFloat(r.cpm || '0') || 0,
          leads: sumLeadActions(r.actions),
          currency: r.account_currency || 'ILS',
          fetched_at: new Date().toISOString(),
        }
      })

      const { error: upsertErr, count } = await supabase
        .from('meta_campaign_spend_daily')
        .upsert(records, { onConflict: 'date,campaign_id', count: 'exact' })

      if (upsertErr) {
        const msg = `${day}: ${upsertErr.message}`
        console.error(msg);
        (summary.errors as string[]).push(msg)
      } else {
        summary.rows_upserted = (summary.rows_upserted as number) + (count ?? records.length)
      }

      // Auto-fill the mapping table with campaign_id+name pairs we haven't seen yet.
      // This gives Hillel a list to review without him having to know the IDs upfront.
      const knownIds = new Set(mapping.keys())
      const newPairs = records
        .filter((r) => !knownIds.has(r.campaign_id))
        .map((r) => ({
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          utm_campaign: r.utm_campaign,
        }))
      if (newPairs.length) {
        // Dedup within this batch
        const seen = new Set<string>()
        const dedup = newPairs.filter((p) => {
          if (seen.has(p.campaign_id)) return false
          seen.add(p.campaign_id)
          return true
        })
        await supabase
          .from('meta_campaign_to_utm')
          .upsert(dedup, { onConflict: 'campaign_id', ignoreDuplicates: true })
        for (const p of dedup) mapping.set(p.campaign_id, p.utm_campaign)
      }

      summary.days_processed = (summary.days_processed as number) + 1
    } catch (err) {
      const msg = `${day}: ${err instanceof Error ? err.message : String(err)}`
      console.error(msg);
      (summary.errors as string[]).push(msg)
    }
  }

  console.log(JSON.stringify({ level: 'info', ...summary }))

  const status = (summary.errors as string[]).length === 0 ? 200 : 207
  return new Response(JSON.stringify(summary), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
