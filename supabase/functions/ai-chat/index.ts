import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NLP_KNOWLEDGE } from './knowledge.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DAILY_LIMIT = 200
const MODEL = 'claude-sonnet-4-5-20241022'

// ===== SYSTEM PROMPT =====
const SYSTEM_PROMPT = `אתה רם — המורה הראשי של קורס NLP פרקטישנר ומאסטר פרקטישנר של בית הספר "בית המטפלים". אתה מומחה עולמי ל-NLP עם ניסיון של שנים בהכשרת מטפלים ומאמנים.

## הסגנון שלך:
- מקצועי אבל חם ואנושי, כמו מרצה שמדבר עם תלמיד אחד על אחד
- משתמש בדוגמאות מהשיעורים ובסיפורים אמיתיים מהקורס
- מסביר מושגים מורכבים בצורה פשוטה וברורה
- מעודד ונותן תחושה שהתלמיד מתקדם

## בסיס הידע שלך:
${NLP_KNOWLEDGE}

## כללים:
1. ענה על בסיס בסיס הידע שלמעלה. אם מידע לא מופיע בבסיס הידע — אמור בכנות שזה לא נלמד בקורס הזה ספציפית, אבל תן תשובה כללית מהידע שלך ב-NLP אם רלוונטי.
2. לעולם אל תמציא שמות חוקרים, ציטוטים או מחקרים ספציפיים.
3. ענה תמיד בעברית, בשפה מקצועית וברורה.
4. תן תשובות מפורטות ומקצועיות — הסבר את העניין לעומק עם דוגמאות. אל תקצר יתר על המידה.
5. כשמסביר טכניקה — תן את כל השלבים בצורה ממוספרת עם הסבר לכל שלב.
6. השתמש בדוגמאות ובסיפורים מהקורס כדי להמחיש נקודות.
7. אם התלמיד שואל מחוץ לנושאי NLP — ענה בקצרה והפנה בעדינות חזרה לחומר.
8. כשאתה לא בטוח — הודה בזה.
9. אם התלמיד מבקש תרגול — תן תרגול מעשי שאפשר לעשות לבד.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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
          error: `הגעת למגבלה היומית של ${DAILY_LIMIT} הודעות. חזור מחר!`,
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
    const contextNote = lessonContext
      ? `\n\n[התלמיד לומד כרגע: מודול ${lessonContext.moduleIndex + 1} — "${lessonContext.moduleTitle}", שיעור: "${lessonContext.lessonTitle}". התמקד בנושא זה.]`
      : ''

    const fullSystemPrompt = SYSTEM_PROMPT + studentProfile + contextNote

    // --- Build messages for Anthropic ---
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const m of history) {
      const role = (m.role === 'model' || m.role === 'assistant') ? 'assistant' : 'user'
      if (role === 'user' || role === 'assistant') {
        messages.push({ role, content: m.content })
      }
    }
    messages.push({ role: 'user', content: message })

    // --- Call Anthropic ---
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.4,
        system: fullSystemPrompt,
        messages
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[Anthropic] ${response.status}: ${errBody}`)
      return new Response(
        JSON.stringify({ reply: 'שגיאה זמנית בשירות ה-AI. נסו שוב בעוד כמה שניות.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const reply = data.content?.[0]?.text

    if (!reply) {
      console.error('[Anthropic] Empty response:', JSON.stringify(data))
      return new Response(
        JSON.stringify({ reply: 'לא התקבלה תשובה. נסו שוב.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Increment quota ONLY after successful response ---
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

    return new Response(
      JSON.stringify({
        reply,
        remaining: DAILY_LIMIT - (currentCount + 1),
        provider: 'anthropic',
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
