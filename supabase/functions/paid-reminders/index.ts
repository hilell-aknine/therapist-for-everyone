import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Personalized learning reminders for paying customers. Runs hourly (secret-gated
// so a scheduler can call it). For each customer who opted in and chose THIS day +
// hour (Asia/Jerusalem) in their reminder_prefs, sends one gentle WhatsApp nudge.
// Honors profiles.whatsapp_opt_out and de-dupes within the same hour.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GREEN_API_URL = Deno.env.get('GREEN_API_URL') || 'https://api.green-api.com'
const GREEN_API_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') || ''
const GREEN_API_TOKEN = Deno.env.get('GREEN_API_TOKEN') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } }

// 972-format phone for Green API chatId.
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
  const day = il.getDay()   // 0=Sun .. 6=Sat
  const hour = il.getHours()
  const key = `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}`
  return { day, hour, key }
}

function buildMessage(firstName: string): string {
  const name = firstName || 'היי'
  return (
    `היי ${name} 🙏\n` +
    `בחרת לקבל ממני תזכורת עכשיו לחזור ללמוד ולתרגל — אז הנה היא 😊\n` +
    `אפילו כמה דקות בקורס המאסטר היום שוות הרבה. נתראה בפנים 🤍\n` +
    `— הלל\n\n` +
    `(להפסקת התזכורות אפשר להשיב "הסר".)`
  )
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!GREEN_API_INSTANCE || !GREEN_API_TOKEN) return false
  try {
    const res = await fetch(`${GREEN_API_URL}/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
    })
    return res.ok
  } catch { return false }
}

serve(async (req) => {
  const cors = corsHeaders()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const key = url.searchParams.get('key') || req.headers.get('x-cron-secret') || ''
  if (!CRON_SECRET || key !== CRON_SECRET) return json({ error: 'forbidden' }, 403)

  const dry = url.searchParams.get('dry') === '1'
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { day, hour, key: hourKey } = israelNow()

  // Paid customers who opted in and are not opted out. Filter day/hour in code.
  const { data: rows, error } = await db
    .from('profiles')
    .select('id, full_name, phone, reminder_prefs, whatsapp_opt_out')
    .eq('role', 'paid_customer')
    .eq('whatsapp_opt_out', false)
    .not('reminder_prefs', 'is', null)
  if (error) return json({ error: error.message }, 500)

  const due: Array<{ id: string; name: string; phone: string }> = []
  for (const r of (rows || [])) {
    const p = r.reminder_prefs || {}
    if (!p.on) continue
    if (!Array.isArray(p.days) || !p.days.includes(day)) continue
    if (!Array.isArray(p.hours) || !p.hours.includes(hour)) continue
    if (p.last_sent === hourKey) continue   // already sent this hour
    const phone = normalizePhone(r.phone)
    if (!phone) continue
    due.push({ id: r.id, name: (r.full_name || '').trim().split(' ')[0], phone })
  }

  const results: Array<Record<string, unknown>> = []
  for (const c of due) {
    if (dry) { results.push({ name: c.name, phone: c.phone, sent: 'dry' }); continue }
    const ok = await sendWhatsApp(c.phone, buildMessage(c.name))
    if (ok) {
      // stamp last_sent so we don't double-send this hour
      const cur = (rows || []).find(x => x.id === c.id)?.reminder_prefs || {}
      await db.from('profiles').update({ reminder_prefs: { ...cur, last_sent: hourKey } }).eq('id', c.id)
    }
    results.push({ name: c.name, phone: c.phone, sent: ok })
  }

  return json({ israel: { day, hour, hourKey }, candidates: (rows || []).length, due: due.length, results })
})
