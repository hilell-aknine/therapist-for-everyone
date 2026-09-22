// =============================================================================
// sim-turn / engine.ts — THE STATE LIVES HERE, NOT IN THE MODEL.
//
// Everything in this file is pure: same inputs, same outputs, no network, no
// clock, no randomness. That is deliberate — it is the only part of the feature
// that decides what actually happened, so it has to be testable without an API
// key. See engine_test.ts.
//
// Division of authority:
//   judge model  → classifies the move (a label from a closed list) + confidence
//   THIS FILE    → decides the deltas, the unlocks and the ending
//   actor model  → receives the result as a fact and plays it
//
// Note this is stricter than the spec draft: the judge's own proposed deltas are
// recorded for observability but NEVER applied. The scenario's scoring_rules are
// the single source of numbers, so a scenario author can retune the exercise
// without redeploying, and a model cannot invent a score.
// =============================================================================

export const MOVES = [
  'challenge_universal',
  'specify_time',
  'specify_context',
  'specify_behavior',
  'reflect_back',
  'pace_emotion',
  'give_advice',
  'why_question',
  'jargon',
  'challenge_no_rapport',
  'closed_question',
  'neutral',
] as const

export type Move = typeof MOVES[number]

export type Metrics = {
  rapport: number
  resistance: number
  emotional_depth: number
  specificity: number
}

export type Flags = Record<string, number>

export type Evaluation = {
  move: Move
  secondary_moves: Move[]
  rule_hits: string[]
  violations: string[]
  quote_used: string
  deltas: Partial<Metrics>          // the judge's proposal — recorded, not applied
  applied: Partial<Metrics>         // what this engine actually applied
  unlock_candidates: string[]
  confidence: number
  one_line_note: string
  source: 'regex' | 'model'         // how the move was decided
}

export type GatedFact = {
  id: string
  content: string
  is_target?: boolean
  is_bonus?: boolean
  unlock_when: {
    moves: string[]
    requires?: string[]
    min_rapport?: number
    max_resistance?: number
  }
}

export type Spec = {
  briefing: Record<string, unknown>
  patient: Record<string, unknown>
  language_patterns?: Record<string, string[]>
  gated_facts: GatedFact[]
  metrics_init: Metrics
  scoring_rules: Record<string, Partial<Metrics>>
  success: { all_of: Array<Record<string, unknown>> }
  failure: { any_of: Array<Record<string, unknown>> }
  known_errors?: Array<Record<string, unknown>>
}

export type SessionState = {
  metrics: Metrics
  unlocked: string[]
  flags: Flags
  turn_count: number
}

// Resistance never falls below this, by difficulty. A person who is guarded does
// not become fully open in four sentences; without a floor the exercise collapses
// into a patient who caves, which is exactly the failure mode being designed out.
export const RESISTANCE_FLOOR: Record<number, number> = { 1: 10, 2: 25, 3: 35 }

const METRIC_KEYS: (keyof Metrics)[] = ['rapport', 'resistance', 'emotional_depth', 'specificity']

// One metric can move at most this much in a single turn. One good sentence
// should not win the session, and one bad one should not end it.
const MAX_DELTA_PER_METRIC = 25

// Below this, the judge is guessing. Half the effect, and no fact is handed over.
export const LOW_CONFIDENCE = 0.5

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

// ── Layer 0: deterministic classification ───────────────────────────────────
// Moves that must always produce the same reaction are caught here, in code,
// before any model runs. A learner who writes "למה" gets the same consequence
// every single time — which is the whole point of a drill. It also skips an
// API call.

const JARGON_TERMS = [
  'אמונה מגבילה', 'אמונות מגבילות', 'ראפור', 'רפור', 'עוגן', 'עיגון',
  'מטא מודל', 'מטה מודל', 'מטא-מודל', 'הכללה', 'הכללות', 'מחיקה', 'עיוות',
  'סאב מודאליות', 'סאבמודאליות', 'רפריימינג', 'מסגור מחדש', 'קליברציה',
  'ליווי והובלה', 'תת מודע', 'תת-מודע', 'NLP', 'אן אל פי',
]

const ADVICE_RE =
  /(כדאי ש|כדאי לך|את צריכה|אתה צריך|תנסי|תנסה|תדברי|תדבר |תגידי|תגיד ל|אני מציע|הייתי מציע|הייתי במקומך|למה שלא|מה אם פשוט|את חייבת|אתה חייב)/

// Hebrew prefixes attach straight onto the word, so "ומדוע" and "ולמה" need the
// optional ו. The ש prefix is deliberately NOT allowed: "שלמה" is a common name,
// and flagging someone for saying a name would be worse than missing a why.
const WHY_RE = /(^|[\s,.!?"'״׳])ו?(למה|מדוע)([\s?,.!]|$)/

export function preClassify(text: string): Move | null {
  const t = (text || '').trim()
  if (!t) return null

  // Order matters. Naming the technique is the worst move even inside an
  // otherwise good question, and "למה שלא תדברי איתה" is advice wearing a
  // why-question costume — so advice is tested before why.
  const lowered = t.toLowerCase()
  for (const term of JARGON_TERMS) {
    if (lowered.includes(term.toLowerCase())) return 'jargon'
  }
  if (ADVICE_RE.test(t)) return 'give_advice'
  if (WHY_RE.test(t)) return 'why_question'
  return null
}

// ── Layer 1: parse the judge's JSON without trusting it ─────────────────────

export function parseEvaluation(raw: string): Partial<Evaluation> | null {
  if (!raw) return null
  // Models wrap JSON in prose or fences more often than they admit.
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  s = s.slice(first, last + 1)
  try {
    const o = JSON.parse(s)
    if (!o || typeof o !== 'object') return null
    return o as Partial<Evaluation>
  } catch {
    return null
  }
}

export function normalizeEvaluation(
  parsed: Partial<Evaluation> | null,
  source: 'regex' | 'model',
  forcedMove?: Move,
): Evaluation {
  const moveRaw = forcedMove ?? (parsed?.move as string)
  const move: Move = (MOVES as readonly string[]).includes(moveRaw) ? moveRaw as Move : 'neutral'

  const secondary = Array.isArray(parsed?.secondary_moves)
    ? (parsed!.secondary_moves as string[]).filter(m => (MOVES as readonly string[]).includes(m)) as Move[]
    : []

  const deltas: Partial<Metrics> = {}
  const rawDeltas = (parsed?.deltas ?? {}) as Record<string, unknown>
  for (const k of METRIC_KEYS) {
    const v = Number(rawDeltas[k])
    if (Number.isFinite(v)) deltas[k] = Math.max(-MAX_DELTA_PER_METRIC, Math.min(MAX_DELTA_PER_METRIC, Math.round(v)))
  }

  let confidence = Number(parsed?.confidence)
  if (!Number.isFinite(confidence)) confidence = source === 'regex' ? 1 : 0.5
  confidence = Math.max(0, Math.min(1, confidence))
  if (source === 'regex') confidence = 1   // a regex hit is not an opinion

  return {
    move,
    secondary_moves: secondary,
    rule_hits: Array.isArray(parsed?.rule_hits) ? (parsed!.rule_hits as string[]).slice(0, 6).map(String) : [],
    violations: Array.isArray(parsed?.violations) ? (parsed!.violations as string[]).slice(0, 6).map(String) : [],
    quote_used: typeof parsed?.quote_used === 'string' ? parsed!.quote_used!.slice(0, 120) : '',
    deltas,
    applied: {},
    unlock_candidates: Array.isArray(parsed?.unlock_candidates)
      ? (parsed!.unlock_candidates as string[]).slice(0, 4).map(String) : [],
    confidence,
    one_line_note: typeof parsed?.one_line_note === 'string' ? parsed!.one_line_note!.slice(0, 220) : '',
    source,
  }
}

// ── Layer 2: apply the turn ─────────────────────────────────────────────────

export type ApplyResult = {
  metrics: Metrics
  unlocked: string[]
  newly_unlocked: GatedFact | null
  flags: Flags
  evaluation: Evaluation
}

export function applyTurn(
  spec: Spec,
  state: SessionState,
  evaluation: Evaluation,
  difficulty: number,
): ApplyResult {
  const halved = evaluation.confidence < LOW_CONFIDENCE

  // Canonical deltas come from the scenario, never from the model.
  const base = spec.scoring_rules?.[evaluation.move] ?? {}
  const applied: Partial<Metrics> = {}
  const metrics: Metrics = { ...state.metrics }

  for (const k of METRIC_KEYS) {
    let d = Number(base[k] ?? 0)
    if (!Number.isFinite(d) || d === 0) continue
    if (halved) d = d > 0 ? Math.floor(d / 2) : Math.ceil(d / 2)
    d = Math.max(-MAX_DELTA_PER_METRIC, Math.min(MAX_DELTA_PER_METRIC, d))
    applied[k] = d
    metrics[k] = clamp(metrics[k] + d)
  }

  // A secondary move contributes its rapport/resistance effect at half weight.
  // It is a modifier on how the primary move landed, not a second move.
  for (const sm of evaluation.secondary_moves) {
    if (sm === evaluation.move) continue
    const sb = spec.scoring_rules?.[sm] ?? {}
    for (const k of ['rapport', 'resistance'] as (keyof Metrics)[]) {
      const raw = Number(sb[k] ?? 0)
      if (!Number.isFinite(raw) || raw === 0) continue
      let d = raw > 0 ? Math.floor(raw / 2) : Math.ceil(raw / 2)
      if (halved) d = d > 0 ? Math.floor(d / 2) : Math.ceil(d / 2)
      if (d === 0) continue
      applied[k] = (applied[k] ?? 0) + d
      metrics[k] = clamp(metrics[k] + d)
    }
  }

  const floor = RESISTANCE_FLOOR[difficulty] ?? 10
  if (metrics.resistance < floor) metrics.resistance = floor

  // Flags — counters the failure conditions read.
  const flags: Flags = { ...state.flags }
  const bump = (k: string) => { flags[k] = (Number(flags[k]) || 0) + 1 }
  if (evaluation.move === 'give_advice') bump('advice_count')
  if (evaluation.move === 'why_question') bump('why_count')
  if (evaluation.move === 'jargon') bump('jargon_count')

  // Unlocks. At most one per turn — two excellent sentences in a row open one
  // now and one next turn, so the patient never dumps her whole story at once.
  const unlocked = [...state.unlocked]
  let newly: GatedFact | null = null
  if (!halved) {
    const movesThisTurn = new Set<string>([evaluation.move, ...evaluation.secondary_moves])
    for (const f of spec.gated_facts || []) {
      if (unlocked.includes(f.id)) continue
      const w = f.unlock_when || { moves: [] }
      if (!(w.moves || []).some(m => movesThisTurn.has(m))) continue
      if ((w.requires || []).some(r => !unlocked.includes(r))) continue
      if (w.min_rapport != null && metrics.rapport < w.min_rapport) continue
      if (w.max_resistance != null && metrics.resistance > w.max_resistance) continue
      unlocked.push(f.id)
      newly = f
      break
    }
  }

  return { metrics, unlocked, newly_unlocked: newly, flags, evaluation: { ...evaluation, applied } }
}

// ── Layer 3: is it over ─────────────────────────────────────────────────────

export type Outcome = 'success' | 'budget' | 'collapse'

function metricOf(m: Metrics, name: unknown): number | null {
  if (typeof name !== 'string') return null
  return (name in m) ? (m as unknown as Record<string, number>)[name] : null
}

export function checkSuccess(spec: Spec, s: { metrics: Metrics; unlocked: string[] }): boolean {
  const conds = spec.success?.all_of || []
  if (!conds.length) return false
  return conds.every(c => {
    if (typeof c.fact_unlocked === 'string') return s.unlocked.includes(c.fact_unlocked)
    const v = metricOf(s.metrics, c.metric)
    if (v === null) return false
    if (typeof c.gte === 'number') return v >= c.gte
    if (typeof c.lte === 'number') return v <= c.lte
    if (typeof c.lt === 'number') return v < c.lt
    if (typeof c.gt === 'number') return v > c.gt
    return false
  })
}

export function checkTerminal(
  spec: Spec,
  s: { metrics: Metrics; unlocked: string[]; flags: Flags },
  turnCount: number,
  turnBudget: number,
): Outcome | null {
  // Success is checked first on purpose: a learner who hit the target on the
  // last available turn succeeded, they did not run out of budget.
  if (checkSuccess(spec, s)) return 'success'

  const budgetExhausted = turnCount >= turnBudget

  for (const c of spec.failure?.any_of || []) {
    if (c.budget_exhausted === true) {
      if (!budgetExhausted) continue
      const v = metricOf(s.metrics, c.metric)
      if (v === null) return 'budget'
      if (typeof c.lt === 'number' && v < c.lt) return 'budget'
      if (typeof c.lte === 'number' && v <= c.lte) return 'budget'
      continue
    }
    if (typeof c.flag === 'string') {
      const fv = Number(s.flags[c.flag]) || 0
      if (typeof c.gte === 'number' && fv >= c.gte) return 'collapse'
      continue
    }
    const v = metricOf(s.metrics, c.metric)
    if (v === null) continue
    if (typeof c.lte === 'number' && v <= c.lte) return 'collapse'
    if (typeof c.lt === 'number' && v < c.lt) return 'collapse'
    if (typeof c.gte === 'number' && v >= c.gte) return 'collapse'
  }

  if (budgetExhausted) return 'budget'
  return null
}

// ── Layer 4: the token window ───────────────────────────────────────────────
// The only cost control that actually works here. The full transcript is never
// sent: the last WINDOW_TURNS stay verbatim, everything older is compressed into
// one short summary that gets overwritten. Cost per turn therefore stays flat —
// a 12-turn session costs roughly what a 4-turn session costs.

export const WINDOW_TURNS = 6
export const SUMMARIZE_EVERY = 6

export type TurnRow = { turn_index: number; student_text: string; patient_text: string }

export function windowTurns(turns: TurnRow[]): TurnRow[] {
  return turns.slice(-WINDOW_TURNS)
}

export function turnsToSummarize(turns: TurnRow[]): TurnRow[] {
  return turns.slice(0, Math.max(0, turns.length - WINDOW_TURNS))
}

export function shouldSummarize(turns: TurnRow[]): boolean {
  return turnsToSummarize(turns).length > 0 && turns.length % SUMMARIZE_EVERY === 0
}

// The conversation as the actor model sees it: summary of the far past, then the
// recent turns verbatim. Nothing else.
export function buildConvo(
  rollingSummary: string,
  turns: TurnRow[],
  studentText: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const convo: Array<{ role: 'user' | 'assistant'; content: string }> = []
  if (rollingSummary.trim()) {
    convo.push({ role: 'user', content: `[מה שקרה עד כה: ${rollingSummary.trim()}]` })
    convo.push({ role: 'assistant', content: '...' })
  }
  for (const t of windowTurns(turns)) {
    if (t.student_text) convo.push({ role: 'user', content: t.student_text })
    if (t.patient_text) convo.push({ role: 'assistant', content: t.patient_text })
  }
  convo.push({ role: 'user', content: studentText })

  // Turn 0 is the patient's opening line, so on the first real turn the history
  // starts with an assistant message. The Anthropic API rejects that outright
  // ("first message must use the user role"), which would have made every
  // session fail on its very first turn.
  if (convo.length && convo[0].role === 'assistant') {
    convo.unshift({ role: 'user', content: '[תחילת המפגש]' })
  }
  return convo
}
