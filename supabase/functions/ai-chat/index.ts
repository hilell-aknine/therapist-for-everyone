import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NLP_KNOWLEDGE } from './knowledge.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DAILY_LIMIT = 50

// ===== SYSTEM PROMPTS =====

const SYSTEM_PROMPT = `אתה "המורה של NLP" — עוזר לימודי מקצועי של קורס NLP פרקטישנר ומאסטר פרקטישנר של בית הספר "מטפל לכל אחד".

## תפקידך:
- לענות על שאלות לגבי חומרי הקורס, טכניקות NLP, ותרגולים
- להסביר מושגים בצורה ברורה ופשוטה בעברית
- לעזור לתלמידים להבין טכניקות ולתרגל אותן
- לתת דוגמאות מעשיות ליישום הטכניקות בחיי היומיום

## בסיס הידע שלך:
${NLP_KNOWLEDGE}

## כללים:
- ענה תמיד בעברית
- תשובות ממוקדות (3-6 משפטים). הרחב רק אם התלמיד מבקש
- אל תמציא מידע — אם אתה לא בטוח, אמור "לא מצאתי מידע על זה בחומרי הקורס, אבל..."
- אם התלמיד שואל משהו מחוץ לנושאי הקורס, הפנה אותו בעדינות חזרה
- כשמסביר טכניקה, תן את השלבים בצורה מסודרת (1, 2, 3...)
- השתמש בדוגמאות מחיי היומיום כדי להמחיש מושגים
- אם התלמיד לומד שיעור ספציפי, התמקד בנושא של אותו שיעור`

// ===== ROUTER PROMPT (Layer A) =====
const ROUTER_PROMPT = `You are a question classifier for an NLP (Neuro-Linguistic Programming) course.
Classify the user's message into exactly one category. Reply with ONLY the category word, nothing else.

Categories:
- SIMPLE: Greetings, basic factual questions, course logistics, "what is X", definitions, yes/no questions
- MEDIUM: Explain a technique step-by-step, compare two concepts, give examples, practice exercises, lesson summaries
- COMPLEX: Deep psychological case analysis, therapeutic intervention planning, multi-layered NLP analysis of characters/relationships, questions requiring high empathy and nuanced psychological insight, creative role-play scenarios

User message: `

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ===== LAYER A: Router via Groq (fast small model) =====
async function routeQuestion(message: string): Promise<'SIMPLE' | 'MEDIUM' | 'COMPLEX'> {
  if (!GROQ_API_KEY) return 'MEDIUM' // Default if no router available

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'user', content: ROUTER_PROMPT + message }
        ],
        max_tokens: 10,
        temperature: 0
      })
    })

    if (response.ok) {
      const data = await response.json()
      const classification = (data.choices?.[0]?.message?.content || '').trim().toUpperCase()
      if (['SIMPLE', 'MEDIUM', 'COMPLEX'].includes(classification)) {
        return classification as 'SIMPLE' | 'MEDIUM' | 'COMPLEX'
      }
    }
  } catch (e) {
    console.error('Router error:', e)
  }

  return 'MEDIUM' // Default fallback
}

// ===== LAYER B: Gemini Flash (workhorse) =====
async function callGemini(
  message: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null

  const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const m of history) {
    if (m.role === 'user' || m.role === 'model') {
      geminiContents.push({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      })
    }
  }
  geminiContents.push({ role: 'user', parts: [{ text: message }] })

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
        })
      }
    )

    if (response.ok) {
      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null
    }
    console.error('Gemini failed, status:', response.status)
  } catch (e) {
    console.error('Gemini error:', e)
  }
  return null
}

// ===== LAYER B fallback: Groq LLaMA 70B =====
async function callGroq(
  chatMessages: Array<{ role: string; content: string }>
): Promise<string | null> {
  if (!GROQ_API_KEY) return null

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: chatMessages,
        max_tokens: 1024,
        temperature: 0.7
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    }
    const errText = await response.text()
    console.error('Groq API error:', errText)
  } catch (e) {
    console.error('Groq error:', e)
  }
  return null
}

// ===== LAYER C: Claude Sonnet (specialist) =====
async function callClaude(
  chatMessages: Array<{ role: string; content: string }>
): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null

  // Extract system message and conversation messages
  const systemMsg = chatMessages.find(m => m.role === 'system')?.content || ''
  const conversationMsgs = chatMessages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: systemMsg,
        messages: conversationMsgs
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.content?.[0]?.text || null
    }
    const errText = await response.text()
    console.error('Claude API error:', errText)
  } catch (e) {
    console.error('Claude error:', e)
  }
  return null
}

// ===== MAIN HANDLER =====
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth verification ---
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
    const { data: usage } = await supabaseAdmin
      .from('ai_chat_usage')
      .select('message_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    const currentCount = usage?.message_count || 0

    if (currentCount >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `הגעת למגבלה היומית של ${DAILY_LIMIT} הודעות. חזור מחר! 😊`,
          rateLimited: true,
          remaining: 0
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment usage
    if (usage) {
      await supabaseAdmin
        .from('ai_chat_usage')
        .update({ message_count: currentCount + 1 })
        .eq('user_id', user.id)
        .eq('date', today)
    } else {
      await supabaseAdmin
        .from('ai_chat_usage')
        .insert({ user_id: user.id, message_count: 1, date: today })
    }

    // --- Check API keys ---
    if (!GEMINI_API_KEY && !GROQ_API_KEY && !ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ reply: 'העוזר הלימודי עדיין בהקמה. פנו אלינו ב-WhatsApp לכל שאלה.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Fetch student profile from questionnaire ---
    let studentProfile = ''
    try {
      const { data: profile } = await supabaseAdmin
        .from('course_questionnaires')
        .select('full_name, experience_level, motivation, preferred_learning, interest_certification')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (profile) {
        const levelMap: Record<string, string> = {
          'beginner': 'מתחיל — לא למד NLP בעבר. הסבר בפשטות, תן דוגמאות בסיסיות, אל תניח ידע מוקדם.',
          'intermediate': 'בינוני — למד קורס בסיסי. אפשר להשתמש במונחים מקצועיים עם הסבר קצר.',
          'advanced': 'מתקדם — בעל ניסיון וידע. אפשר להעמיק, להשוות בין גישות, ולתת אתגרים ברמה גבוהה.'
        }
        const parts: string[] = []
        if (profile.full_name) parts.push(`שם התלמיד: ${profile.full_name}`)
        if (profile.experience_level) parts.push(`רמה: ${levelMap[profile.experience_level] || profile.experience_level}`)
        if (profile.motivation) parts.push(`מוטיבציה ללימודים: ${profile.motivation}`)
        if (profile.preferred_learning === 'online') parts.push('מעדיף למידה אונליין')
        else if (profile.preferred_learning === 'in_person') parts.push('מעדיף למידה פרונטלית')

        if (parts.length > 0) {
          studentProfile = `\n\n## פרופיל התלמיד (מותאם אישית):\n${parts.join('\n')}\n\nהתאם את רמת ההסבר, הדוגמאות והשפה לפרופיל התלמיד. אם הוא מתחיל — פשט. אם מתקדם — העמק.`
        }
      }
    } catch (e) {
      console.log('No student profile found, using default')
    }

    // --- Build context ---
    const contextNote = lessonContext
      ? `\n\n[התלמיד לומד כרגע: מודול ${lessonContext.moduleIndex + 1} — "${lessonContext.moduleTitle}", שיעור: "${lessonContext.lessonTitle}". התמקד בנושא זה.]`
      : ''

    const fullSystemPrompt = SYSTEM_PROMPT + studentProfile + contextNote

    // Build chat history (OpenAI-compatible format)
    const chatMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: fullSystemPrompt }
    ]
    for (const m of history) {
      if (m.role === 'user' || m.role === 'assistant' || m.role === 'model') {
        chatMessages.push({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content
        })
      }
    }
    chatMessages.push({ role: 'user', content: message })

    // ===== THREE-LAYER ROUTING =====

    // Layer A: Route the question
    const complexity = await routeQuestion(message)
    console.log(`[Router] "${message.slice(0, 50)}..." → ${complexity}`)

    let reply = ''
    let usedProvider = 'none'

    if (complexity === 'COMPLEX' && ANTHROPIC_API_KEY) {
      // Layer C: Claude Sonnet for complex questions
      console.log('[Layer C] Routing to Claude Sonnet')
      reply = await callClaude(chatMessages) || ''
      if (reply) usedProvider = 'claude'
    }

    if (!reply) {
      // Layer B: Gemini Flash for simple/medium (or Claude fallback)
      console.log('[Layer B] Routing to Gemini Flash')
      reply = await callGemini(message, history, fullSystemPrompt) || ''
      if (reply) usedProvider = 'gemini'
    }

    if (!reply) {
      // Layer B fallback: Groq LLaMA 70B
      console.log('[Layer B fallback] Routing to Groq')
      reply = await callGroq(chatMessages) || ''
      if (reply) usedProvider = 'groq'
    }

    if (!reply) {
      throw new Error('All AI providers failed')
    }

    console.log(`[Done] Provider: ${usedProvider}, Complexity: ${complexity}`)

    return new Response(
      JSON.stringify({
        reply,
        remaining: DAILY_LIMIT - (currentCount + 1),
        provider: usedProvider,
        complexity,
        personalized: studentProfile !== ''
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
