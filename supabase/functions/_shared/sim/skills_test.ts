// Run: deno test supabase/functions/_shared/sim/
// Covers the technique registry: a second skill must work end to end through the
// same engine, and the original chunk-down behaviour must not move.

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyTurn, MOVES, normalizeEvaluation, parseEvaluation, preClassify, type Spec } from './engine.ts'
import { adjustInitialMetrics, coachNote, learnerDifficulty, resolveSkill, SKILLS } from './skills.ts'
import { actorStable, debriefPrompt, isFemale, judgePrompt } from './prompts.ts'

const reframeSpec = {
  briefing: { mission: 'למצוא את הכוונה החיובית מאחורי הדחיינות' },
  patient: { name: 'יואב', gender: 'm', age: 34, occupation: 'מהנדס', presenting_problem: 'דוחה הכל',
    speech_register: 'קצר', tics: [], never_does: [], opening_line: 'אני פשוט עצלן.' },
  gated_facts: [
    { id: 'f1', content: 'כשאני דוחה, אף אחד לא שופט אותי', unlock_when: { moves: ['positive_intent'] } },
    { id: 'f2', content: 'אולי אני מגן על עצמי מכישלון', is_target: true,
      unlock_when: { moves: ['meaning_reframe', 'positive_intent'], requires: ['f1'] } },
  ],
  metrics_init: { rapport: 40, resistance: 40, emotional_depth: 20, specificity: 10 },
  scoring_rules: {},
  success: { all_of: [{ fact_unlocked: 'f2' }] },
  failure: { any_of: [{ flag: 'advice_count', gte: 3 }] },
} as unknown as Spec

Deno.test('every registered skill resolves with the universal moves included', () => {
  for (const key of Object.keys(SKILLS)) {
    const r = resolveSkill(key, {})
    for (const u of ['give_advice', 'why_question', 'jargon', 'neutral', 'reflect_back']) {
      assert(r.moveIds.includes(u), `${key} is missing ${u}`)
    }
    assert(r.skill.moves.length > 0, `${key} has no technique moves`)
    for (const id of r.moveIds) assert(r.scoring_rules[id] !== undefined, `${key}.${id} has no rule`)
  }
})

Deno.test('chunk_down keeps exactly the original move list', () => {
  const r = resolveSkill('chunk_down', {})
  for (const mv of MOVES) assert(r.moveIds.includes(mv), mv)
})

Deno.test('an unknown skill falls back to integrative, never throws', () => {
  assertEquals(resolveSkill('nonsense', {}).skill.key, 'integrative')
})

Deno.test('a skill move is legal for its own skill and neutral for another', () => {
  const reframe = resolveSkill('reframing', reframeSpec)
  assertEquals(normalizeEvaluation({ move: 'positive_intent' }, 'model', undefined, reframe.moveIds).move, 'positive_intent')
  const chunk = resolveSkill('chunk_down', {})
  assertEquals(normalizeEvaluation({ move: 'positive_intent' }, 'model', undefined, chunk.moveIds).move, 'neutral')
})

Deno.test('the scenario author overrides a default number', () => {
  const r = resolveSkill('reframing', { scoring_rules: { positive_intent: { rapport: 1, specificity: 30 } } })
  assertEquals(r.scoring_rules.positive_intent.specificity, 30)
  assertEquals(r.scoring_rules.give_advice.resistance, 14)   // untouched default
})

Deno.test('a reframing session reaches its target through the same engine', () => {
  const r = resolveSkill('reframing', reframeSpec)
  const spec = { ...reframeSpec, scoring_rules: r.scoring_rules } as Spec
  let st = { metrics: spec.metrics_init, unlocked: [] as string[], flags: {}, turn_count: 0 }
  for (const mv of ['positive_intent', 'meaning_reframe']) {
    const ev = normalizeEvaluation({ move: mv, confidence: 0.9 }, 'model', undefined, r.moveIds)
    const res = applyTurn(spec, st, ev, 1, r.flag_on_move)
    st = { metrics: res.metrics, unlocked: res.unlocked, flags: res.flags, turn_count: st.turn_count + 1 }
  }
  assertEquals(st.unlocked, ['f1', 'f2'])
})

Deno.test('the drill term is not jargon in its own drill, but still is elsewhere', () => {
  const text = 'בוא ניצור עוגן לרגע הזה, מה את מרגישה שם?'
  assertEquals(preClassify(text), 'jargon')
  const r = resolveSkill('state_anchoring', {})
  assertEquals(preClassify(text, { jargonExempt: r.jargon_exempt, allowDirectives: r.allow_directives }), null)
})

Deno.test('a guided instruction is the technique in a process drill, advice elsewhere', () => {
  const text = 'תנסה לדמיין את הרגע הזה מהצד, כמו צופה.'
  assertEquals(preClassify(text), 'give_advice')
  assertEquals(preClassify(text, { allowDirectives: true }), null)
})

Deno.test('a why question is caught in every drill, directives or not', () => {
  assertEquals(preClassify('למה אתה חושב ככה?', { allowDirectives: true }), 'why_question')
})

Deno.test('a male patient is written in masculine Hebrew throughout', () => {
  assertFalse(isFemale(reframeSpec))
  const p = actorStable(reframeSpec)
  assert(p.includes('מי אתה'))
  assert(p.includes('בן 34'))
  assertFalse(p.includes('מי את\n'))
})

Deno.test('the original patient has no gender field and stays female', () => {
  assert(isFemale({ patient: { name: 'מירב' } } as unknown as Spec))
})

Deno.test('the judge sees only the moves of the drill', () => {
  const r = resolveSkill('reframing', reframeSpec)
  const p = judgePrompt(reframeSpec, reframeSpec.metrics_init, [], [], '', 'מה זה נותן לך?', r)
  assert(p.includes('positive_intent'))
  assertFalse(p.includes('specify_time'))
  assert(p.includes('המטופל'))
})

Deno.test('the debrief asks for the skill score key and the spec contract fields', () => {
  const r = resolveSkill('reframing', reframeSpec)
  const p = debriefPrompt(reframeSpec, 'הצלחה', 8, r)
  for (const k of ['"reframing"', '"overall"', 'technique_application', 'missed_opportunities', 'actionable_takeaway']) {
    assert(p.includes(k), k)
  }
  assertFalse(p.includes('"chunk_down"'))
})

Deno.test('learner level moves with the questionnaire and with recent scores', () => {
  assertEquals(learnerDifficulty(1, 'advanced', []), 2)
  assertEquals(learnerDifficulty(2, 'beginner', []), 1)
  assertEquals(learnerDifficulty(1, null, [90, 88, 95]), 2)
  assertEquals(learnerDifficulty(2, null, [40, 50]), 1)
  assertEquals(learnerDifficulty(3, 'advanced', [99, 99]), 3)   // never above 3
  assertEquals(learnerDifficulty(1, null, [95]), 1)              // one score is not a trend
})

Deno.test('a harder session opens with less rapport and more resistance', () => {
  const init = { rapport: 40, resistance: 40, emotional_depth: 20, specificity: 10 }
  const harder = adjustInitialMetrics(init, 1, 3)
  assert(harder.rapport < init.rapport)
  assert(harder.resistance > init.resistance)
  assertEquals(adjustInitialMetrics(init, 2, 2), init)
})

Deno.test('training mode names the move without leaking its label', () => {
  const r = resolveSkill('reframing', {})
  const n = coachNote(r, 'give_advice', '')
  assert(n.length > 0)
  assertFalse(n.includes('give_advice'))
})

Deno.test('"to what" is not "why": the comparative question and "what do you mean" pass', () => {
  assertEquals(preClassify('וזה יותר גרוע בהשוואה למה?'), null)
  assertEquals(preClassify('ביחס למה?'), null)
  assertEquals(preClassify('למה את מתכוונת כשאת אומרת קצר?'), null)
  assertEquals(preClassify('למה בדיוק אתה מתכוון?'), null)
  assertEquals(preClassify('למה את לא אומרת לו?'), 'why_question')
  assertEquals(preClassify('ולמה זה קורה לך?'), 'why_question')
})

Deno.test('a judge answer cut by the token limit keeps its verdict, at capped confidence', () => {
  const cut = '```json\n{\n  "move": "challenge_modal",\n  "secondary_moves": ["counter_example"],\n  "rule_hits": ["אתגר'
  const p = parseEvaluation(cut)!
  assertEquals(p.move, 'challenge_modal')
  assertEquals(p.secondary_moves, ['counter_example'])
  assert((p.confidence as number) <= 0.6)
  assertEquals(parseEvaluation('{"rule_hits": ["x"'), null)
})
