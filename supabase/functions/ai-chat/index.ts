import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NLP_KNOWLEDGE } from './knowledge.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DAILY_LIMIT = 50

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // --- Check API key ---
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ reply: 'העוזר הלימודי עדיין בהקמה. פנו אלינו ב-WhatsApp לכל שאלה.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Build Gemini messages ---
    const contextNote = lessonContext
      ? `\n\n[התלמיד לומד כרגע: מודול ${lessonContext.moduleIndex + 1} — "${lessonContext.moduleTitle}", שיעור: "${lessonContext.lessonTitle}". התמקד בנושא זה.]`
      : ''

    const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    // Add history
    for (const m of history) {
      if (m.role === 'user' || m.role === 'model') {
        geminiContents.push({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })
      }
    }

    // Add current message
    geminiContents.push({
      role: 'user',
      parts: [{ text: message }]
    })

    // --- Call Gemini 2.0 Flash ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT + contextNote }]
          },
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      throw new Error('API call failed')
    }

    const data = await response.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'לא הצלחתי לענות. נסו שוב.'

    return new Response(
      JSON.stringify({
        reply,
        remaining: DAILY_LIMIT - (currentCount + 1)
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
