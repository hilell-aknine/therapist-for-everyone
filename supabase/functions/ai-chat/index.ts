import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NLP_KNOWLEDGE } from './knowledge.ts'
import { MASTER_KNOWLEDGE } from './knowledge-master.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Daily message caps, per user, by role.
// The mentor used to be paid-only (hard 403 for everyone else), which is why almost
// nobody ever touched it. It is now open to every logged-in learner — the throttle,
// not a lock, is what protects the spend. Master members keep the generous cap.
const DAILY_LIMIT = 200        // paid_customer / admin
const DAILY_LIMIT_FREE = 30    // any other logged-in learner
const MODEL = 'stepfun/step-3.5-flash:free'
const OPENROUTER_FALLBACK = 'nvidia/nemotron-3-nano-30b-a3b:free'
const GEMINI_MODEL = 'gemini-2.0-flash'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// ===== Claude Sonnet (primary smart model) + monthly budget cap =====
// The mentor now answers with claude-sonnet-4-6. A hard monthly ₪ ceiling,
// shared across both mentors (ai-chat + gemini-mentor), protects spend: once
// the month's Sonnet cost reaches the cap we silently fall back to Gemini.
// Cost is derived from tokens logged on source='chat-sonnet'/'mentor-sonnet'.
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const SONNET_MODEL = 'claude-sonnet-4-6'
const SONNET_IN_USD = Number(Deno.env.get('SONNET_IN_USD')) || 3      // $/1M input tokens
const SONNET_OUT_USD = Number(Deno.env.get('SONNET_OUT_USD')) || 15   // $/1M output tokens
const USD_ILS = Number(Deno.env.get('USD_ILS')) || 3.8               // conservative FX (cap never overshoots)
const AI_MONTHLY_CAP_ILS = Number(Deno.env.get('AI_MONTHLY_CAP_ILS')) || 100

// ===== SYSTEM PROMPT =====
// Split into HEADER (role/style) + RULES so the knowledge base can be injected
// PER REQUEST, scoped to the current lesson — instead of baking the full ~65KB
// NLP_KNOWLEDGE into a static constant sent on every message (audit-2026-06-01,
// AI token bloat #1).
const SYSTEM_PROMPT_HEADER = `אתה רם — העוזר המקצועי החכם של פורטל "בית המטפלים", מומחה ל-NLP (תכנות עצבי-לשוני) עם ניסיון עשיר בהכשרת מטפלים ומאמנים.

## התפקיד שלך:
- אתה מלווה מקצועי למטפלי NLP בכל שלבי הלמידה — מפרקטישנר ועד מאסטר פרקטישנר.
- אתה עוזר לתלמידים להבין מושגים, לתרגל טכניקות, ולהעמיק בחומר הקורס.
- אתה מרצה מנוסה שמדבר עם תלמיד אחד על אחד — חם, מקצועי ותומך.

## הסגנון שלך:
- מקצועי אבל חם ואנושי
- משתמש בדוגמאות מהשיעורים ובסיפורים אמיתיים מהקורס
- מסביר מושגים מורכבים בצורה פשוטה וברורה
- מעודד ונותן תחושה שהתלמיד מתקדם`

const SYSTEM_PROMPT_RULES = `## כללים:
1. ענה על בסיס בסיס הידע שלמעלה. אם מידע לא מופיע בבסיס הידע — אמור בכנות שזה לא נלמד בקורס הזה ספציפית, אבל תן תשובה כללית מהידע שלך ב-NLP אם רלוונטי.
2. לעולם אל תמציא שמות חוקרים, ציטוטים או מחקרים ספציפיים.
3. ענה תמיד בעברית, בשפה מקצועית וברורה.
4. תן תשובות מפורטות ומקצועיות — הסבר את העניין לעומק עם דוגמאות. אל תקצר יתר על המידה.
5. כשמסביר טכניקה — תן את כל השלבים בצורה ממוספרת עם הסבר לכל שלב.
6. השתמש בדוגמאות ובסיפורים מהקורס כדי להמחיש נקודות.
7. אם התלמיד שואל מחוץ לנושאי NLP — ענה בקצרה והפנה בעדינות חזרה לחומר.
8. כשאתה לא בטוח — הודה בזה.
9. אם התלמיד מבקש תרגול — תן תרגול מעשי שאפשר לעשות לבד.
10. הישאר אך ורק בתוך תוכן הקורס וה-NLP. אם השאלה אינה קשורה לקורס — דחה בנימוס במשפט אחד והחזר את התלמיד לחומר. אל תיגרר לנושאים אחרים.
11. כשמתאים פדגוגית (התלמיד אומר שהבין, או מתקשה במושג) — אתה רשאי להציע *כשאלה* קצרה: "רוצה לבדוק שהבנת דרך דמות או סצנה מסדרה/סרט שאתה מכיר?" וקשר את המושג מהקורס לדוגמה שהתלמיד מכיר, כדי להכניס אותו לחיי היומיום. הצע זאת רק כשזה תורם, לא בכל הודעה, ותמיד מתוך מושגי הקורס.`

// ===== MASTER COURSE SYSTEM PROMPT =====
// Used when courseType === 'master'. Tone is advanced/practitioner-trainer level.
// The Master course is taught by רם. Students are Practitioner graduates.
const SYSTEM_PROMPT_MASTER_HEADER = `אתה רם — המנחה המקצועי של קורס NLP מאסטר בפורטל "בית המטפלים". אתה מאמן NLP בכיר עם שנים של ניסיון בהכשרת מאמנים ומטפלים ברמת מאסטר פרקטישינר.

## התפקיד שלך:
- אתה מלווה מקצועי לבוגרי קורס פרקטישינר שמעמיקים ברמת מאסטר.
- אתה עוזר לתלמידים לשלב כלים מתקדמים בקליניקה ובחיי היומיום.
- אתה מרצה מנוסה שמדבר כ"עמית מקצועי" — מתוך הנחה שהתלמיד כבר שולט בבסיס.

## הסגנון שלך:
- מקצועי, מעמיק ומדויק — כאילו אתה מדבר עם מאמן/מטפל מתמחה
- מתייחס לשאלות ברמת הניואנס: "למה הטכניקה עובדת כך?" "מתי לבחור בזה לעומת אחר?"
- מחבר בין תיאוריה לפרקטיקה של קליניקה
- מעודד חשיבה ביקורתית ולא שינון`

const SYSTEM_PROMPT_MASTER_RULES = `## כללים:
1. הניח שהתלמיד מכיר את הבסיס (פרקטישינר) — אל תסביר מושגים בסיסיים אלא אם נשאל.
2. ענה על בסיס בסיס הידע שלמעלה. אם מידע לא מופיע בבסיס הידע — ציין זאת, ותן תשובה מקצועית מניסיונך ב-NLP.
3. לעולם אל תמציא שמות חוקרים, ציטוטים או מחקרים ספציפיים.
4. ענה תמיד בעברית, בשפה מקצועית ועניינית.
5. תן תשובות מעמיקות עם ניואנסים — ברמת "מאמן מכשיר מאמן".
6. כשמסביר טכניקה — כלול שיקולים קליניים: מתי כן, מתי לא, טעויות נפוצות.
7. אם שאלה יוצאת מגדר נושאי הקורס — ענה בקצרה והחזר לחומר.
8. כשאתה לא בטוח — הודה בזה בכנות מקצועית.
9. אם מבקשים תרגול — תן תרגול ברמת "אפשר להשתמש בקליניקה מחר".
10. הישאר אך ורק בתוך תוכן הקורס וה-NLP. שאלה שאינה קשורה לקורס — דחה בנימוס במשפט אחד והחזר לחומר.
11. כשמתאים פדגוגית — אתה רשאי להציע *כשאלה* לבדוק הבנה דרך דמות/סצנה מסדרה או סרט שהתלמיד מכיר, כדי לחבר את המושג לחיי היומיום. רק כשזה תורם, לא בכל הודעה, ותמיד מתוך מושגי הקורס.`

// ===== Knowledge base scoping =====
// Parse a knowledge base string ONCE at module load into: a small preamble,
// per-section text (keyed by section number), and shared appendices.
// sectionPattern: regex to extract section number from a "## ..." heading.
//   Practitioner KB: /^מודול\s+(\d+)/
//   Master KB:       /^מפגש\s+(\d+)/
function splitKnowledge(src: string, sectionPattern: RegExp) {
  const lines = src.split('\n')
  const heads: Array<{ title: string; start: number }> = []
  lines.forEach((ln, i) => {
    if (/^##\s+/.test(ln)) heads.push({ title: ln.replace(/^##\s+/, '').trim(), start: i })
  })

  const firstStart = heads.length ? heads[0].start : lines.length
  const preamble = lines.slice(0, firstStart).join('\n').trim()

  const sectionText: Record<number, string> = {}
  let appendix = ''
  heads.forEach((sec, idx) => {
    const end = idx + 1 < heads.length ? heads[idx + 1].start : lines.length
    const body = lines.slice(sec.start, end).join('\n').trim()
    const m = sec.title.match(sectionPattern)
    if (m) {
      sectionText[parseInt(m[1], 10)] = body
    } else {
      appendix += (appendix ? '\n\n' : '') + body  // appendices (glossary, quotes)
    }
  })

  return { preamble, sectionText, appendix }
}

// Parse both KBs once at module load.
const KB_PRACTITIONER = splitKnowledge(NLP_KNOWLEDGE, /^מודול\s+(\d+)/)
const KB_MASTER = splitKnowledge(MASTER_KNOWLEDGE, /^מפגש\s+(\d+)/)

// Pick the slice of the knowledge base relevant to the lesson the user is on.
// isMaster: selects master KB and section pattern; defaults to practitioner.
// Returns the full KB as a safe fallback when no reliable section is known.
function selectKnowledge(
  lessonContext: unknown,
  isMaster: boolean
): { text: string; scope: string } {
  const kb = isMaster ? KB_MASTER : KB_PRACTITIONER
  const fullSrc = isMaster ? MASTER_KNOWLEDGE : NLP_KNOWLEDGE
  const sectionLabel = isMaster ? 'session' : 'module'

  let sectionNum: number | null = null
  if (lessonContext && typeof lessonContext === 'object') {
    const mi = (lessonContext as { moduleIndex?: unknown }).moduleIndex
    if (typeof mi === 'number' && Number.isInteger(mi) && mi >= 0) sectionNum = mi + 1
  }

  if (sectionNum && kb.sectionText[sectionNum]) {
    const text = [kb.preamble, kb.sectionText[sectionNum], kb.appendix].filter(Boolean).join('\n\n')
    return { text, scope: `${sectionLabel}_${sectionNum}` }
  }
  return { text: fullSrc, scope: 'full' }
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

// ── AI providers: Gemini direct (primary) + OpenRouter (free + fallback) ──
// Each returns { reply, promptTokens, completionTokens, provider } or null on failure,
// so the handler can try them in order and degrade gracefully instead of dying on one outage.
async function callGemini(systemPrompt: string, convo: Array<{ role: string; content: string }>) {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith('AIza')) return null
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body: Record<string, unknown> = {
    contents: convo.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096, topP: 0.9 },
  }
  const call = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let res = await call()
  if (res.status === 429) { await new Promise(r => setTimeout(r, 3000)); res = await call() }   // one retry on rate-limit
  if (!res.ok) { console.error(`[Gemini] ${res.status}: ${await res.text()}`); return null }
  const data = await res.json()
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!reply) return null
  const um = data.usageMetadata || {}
  return { reply, promptTokens: Number(um.promptTokenCount) || 0, completionTokens: Number(um.candidatesTokenCount) || 0, provider: 'gemini' }
}

async function callOpenRouter(messages: Array<{ role: string; content: string }>, model: string) {
  if (!OPENROUTER_API_KEY) return null
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.therapist-home.com',
      'X-Title': 'Beit HaMetaplim - NLP Portal',
    },
    body: JSON.stringify({ model, max_tokens: 4096, temperature: 0.4, messages }),
  })
  if (!res.ok) { console.error(`[OpenRouter/${model}] ${res.status}: ${await res.text()}`); return null }
  const data = await res.json()
  const reply = data.choices?.[0]?.message?.content
  if (!reply) return null
  return { reply, promptTokens: Number(data.usage?.prompt_tokens) || 0, completionTokens: Number(data.usage?.completion_tokens) || 0, provider: `openrouter:${model}` }
}

// ── Claude Sonnet (primary). System is split into a STABLE block (role + scoped
// knowledge + rules) that is prompt-cached, and a VOLATILE block (per-student
// profile + lesson note) that is not — so repeat questions on the same lesson
// read the big knowledge block from cache (~10x cheaper input). ──
async function callSonnet(systemStable: string, systemVolatile: string, convo: Array<{ role: string; content: string }>) {
  if (!ANTHROPIC_API_KEY) return null
  const system: Array<Record<string, unknown>> = [
    { type: 'text', text: systemStable, cache_control: { type: 'ephemeral' } },
  ]
  if (systemVolatile && systemVolatile.trim()) system.push({ type: 'text', text: systemVolatile })
  const messages = convo.map(m => ({
    role: (m.role === 'assistant' || m.role === 'model') ? 'assistant' : 'user',
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
      body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 4096, thinking: { type: 'disabled' }, system, messages }),
    })
    if (!res.ok) { console.error(`[Sonnet] ${res.status}: ${await res.text()}`); return null }
    const data = await res.json()
    const reply = (data.content || []).filter((b: { type?: string }) => b.type === 'text').map((b: { text?: string }) => b.text || '').join('').trim()
    if (!reply) return null
    const u = data.usage || {}
    // prompt_tokens = all input (fresh + cache write + cache read); priced conservatively at full input rate.
    const promptTokens = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0)
    const completionTokens = Number(u.output_tokens) || 0
    return { reply, promptTokens, completionTokens, provider: 'sonnet' }
  } catch (e) { console.error('[Sonnet] error', e); return null }
}

// First day of the current month in Asia/Jerusalem, as 'YYYY-MM-01' (DATE compare).
function monthStartIsrael(): string {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${ym}-01`
}

// Month-to-date Sonnet spend in ₪, shared across both mentors. Conservative:
// every input token billed at full input rate (cache reads are actually cheaper),
// so the real spend is always ≤ this number → the cap can never be overshot.
// deno-lint-ignore no-explicit-any
async function monthlyCostShekel(supabaseAdmin: any): Promise<number> {
  const since = monthStartIsrael()
  const { data } = await supabaseAdmin
    .from('ai_chat_usage')
    .select('prompt_tokens, completion_tokens')
    .in('source', ['chat-sonnet', 'mentor-sonnet'])
    .gte('date', since)
  let pt = 0, ct = 0
  for (const r of (data || []) as Array<{ prompt_tokens?: number; completion_tokens?: number }>) { pt += Number(r.prompt_tokens) || 0; ct += Number(r.completion_tokens) || 0 }
  const usd = (pt * SONNET_IN_USD + ct * SONNET_OUT_USD) / 1_000_000
  return usd * USD_ILS
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'לא מחובר. התחבר כדי להשתמש בעוזר הלימודי.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'אימות נכשל. נסה להתחבר מחדש.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Role → daily cap (cost control) ---
    // Open to every authenticated learner. Cost is bounded by the per-role daily cap
    // below plus the monthly ₪ ceiling (AI_MONTHLY_CAP_ILS), which degrades to the free
    // models rather than blocking anyone. Login is still required — no anonymous access.
    const { data: roleRow } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = roleRow?.role
    const isPaid = role === 'paid_customer' || role === 'admin'
    const dailyLimit = isPaid ? DAILY_LIMIT : DAILY_LIMIT_FREE

    // --- Parse request ---
    // courseType: 'master' activates the master KB and master system prompt.
    // The client sends this either as a top-level field or nested in lessonContext.
    const { message, history = [], lessonContext, courseType: topLevelCourseType } = await req.json()
    const lessonCourseType = (lessonContext && typeof lessonContext === 'object')
      ? (lessonContext as { courseType?: unknown }).courseType
      : undefined
    const isMaster = topLevelCourseType === 'master' || lessonCourseType === 'master'

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Missing message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Rate limiting (daily, per user) ---
    // Count BOTH model rows for this mentor: 'chat' (Gemini fallback) + 'chat-sonnet'
    // (Sonnet). The daily limit is on total messages regardless of which model answered.
    const today = new Date().toISOString().split('T')[0]
    const { data: usageRows } = await supabaseAdmin
      .from('ai_chat_usage')
      .select('source, message_count, prompt_tokens, completion_tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .in('source', ['chat', 'chat-sonnet'])

    const rowBySource: Record<string, { message_count?: number; prompt_tokens?: number; completion_tokens?: number }> = {}
    let currentCount = 0
    for (const r of (usageRows || [])) { rowBySource[r.source] = r; currentCount += Number(r.message_count) || 0 }

    if (currentCount >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: isPaid
            ? `הגעת למגבלה היומית של ${dailyLimit} הודעות. נתראה מחר!`
            : `הגעת למגבלה היומית של ${dailyLimit} הודעות. אפשר להמשיך לתרגל במשחק, לחזור מחר, או לשדרג לקורס המאסטר לשיחה בלי הגבלה כמעט 👑`,
          rateLimited: true,
          remaining: 0
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Student profile (personalization) ---
    let studentProfile = ''
    try {
      const { data: profile } = await supabaseAdmin
        .from('course_questionnaires')
        .select('full_name, experience_level, motivation, preferred_learning')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (profile) {
        const levelMap: Record<string, string> = {
          'beginner': 'מתחיל — הסבר בפשטות, אל תניח ידע מוקדם.',
          'intermediate': 'בינוני — אפשר להשתמש במונחים מקצועיים עם הסבר קצר.',
          'advanced': 'מתקדם — אפשר להעמיק ולאתגר.'
        }
        const parts: string[] = []
        if (profile.full_name) parts.push(`שם התלמיד: ${profile.full_name}`)
        if (profile.experience_level) parts.push(`רמה: ${levelMap[profile.experience_level] || profile.experience_level}`)
        if (profile.motivation) parts.push(`מוטיבציה: ${profile.motivation}`)

        if (parts.length > 0) {
          studentProfile = `\n\n## פרופיל התלמיד:\n${parts.join('\n')}\nהתאם את רמת ההסבר לפרופיל.`
        }
      }
    } catch (_e) {
      // No profile — use default
    }

    // --- Build context ---
    // Build a context note describing which session/module the student is currently on.
    let contextNote = ''
    if (lessonContext && typeof lessonContext === 'object') {
      const lc = lessonContext as { moduleIndex?: unknown; moduleTitle?: unknown; lessonTitle?: unknown }
      if (typeof lc.moduleIndex === 'number') {
        const sectionLabel = isMaster ? 'מפגש' : 'מודול'
        const titlePart = lc.moduleTitle ? ` — "${lc.moduleTitle}"` : ''
        const lessonPart = lc.lessonTitle ? `, שיעור: "${lc.lessonTitle}"` : ''
        contextNote = `\n\n[התלמיד לומד כרגע: ${sectionLabel} ${lc.moduleIndex + 1}${titlePart}${lessonPart}. התמקד בנושא זה.]`
      }
    } else if (typeof lessonContext === 'string' && lessonContext) {
      contextNote = `\n\n[הקשר השיעור: ${lessonContext}. התמקד בנושא זה.]`
    }

    // Scope the knowledge base to the current lesson/module (token-bloat fix).
    // Route to master KB when isMaster, otherwise use practitioner KB (unchanged behaviour).
    const knowledge = selectKnowledge(lessonContext, isMaster)

    // Assemble system prompt. STABLE block (cached by Sonnet across users on the same
    // lesson) = header + scoped KB + rules. VOLATILE block = per-student profile +
    // current-lesson note (changes per request, so it sits after the cache breakpoint).
    const promptHeader = isMaster ? SYSTEM_PROMPT_MASTER_HEADER : SYSTEM_PROMPT_HEADER
    const promptRules = isMaster ? SYSTEM_PROMPT_MASTER_RULES : SYSTEM_PROMPT_RULES

    const stableSystem =
      promptHeader +
      '\n\n## בסיס הידע שלך:\n' + knowledge.text +
      '\n\n' + promptRules
    const volatileSystem = (studentProfile + contextNote).trim()
    const fullSystemPrompt = volatileSystem ? stableSystem + '\n' + volatileSystem : stableSystem

    // Conversation turns (history + new question), shared by every provider.
    const convo: Array<{ role: string; content: string }> = []
    for (const m of history) {
      const role = (m.role === 'model' || m.role === 'assistant') ? 'assistant' : 'user'
      convo.push({ role, content: m.content })
    }
    convo.push({ role: 'user', content: message })

    // OpenRouter (OpenAI-compatible) wants the system prompt as the first message.
    const messagesForOR: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: fullSystemPrompt },
      ...convo.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // --- Call AI: Sonnet (primary, smart) within budget → Gemini → OpenRouter x2 ---
    // Budget gate: once the month's shared Sonnet spend reaches the cap, skip Sonnet
    // and serve from the free model so the mentor keeps working at zero extra cost.
    const overBudget = (await monthlyCostShekel(supabaseAdmin)) >= AI_MONTHLY_CAP_ILS

    let result = overBudget ? null : await callSonnet(stableSystem, volatileSystem, convo)
    if (!result) { if (!overBudget) console.log('[ai-chat] Sonnet unavailable → Gemini'); result = await callGemini(fullSystemPrompt, convo) }
    if (!result) { console.log('[ai-chat] Gemini failed → OpenRouter primary'); result = await callOpenRouter(messagesForOR, MODEL) }
    if (!result) { console.log('[ai-chat] OpenRouter primary failed → OpenRouter fallback'); result = await callOpenRouter(messagesForOR, OPENROUTER_FALLBACK) }

    if (!result) {
      console.error('[ai-chat] All providers failed (Gemini + OpenRouter x2)')
      return new Response(
        JSON.stringify({ reply: 'העוזר עמוס כרגע. נסו שוב בעוד רגע 🙏' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const reply = result.reply
    const promptTokens = result.promptTokens
    const completionTokens = result.completionTokens

    // --- Log usage to the row matching the model that answered ---
    // Sonnet → 'chat-sonnet' (the billable rows the budget cap + cost panel read);
    // Gemini/OpenRouter fallback → 'chat' (free). Each source keeps its own totals.
    const logSource = result.provider === 'sonnet' ? 'chat-sonnet' : 'chat'
    const prev = rowBySource[logSource] || {}
    await supabaseAdmin
      .from('ai_chat_usage')
      .upsert({
        user_id: user.id,
        date: today,
        source: logSource,
        message_count: (Number(prev.message_count) || 0) + 1,
        prompt_tokens: (Number(prev.prompt_tokens) || 0) + promptTokens,
        completion_tokens: (Number(prev.completion_tokens) || 0) + completionTokens,
      }, { onConflict: 'user_id,date,source' })

    return new Response(
      JSON.stringify({
        reply,
        remaining: dailyLimit - (currentCount + 1),
        dailyLimit,
        provider: result.provider,
        personalized: studentProfile !== '',
        knowledgeScope: knowledge.scope,
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ reply: 'שגיאה זמנית. נסו שוב בעוד כמה שניות.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
