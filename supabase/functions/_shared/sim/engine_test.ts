// =============================================================================
// engine_test.ts — run with:  deno test supabase/functions/_shared/sim/
//
// These tests exist because the engine is the only thing standing between a
// language model and the learner's score. Everything here runs without a network
// or an API key.
// =============================================================================

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  applyTurn, buildConvo, checkSuccess, checkTerminal, LOW_CONFIDENCE,
  normalizeEvaluation, parseEvaluation, preClassify, RESISTANCE_FLOOR,
  shouldSummarize, windowTurns, WINDOW_TURNS,
  type Metrics, type Spec, type TurnRow,
} from './engine.ts'

// ── the golden scenario, trimmed to what the engine reads ───────────────────
const SPEC: Spec = {
  briefing: {},
  patient: { name: 'מירב' },
  gated_facts: [
    { id: 'f1_who', content: 'בעיקר רונית.', unlock_when: { moves: ['challenge_universal'], min_rapport: 40 } },
    { id: 'f2_when', content: 'ביום רביעי.', unlock_when: { moves: ['specify_time', 'specify_context'], requires: ['f1_who'], min_rapport: 45 } },
    { id: 'f3_what', content: 'היא הסתכלה בטלפון.', is_target: true, unlock_when: { moves: ['specify_behavior'], requires: ['f2_when'], min_rapport: 50, max_resistance: 60 } },
    { id: 'f4_self', content: 'לא אמרתי כלום.', is_bonus: true, unlock_when: { moves: ['specify_behavior', 'reflect_back'], requires: ['f3_what'], min_rapport: 65 } },
  ],
  metrics_init: { rapport: 55, resistance: 45, emotional_depth: 10, specificity: 5 },
  scoring_rules: {
    challenge_universal:  { rapport: 5, specificity: 20, resistance: -5 },
    specify_time:         { rapport: 3, specificity: 15 },
    specify_behavior:     { rapport: 5, specificity: 25, emotional_depth: 10 },
    reflect_back:         { rapport: 10, resistance: -10 },
    give_advice:          { rapport: -5, resistance: 15, emotional_depth: -10 },
    why_question:         { rapport: -5, resistance: 12 },
    jargon:               { rapport: -15, resistance: 10 },
    challenge_no_rapport: { rapport: -20, resistance: 20 },
    closed_question:      { specificity: 3 },
    neutral:              { rapport: -2 },
  },
  success: {
    all_of: [
      { fact_unlocked: 'f3_what' },
      { metric: 'specificity', gte: 60 },
      { metric: 'rapport', gte: 50 },
    ],
  },
  failure: {
    any_of: [
      { metric: 'rapport', lte: 20 },
      { flag: 'advice_count', gte: 3 },
      { budget_exhausted: true, metric: 'specificity', lt: 30 },
    ],
  },
}

const start = () => ({
  metrics: { ...SPEC.metrics_init } as Metrics,
  unlocked: [] as string[],
  flags: {} as Record<string, number>,
  turn_count: 0,
})

const ev = (move: string, conf = 0.9, secondary: string[] = []) =>
  normalizeEvaluation({ move, confidence: conf, secondary_moves: secondary } as never, 'model')

// ── layer 0: deterministic classification ───────────────────────────────────

Deno.test('preClassify catches a why question', () => {
  assertEquals(preClassify('למה את חושבת שהם לא מקשיבים?'), 'why_question')
  assertEquals(preClassify('ומדוע זה קורה?'), 'why_question')   // ו prefix, no space
  assertEquals(preClassify('אז ולמה זה מפריע לך?'), 'why_question')
})

Deno.test('a name is not a why question', () => {
  // "שלמה" = Shlomo. A ש prefix on "למה" spells a common name, so the matcher
  // must not accept it. Missing a why is cheaper than accusing someone of one.
  assertEquals(preClassify('שלמה מהצוות אמר לך משהו?'), null)
})

Deno.test('preClassify catches jargon even inside a good question', () => {
  assertEquals(preClassify('זו אמונה מגבילה קלאסית, מה קרה בדיוק?'), 'jargon')
  assertEquals(preClassify('בוא נבנה ראפור'), 'jargon')
})

Deno.test('advice wearing a why-question costume is still advice', () => {
  // "למה שלא" reads as a why-question to a naive matcher. It is advice.
  assertEquals(preClassify('למה שלא תדברי איתה על זה?'), 'give_advice')
  assertEquals(preClassify('כדאי שתדברי איתם'), 'give_advice')
})

Deno.test('a clean question is left to the judge', () => {
  assertEquals(preClassify('"אף אחד לא מקשיב". אף אחד?'), null)
  assertEquals(preClassify('מה היא עשתה שם בפועל?'), null)
})

// ── parsing a model that will not behave ────────────────────────────────────

Deno.test('parseEvaluation survives fences and surrounding prose', () => {
  const p = parseEvaluation('כמובן!\n```json\n{"move":"reflect_back","confidence":0.8}\n```\nבהצלחה')
  assertEquals(p?.move, 'reflect_back')
})

Deno.test('an unknown move degrades to neutral, never throws', () => {
  const e = normalizeEvaluation({ move: 'brilliant_move', confidence: 0.99 } as never, 'model')
  assertEquals(e.move, 'neutral')
})

Deno.test('a regex hit is not an opinion and carries full confidence', () => {
  const e = normalizeEvaluation(null, 'regex', 'give_advice')
  assertEquals(e.confidence, 1)
  assertEquals(e.move, 'give_advice')
})

// ── the model cannot invent a score ─────────────────────────────────────────

Deno.test('judge deltas are recorded but never applied', () => {
  const e = normalizeEvaluation(
    { move: 'neutral', confidence: 0.9, deltas: { rapport: 25, specificity: 25 } } as never, 'model')
  const r = applyTurn(SPEC, start(), e, 1)
  // scoring_rules.neutral is rapport -2. The judge asked for +25 and got nothing.
  assertEquals(r.metrics.rapport, 53)
  assertEquals(r.metrics.specificity, 5)
  assertEquals(e.deltas.rapport, 25)   // still on the record
})

// ── the golden path ─────────────────────────────────────────────────────────

Deno.test('golden path: four moves reach the target and win', () => {
  let s = start()

  let r = applyTurn(SPEC, s, ev('challenge_universal'), 1)
  assertEquals(r.newly_unlocked?.id, 'f1_who')
  assertEquals(r.metrics.rapport, 60)
  assertEquals(r.metrics.specificity, 25)
  assertEquals(r.metrics.resistance, 40)
  s = { ...s, ...r, turn_count: 1 }

  r = applyTurn(SPEC, s, ev('specify_time'), 1)
  assertEquals(r.newly_unlocked?.id, 'f2_when')
  assertEquals(r.metrics.specificity, 40)
  s = { ...s, ...r, turn_count: 2 }

  r = applyTurn(SPEC, s, ev('specify_behavior', 0.9, ['reflect_back']), 1)
  assertEquals(r.newly_unlocked?.id, 'f3_what')
  // primary +5 rapport, secondary reflect_back at half weight = +5 → 63+10 = 73
  assertEquals(r.metrics.rapport, 73)
  assertEquals(r.metrics.specificity, 65)
  s = { ...s, ...r, turn_count: 3 }

  assert(checkSuccess(SPEC, s))
  assertEquals(checkTerminal(SPEC, s, 3, 12), 'success')
})

// ── the failure path that feels fine ────────────────────────────────────────

Deno.test('failure path: polite agreement kills the session', () => {
  let s = start()
  for (const move of ['why_question', 'jargon', 'give_advice']) {
    const r = applyTurn(SPEC, s, ev(move), 1)
    s = { ...s, ...r, turn_count: s.turn_count + 1 }
  }
  assertEquals(s.metrics.rapport, 30)
  assertEquals(s.metrics.resistance, 82)
  assertEquals(s.metrics.specificity, 5)
  assertEquals(s.unlocked.length, 0)
  assertEquals(s.flags.advice_count, 1)
  // Not over yet — this is the point. It looks like a polite conversation.
  assertEquals(checkTerminal(SPEC, s, 3, 12), null)
  // Budget runs out with specificity below 30 → failure.
  assertEquals(checkTerminal(SPEC, s, 12, 12), 'budget')
})

Deno.test('three pieces of advice collapse the session on their own', () => {
  let s = start()
  s.metrics.rapport = 90          // even with great rapport
  for (let i = 0; i < 3; i++) {
    const r = applyTurn(SPEC, s, ev('give_advice'), 1)
    s = { ...s, ...r, turn_count: s.turn_count + 1 }
  }
  assertEquals(s.flags.advice_count, 3)
  assertEquals(checkTerminal(SPEC, s, 3, 12), 'collapse')
})

// ── anti-collapse guards ────────────────────────────────────────────────────

Deno.test('a locked fact stays locked when rapport is below its gate', () => {
  const s = start()
  s.metrics.rapport = 30          // f1_who needs 40
  const r = applyTurn(SPEC, s, ev('challenge_universal'), 1)
  // +5 puts rapport at 35, still under the gate
  assertEquals(r.metrics.rapport, 35)
  assertEquals(r.newly_unlocked, null)
  assertEquals(r.unlocked.length, 0)
})

Deno.test('prerequisites are enforced — no skipping to the target', () => {
  const s = start()
  s.metrics.rapport = 90
  const r = applyTurn(SPEC, s, ev('specify_behavior'), 1)
  // f3_what requires f2_when which requires f1_who. Nothing opens.
  assertEquals(r.newly_unlocked, null)
})

Deno.test('high resistance blocks the target even with perfect rapport', () => {
  const s = start()
  s.metrics.rapport = 90
  s.metrics.resistance = 75        // f3_what caps resistance at 60
  s.unlocked = ['f1_who', 'f2_when']
  const r = applyTurn(SPEC, s, ev('specify_behavior'), 1)
  assertEquals(r.newly_unlocked, null)
})

Deno.test('at most one fact opens per turn', () => {
  const s = start()
  s.metrics.rapport = 95
  s.unlocked = ['f1_who']
  const r = applyTurn(SPEC, s, ev('specify_behavior', 0.9, ['specify_time', 'reflect_back']), 1)
  assertEquals(r.unlocked.length, 2)          // only f2_when joined
  assertEquals(r.newly_unlocked?.id, 'f2_when')
})

Deno.test('resistance never falls below the difficulty floor', () => {
  const s = start()
  s.metrics.resistance = RESISTANCE_FLOOR[3] + 2
  const r = applyTurn(SPEC, s, ev('reflect_back'), 3)
  assertEquals(r.metrics.resistance, RESISTANCE_FLOOR[3])
})

Deno.test('low confidence halves the effect and opens nothing', () => {
  const s = start()
  const r = applyTurn(SPEC, s, ev('challenge_universal', LOW_CONFIDENCE - 0.01), 1)
  assertEquals(r.metrics.specificity, 15)     // +20 halved to +10
  assertEquals(r.newly_unlocked, null)
})

Deno.test('metrics stay inside 0-100', () => {
  const s = start()
  s.metrics.rapport = 3
  const r = applyTurn(SPEC, s, ev('challenge_no_rapport'), 1)
  assertEquals(r.metrics.rapport, 0)
  assert(r.metrics.resistance <= 100)
})

// ── terminal ordering ───────────────────────────────────────────────────────

Deno.test('success on the last available turn is success, not budget', () => {
  const s = { metrics: { rapport: 70, resistance: 40, emotional_depth: 20, specificity: 70 } as Metrics,
              unlocked: ['f1_who', 'f2_when', 'f3_what'], flags: {} }
  assertEquals(checkTerminal(SPEC, s, 12, 12), 'success')
})

Deno.test('rapport bottoming out is a collapse, not a budget ending', () => {
  const s = { metrics: { rapport: 18, resistance: 80, emotional_depth: 0, specificity: 5 } as Metrics,
              unlocked: [], flags: {} }
  assertEquals(checkTerminal(SPEC, s, 4, 12), 'collapse')
})

Deno.test('budget with enough specificity ends as budget, not collapse', () => {
  const s = { metrics: { rapport: 60, resistance: 40, emotional_depth: 20, specificity: 45 } as Metrics,
              unlocked: ['f1_who', 'f2_when'], flags: {} }
  assertEquals(checkTerminal(SPEC, s, 12, 12), 'budget')
})

// ── the token window: the only cost control that works ──────────────────────

const mkTurns = (n: number): TurnRow[] =>
  Array.from({ length: n }, (_, i) => ({ turn_index: i, student_text: `s${i}`, patient_text: `p${i}` }))

Deno.test('the window never grows past its cap', () => {
  assertEquals(windowTurns(mkTurns(3)).length, 3)
  assertEquals(windowTurns(mkTurns(30)).length, WINDOW_TURNS)
})

Deno.test('a 20-turn conversation sends the same number of turns as a 6-turn one', () => {
  const short = buildConvo('', mkTurns(6), 'עכשיו')
  const long = buildConvo('', mkTurns(20), 'עכשיו')
  assertEquals(short.length, long.length)
})

Deno.test('the summary is regenerated only once the window overflows', () => {
  assertFalse(shouldSummarize(mkTurns(6)))
  assert(shouldSummarize(mkTurns(12)))
  assertFalse(shouldSummarize(mkTurns(13)))
})

Deno.test('the conversation never starts with the patient', () => {
  // Turn 0 is her opening line. Anthropic rejects a history whose first message
  // is an assistant turn, which would break the FIRST turn of every session.
  const convo = buildConvo('', [{ turn_index: 0, student_text: '', patient_text: 'פתיחה' }], 'שאלה')
  assertEquals(convo[0].role, 'user')
  assertEquals(convo[1].role, 'assistant')
  assertEquals(convo[1].content, 'פתיחה')
  assertEquals(convo[convo.length - 1].content, 'שאלה')
})

Deno.test('roles alternate cleanly once the summary is in play', () => {
  const convo = buildConvo('תקציר', mkTurns(3), 'שאלה')
  assertEquals(convo[0].role, 'user')
  for (let i = 1; i < convo.length; i++) {
    assert(convo[i].role !== convo[i - 1].role, `roles repeat at ${i}`)
  }
})
