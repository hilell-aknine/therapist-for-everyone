// =============================================================================
// load-scenarios.mjs — upsert the scenario files into sim_scenarios.
//
// is_published comes from the self-play gate report and nothing else: a file
// with no gate verdict, or a failing one, is loaded but stays hidden.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/sandbox/load-scenarios.mjs [--dry]
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIR = join(here, '..', '..', 'content-private', 'sandbox-scenarios')
const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
const DRY = process.argv.includes('--dry')
if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing'); process.exit(1) }

let report = {}
try { report = JSON.parse(readFileSync(join(DIR, '_gate-report.json'), 'utf8')) } catch { /* no gate yet */ }

const rows = readdirSync(DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map(f => {
    const s = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
    return {
      slug: s.slug,
      version: s.version || 1,
      course_type: s.course_type,
      module_id: s.module_id,
      lesson_id: s.lesson_id,
      video_id: s.video_id || null,
      title: s.title,
      primary_skill: s.primary_skill,
      difficulty: s.difficulty || 1,
      turn_budget: s.turn_budget || 8,
      passing_score: s.passing_score ?? 75,
      spec: s.spec,
      is_published: report[f]?.publish === true,
    }
  })

console.log(`${rows.length} scenarios · ${rows.filter(r => r.is_published).length} publishable`)
if (DRY) process.exit(0)

const res = await fetch(`${URL_}/rest/v1/sim_scenarios?on_conflict=slug,version`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'Content-Profile': 'public',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
})
console.log(res.status, res.ok ? 'upserted' : await res.text())
if (!res.ok) process.exit(1)
