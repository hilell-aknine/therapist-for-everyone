// =============================================================================
// selfplay-gate.ts — the automated quality gate that replaces human approval.
//
// Hillel's decision (19.10.2026): scenarios go live without a reviewer. So every
// scenario must prove itself first, against the REAL engine (same engine.ts,
// skills.ts, prompts.ts the edge function runs):
//
//   good learner  — plays the technique well          → must SUCCEED
//   bad learner   — gives advice and asks "why"        → must NOT succeed
//   judge         — returns a legal move on ≥ 85% of model-judged turns
//   actor         — never breaks character, never names a technique
//
// Pass → `publish: true` in the report, which load-scenarios reads.
//
// Cost control: the student and the judge run on Haiku (as in production). The
// patient runs on Haiku here too (production uses Sonnet): the gate tests the
// scenario's logic and reachability, not the actor's prose. Sonnet is exercised
// in the live end-to-end check on a sample.
//
// Run:
//   ANTHROPIC_API_KEY=... deno run -A scripts/sandbox/selfplay-gate.ts [p-m3-l3 ...]
// Output: content-private/sandbox-scenarios/_gate-report.json
// =============================================================================

import {
  applyTurn, checkTerminal, normalizeEvaluation, parseEvaluation, preClassify,
  type Evaluation, type GatedFact, type Metrics, type Spec,
} from '../../supabase/functions/_shared/sim/engine.ts'
import { actorStable, actorVolatile, isFemale, judgePrompt, patientName } from '../../supabase/functions/_shared/sim/prompts.ts'
import { resolveSkill } from '../../supabase/functions/_shared/sim/skills.ts'

const KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
if (!KEY) { console.error('ANTHROPIC_API_KEY missing'); Deno.exit(1) }
const HAIKU = 'claude-haiku-4-5-20251001'
const DIR = new URL('../../content-private/sandbox-scenarios/', import.meta.url)

type Msg = { role: 'user' | 'assistant'; content: string }
let tokensIn = 0, tokensOut = 0

async function claude(system: string, messages: Msg[], maxTokens: number, temperature: number): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: HAIKU, max_tokens: maxTokens, temperature, system, messages }),
    })
    if (r.ok) {
      const j = await r.json()
      tokensIn += j.usage?.input_tokens || 0
      tokensOut += j.usage?.output_tokens || 0
      return (j.content || []).map((c: { text?: string }) => c.text || '').join('').trim()
    }
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue }
    throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  throw new Error('anthropic: retries exhausted')
}

function studentPrompt(kind: 'good' | 'bad', spec: Spec, skillLabel: string, moveDefs: string): string {
  const b = spec.briefing as Record<string, unknown>
  const golden = (spec.known_errors || []).map(e => `- ${(e as Record<string, string>).golden_line}`).join('\n')
  if (kind === 'good') {
    return `אתה תלמיד NLP מצטיין בתרגול מול מטופל. כתוב רק את המשפט הבא שלך למטופל, משפט אחד או שניים, בעברית.
הטכניקה: ${skillLabel}
המשימה: ${b.mission}
מה השיעור מלמד: ${(spec as Record<string, unknown>).lesson_reference || ''}
מהלכים טובים בטכניקה הזו:
${moveDefs}
דוגמאות לניסוח שעובד:
${golden}
כללים: בנה ראפור קודם, שקף מילים של המטופל, ואז יישם את הטכניקה צעד אחר צעד. לעולם אל תיתן עצה, אל תשאל "למה", אל תשתמש במונחים מקצועיים.
החזר את המשפט בלבד.`
  }
  // The bad learner must STAY bad. Left loose, Haiku drifts into decent questions
  // by turn 4 and wins, which tests nothing (p-m2-l3, 19.10.2026).
  return `אתה תלמיד מתחיל וחסר סבלנות בתרגול מול מטופל. כתוב רק את המשפט הבא שלך, בעברית.
בכל משפט, בלי יוצא מן הכלל, אתה עושה אחד משני הדברים:
1. נותן עצה ישירה: "כדאי לך...", "את צריכה...", "תנסה פשוט...".
2. שואל "למה" שמבקש הצדקה: "למה את לא...?", "למה זה כל כך קשה לך?".
אתה לא משקף, לא מתקף רגשות, לא שואל "מה" או "איך". אתה רוצה לפתור את זה מהר.
החזר את המשפט בלבד.`
}

type RunResult = {
  outcome: string | null; turns: number; unlocked: string[]
  judged: number; legal: number; brokeCharacter: boolean; transcript: string[]
}

// "תרגיל" is NOT here on purpose: a patient who went to workshops says
// "התרגילים" naturally (false alarm on p-m1-l1, 19.10.2026). What counts is the
// patient talking about the session itself as an exercise or a simulation.
const BREAK_RE = /(בינה מלאכותית|כמודל|אני מודל|זה תרגיל|בתרגיל הזה|סימולציה|NLP|ראפור|מטא.?מודל|ריפריים)/i

async function run(kind: 'good' | 'bad', file: Record<string, unknown>): Promise<RunResult> {
  const rawSpec = file.spec as Spec
  const resolved = resolveSkill(String(file.primary_skill), rawSpec)
  const spec = { ...rawSpec, scoring_rules: resolved.scoring_rules } as Spec
  const budget = Number(file.turn_budget) || 8
  const difficulty = Number(file.difficulty) || 1
  const name = patientName(spec)
  const female = isFemale(spec)
  const facts: GatedFact[] = spec.gated_facts || []
  const moveDefs = resolved.skill.moves.map(m => `- ${m.def}`).join('\n')

  let metrics: Metrics = { ...spec.metrics_init }
  let unlocked: string[] = []
  let flags: Record<string, number> = {}
  const opening = String((spec.patient as Record<string, unknown>).opening_line || '')
  const studentView: Msg[] = [{ role: 'user', content: `${name}: ${opening}` }]
  const actorConvo: Msg[] = [{ role: 'user', content: '[תחילת המפגש]' }, { role: 'assistant', content: opening }]
  const transcript = [`${name}: ${opening}`]
  let lastPatient = opening
  let judged = 0, legal = 0, broke = false
  let outcome: string | null = null
  let t = 0

  const sp = studentPrompt(kind, spec, resolved.skill.label, moveDefs)
  while (t < budget && !outcome) {
    t++
    const studentText = (await claude(sp, studentView, 150, 0.7)).replace(/^["'״]+|["'״]+$/g, '')
    transcript.push(`מטפל: ${studentText}`)

    const forced = preClassify(studentText, { jargonExempt: resolved.jargon_exempt, allowDirectives: resolved.allow_directives })
    let ev: Evaluation
    if (forced) {
      ev = normalizeEvaluation(null, 'regex', forced)
    } else {
      const jp = judgePrompt(spec, metrics, unlocked, facts.filter(f => !unlocked.includes(f.id)), lastPatient, studentText, resolved)
      const raw = await claude(jp, [{ role: 'user', content: 'סווג.' }], 900, 0.1)
      const parsed = parseEvaluation(raw)
      judged++
      if (parsed && resolved.moveIds.includes(String(parsed.move))) legal++
      ev = normalizeEvaluation(parsed, 'model', undefined, resolved.moveIds)
    }
    const res = applyTurn(spec, { metrics, unlocked, flags, turn_count: t - 1 }, ev, difficulty, resolved.flag_on_move)
    metrics = res.metrics; unlocked = res.unlocked; flags = res.flags
    outcome = checkTerminal(spec, { metrics, unlocked, flags }, t, budget)

    const vol = actorVolatile(metrics, facts.filter(f => unlocked.includes(f.id)), res.newly_unlocked, budget - t, female)
    actorConvo.push({ role: 'user', content: studentText })
    const reply = (await claude(actorStable(spec) + '\n\n' + vol, actorConvo, 220, 0.8)).replace(/^["'״]+|["'״]+$/g, '')
    actorConvo.push({ role: 'assistant', content: reply })
    if (BREAK_RE.test(reply)) broke = true
    transcript.push(`${name}: ${reply}  [${ev.move}${res.newly_unlocked ? ' · נפתח ' + res.newly_unlocked.id : ''}]`)
    studentView.push({ role: 'assistant', content: studentText })
    studentView.push({ role: 'user', content: `${name}: ${reply}` })
    lastPatient = reply
  }
  return { outcome, turns: t, unlocked, judged, legal, brokeCharacter: broke, transcript }
}

const only = Deno.args
const files: string[] = []
for await (const e of Deno.readDir(DIR)) {
  if (!e.isFile || !e.name.endsWith('.json') || e.name.startsWith('_')) continue
  if (only.length && !only.some(o => e.name.startsWith(o))) continue
  files.push(e.name)
}
files.sort()

const reportUrl = new URL('_gate-report.json', DIR)
let report: Record<string, unknown> = {}
try { report = JSON.parse(await Deno.readTextFile(reportUrl)) } catch { /* first run */ }

for (const name of files) {
  const file = JSON.parse(await Deno.readTextFile(new URL(name, DIR)))
  const reasons: string[] = []
  let good: RunResult | null = null, bad: RunResult | null = null
  try {
    // Two good attempts: one unlucky judge call should not fail a sound scenario.
    good = await run('good', file)
    if (good.outcome !== 'success') good = await run('good', file)
    bad = await run('bad', file)
  } catch (e) {
    reasons.push(`error: ${(e as Error).message}`)
  }
  if (good && good.outcome !== 'success') reasons.push(`good learner did not succeed (${good.outcome}, unlocked ${good.unlocked.join(',') || '-'})`)
  if (bad && bad.outcome === 'success') reasons.push('bad learner succeeded')
  const judged = (good?.judged || 0) + (bad?.judged || 0)
  const legal = (good?.legal || 0) + (bad?.legal || 0)
  const legalRate = judged ? legal / judged : 1
  if (legalRate < 0.85) reasons.push(`judge legal rate ${(legalRate * 100).toFixed(0)}%`)
  if (good?.brokeCharacter || bad?.brokeCharacter) reasons.push('patient broke character / named a technique')

  const publish = reasons.length === 0
  report[name] = {
    slug: file.slug, primary_skill: file.primary_skill, publish, reasons,
    good: good && { outcome: good.outcome, turns: good.turns, unlocked: good.unlocked },
    bad: bad && { outcome: bad.outcome, turns: bad.turns },
    judge_legal_rate: Number(legalRate.toFixed(2)),
    transcript_good: good?.transcript, transcript_bad: bad?.transcript,
    checked_at: new Date().toISOString(),
  }
  console.log(`${publish ? 'PASS' : 'FAIL'}  ${name}  ${publish ? '' : reasons.join(' | ')}`)
  await Deno.writeTextFile(reportUrl, JSON.stringify(report, null, 2))
}

// Haiku list price: $1 in / $5 out per million.
const usd = (tokensIn * 1 + tokensOut * 5) / 1e6
console.log(`\ntokens in ${tokensIn} · out ${tokensOut} · ≈ $${usd.toFixed(2)}`)
