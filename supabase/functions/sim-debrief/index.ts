// =============================================================================
// sim-debrief — one good call on the whole transcript, once, at the end.
//
// Separate from sim-turn because it has the opposite cost profile: slow, big
// input, worth a strong model. Folding it into the turn loop would make every
// turn expensive. This is the "12 cheap calls and one good one" split.
//
// Idempotent: a session that already has a debrief returns the stored one
// instead of paying for it again.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { parseEvaluation, type Spec } from '../_shared/sim/engine.ts'
import { debriefPrompt } from '../_shared/sim/prompts.ts'
import {
  AI_MONTHLY_CAP_ILS, callClaude, corsHeaders, logUsage, monthlyCostShekel, SONNET_MODEL,
} from '../_shared/sim/llm.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const OUTCOME_HE: Record<string, string> = {
  success: 'הצלחה',
  budget: 'התקציב נגמר',
  collapse: 'קריסת קשר',
  abandoned: 'ננטש',
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'לא מחובר.' }, 401, cors)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authErr } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'אימות נכשל.' }, 401, cors)

    const { session_id } = await req.json().catch(() => ({}))
    if (!session_id) return json({ error: 'חסר מזהה סשן.' }, 400, cors)

    const { data: sess } = await admin.from('sim_sessions')
      .select('*').eq('id', session_id).eq('user_id', user.id).maybeSingle()
    if (!sess) return json({ error: 'סשן לא נמצא.' }, 404, cors)
    if (sess.debrief) return json({ debrief: sess.debrief, cached: true }, 200, cors)
    if (sess.status === 'in_session') return json({ error: 'הסשן עוד פתוח.' }, 409, cors)

    const { data: scen } = await admin.from('sim_scenarios')
      .select('spec, turn_budget, title').eq('id', sess.scenario_id).maybeSingle()
    if (!scen) return json({ error: 'תרחיש לא נמצא.' }, 404, cors)
    const spec = scen.spec as Spec

    const { data: turns } = await admin.from('sim_turns')
      .select('turn_index, student_text, patient_text, evaluation, metrics_after')
      .eq('session_id', session_id).order('turn_index')

    const rows = turns || []
    if (rows.length <= 1) {
      const empty = {
        headline: 'הסשן נסגר לפני שהתחיל.',
        scores: { rapport_building: 0, chunk_down: 0, language_discipline: 0, pacing: 0, overall: 0 },
        strengths: [], growth_edges: [], replay_suggestion: null,
        outcome: sess.outcome, turns_used: sess.turn_count,
        facts_unlocked: sess.unlocked_facts || [], facts_missed: [],
        target_achieved: false, hint_count: Number((sess.flags || {}).hint_count) || 0,
      }
      await admin.from('sim_sessions').update({ debrief: empty, status: 'debriefed' }).eq('id', session_id)
      return json({ debrief: empty }, 200, cors)
    }

    // The transcript the reviewer sees includes the machinery, so its feedback
    // is anchored to what actually happened rather than to its own re-reading.
    const transcript = rows.map(t => {
      if (t.turn_index === 0) return `[פתיחה]\nמירב: ${t.patient_text}`
      const ev = (t.evaluation || {}) as Record<string, unknown>
      const m = (t.metrics_after || {}) as Record<string, number>
      const unlockedNow = ev.unlocked_now ? ` | נפתח: ${ev.unlocked_now}` : ''
      return `[תור ${t.turn_index} | סיווג: ${ev.move}${unlockedNow} | `
        + `ראפור ${m.rapport} התנגדות ${m.resistance} עומק ${m.emotional_depth} פירוט ${m.specificity}]\n`
        + `מטפל: ${t.student_text}\nמירב: ${t.patient_text}`
    }).join('\n\n')

    const facts = spec.gated_facts || []
    const unlocked: string[] = sess.unlocked_facts || []
    const target = facts.find(f => f.is_target)

    // Budget ceiling. A session with no debrief is a session with no value, so
    // rather than blocking outright we return the deterministic part of the
    // report and say plainly that the written feedback is missing.
    if ((await monthlyCostShekel(admin)) >= AI_MONTHLY_CAP_ILS) {
      const partial = {
        headline: 'התחקיר הכתוב לא נוצר הפעם, מסיבת עלות. הנתונים למטה מדויקים.',
        scores: null,
        strengths: [], growth_edges: [], replay_suggestion: null,
        outcome: sess.outcome, turns_used: sess.turn_count,
        facts_unlocked: unlocked,
        facts_missed: facts.filter(f => !unlocked.includes(f.id)).map(f => f.id),
        target_achieved: !!(target && unlocked.includes(target.id)),
        final_metrics: sess.metrics,
        hint_count: Number((sess.flags || {}).hint_count) || 0,
        budget_blocked: true,
      }
      return json({ debrief: partial, budget_blocked: true }, 200, cors)
    }

    const sys = debriefPrompt(spec, OUTCOME_HE[sess.outcome] || String(sess.outcome), Number(scen.turn_budget) || 12)
    let res = await callClaude(SONNET_MODEL, sys, '', [{ role: 'user', content: transcript }], 1400, 0.4)
    if (!res) res = await callClaude(SONNET_MODEL, sys, '', [{ role: 'user', content: transcript }], 1400, 0.4)
    if (!res) return json({ error: 'התחקיר לא זמין כרגע. הסשן נשמר, אפשר לנסות שוב.' }, 503, cors)

    await logUsage(admin, user.id, 'sim-debrief', res.promptTokens, res.completionTokens)

    const parsed = parseEvaluation(res.text) as Record<string, unknown> | null
    if (!parsed) return json({ error: 'התחקיר חזר בפורמט לא תקין. נסה שוב.' }, 502, cors)

    // Everything countable is computed here, not taken from the model. The model
    // writes the words; the engine owns the facts.
    const debrief = {
      headline: String(parsed.headline || ''),
      scores: parsed.scores || null,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
      growth_edges: Array.isArray(parsed.growth_edges) ? parsed.growth_edges.slice(0, 3) : [],
      replay_suggestion: parsed.replay_suggestion || null,
      outcome: sess.outcome,
      turns_used: sess.turn_count,
      turn_budget: Number(scen.turn_budget) || 12,
      final_metrics: sess.metrics,
      facts_unlocked: unlocked,
      facts_missed: facts.filter(f => !unlocked.includes(f.id)).map(f => f.id),
      target_achieved: !!(target && unlocked.includes(target.id)),
      hint_count: Number((sess.flags || {}).hint_count) || 0,
      generated_at: new Date().toISOString(),
    }

    await admin.from('sim_sessions')
      .update({ debrief, status: 'debriefed', tokens_in: Number(sess.tokens_in) + res.promptTokens, tokens_out: Number(sess.tokens_out) + res.completionTokens })
      .eq('id', session_id)

    return json({ debrief }, 200, cors)

  } catch (e) {
    console.error('[sim-debrief] fatal', e)
    return json({ error: 'שגיאה זמנית.' }, 500, corsHeaders(req))
  }
})
