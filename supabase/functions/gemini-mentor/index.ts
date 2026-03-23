import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Keys from Supabase secrets — never hardcoded
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''

const GEMINI_MODEL = 'gemini-2.0-flash'
const OPENROUTER_MODEL = 'google/gemini-2.0-flash-exp:free'
const OPENROUTER_FALLBACK = 'meta-llama/llama-3.3-8b-instruct:free'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, systemPrompt } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Mentor] Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
