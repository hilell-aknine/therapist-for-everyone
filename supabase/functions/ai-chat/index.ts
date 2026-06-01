import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NLP_KNOWLEDGE } from './knowledge.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DAILY_LIMIT = 200
const MODEL = 'stepfun/step-3.5-flash:free'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
9. אם התלמיד מבקש תרגול — תן תרגול מעשי שאפשר לעשות לבד.`

// ===== Knowledge base scoping =====
// Parse NLP_KNOWLEDGE ONCE at module load into: a small preamble, per-module
// sections (keyed by module number 1..7 from "## מודול N" headings) and the
// shared appendices (glossary + quotes — small + broadly useful, always kept).
function splitKnowledge(src: string) {
  const lines = src.split('\n')
  const heads: Array<{ title: string; start: number }> = []
  lines.forEach((ln, i) => {
    if (/^##\s+/.test(ln)) heads.push({ title: ln.replace(/^##\s+/, '').trim(), start: i })
  })

  const firstStart = heads.length ? heads[0].start : lines.length
  const preamble = lines.slice(0, firstStart).join('\n').trim()

  const moduleText: Record<number, string> = {}
  let appendix = ''
  heads.forEach((sec, idx) => {
    const end = idx + 1 < heads.length ? heads[idx + 1].start : lines.length
    const body = lines.slice(sec.start, end).join('\n').trim()
    const m = sec.title.match(/^מודול\s+(\d+)/)
    if (m) {
      moduleText[parseInt(m[1], 10)] = body
    } else {
      appendix += (appendix ? '\n\n' : '') + body  // appendices (glossary, quotes)
    }
  })

  return { preamble, moduleText, appendix }
}

const KB = splitKnowledge(NLP_KNOWLEDGE)

// Pick the slice of the knowledge base relevant to the lesson the user is on.
// Returns the full base as a safe fallback when no reliable module is known
// (e.g. the Master course sends a string context), so answer quality never drops.
function selectKnowledge(lessonContext: unknown): { text: string; scope: string } {
  let moduleNum: number | null = null
  if (lessonContext && typeof lessonContext === 'object') {
    const mi = (lessonContext as { moduleIndex?: unknown }).moduleIndex
    if (typeof mi === 'number' && Number.isInteger(mi) && mi >= 0) moduleNum = mi + 1
  }

  if (moduleNum && KB.moduleText[moduleNum]) {
    const text = [KB.preamble, KB.moduleText[moduleNum], KB.appendix].filter(Boolean).join('\n\n')
    return { text, scope: `module_${moduleNum}` }
  }
  return { text: NLP_KNOWLEDGE, scope: 'full' }
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

    // --- Parse request ---
    const { message, history = [], lessonContext } = await req.json()

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Missing message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Rate limiting ---
    const today = new Date().toISOString().split('T')[0]
    // Scope to source='chat' — gemini-mentor writes source='mentor' rows for the
    // same (user, date), which previously made this .single() match 2 rows.
    const { data: usage } = await supabaseAdmin
      .from('ai_chat_usage')
      .select('message_count, prompt_tokens, completion_tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('source', 'chat')
      .maybeSingle()

    const currentCount = usage?.message_count || 0

    if (currentCount >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `הגעת למגבלה היומית של ${DAILY_LIMIT} הודעות. אפשר להמשיך עם העוזר החינמי, או לחזור מחר!`,
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
    const contextNote = (lessonContext && typeof lessonContext === 'object' && typeof lessonContext.moduleIndex === 'number')
      ? `\n\n[התלמיד לומד כרגע: מודול ${lessonContext.moduleIndex + 1} — "${lessonContext.moduleTitle}", שיעור: "${lessonContext.lessonTitle}". התמקד בנושא זה.]`
      : (typeof lessonContext === 'string' && lessonContext)
        ? `\n\n[הקשר השיעור: ${lessonContext}. התמקד בנושא זה.]`
        : ''

    // Scope the knowledge base to the current lesson/module (token-bloat fix).
    const knowledge = selectKnowledge(lessonContext)

    const fullSystemPrompt =
      SYSTEM_PROMPT_HEADER +
      '\n\n## בסיס הידע שלך:\n' + knowledge.text +
      '\n\n' + SYSTEM_PROMPT_RULES +
      studentProfile + contextNote

    // --- Build messages for OpenRouter (OpenAI-compatible format) ---
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: fullSystemPrompt }
    ]
    for (const m of history) {
      const role = (m.role === 'model' || m.role === 'assistant') ? 'assistant' as const : 'user' as const
      messages.push({ role, content: m.content })
    }
    messages.push({ role: 'user', content: message })

    // --- Call OpenRouter ---
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.therapist-home.com',
        'X-Title': 'Beit HaMetaplim - NLP Portal'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.4,
        messages
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[OpenRouter] ${response.status}: ${errBody}`)
      return new Response(
        JSON.stringify({ reply: 'שגיאה זמנית בשירות ה-AI. נסו שוב בעוד כמה שניות.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content

    if (!reply) {
      console.error('[OpenRouter] Empty response:', JSON.stringify(data))
      return new Response(
        JSON.stringify({ reply: 'לא התקבלה תשובה. נסו שוב.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Usage accounting (efficiency monitoring) ---
    // Token counts let us verify the knowledge-scoping actually cut input cost.
    const promptTokens = Number(data.usage?.prompt_tokens) || 0
    const completionTokens = Number(data.usage?.completion_tokens) || 0

    // --- Increment quota + token totals ONLY after successful response ---
    if (usage) {
      await supabaseAdmin
        .from('ai_chat_usage')
        .update({
          message_count: currentCount + 1,
          prompt_tokens: (usage.prompt_tokens || 0) + promptTokens,
          completion_tokens: (usage.completion_tokens || 0) + completionTokens
        })
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('source', 'chat')
    } else {
      await supabaseAdmin
        .from('ai_chat_usage')
        .insert({
          user_id: user.id,
          message_count: 1,
          date: today,
          source: 'chat',
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens
        })
    }

    return new Response(
      JSON.stringify({
        reply,
        remaining: DAILY_LIMIT - (currentCount + 1),
        provider: 'openrouter',
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
