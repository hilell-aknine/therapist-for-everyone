import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// GA4 DATA API — Supabase Edge Function
// Pulls daily metrics from Google Analytics 4 Reporting API v1
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// GA4 credentials (set via: supabase secrets set GA4_PROPERTY_ID=... GA4_SERVICE_ACCOUNT_JSON=...)
const GA4_PROPERTY_ID = Deno.env.get('GA4_PROPERTY_ID')!
const GA4_SERVICE_ACCOUNT_JSON = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON')!

const ALLOWED_ORIGIN = 'https://www.therapist-home.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// ============================================================================
// JWT SIGNING FOR GOOGLE SERVICE ACCOUNT
// ============================================================================

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function createGoogleJWT(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)))
  const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Parse PEM private key
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  )

  return `${signingInput}.${base64url(signature)}`
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccount)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google token exchange failed: ${err}`)
  }

  const data = await res.json()
  return data.access_token
}

// ============================================================================
// GA4 DATA API QUERY
// ============================================================================

async function queryGA4(
  accessToken: string,
  propertyId: string,
  dateRange: { startDate: string; endDate: string },
  dimensions: { name: string }[],
  metrics: { name: string }[],
  dimensionFilter?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    dateRanges: [dateRange],
    dimensions,
    metrics,
  }
  if (dimensionFilter) {
    body.dimensionFilter = dimensionFilter
  }

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GA4 API error: ${res.status} ${err}`)
  }

  return await res.json()
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ---- Auth check: must be admin ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Parse service account & get token ----
    const serviceAccount = JSON.parse(GA4_SERVICE_ACCOUNT_JSON)
    const accessToken = await getGoogleAccessToken(serviceAccount)
    const today = new Date().toISOString().split('T')[0]

    // ---- Run 3 queries in parallel ----
    const [usersReport, pagesReport, channelsReport] = await Promise.all([
      // 1) Active users & new users — last 30 days, by date
      queryGA4(
        accessToken,
        GA4_PROPERTY_ID,
        { startDate: '30daysAgo', endDate: 'today' },
        [{ name: 'date' }],
        [{ name: 'activeUsers' }, { name: 'newUsers' }]
      ),

      // 2) Page views for free content pages
      queryGA4(
        accessToken,
        GA4_PROPERTY_ID,
        { startDate: '30daysAgo', endDate: 'today' },
        [{ name: 'pageTitle' }, { name: 'pagePath' }],
        [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        {
          orGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'pagePath',
                  stringFilter: {
                    matchType: 'CONTAINS',
                    value: 'course-library',
                  },
                },
              },
              {
                filter: {
                  fieldName: 'pagePath',
                  stringFilter: {
                    matchType: 'CONTAINS',
                    value: 'free-portal',
                  },
                },
              },
              {
                filter: {
                  fieldName: 'pagePath',
                  stringFilter: {
                    matchType: 'CONTAINS',
                    value: 'learning-master',
                  },
                },
              },
            ],
          },
        }
      ),

      // 3) Traffic sources — session primary channel group
      queryGA4(
        accessToken,
        GA4_PROPERTY_ID,
        { startDate: '30daysAgo', endDate: 'today' },
        [{ name: 'sessionDefaultChannelGroup' }],
        [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' }]
      ),
    ])

    // ---- Format response ----
    const response = {
      generated_at: new Date().toISOString(),
      period: '30 days',

      // Summary: sum of last 30 days
      users: formatUsersReport(usersReport),

      // Free content pages
      free_content: formatPagesReport(pagesReport),

      // Traffic channels
      traffic_sources: formatChannelsReport(channelsReport),
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('GA4 Analytics error:', error)
    return new Response(
      JSON.stringify({ error: 'Unable to fetch analytics data' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ============================================================================
// FORMATTERS
// ============================================================================

function formatUsersReport(report: Record<string, unknown>): Record<string, unknown> {
  const rows = (report as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }).rows || []

  let totalActive = 0
  let totalNew = 0
  const daily: { date: string; activeUsers: number; newUsers: number }[] = []

  for (const row of rows) {
    const date = row.dimensionValues[0].value // YYYYMMDD
    const active = parseInt(row.metricValues[0].value) || 0
    const newU = parseInt(row.metricValues[1].value) || 0
    totalActive += active
    totalNew += newU
    daily.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      activeUsers: active,
      newUsers: newU,
    })
  }

  // Sort by date descending
  daily.sort((a, b) => b.date.localeCompare(a.date))

  // Today's numbers (first entry if today's date matches)
  const todayStr = new Date().toISOString().split('T')[0]
  const todayData = daily.find(d => d.date === todayStr) || { activeUsers: 0, newUsers: 0 }

  return {
    today: { activeUsers: todayData.activeUsers, newUsers: todayData.newUsers },
    last30days: { activeUsers: totalActive, newUsers: totalNew },
    daily: daily.slice(0, 7), // last 7 days for sparkline
  }
}

function formatPagesReport(report: Record<string, unknown>): Record<string, unknown> {
  const rows = (report as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }).rows || []

  let totalViews = 0
  let totalUsers = 0
  const pages: { title: string; path: string; views: number; users: number }[] = []

  for (const row of rows) {
    const title = row.dimensionValues[0].value
    const path = row.dimensionValues[1].value
    const views = parseInt(row.metricValues[0].value) || 0
    const users = parseInt(row.metricValues[1].value) || 0
    totalViews += views
    totalUsers += users
    pages.push({ title, path, views, users })
  }

  pages.sort((a, b) => b.views - a.views)

  return {
    totalViews,
    totalUsers,
    pages,
  }
}

function formatChannelsReport(report: Record<string, unknown>): Record<string, unknown> {
  const rows = (report as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }).rows || []

  const channels: { channel: string; sessions: number; activeUsers: number; newUsers: number; percentage: number }[] = []
  let totalSessions = 0

  for (const row of rows) {
    const sessions = parseInt(row.metricValues[0].value) || 0
    totalSessions += sessions
  }

  for (const row of rows) {
    const channel = row.dimensionValues[0].value
    const sessions = parseInt(row.metricValues[0].value) || 0
    const activeUsers = parseInt(row.metricValues[1].value) || 0
    const newUsers = parseInt(row.metricValues[2].value) || 0
    channels.push({
      channel,
      sessions,
      activeUsers,
      newUsers,
      percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
    })
  }

  channels.sort((a, b) => b.sessions - a.sessions)

  return {
    totalSessions,
    channels,
  }
}
