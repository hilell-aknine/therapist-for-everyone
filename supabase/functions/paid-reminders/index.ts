import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MASTER_LESSONS } from './master-lessons.ts'

// Personalized learning reminders — every user who opted in (paid + free portal).
// Runs hourly (secret-gated). For each user who chose THIS day+hour (Asia/Jerusalem),
// sends ONE personal WhatsApp nudge. Paid customers get their GOAL tied to the SPECIFIC
// next master lesson; free-portal learners get a goal-based nudge with the portal link.
// Honors whatsapp_opt_out, de-dupes within the hour via reminder_prefs.last_sent.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GREEN_API_URL = Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('GREEN_API_TOKEN') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const ALERT_PHONE = Deno.env.get('ALERT_PHONE') || '972549116092'
const SONNET_MODEL = 'claude-sonnet-4-6'
const DAY_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

interface NextLesson { title: string; module: string }

function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } }

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.startsWith('972')) { /* ok */ }
  else if (d.startsWith('0')) d = '972' + d.slice(1)
  else if (d.length === 9) d = '972' + d
  else return null
  return d.length >= 11 ? d : null
}

function israelNow(): { day: number; hour: number; key: string } {
  const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const key = `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}T${String(il.getHours()).padStart(2, '0')}`
  return { day: il.getDay(), hour: il.getHours(), key }
}

// Claude Sonnet — write the warm, personal reminder. Falls back to a template on failure.
const PORTAL_LINK = 'https://www.therapist-home.com/pages/course-library-v2.html'

async function writeMessage(name: string, goal: string, next: NextLesson | null, audience: 'master' | 'free' = 'master'): Promise<string> {
  const optout = '\n\n(להפסקת התזכורות אפשר להשיב "הסר".)'
  // Template fallback (also used when no AI key)
  const tmpl = audience === 'free'
    ? `היי ${name} 🙏\nבחרת שאזכיר לך לחזור ללמוד — אז הנה תזכורת קטנה 😊\nכמה דקות לימוד היום יקרבו אותך${goal ? ' ל' + goal : ' למטרה שלך'}.\nהפורטל מחכה לך: ${PORTAL_LINK}\n— הלל`
    : next
    ? `היי ${name} 🙏\nבחרת שאזכיר לך עכשיו לחזור ללמוד — אז הנה 😊\nהשלב הבא שמחכה לך במאסטר: "${next.title}" (${next.module}).\nכמה דקות עליו היום יקרבו אותך${goal ? ' ל' + goal : ' למטרה שלך'}. נתראה בפנים 🤍\n— הלל`
    : `היי ${name} 🙏\nכל הכבוד — סיימת את כל שיעורי המאסטר! 🎉\nזה הזמן לחזור ולתרגל את מה שהכי חשוב לך${goal ? ' עבור ' + goal : ''}. אני כאן 🤍\n— הלל`
  if (!ANTHROPIC_API_KEY) return tmpl + optout
  try {
    const system = audience === 'free'
      ? `אתה רם, המנחה של קורס ה-NLP החינמי ב"בית המטפלים". כתוב הודעת וואטסאפ קצרה (3-4 שורות), חמה ואישית, בגוף ראשון, שמזכירה בעדינות לתלמיד לחזור ללמוד בפורטל. אם נמסרה מטרה אישית — קשר אליה במילים שלו, בלי מכירתיות ובלי הגזמה. בעברית. אל תמציא תוכן שלא נמסר לך. סיים בשורה: ${PORTAL_LINK} ואז חתום "— הלל".`
      : `אתה רם, המנחה של קורס NLP מאסטר ב"בית המטפלים". כתוב הודעת וואטסאפ קצרה (3-4 שורות), חמה ואישית, בגוף ראשון, שמזכירה בעדינות לתלמיד לחזור ללמוד. קשר בין המטרה האישית שלו לבין השיעור הספציפי הבא שמחכה לו במאסטר — תהיה ספציפי ומדויק, בלי מכירתיות ובלי הגזמה. בעברית. אל תמציא תוכן שלא נמסר לך. חתום "— הלל".`
    const payload = audience === 'free'
      ? { name, goal: goal || '(לא צוין)', portal_link: PORTAL_LINK }
      : { name, goal: goal || '(לא צוין)', next_lesson: next ? `${next.title} (${next.module})` : '(סיים את כל הקורס)' }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 400, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
    })
    if (!res.ok) return tmpl + optout
    const data = await res.json()
    // deno-lint-ignore no-explicit-any
    const txt = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('').trim()
    return (txt || tmpl) + optout
  } catch { return tmpl + optout }
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) return false
  try {
    const res = await fetch(`${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
    })
    return res.ok
  } catch { return false }
}

// deno-lint-ignore no-explicit-any
async function nextMasterLesson(db: any, uid: string): Promise<NextLesson | null> {
  const { data } = await db.from('course_progress').select('video_id').eq('user_id', uid).eq('course_type', 'nlp-master').eq('completed', true)
  const done = new Set((data || []).map((r: { video_id: string }) => r.video_id))
  const nxt = MASTER_LESSONS.find(l => !done.has(l.video_id))
  return nxt ? { title: nxt.title, module: nxt.module } : null
}

// deno-lint-ignore no-explicit-any
async function userGoal(db: any, uid: string, prefsGoal: string | undefined): Promise<string> {
  if (prefsGoal && prefsGoal.trim()) return prefsGoal.trim()
  const { data } = await db.from('portal_questionnaires').select('why_nlp, vision_one_year, motivation_tip, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return ''
  return (data.vision_one_year || data.why_nlp || data.motivation_tip || '').trim()
}

serve(async (req) => {
  const cors = corsHeaders()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const key = url.searchParams.get('key') || req.headers.get('x-cron-secret') || ''
  if (!CRON_SECRET || key !== CRON_SECRET) return json({ error: 'forbidden' }, 403)

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Self-test: send a SAMPLE personalized reminder to a number (proves the full message path).
  const testPhone = url.searchParams.get('test_phone')
  if (testPhone) {
    const msg = await writeMessage('הלל', 'ביטחון עצמי ושליטה ברגשות', { title: MASTER_LESSONS[0].title, module: MASTER_LESSONS[0].module })
    const ok = await sendWhatsApp(testPhone.replace(/\D/g, ''), msg)
    return json({ test: true, phone: testPhone, sent: ok, sample_message: msg })
  }

  // Status report to Hillel: who activated reminders, their goal + chosen times.
  // Paid customers are always listed; free-portal users appear once they set prefs.
  if (url.searchParams.get('report') === '1') {
    const { data } = await db.from('profiles').select('full_name, role, reminder_prefs, whatsapp_opt_out')
      .or('role.eq.paid_customer,reminder_prefs.not.is.null')
    const on: string[] = [], off: string[] = []
    for (const r of (data || [])) {
      const p = r.reminder_prefs || {}
      const name = (r.full_name || 'לקוח').trim() + (r.role === 'paid_customer' ? ' 👑' : '')
      if (p.on && Array.isArray(p.days) && p.days.length && Array.isArray(p.hours) && p.hours.length) {
        const days = p.days.map((d: number) => DAY_HE[d] || d).join(',')
        const hours = p.hours.map((h: number) => String(h).padStart(2, '0') + ':00').join(',')
        const goal = (p.goal || '').trim()
        on.push(`• ${name}${goal ? ' — ' + goal : ''}\n   ימים ${days} · שעות ${hours}`)
      } else if (r.role === 'paid_customer') { off.push(name) }
    }
    const msg = `🔔 סטטוס תזכורות אישיות (👑 = מאסטר)\n\n` +
      `✅ הפעילו (${on.length}):\n${on.length ? on.join('\n') : '—'}\n\n` +
      `⏳ מאסטר שטרם הפעילו (${off.length}): ${off.length ? off.join(', ') : '—'}`
    const sent = await sendWhatsApp(ALERT_PHONE.replace(/\D/g, ''), msg)
    return json({ report: true, active: on.length, pending: off.length, sent })
  }

  const dry = url.searchParams.get('dry') === '1'
  const { day, hour, key: hourKey } = israelNow()

  const { data: rows, error } = await db
    .from('profiles')
    .select('id, full_name, phone, role, reminder_prefs, whatsapp_opt_out')
    .eq('whatsapp_opt_out', false)
    .not('reminder_prefs', 'is', null)
  if (error) return json({ error: error.message }, 500)

  const due: Array<{ id: string; name: string; phone: string; role: string; prefs: Record<string, unknown> }> = []
  for (const r of (rows || [])) {
    const p = r.reminder_prefs || {}
    if (!p.on) continue
    if (!Array.isArray(p.days) || !p.days.includes(day)) continue
    if (!Array.isArray(p.hours) || !p.hours.includes(hour)) continue
    if (p.last_sent === hourKey) continue
    const phone = normalizePhone(r.phone)
    if (!phone) continue
    due.push({ id: r.id, name: (r.full_name || '').trim().split(' ')[0], phone, role: r.role || '', prefs: p })
  }

  const results: Array<Record<string, unknown>> = []
  for (const c of due) {
    // Paid customers (and admin for self-testing) get the master-lesson nudge;
    // everyone else gets the free-portal nudge with the portal link.
    const isMaster = c.role === 'paid_customer' || c.role === 'admin'
    const next = isMaster ? await nextMasterLesson(db, c.id) : null
    const goal = await userGoal(db, c.id, c.prefs.goal as string | undefined)
    const msg = await writeMessage(c.name, goal, next, isMaster ? 'master' : 'free')
    if (dry) { results.push({ name: c.name, next: next?.title || '(finished)', goal, preview: msg }); continue }
    const ok = await sendWhatsApp(c.phone, msg)
    if (ok) await db.from('profiles').update({ reminder_prefs: { ...c.prefs, last_sent: hourKey } }).eq('id', c.id)
    results.push({ name: c.name, next: next?.title || '(finished)', sent: ok })
  }

  return json({ israel: { day, hour, hourKey }, candidates: (rows || []).length, due: due.length, results })
})
