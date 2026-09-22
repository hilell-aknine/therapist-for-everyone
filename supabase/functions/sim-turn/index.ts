// =============================================================================
// sim-turn — the simulator's turn loop.
//
//   validating → evaluating (judge) → applying (engine) → acting (actor)
//
// The order is the design. The judge runs BEFORE the actor, so the actor plays a
// state that was already decided. Run it the other way and the model commits to
// a reply first and the "judgement" just rationalises it.
//
// Nothing here trusts the client: the session is loaded by id AND user_id, the
// scenario spec never leaves the server, and metrics are written under
// service_role because `authenticated` has no UPDATE policy on sim_sessions.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  applyTurn, buildConvo, checkTerminal, normalizeEvaluation, parseEvaluation,
  preClassify, shouldSummarize, turnsToSummarize,
  type Evaluation, type GatedFact, type Metrics, type Spec, type TurnRow,
} from '../_shared/sim/engine.ts'
import { actorStable, actorVolatile, judgePrompt, SUMMARY_PROMPT } from '../_shared/sim/prompts.ts'
import {
  AI_MONTHLY_CAP_ILS, callClaude, callGemini, callOpenRouter, corsHeaders,
  HAIKU_MODEL, logUsage, monthlyCostShekel, SONNET_MODEL, todayIsrael,
} from '../_shared/sim/llm.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_STUDENT_CHARS = 600
const DAILY_SESSIONS = 3

// Anything the learner types that is really an attempt to talk to the model
// instead of to the patient. Caught here so it never reaches the actor prompt.
const BREAK_CHARACTER_RE =
  /(אתה בינה|אתה ai|ignore (previous|all)|system prompt|התעלם מההוראות|צא מהדמות|את מודל|תפסיק לשחק)/i

// The learner writing about their own distress, not the patient's. The session
// stops and a human contact is shown. Keyword-based on purpose: this must not
// depend on a model's judgement.
const SELF_HARM_RE =
  /(אני רוצה למות|לשים סוף לחיי|לאבד את עצמי לדעת|אין לי סיבה לחיות|אני מתכוון לפגוע בעצמי)/

type Json = Record<string, unknown>

function json(body: Json, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
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
    if (authErr || !user) return json({ error: 'אימות נכשל. התחבר מחדש.' }, 401, cors)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'turn')

    // ── role gate ────────────────────────────────────────────────────────────
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = prof?.role
    const isAdmin = role === 'admin'
    const isPaid = role === 'paid_customer' || isAdmin

    if (action === 'start') {
      return await handleStart(admin, user.id, isPaid, isAdmin, body, cors)
    }
    if (action === 'abandon') {
      await admin.from('sim_sessions')
        .update({ status: 'ended', outcome: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', String(body.session_id || '')).eq('user_id', user.id).eq('status', 'in_session')
      return json({ ok: true }, 200, cors)
    }
    if (action === 'hint') {
      return await handleHint(admin, user.id, body, cors)
    }
    if (action !== 'turn') return json({ error: 'פעולה לא מוכרת.' }, 400, cors)

    // ── validating ───────────────────────────────────────────────────────────
    const sessionId = String(body.session_id || '')
    const studentText = String(body.text || '').trim()

    if (!sessionId) return json({ error: 'חסר מזהה סשן.' }, 400, cors)
    if (!studentText) return json({ error: 'לא נכתב כלום.' }, 400, cors)
    if (studentText.length > MAX_STUDENT_CHARS) {
      return json({ error: `עד ${MAX_STUDENT_CHARS} תווים. במציאות גם מטופל לא סופג יותר מזה בבת אחת.` }, 400, cors)
    }
    if (SELF_HARM_RE.test(studentText)) {
      await admin.from('sim_sessions')
        .update({ status: 'ended', outcome: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', sessionId).eq('user_id', user.id)
      return json({
        safety_stop: true,
        message: 'עצרנו את התרגול. אם מה שכתבת נוגע לך ולא למטופלת המדומה, אל תישאר עם זה לבד. '
          + 'ער"ן 1201, קו הסיוע של משרד הבריאות 5400*, או פנה לרם ישירות.',
      }, 200, cors)
    }
    if (BREAK_CHARACTER_RE.test(studentText)) {
      return json({
        rejected: true,
        reply: 'מירב היא לא מודל ואי אפשר לדבר איתה על זה. חזור לשיחה.',
      }, 200, cors)
    }

    // ── load session + scenario (server-side only) ───────────────────────────
    const { data: sess } = await admin.from('sim_sessions')
      .select('*').eq('id', sessionId).eq('user_id', user.id).maybeSingle()
    if (!sess) return json({ error: 'סשן לא נמצא.' }, 404, cors)
    if (sess.status !== 'in_session') return json({ error: 'הסשן כבר הסתיים.', status: sess.status }, 409, cors)

    const { data: scen } = await admin.from('sim_scenarios')
      .select('id, spec, difficulty, turn_budget, title, primary_skill')
      .eq('id', sess.scenario_id).maybeSingle()
    if (!scen) return json({ error: 'תרחיש לא נמצא.' }, 404, cors)

    const spec = scen.spec as Spec
    const turnBudget = Number(scen.turn_budget) || 12

    // ── budget ceiling: block, never degrade ─────────────────────────────────
    if (!isAdmin && (await monthlyCostShekel(admin)) >= AI_MONTHLY_CAP_ILS) {
      return json({
        error: 'התרגול החי סגור להיום מטעמי עלות. המנטור והמשחק פתוחים כרגיל.',
        budget_blocked: true,
      }, 429, cors)
    }

    const { data: turnRows } = await admin.from('sim_turns')
      .select('turn_index, student_text, patient_text')
      .eq('session_id', sessionId).order('turn_index')
    const turns = (turnRows || []) as TurnRow[]
    const lastPatientLine = turns.length ? turns[turns.length - 1].patient_text : ''

    const metrics = sess.metrics as Metrics
    const unlocked: string[] = sess.unlocked_facts || []
    const facts: GatedFact[] = spec.gated_facts || []
    const candidates = facts.filter(f => !unlocked.includes(f.id))

    const t0 = Date.now()
    let promptIn = 0, promptOut = 0

    // ── evaluating ───────────────────────────────────────────────────────────
    // Layer 0 first: obvious moves are decided in code, identically every time,
    // and skip the judge call entirely.
    const forced = preClassify(studentText)
    let evaluation: Evaluation
    let judgeProvider = 'regex'

    if (forced) {
      evaluation = normalizeEvaluation(null, 'regex', forced)
    } else {
      const jp = judgePrompt(spec, metrics, unlocked, candidates, lastPatientLine, studentText)
      let jr = await callClaude(HAIKU_MODEL, jp, '', [{ role: 'user', content: 'סווג.' }], 500, 0.1)
      if (!jr) jr = await callGemini(jp, [{ role: 'user', content: 'סווג.' }], 0.1)
      if (!jr) jr = await callOpenRouter(jp, [{ role: 'user', content: 'סווג.' }])
      if (!jr) {
        // No judgement means no basis to change the world. The turn is NOT
        // consumed and nothing is written.
        return json({ error: 'השופט לא זמין כרגע. נסה שוב בעוד רגע, התור לא נספר.' }, 503, cors)
      }
      judgeProvider = jr.provider
      promptIn += jr.promptTokens; promptOut += jr.completionTokens
      await logUsage(admin, user.id, jr.provider === 'haiku' ? 'sim-judge' : 'sim-judge-free',
        jr.promptTokens, jr.completionTokens)
      evaluation = normalizeEvaluation(parseEvaluation(jr.text), 'model')
    }

    // ── applying: the only place the world changes ───────────────────────────
    const applied = applyTurn(
      spec,
      { metrics, unlocked, flags: (sess.flags || {}) as Record<string, number>, turn_count: sess.turn_count },
      evaluation,
      Number(scen.difficulty) || 1,
    )
    const newTurnCount = Number(sess.turn_count) + 1
    const outcome = checkTerminal(
      spec,
      { metrics: applied.metrics, unlocked: applied.unlocked, flags: applied.flags },
      newTurnCount,
      turnBudget,
    )

    // ── acting ───────────────────────────────────────────────────────────────
    const unlockedFacts = facts.filter(f => applied.unlocked.includes(f.id))
    const stable = actorStable(spec)
    const volatile = actorVolatile(
      applied.metrics,
      unlockedFacts,
      applied.newly_unlocked,
      Math.max(0, turnBudget - newTurnCount),
    )
    const convo = buildConvo(String(sess.rolling_summary || ''), turns, studentText)

    let ar = await callClaude(SONNET_MODEL, stable, volatile, convo, 220, 0.8)
    if (!ar) ar = await callClaude(SONNET_MODEL, stable, volatile, convo, 220, 0.8)   // one retry
    if (!ar) {
      // Deliberately NOT degrading to a weak model. A badly played patient
      // teaches wrong patterns, which is worse than a retry. Turn not consumed.
      return json({ error: 'מירב לא זמינה כרגע. נסה שוב בעוד רגע, התור לא נספר.' }, 503, cors)
    }
    promptIn += ar.promptTokens; promptOut += ar.completionTokens
    await logUsage(admin, user.id, 'sim-actor', ar.promptTokens, ar.completionTokens)

    const patientText = ar.text.replace(/^["'״]+|["'״]+$/g, '').trim()

    // ── persist ──────────────────────────────────────────────────────────────
    await admin.from('sim_turns').insert({
      session_id: sessionId,
      turn_index: newTurnCount,
      student_text: studentText,
      patient_text: patientText,
      evaluation: { ...applied.evaluation, judge_provider: judgeProvider, unlocked_now: applied.newly_unlocked?.id ?? null },
      metrics_after: applied.metrics,
      latency_ms: Date.now() - t0,
    })

    // Rolling summary: compress whatever fell out of the window, overwrite the
    // previous summary. This is what keeps per-turn cost flat.
    let rollingSummary = String(sess.rolling_summary || '')
    const allTurns: TurnRow[] = [...turns, { turn_index: newTurnCount, student_text: studentText, patient_text: patientText }]
    if (shouldSummarize(allTurns)) {
      const old = turnsToSummarize(allTurns)
        .map(t => `${t.student_text ? 'מטפל: ' + t.student_text + '\n' : ''}מירב: ${t.patient_text}`)
        .join('\n')
      const sr = await callClaude(HAIKU_MODEL, SUMMARY_PROMPT, '', [{ role: 'user', content: old }], 200, 0.2)
      if (sr) {
        rollingSummary = sr.text
        await logUsage(admin, user.id, 'sim-summary', sr.promptTokens, sr.completionTokens)
      }
    }

    await admin.from('sim_sessions').update({
      metrics: applied.metrics,
      unlocked_facts: applied.unlocked,
      flags: applied.flags,
      turn_count: newTurnCount,
      rolling_summary: rollingSummary,
      tokens_in: Number(sess.tokens_in) + promptIn,
      tokens_out: Number(sess.tokens_out) + promptOut,
      ...(outcome ? { status: 'ended', outcome, ended_at: new Date().toISOString() } : {}),
    }).eq('id', sessionId)

    // NOTE: the move classification is deliberately NOT returned mid-session.
    // Showing "give_advice" live would teach the learner to game the classifier
    // instead of reading the patient. It all surfaces in the debrief.
    return json({
      reply: patientText,
      metrics: applied.metrics,
      unlocked_count: applied.unlocked.length,
      total_facts: facts.length,
      revealed: !!applied.newly_unlocked,
      turns_used: newTurnCount,
      turns_left: Math.max(0, turnBudget - newTurnCount),
      status: outcome ? 'ended' : 'in_session',
      outcome: outcome ?? null,
    }, 200, cors)

  } catch (e) {
    console.error('[sim-turn] fatal', e)
    return json({ error: 'שגיאה זמנית. נסה שוב.' }, 500, corsHeaders(req))
  }
})

// ── start ────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleStart(admin: any, userId: string, isPaid: boolean, isAdmin: boolean, body: Json, cors: Record<string, string>) {
  const slug = String(body.scenario_slug || '')
  if (!slug) return json({ error: 'חסר תרחיש.' }, 400, cors)

  const { data: scen } = await admin.from('sim_scenarios')
    .select('id, version, spec, turn_budget, title, course_type, is_published')
    .eq('slug', slug).eq('is_published', true)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (!scen) return json({ error: 'תרחיש לא נמצא.' }, 404, cors)
  if (scen.course_type === 'master' && !isPaid) {
    return json({ error: 'התרגול החי פתוח למנויי המאסטר.', upsell: true }, 403, cors)
  }

  // Daily quota. Counted on sessions STARTED today, in Israel time.
  if (!isAdmin) {
    const since = `${todayIsrael()}T00:00:00+03:00`
    const { count } = await admin.from('sim_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('started_at', since)
    if ((count || 0) >= DAILY_SESSIONS) {
      return json({
        error: `${DAILY_SESSIONS} סשנים ליום. תרגול טוב מתעכל, לא נצבר. נתראה מחר.`,
        quota: true,
      }, 429, cors)
    }
  }

  // Close anything the learner left dangling, so one person never holds two
  // open sessions and the daily count stays honest.
  await admin.from('sim_sessions')
    .update({ status: 'ended', outcome: 'abandoned', ended_at: new Date().toISOString() })
    .eq('user_id', userId).eq('status', 'in_session')

  const spec = scen.spec as Spec
  const opening = String((spec.patient as Record<string, unknown>).opening_line || '')

  const { data: created, error: insErr } = await admin.from('sim_sessions').insert({
    user_id: userId,
    scenario_id: scen.id,
    scenario_version: scen.version,
    metrics: spec.metrics_init,
  }).select('id, metrics').single()
  if (insErr || !created) return json({ error: 'לא הצלחנו לפתוח סשן.' }, 500, cors)

  await admin.from('sim_turns').insert({
    session_id: created.id,
    turn_index: 0,
    student_text: '',
    patient_text: opening,
    evaluation: { move: 'opening', source: 'scenario' },
    metrics_after: spec.metrics_init,
  })

  return json({
    session_id: created.id,
    title: scen.title,
    briefing: spec.briefing,
    opening,
    metrics: spec.metrics_init,
    total_facts: (spec.gated_facts || []).length,
    unlocked_count: 0,
    turns_left: Number(scen.turn_budget) || 12,
    turn_budget: Number(scen.turn_budget) || 12,
  }, 200, cors)
}

// ── hint ─────────────────────────────────────────────────────────────────────
// Deterministic and free: derived from the next locked fact's own conditions.
// No model call, and it is recorded so the debrief can account for it.
// deno-lint-ignore no-explicit-any
async function handleHint(admin: any, userId: string, body: Json, cors: Record<string, string>) {
  const sessionId = String(body.session_id || '')
  const { data: sess } = await admin.from('sim_sessions')
    .select('id, scenario_id, unlocked_facts, flags, metrics, status')
    .eq('id', sessionId).eq('user_id', userId).maybeSingle()
  if (!sess || sess.status !== 'in_session') return json({ error: 'סשן לא פעיל.' }, 409, cors)

  const { data: scen } = await admin.from('sim_scenarios').select('spec').eq('id', sess.scenario_id).maybeSingle()
  const spec = (scen?.spec || {}) as Spec
  const unlocked: string[] = sess.unlocked_facts || []
  const metrics = sess.metrics as Metrics

  const next = (spec.gated_facts || []).find(f =>
    !unlocked.includes(f.id) && !(f.unlock_when.requires || []).some(r => !unlocked.includes(r)))

  const MOVE_HINT: Record<string, string> = {
    challenge_universal: 'היא אמרה מילה שמכסה את כולם. החזר לה אותה כשאלה.',
    specify_time: 'שאל מתי זה קרה בפעם האחרונה.',
    specify_context: 'שאל איפה, או באיזה מצב בדיוק, זה קורה.',
    specify_behavior: 'שאל מה בדיוק נעשה שם. התנהגות שאפשר לראות, לא רגש.',
    reflect_back: 'קח מילה שלה ותחזיר אותה לה מילה במילה.',
    pace_emotion: 'לפני שאתה חוקר, תן לה להרגיש שהבנת מה עובר עליה.',
  }

  let text = 'המשך לחקור. אל תציע פתרון.'
  if (next) {
    const move = next.unlock_when.moves[0]
    text = MOVE_HINT[move] || text
    if (next.unlock_when.min_rapport != null && metrics.rapport < next.unlock_when.min_rapport) {
      text = 'היא עדיין לא איתך. תן לה להרגיש שהבנת, לפני שאתה מבקש עוד פרט.'
    } else if (next.unlock_when.max_resistance != null && metrics.resistance > next.unlock_when.max_resistance) {
      text = 'היא בהגנה. רד מהלחץ, שקף לה מה שאמרה, ואז תחזור לחקור.'
    }
  }

  const flags = { ...(sess.flags || {}) }
  flags.hint_count = (Number(flags.hint_count) || 0) + 1
  await admin.from('sim_sessions').update({ flags }).eq('id', sessionId)

  return json({ hint: text, hint_count: flags.hint_count }, 200, cors)
}
