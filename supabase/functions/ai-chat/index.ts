import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `אתה עוזר לימודי מקצועי של קורס NLP פרקטישנר ומאסטר פרקטישנר של בית הספר "מטפל לכל אחד".

תפקידך:
- לענות על שאלות לגבי חומרי הקורס, טכניקות NLP, ותרגולים
- להסביר מושגים בצורה ברורה ופשוטה בעברית
- לעזור לתלמידים להבין טכניקות ולתרגל אותן

נושאי הקורס כוללים:
- הנחות יסוד של NLP (מפת המציאות, אין כישלון רק משוב, הגוף והנפש מערכת אחת)
- מערכות ייצוג (ויזואלי, אודיטורי, קינסתטי, אולפקטורי/גוסטטורי)
- תנועות עיניים ומערכות ייצוג
- עוגנים (Anchoring) - יצירה, שרשור, קריסה
- מטא-מודל ומילטון-מודל
- רפריימינג (reframing) - תוכן והקשר
- תת-אופנויות (Submodalities)
- קווי זמן (Timeline)
- אסטרטגיות NLP
- מודלים של שפה - מחיקות, עיוותים, הכללות
- ראפור ומיררינג
- פוביות ומודל הריפוי המהיר
- חלקים (Parts Integration)
- מטא-תוכניות (Meta Programs)
- מודלינג (Modeling)

כללים:
- ענה תמיד בעברית
- תשובות קצרות וממוקדות (3-5 משפטים אלא אם צריך יותר)
- אל תמציא מידע - אם אתה לא בטוח, אמור זאת
- אם התלמיד שואל משהו מחוץ לנושאי הקורס, הפנה אותו בעדינות חזרה`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ reply: 'העוזר הלימודי עדיין בהקמה. פנו אלינו ב-WhatsApp לכל שאלה.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { message, history = [] } = await req.json()

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Missing message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build messages array from history
    const messages = history
      .filter((m: { role: string; content: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content
      }))

    // Ensure the latest user message is included
    if (messages.length === 0 || messages[messages.length - 1].content !== message) {
      messages.push({ role: 'user', content: message })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', errorText)
      throw new Error('API call failed')
    }

    const data = await response.json()
    const reply = data.content?.[0]?.text || 'לא הצלחתי לענות. נסו שוב.'

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ reply: 'העוזר הלימודי עדיין בהקמה. בינתיים, פנו אלינו ב-WhatsApp לכל שאלה על הקורס.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
