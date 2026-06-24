import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Keys from Supabase secrets — never hardcoded
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GEMINI_MODEL = 'gemini-2.0-flash'
const OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free'
const OPENROUTER_FALLBACK = 'nvidia/nemotron-3-nano-30b-a3b:free'
const DAILY_LIMIT = 100

// ===== Claude Sonnet (primary smart model) + shared monthly budget cap =====
// The game mentor now answers with claude-sonnet-4-6. The same hard monthly ₪
// ceiling shared with ai-chat protects spend: once the month's Sonnet cost hits
// the cap we silently fall back to the free Gemini model. Cost is derived from
// tokens logged on source='chat-sonnet'/'mentor-sonnet'.
const SONNET_MODEL = 'claude-sonnet-4-6'
const SONNET_IN_USD = Number(Deno.env.get('SONNET_IN_USD')) || 3
const SONNET_OUT_USD = Number(Deno.env.get('SONNET_OUT_USD')) || 15
const USD_ILS = Number(Deno.env.get('USD_ILS')) || 3.8
const AI_MONTHLY_CAP_ILS = Number(Deno.env.get('AI_MONTHLY_CAP_ILS')) || 100

// Extra rules appended to the client-supplied system prompt: stay on course
// content, and (when it helps) offer a movie/series check to anchor the concept
// in the student's daily life. Everyday examples only — no business language.
const MENTOR_EXTRA_RULES = `

## כללים נוספים:
- הישאר אך ורק בנושאי הקורס וה-NLP. שאלה שאינה קשורה לחומר — החזר בעדינות לנושא במשפט אחד.
- כשזה תורם, אתה רשאי להציע *כשאלה* קצרה לבדוק הבנה דרך דמות או סצנה מסדרה/סרט שהתלמיד מכיר, כדי לחבר את המושג לחיי היומיום. לא בכל הודעה, ותמיד מתוך תוכן הקורס. דוגמאות מהיומיום בלבד.`

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

// Normalize the client's Gemini-format messages (role/parts) into {role, content}.
// deno-lint-ignore no-explicit-any
function toConvo(messages: any[]): Array<{ role: string; content: string }> {
  return (messages || []).map((m) => ({
    role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
    content: m.parts?.[0]?.text || m.content || '',
  }))
}

// ── Claude Sonnet (primary) — caches the (large, stable) game knowledge prompt ──
async function callSonnet(systemPrompt: string, convo: Array<{ role: string; content: string }>) {
  if (!ANTHROPIC_API_KEY) return null
  const system: Array<Record<string, unknown>> = systemPrompt
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : []
  const messages = convo.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }))
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 700, thinking: { type: 'disabled' }, system, messages }),
    })
    if (!res.ok) { console.error(`[Sonnet] ${res.status}: ${await res.text()}`); return null }
    const data = await res.json()
    // deno-lint-ignore no-explicit-any
    const reply = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('').trim()
    if (!reply) return null
    const u = data.usage || {}
    const promptTokens = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0)
    const completionTokens = Number(u.output_tokens) || 0
    return { text: reply, promptTokens, completionTokens, provider: 'sonnet' }
  } catch (e) { console.error('[Sonnet] error', e); return null }
}

// First day of the current month in Asia/Jerusalem, as 'YYYY-MM-01'.
function monthStartIsrael(): string {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${ym}-01`
}

// Month-to-date Sonnet spend in ₪ (shared across both mentors). Conservative:
// all input tokens billed at full input rate → real spend ≤ this → cap never overshoots.
// deno-lint-ignore no-explicit-any
async function monthlyCostShekel(supabaseAdmin: any): Promise<number> {
  const { data } = await supabaseAdmin
    .from('ai_chat_usage')
    .select('prompt_tokens, completion_tokens')
    .in('source', ['chat-sonnet', 'mentor-sonnet'])
    .gte('date', monthStartIsrael())
  let pt = 0, ct = 0
  for (const r of (data || []) as Array<{ prompt_tokens?: number; completion_tokens?: number }>) {
    pt += Number(r.prompt_tokens) || 0; ct += Number(r.completion_tokens) || 0
  }
  return ((pt * SONNET_IN_USD + ct * SONNET_OUT_USD) / 1_000_000) * USD_ILS
}

// ── Gemini Direct API (free fallback) ────────────────
// deno-lint-ignore no-explicit-any
async function callGemini(messages: any[], systemPrompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith('AIza')) return null

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  // deno-lint-ignore no-explicit-any
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
    console.log('[Gemini] Rate limited, retrying in 3s...')
    await new Promise(r => setTimeout(r, 3000))
    const retry = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!retry.ok) { console.error(`[Gemini] Retry failed: ${retry.status}`); return null }
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

// ── OpenRouter API (OpenAI-compatible, free fallback) ─
// deno-lint-ignore no-explicit-any
async function callOpenRouter(messages: any[], systemPrompt: string, model: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null

  // deno-lint-ignore no-explicit-any
  const openaiMessages: any[] = []
  if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt })
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
    body: JSON.stringify({ model, messages: openaiMessages, max_tokens: 500, temperature: 0.8 }),
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

    // ── Rate limiting (100/day per user) — count both model rows ─────
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())

    const { data: usageRows } = await supabaseAdmin
      .from('ai_chat_usage')
      .select('source, message_count, prompt_tokens, completion_tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .in('source', ['mentor', 'mentor-sonnet'])

    const rowBySource: Record<string, { message_count?: number; prompt_tokens?: number; completion_tokens?: number }> = {}
    let currentCount = 0
    for (const r of (usageRows || [])) { rowBySource[r.source] = r; currentCount += Number(r.message_count) || 0 }

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

    const sysFull = (systemPrompt || '') + MENTOR_EXTRA_RULES
    const convo = toConvo(messages)

    // ── Call AI: Sonnet (primary, smart) within budget → Gemini → OpenRouter x2 ──
    const overBudget = (await monthlyCostShekel(supabaseAdmin)) >= AI_MONTHLY_CAP_ILS

    let text: string | null = null
    let provider = 'gemini'
    let promptTokens = 0
    let completionTokens = 0

    if (!overBudget) {
      const s = await callSonnet(sysFull, convo)
      if (s) { text = s.text; provider = 'sonnet'; promptTokens = s.promptTokens; completionTokens = s.completionTokens }
    }
    if (!text) {
      if (!overBudget) console.log('[Mentor] Sonnet unavailable, trying Gemini...')
      text = await callGemini(messages, sysFull)
      if (text) provider = 'gemini'
    }
    if (!text) {
      console.log('[Mentor] Gemini failed, trying OpenRouter...')
      text = await callOpenRouter(messages, sysFull, OPENROUTER_MODEL)
      if (text) provider = 'openrouter'
    }
    if (!text) {
      console.log('[Mentor] OpenRouter primary failed, trying fallback...')
      text = await callOpenRouter(messages, sysFull, OPENROUTER_FALLBACK)
      if (text) provider = 'openrouter'
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'All AI providers failed' }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Log usage to the row matching the model that answered ──
    // Sonnet → 'mentor-sonnet' (billable, read by the cap + cost panel);
    // Gemini/OpenRouter → 'mentor' (free). Each source keeps its own totals.
    const logSource = provider === 'sonnet' ? 'mentor-sonnet' : 'mentor'
    const prev = rowBySource[logSource] || {}
    await supabaseAdmin.from('ai_chat_usage').upsert({
      user_id: user.id,
      date: today,
      source: logSource,
      message_count: (Number(prev.message_count) || 0) + 1,
      prompt_tokens: (Number(prev.prompt_tokens) || 0) + promptTokens,
      completion_tokens: (Number(prev.completion_tokens) || 0) + completionTokens,
    }, { onConflict: 'user_id,date,source' })

    return new Response(
      JSON.stringify({ text, provider }),
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
