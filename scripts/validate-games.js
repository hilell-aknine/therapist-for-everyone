/* validate-games.js — deterministic integrity check for the NLP games.
   Loads the data files exactly like the browser, then validates every exercise
   against the engine's contract (nlp-game.js). Read-only. Run:
     node scripts/validate-games.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'js');
const LETTERS = 4; // engine uses ['א','ב','ג','ד'] → options must be ≤ 4

const VALID_TYPES = new Set([
  'multiple-choice', 'fill-blank', 'order', 'identify',
  'compare', 'scenario', 'improve', 'match'
]);

function loadCourse(files, assembler) {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const code = fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  // assembler declares `const MODULES = [...]` — capture it by appending an export
  const asmCode = fs.readFileSync(path.join(JS, assembler), 'utf8') + '\n;window.__MODULES__ = MODULES;';
  vm.runInContext(asmCode, ctx, { filename: assembler });
  return ctx.__MODULES__;
}

const problems = [];
function err(loc, msg) { problems.push({ level: 'ERROR', loc, msg }); }
function warn(loc, msg) { problems.push({ level: 'WARN', loc, msg }); }

function isPerm(arr, n) {
  if (!Array.isArray(arr) || arr.length !== n) return false;
  const seen = new Set(arr);
  if (seen.size !== n) return false;
  for (let i = 0; i < n; i++) if (!seen.has(i)) return false;
  return true;
}

function validateExercise(ex, loc) {
  if (!ex || typeof ex !== 'object') { err(loc, 'exercise is not an object'); return; }
  if (!VALID_TYPES.has(ex.type)) { err(loc, `invalid/unknown type: ${JSON.stringify(ex.type)}`); return; }
  if (!ex.question || typeof ex.question !== 'string') err(loc, 'missing question');
  if (ex.explanation === undefined) warn(loc, 'missing explanation (shown after answer)');

  const optionBased = ['multiple-choice', 'scenario', 'improve', 'fill-blank'];
  if (optionBased.includes(ex.type)) {
    if (!Array.isArray(ex.options) || ex.options.length < 2) { err(loc, 'options must be an array of ≥2'); return; }
    if (ex.options.length > LETTERS && ex.type !== 'fill-blank')
      err(loc, `options has ${ex.options.length} items but engine only labels 4 (א-ד) → extra render as "undefined"`);
    if (typeof ex.correct !== 'number' || ex.correct < 0 || ex.correct >= ex.options.length)
      err(loc, `correct index ${ex.correct} out of range for ${ex.options.length} options`);
    // wrongExplanations: per-distractor feedback. MEANINGFUL only for MC/scenario/improve
    // (the user picks a labelled option). For fill-blank the engine never surfaces it
    // distinctly, so `[null]` is a benign placeholder — info only, not an error.
    const wantsPerOptionFeedback = ['multiple-choice', 'scenario', 'improve'].includes(ex.type);
    if (ex.wrongExplanations !== undefined) {
      if (!Array.isArray(ex.wrongExplanations)) err(loc, 'wrongExplanations must be an array');
      else if (wantsPerOptionFeedback) {
        if (ex.wrongExplanations.length !== ex.options.length)
          err(loc, `wrongExplanations length ${ex.wrongExplanations.length} ≠ options length ${ex.options.length}`);
        if (typeof ex.correct === 'number' && ex.wrongExplanations.length === ex.options.length && ex.wrongExplanations[ex.correct] !== null)
          err(loc, `wrongExplanations[correct=${ex.correct}] must be null`);
        ex.wrongExplanations.forEach((w, i) => {
          if (i !== ex.correct && (w === null || w === undefined || w === ''))
            warn(loc, `wrongExplanations[${i}] empty (no feedback if user picks this wrong answer)`);
        });
      }
    } else if (wantsPerOptionFeedback) {
      warn(loc, 'no wrongExplanations (user gets generic feedback on wrong pick)');
    }
  }

  if (ex.type === 'fill-blank') {
    if (typeof ex.template !== 'string' || !ex.template.includes('___'))
      err(loc, 'fill-blank template missing "___" placeholder → blank never renders');
  }

  if (ex.type === 'compare') {
    for (const k of ['optionA', 'optionB']) {
      if (!ex[k] || typeof ex[k].text !== 'string' || typeof ex[k].label !== 'string')
        err(loc, `compare ${k} must have {label, text}`);
    }
    if (ex.correct !== 0 && ex.correct !== 1) err(loc, `compare correct must be 0 or 1 (got ${ex.correct})`);
  }

  if (ex.type === 'order') {
    if (!Array.isArray(ex.items) || ex.items.length < 2) err(loc, 'order items must be array of ≥2');
    else if (!isPerm(ex.correctOrder, ex.items.length))
      err(loc, `correctOrder must be a permutation of 0..${ex.items.length - 1} (got ${JSON.stringify(ex.correctOrder)})`);
  }

  if (ex.type === 'identify') {
    if (typeof ex.text !== 'string' || !ex.text.length) err(loc, 'identify missing text');
    else if (!Array.isArray(ex.correctRange) || ex.correctRange.length < 2)
      err(loc, 'identify correctRange must be [start,end]');
    else {
      const [s, e] = ex.correctRange;
      if (!(Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e > s && e <= ex.text.length))
        err(loc, `identify correctRange [${s},${e}] out of bounds for text length ${ex.text.length}`);
    }
  }

  if (ex.type === 'match') {
    if (!Array.isArray(ex.pairs) || ex.pairs.length < 2) err(loc, 'match pairs must be array of ≥2');
    else ex.pairs.forEach((p, i) => {
      if (!p || typeof p.left !== 'string' || typeof p.right !== 'string')
        err(`${loc}`, `match pair[${i}] must have {left,right} strings`);
    });
  }
}

function validateCourse(name, modules) {
  const stats = { modules: 0, lessons: 0, exercises: 0, byType: {} };
  if (!Array.isArray(modules) || !modules.length) { err(name, 'MODULES empty or not an array'); return stats; }
  modules.forEach((m, mi) => {
    if (!m) { err(`${name} module#${mi}`, 'module is null/undefined (filtered slot?)'); return; }
    stats.modules++;
    const mloc = `${name} M${m.id ?? mi}`;
    if (m.id === undefined) warn(mloc, 'module missing id');
    if (!m.title) warn(mloc, 'module missing title');
    if (!Array.isArray(m.lessons) || !m.lessons.length) { err(mloc, 'module has no lessons'); return; }
    m.lessons.forEach((l, li) => {
      stats.lessons++;
      const lloc = `${mloc} · lesson ${l.id ?? li} "${(l.title || '').slice(0, 30)}"`;
      if (!l.title) warn(lloc, 'lesson missing title');
      if (l.reading) {
        if (!Array.isArray(l.reading.paragraphs) || !l.reading.paragraphs.length)
          warn(lloc, 'reading has no paragraphs');
      }
      if (!Array.isArray(l.exercises) || !l.exercises.length) { err(lloc, 'lesson has no exercises'); return; }
      l.exercises.forEach((ex, ei) => {
        stats.exercises++;
        if (ex && ex.type) stats.byType[ex.type] = (stats.byType[ex.type] || 0) + 1;
        validateExercise(ex, `${lloc} · ex#${ei + 1}`);
      });
    });
  });
  return stats;
}

// ── Run ──
// MASTER moved out of the public repo (paid-content leak): its data now lives in
// content-private/master-game/master-modules.json (built by build_master_game_json.mjs,
// served to paying users via the get-game-data Edge Function). Validate the JSON —
// that is exactly what production serves.
const MASTER_JSON = path.join(__dirname, '..', 'content-private', 'master-game', 'master-modules.json');

const courses = [
  {
    name: 'PRACTITIONER',
    files: ['nlp-game-data-m1.js','nlp-game-data-m2.js','nlp-game-data-m3.js','nlp-game-data-m4.js','nlp-game-data-m5.js','nlp-game-data-m6.js','nlp-game-data-m7.js'],
    asm: 'nlp-game-data.js'
  },
  {
    name: 'MASTER',
    json: MASTER_JSON
  }
];

for (const c of courses) {
  problems.length = 0;
  let modules;
  try {
    if (c.json) {
      if (!fs.existsSync(c.json)) { console.log(`\n⚠ ${c.name}: ${c.json} not found on this machine — skipped (built+validated on the machine that uploads it)`); continue; }
      modules = JSON.parse(fs.readFileSync(c.json, 'utf8')).modules;
    } else {
      modules = loadCourse(c.files, c.asm);
    }
  }
  catch (e) { console.log(`\n❌ ${c.name}: failed to load — ${e.message}`); continue; }
  const stats = validateCourse(c.name, modules);
  const errors = problems.filter(p => p.level === 'ERROR');
  const warns = problems.filter(p => p.level === 'WARN');
  console.log(`\n══════════ ${c.name} ══════════`);
  console.log(`modules=${stats.modules}  lessons=${stats.lessons}  exercises=${stats.exercises}`);
  console.log(`by type:`, JSON.stringify(stats.byType));
  console.log(`ERRORS=${errors.length}  WARNINGS=${warns.length}`);
  if (errors.length) {
    console.log(`\n--- ERRORS (break gameplay) ---`);
    errors.forEach(p => console.log(`  ✖ [${p.loc}] ${p.msg}`));
  }
  if (warns.length) {
    console.log(`\n--- WARNINGS (quality) ---`);
    warns.slice(0, 60).forEach(p => console.log(`  ⚠ [${p.loc}] ${p.msg}`));
    if (warns.length > 60) console.log(`  ... +${warns.length - 60} more warnings`);
  }
  if (!errors.length) console.log(`\n✅ ${c.name}: no gameplay-breaking errors.`);
}
