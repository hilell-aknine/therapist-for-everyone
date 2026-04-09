import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Keys from Supabase secrets — never hardcoded
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GEMINI_MODEL = 'gemini-2.0-flash'
const OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free'
const OPENROUTER_FALLBACK = 'nvidia/nemotron-3-nano-30b-a3b:free'
const DAILY_LIMIT = 100

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

// ── Gemini Direct API ────────────────────────────────
async function callGemini(messages: any[], systemPrompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith('AIza')) return null

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  const body: any = {
    contents: messages,
    generationConfig: { temperature: 0.8, maxOutputTokens: 500, topP: 0.9 },
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    // Rate limited — wait and retry once
    console.log('[Gemini] Rate limited, retrying in 3s...')
    await new Promise(r => setTimeout(r, 3000))
    const retry = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!retry.ok) {
      console.error(`[Gemini] Retry failed: ${retry.status}`)
      return null
    }
    const retryData = await retry.json()
    return retryData.candidates?.[0]?.content?.parts?.[0]?.text || null
  }

  if (!res.ok) {
    console.error(`[Gemini] ${res.status}: ${await res.text()}`)
    return null
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null
}

// ── OpenRouter API (OpenAI-compatible) ───────────────
async function callOpenRouter(
  messages: any[],
  systemPrompt: string,
  model: string
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null

  // Convert Gemini format (role/parts) to OpenAI format (role/content)
  const openaiMessages: any[] = []
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt })
  }
  for (const m of messages) {
    const role = m.role === 'model' ? 'assistant' : 'user'
    const content = m.parts?.[0]?.text || m.content || ''
    openaiMessages.push({ role, content })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://www.therapist-home.com',
      'X-Title': 'NLP Game Mentor',
    },
    body: JSON.stringify({
      model,
      messages: openaiMessages,
      max_tokens: 500,
      temperature: 0.8,
    }),
  })

  if (!res.ok) {
    console.error(`[OpenRouter/${model}] ${res.status}: ${await res.text()}`)
    return null
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || null
}

// ── Main Handler ─────────────────────────────────────
serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // ── Auth check ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Rate limiting (100/day per user) ────────────
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())

    const { data: usage } = await supabaseAdmin
      .from('ai_chat_usage')
      .select('message_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('source', 'mentor')
      .single()

    const currentCount = usage?.message_count || 0
    if (currentCount >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Daily mentor limit reached', limit: DAILY_LIMIT }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Parse request ───────────────────────────────
    const { messages, systemPrompt } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing messages' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Try providers in order: Gemini → OpenRouter primary → OpenRouter fallback
    let text: string | null = null

    text = await callGemini(messages, systemPrompt || '')
    if (!text) {
      console.log('[Mentor] Gemini failed, trying OpenRouter...')
      text = await callOpenRouter(messages, systemPrompt || '', OPENROUTER_MODEL)
    }
    if (!text) {
      console.log('[Mentor] OpenRouter primary failed, trying fallback...')
      text = await callOpenRouter(messages, systemPrompt || '', OPENROUTER_FALLBACK)
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'All AI providers failed' }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Increment usage counter ─────────────────────
    await supabaseAdmin.from('ai_chat_usage').upsert({
      user_id: user.id,
      date: today,
      source: 'mentor',
      message_count: currentCount + 1,
    }, { onConflict: 'user_id,date,source' })

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Mentor] Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
