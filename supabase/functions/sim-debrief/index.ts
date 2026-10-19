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
import { debriefPrompt, patientName } from '../_shared/sim/prompts.ts'
import { resolveSkill } from '../_shared/sim/skills.ts'
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
      .select('spec, turn_budget, title, primary_skill, passing_score, video_id, module_id, lesson_id')
      .eq('id', sess.scenario_id).maybeSingle()
    if (!scen) return json({ error: 'תרחיש לא נמצא.' }, 404, cors)
    const spec = scen.spec as Spec
    const resolved = resolveSkill(scen.primary_skill, spec)
    const name = patientName(spec)
    const passingScore = Number(scen.passing_score) || 75
    const durationSeconds = sess.ended_at && sess.started_at
      ? Math.max(0, Math.round((Date.parse(sess.ended_at) - Date.parse(sess.started_at)) / 1000))
      : null
    const zeroScores = Object.fromEntries([...resolved.score_keys.map(k => k.key), 'overall'].map(k => [k, 0]))

    const { data: turns } = await admin.from('sim_turns')
      .select('turn_index, student_text, patient_text, evaluation, metrics_after')
      .eq('session_id', session_id).order('turn_index')

    const rows = turns || []
    if (rows.length <= 1) {
      const empty = {
        headline: 'הסשן נסגר לפני שהתחיל.',
        scores: zeroScores,
        score_labels: resolved.score_keys,
        strengths: [], growth_edges: [], replay_suggestion: null,
        missed_opportunities: [], actionable_takeaway: '',
        overall_score: 0, passed: false, passing_score: passingScore,
        outcome: sess.outcome, turns_used: sess.turn_count,
        facts_unlocked: sess.unlocked_facts || [], facts_missed: [],
        target_achieved: false, hint_count: Number((sess.flags || {}).hint_count) || 0,
      }
      await admin.from('sim_sessions')
        .update({ debrief: empty, status: 'debriefed', overall_score: 0, passed: false, duration_seconds: durationSeconds })
        .eq('id', session_id)
      return json({ debrief: empty }, 200, cors)
    }

    // The transcript the reviewer sees includes the machinery, so its feedback
    // is anchored to what actually happened rather than to its own re-reading.
    const transcript = rows.map(t => {
      if (t.turn_index === 0) return `[פתיחה]\n${name}: ${t.patient_text}`
      const ev = (t.evaluation || {}) as Record<string, unknown>
      const m = (t.metrics_after || {}) as Record<string, number>
      const unlockedNow = ev.unlocked_now ? ` | נפתח: ${ev.unlocked_now}` : ''
      return `[תור ${t.turn_index} | סיווג: ${ev.move}${unlockedNow} | `
        + `ראפור ${m.rapport} התנגדות ${m.resistance} עומק ${m.emotional_depth} ${resolved.labels.specificity} ${m.specificity}]\n`
        + `מטפל: ${t.student_text}\n${name}: ${t.patient_text}`
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

    const sys = debriefPrompt(spec, OUTCOME_HE[sess.outcome] || String(sess.outcome), Number(scen.turn_budget) || 12, resolved)
    // 3000, not 1400: the per-lesson debrief carries more fields (missed
    // opportunities, takeaway, three metrics) and Hebrew is token-heavy. At 1400
    // the JSON was cut mid-object and every debrief failed to parse (19.10.2026).
    // A cut or malformed answer gets one more attempt before giving up.
    const DEBRIEF_MAX_TOKENS = 3000
    let parsed: Record<string, unknown> | null = null
    let res = null
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      res = await callClaude(SONNET_MODEL, sys, '', [{ role: 'user', content: transcript }], DEBRIEF_MAX_TOKENS, 0.4)
      if (!res) continue
      await logUsage(admin, user.id, 'sim-debrief', res.promptTokens, res.completionTokens)
      parsed = parseEvaluation(res.text) as Record<string, unknown> | null
      if (!parsed) console.error('[sim-debrief] unparseable', res.completionTokens, res.text.slice(-120))
    }
    if (!res) return json({ error: 'התחקיר לא זמין כרגע. הסשן נשמר, אפשר לנסות שוב.' }, 503, cors)
    if (!parsed) return json({ error: 'התחקיר חזר בפורמט לא תקין. נסה שוב.' }, 502, cors)

    // Everything countable is computed here, not taken from the model. The model
    // writes the words; the engine owns the facts.
    //
    // Passing needs BOTH: the engine's outcome is success (the target was really
    // reached) AND the reviewer's overall score clears the bar. A session that
    // did not reach the target is capped just under the bar, so the stored number
    // can never contradict `passed` in the admin dashboard.
    const scores = (parsed.scores && typeof parsed.scores === 'object') ? parsed.scores as Record<string, unknown> : {}
    const clamp100 = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
    let overallScore = clamp100(scores.overall)
    const reachedTarget = sess.outcome === 'success'
    if (!reachedTarget) overallScore = Math.min(overallScore, passingScore - 1)
    const passed = reachedTarget && overallScore >= passingScore
    const pm = (parsed.metrics && typeof parsed.metrics === 'object') ? parsed.metrics as Record<string, unknown> : {}
    const strList = (v: unknown, n: number) => Array.isArray(v) ? v.slice(0, n).map(String) : []

    const debrief = {
      headline: String(parsed.headline || ''),
      scores: { ...scores, overall: overallScore },
      score_labels: resolved.score_keys,
      metrics: {
        rapport_calibration: clamp100(pm.rapport_calibration),
        linguistic_precision: clamp100(pm.linguistic_precision),
        technique_application: clamp100(pm.technique_application),
      },
      overall_score: overallScore,
      passed,
      passing_score: passingScore,
      missed_opportunities: strList(parsed.missed_opportunities, 3),
      actionable_takeaway: String(parsed.actionable_takeaway || ''),
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
      .update({
        debrief, status: 'debriefed',
        overall_score: overallScore, passed, duration_seconds: durationSeconds,
        tokens_in: Number(sess.tokens_in) + res.promptTokens,
        tokens_out: Number(sess.tokens_out) + res.completionTokens,
      })
      .eq('id', session_id)

    // "תורגל ✓" — an event in the shared completion log, never a write to
    // course_progress (that table means "watched the video", and the progress
    // bar and streak read it).
    if (passed) {
      const lessonIdentifier = scen.video_id
        || (scen.module_id != null && scen.lesson_id != null ? `${scen.module_id}-${scen.lesson_id}` : null)
      if (lessonIdentifier) {
        await admin.from('lesson_completion_events')
          .insert({ user_id: user.id, lesson_identifier: lessonIdentifier, source: 'sandbox' })
      }
    }

    return json({ debrief }, 200, cors)

  } catch (e) {
    console.error('[sim-debrief] fatal', e)
    return json({ error: 'שגיאה זמנית.' }, 500, corsHeaders(req))
  }
})
