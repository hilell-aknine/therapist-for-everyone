// =============================================================================
// _shared/sim/llm.ts — model calls for the simulator.
//
// Same provider chain and the same shared monthly ₪ ceiling as ai-chat and
// gemini-mentor, so the simulator cannot quietly open a second spending channel.
// Usage rows are logged to `ai_chat_usage` under simulator-specific sources.
//
// One deliberate difference from the mentors: when the monthly cap is reached the
// simulator is BLOCKED, it does not degrade to a free model. A patient played by
// a weak model teaches the wrong patterns, which is worse than no practice.
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''

export const SONNET_MODEL = 'claude-sonnet-4-6'
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const GEMINI_MODEL = 'gemini-2.0-flash'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// ⚠️ OpenRouter retires ":free" slugs without notice and answers 404 with the paid
// slug in the message, which reads like a bug in our code. Verified live 20.09.2026:
// BOTH slugs used elsewhere in this repo are already gone —
// 'nvidia/nemotron-3-nano-30b-a3b:free' and 'stepfun/step-3.5-flash:free'
// (ai-chat + gemini-mentor still point at them, so their fallback chain is dead).
// Re-check against https://openrouter.ai/api/v1/models, no key needed.
const OPENROUTER_FALLBACK = 'nvidia/nemotron-3-super-120b-a12b:free'

const SONNET_IN_USD = Number(Deno.env.get('SONNET_IN_USD')) || 3
const SONNET_OUT_USD = Number(Deno.env.get('SONNET_OUT_USD')) || 15
const USD_ILS = Number(Deno.env.get('USD_ILS')) || 3.8
export const AI_MONTHLY_CAP_ILS = Number(Deno.env.get('AI_MONTHLY_CAP_ILS')) || 100

export const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
]

export function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

export type LlmResult = {
  text: string
  promptTokens: number
  completionTokens: number
  provider: string
}

export type Msg = { role: 'user' | 'assistant'; content: string }

// ── Anthropic ────────────────────────────────────────────────────────────────
// `stable` is sent with cache_control so the scenario identity block (large and
// identical for every learner on this scenario) is read from cache after the
// first call instead of being re-charged at full input rate on every turn.
export async function callClaude(
  model: string,
  stable: string,
  volatile: string,
  messages: Msg[],
  maxTokens: number,
  temperature = 0.7,
): Promise<LlmResult | null> {
  if (!ANTHROPIC_API_KEY) return null
  const system: Array<Record<string, unknown>> = []
  if (stable) system.push({ type: 'text', text: stable, cache_control: { type: 'ephemeral' } })
  if (volatile && volatile.trim()) system.push({ type: 'text', text: volatile })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        thinking: { type: 'disabled' },
        system,
        messages,
      }),
    })
    if (!res.ok) { console.error(`[claude/${model}] ${res.status}: ${await res.text()}`); return null }
    const data = await res.json()
    const text = (data.content || [])
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text || '').join('').trim()
    if (!text) return null
    const u = data.usage || {}
    return {
      text,
      // Conservative: every input token is counted at full input rate, so the
      // real spend is always at or below the number the cap is compared against.
      promptTokens: (Number(u.input_tokens) || 0)
        + (Number(u.cache_creation_input_tokens) || 0)
        + (Number(u.cache_read_input_tokens) || 0),
      completionTokens: Number(u.output_tokens) || 0,
      provider: model.includes('haiku') ? 'haiku' : 'sonnet',
    }
  } catch (e) {
    console.error(`[claude/${model}] error`, e)
    return null
  }
}

// ── Gemini (judge fallback) ──────────────────────────────────────────────────
export async function callGemini(system: string, messages: Msg[], temperature = 0.2): Promise<LlmResult | null> {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith('AIza')) return null
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature, maxOutputTokens: 1024, topP: 0.9 },
  }
  try {
    const call = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let res = await call()
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2500)); res = await call() }
    if (!res.ok) { console.error(`[gemini] ${res.status}: ${await res.text()}`); return null }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const um = data.usageMetadata || {}
    return {
      text: String(text).trim(),
      promptTokens: Number(um.promptTokenCount) || 0,
      completionTokens: Number(um.candidatesTokenCount) || 0,
      provider: 'gemini',
    }
  } catch (e) {
    console.error('[gemini] error', e)
    return null
  }
}

// ── OpenRouter (last resort for the judge only) ──────────────────────────────
export async function callOpenRouter(system: string, messages: Msg[]): Promise<LlmResult | null> {
  if (!OPENROUTER_API_KEY) return null
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.therapist-home.com',
        'X-Title': 'Beit HaMetaplim - NLP Sandbox',
      },
      body: JSON.stringify({
        model: OPENROUTER_FALLBACK,
        max_tokens: 900,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    })
    if (!res.ok) { console.error(`[openrouter] ${res.status}: ${await res.text()}`); return null }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) return null
    return {
      text: String(text).trim(),
      promptTokens: Number(data.usage?.prompt_tokens) || 0,
      completionTokens: Number(data.usage?.completion_tokens) || 0,
      provider: 'openrouter',
    }
  } catch (e) {
    console.error('[openrouter] error', e)
    return null
  }
}

// ── budget ───────────────────────────────────────────────────────────────────

export function monthStartIsrael(): string {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' })
    .format(new Date())
  return `${ym}-01`
}

export function todayIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// Month-to-date spend in ₪ across every paid source in the portal, so the
// simulator shares one ceiling with both mentors instead of adding a second one.
// deno-lint-ignore no-explicit-any
export async function monthlyCostShekel(admin: any): Promise<number> {
  const { data } = await admin
    .from('ai_chat_usage')
    .select('prompt_tokens, completion_tokens')
    .in('source', ['chat-sonnet', 'mentor-sonnet', 'sim-actor', 'sim-judge', 'sim-debrief'])
    .gte('date', monthStartIsrael())
  let pt = 0, ct = 0
  for (const r of (data || []) as Array<{ prompt_tokens?: number; completion_tokens?: number }>) {
    pt += Number(r.prompt_tokens) || 0
    ct += Number(r.completion_tokens) || 0
  }
  return ((pt * SONNET_IN_USD + ct * SONNET_OUT_USD) / 1_000_000) * USD_ILS
}

// Usage rows are keyed (user_id, date, source) — read-modify-write, same shape
// the mentors already use, so the admin cost panel picks these up for free.
// deno-lint-ignore no-explicit-any
export async function logUsage(
  admin: any,
  userId: string,
  source: string,
  promptTokens: number,
  completionTokens: number,
) {
  const date = todayIsrael()
  try {
    const { data: prev } = await admin
      .from('ai_chat_usage')
      .select('message_count, prompt_tokens, completion_tokens')
      .eq('user_id', userId).eq('date', date).eq('source', source)
      .maybeSingle()
    await admin.from('ai_chat_usage').upsert({
      user_id: userId,
      date,
      source,
      message_count: (Number(prev?.message_count) || 0) + 1,
      prompt_tokens: (Number(prev?.prompt_tokens) || 0) + promptTokens,
      completion_tokens: (Number(prev?.completion_tokens) || 0) + completionTokens,
    }, { onConflict: 'user_id,date,source' })
  } catch (e) {
    // Telemetry must never be able to break the feature.
    console.error('[logUsage] failed', e)
  }
}
