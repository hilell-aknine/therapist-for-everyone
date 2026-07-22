/* build_master_game_json.mjs — builds the private Master game data JSON.
   Sources: content-private/master-game/src/nlp-game-data-master-*.js (verbatim,
   transcript-grounded, NOT in git — the public repo must not carry paid content).
   Cleaning: em-dash sweep (X — Y -> X, Y) applied at OBJECT level so that
   identify-exercise correctRange indices are remapped precisely (a text-level
   sweep silently corrupts them).
   Output: content-private/master-game/master-modules.json — uploaded to the
   private `game-data` Storage bucket, served by the get-game-data Edge Function.
   Run: node scripts/build_master_game_json.mjs
*/
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'content-private', 'master-game', 'src');
const OUT = path.join(__dirname, '..', 'content-private', 'master-game', 'master-modules.json');

const EM = /\s*—\s*/g; // "X — Y" -> "X, Y" (same rule as the free-game sweep)

function cleanStr(s) {
  return s.replace(EM, ', ');
}

// Cleaned length of the original prefix -> maps an index in the original
// string to the corresponding index in the cleaned string.
function mapIndex(original, idx) {
  return cleanStr(original.slice(0, idx)).length;
}

let replaced = 0;
function deepClean(node) {
  if (typeof node === 'string') {
    const m = node.match(EM);
    if (m) replaced += m.length;
    return cleanStr(node);
  }
  if (Array.isArray(node)) return node.map(deepClean);
  if (node && typeof node === 'object') {
    // identify exercises: remap correctRange against the cleaned text
    if (node.type === 'identify' && typeof node.text === 'string' && Array.isArray(node.correctRange)) {
      const [s, e] = node.correctRange;
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === 'correctRange') continue;
        out[k] = deepClean(v);
      }
      out.correctRange = [mapIndex(node.text, s), mapIndex(node.text, e)];
      return out;
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = deepClean(v);
    return out;
  }
  return node;
}

// Load the module files exactly like the browser (same approach as validate-games.js)
const files = fs.readdirSync(SRC)
  .filter(f => /^nlp-game-data-master-m\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/m(\d+)/)[1]) - Number(b.match(/m(\d+)/)[1]));
if (files.length !== 10) {
  console.error(`expected 10 master module files in ${SRC}, found ${files.length}`);
  process.exit(1);
}

const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}
const rawModules = files.map((f, i) => ctx[`MODULE_${i + 1}_MASTER`]).filter(Boolean);
if (rawModules.length !== 10) {
  console.error(`expected 10 MODULE_N_MASTER globals, got ${rawModules.length}`);
  process.exit(1);
}

const modules = deepClean(rawModules);

// sanity: identify ranges still select the same (cleaned) phrase
let identifyChecked = 0;
for (const m of rawModules) for (const l of m.lessons || []) for (const ex of l.exercises || []) {
  if (ex.type === 'identify' && typeof ex.text === 'string') {
    const cleanedText = cleanStr(ex.text);
    const [s, e] = ex.correctRange;
    const expect = cleanStr(ex.text.slice(s, e)).trim();
    const got = cleanedText.slice(mapIndex(ex.text, s), mapIndex(ex.text, e)).trim();
    if (expect !== got) {
      console.error(`identify range drift in M${m.id} lesson ${l.id}: "${expect}" != "${got}"`);
      process.exit(1);
    }
    identifyChecked++;
  }
}

const stats = {
  modules: modules.length,
  lessons: modules.reduce((n, m) => n + (m.lessons?.length || 0), 0),
  exercises: modules.reduce((n, m) => n + (m.lessons || []).reduce((k, l) => k + (l.exercises?.length || 0), 0), 0),
};
fs.writeFileSync(OUT, JSON.stringify({ course: 'master', builtAt: new Date().toISOString(), ...stats, modules }), 'utf8');

const remaining = (JSON.stringify(modules).match(/—/g) || []).length;
console.log(`built ${OUT}`);
console.log(`modules=${stats.modules} lessons=${stats.lessons} exercises=${stats.exercises}`);
console.log(`em-dash replacements=${replaced}, remaining em-dashes=${remaining}, identify ranges remapped+verified=${identifyChecked}`);
