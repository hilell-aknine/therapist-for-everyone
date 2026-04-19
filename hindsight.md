# Hindsight — Beit V'Metaplim
> Lessons learned the hard way. Read this BEFORE starting any task.

## Format
Each entry:
- **Date:** when it happened
- **Problem:** what went wrong
- **Root Cause:** why
- **Fix:** what resolved it
- **Rule:** the takeaway

---

## Entries

### "Signups" live in 5 tables, not just profiles
- **Date:** 2026-04-14
- **Problem:** Migration 061 (`admin_segments_overview()`) counted signups from `profiles` only. The Segments tab showed "נרשמו אתמול: 0" while real registrations had happened. Required a same-day fix (migration 062).
- **Root Cause:** The 3 anonymous intake forms (`patients`, `therapists`, `contact_requests`) don't go through Supabase Auth, so the `handle_new_user` trigger never fires and no `profiles` row is ever created for those leads. Querying `profiles` alone is structurally blind to the majority of the funnel. The Instagram tab (`admin-instagram.js:29-38`) already documents the correct pattern — sum 5 tables.
- **Fix:** Migration 062 rewrote the RPC to build a `registrations` CTE as `UNION ALL` of patients ∪ therapists ∪ contact_requests ∪ profiles ∪ portal_questionnaires. Added a `by_channel` breakdown panel so future gaps are visible in the UI at a glance.
- **Rule:** Before writing any "count of users" query in this repo, **list all 5 registration tables explicitly**. If the query only touches `profiles`, it is almost certainly wrong. Reference `admin-instagram.js` for the canonical pattern.

### Hardcoded colors break on dark theme + new tabs
- **Date:** 2026-04-14
- **Problem:** First version of the Segments tab used hardcoded `rgba(0, 96, 107, ...)` backgrounds and aqua→gold gradients. On the dark admin theme it looked tinted, busy, and low-contrast — "not accessible to the eye" per user feedback. Required a same-day redesign (commit a1254f8).
- **Root Cause:** I ignored the existing theme variable system (`var(--card)`, `var(--border)`, `var(--text)`, `var(--text-secondary)`) defined in `css/theme.css` and consumed by `css/admin-styles.css`. Those variables auto-adapt between Light and Dark mode; hardcoded colors do not.
- **Fix:** Rewrote the Segments CSS to match `.overview-card` exactly — flat `var(--card)` background, `var(--border)` border, `var(--text)` values, solid single-color bars, tabular numbers. No gradients, no tinted bgs, no colored icon pills.
- **Rule:** For any new admin tab, inherit `var(--card)` / `var(--border)` / `var(--text)` / `var(--text-secondary)` from the theme system. Only hardcode a color when it represents a semantic meaning that doesn't exist in the palette (e.g., warn red `#E57373`, success green `#10B981`). Always cross-check the tab in Light mode before shipping.

### Column-level REVOKE breaks admin panel
- **Date:** 2026-04-07
- **Problem:** After `REVOKE SELECT (column) ... FROM authenticated` on sensitive columns, admin panel queries using `db.from('table').select('*')` silently returned NULL for the REVOKEd columns. Admin couldn't see questionnaire answers, signatures, etc.
- **Root Cause:** `REVOKE ... FROM authenticated` blocks ALL authenticated users, including admins. Column-level grants are not RLS-aware — they apply before any RLS policy check.
- **Fix:** Create SECURITY DEFINER RPC functions (`admin_get_*_full()`) that verify `profiles.role='admin'` inside the function body, then return `SETOF tablename`. SECURITY DEFINER bypasses column grants because the function owner has full privileges. Update JS to call `db.rpc(...)` instead of `db.from(...).select('*')`.
- **Rule:** When REVOKEing columns from `authenticated`, always create a parallel RPC function for admin access BEFORE deploying the REVOKE. Test both paths.

### Migration references non-existent columns
- **Date:** 2026-04-09
- **Problem:** Migration 049 tried to `CREATE POLICY ... WHERE user_id = auth.uid()` on therapists/patients subqueries, but `therapists.user_id` and `patients.user_id` don't exist in the live DB. `supabase db push` failed with `column "user_id" does not exist`.
- **Root Cause:** Migration 004 referenced `user_id` on therapists/patients, but the tables were originally created by FlutterFlow without that column. Migration 004's policies were created but actually BROKEN from day one — PostgreSQL didn't validate the subquery columns at creation time (deferred to query time), so the migration "succeeded" but the policies never worked.
- **Fix:** Migration 050 dropped the 8 obsolete policies. This is a matchmaking platform — therapists/patients don't log in, so no self-access policies needed. Admin-only access is sufficient.
- **Rule:** Before writing RLS policies that reference columns in subqueries, verify the columns exist in the LIVE DB (not just in migrations). Use `curl $SUPABASE/rest/v1/table?select=col&limit=0` to check.

### `supabase db dump` requires Docker
- **Date:** 2026-04-09
- **Problem:** Tried `npx supabase db dump --schema public` to inspect live schema, got Docker Desktop error.
- **Root Cause:** `supabase db dump` runs pg_dump inside a Docker container for version compatibility.
- **Fix:** Use PostgREST API directly: `curl $SUPABASE/rest/v1/table?select=col&limit=0` returns 200 if column exists, 400 if not. Or read OpenAPI spec at `/rest/v1/?apikey=...`.
- **Rule:** When Docker is unavailable, query PostgREST API to verify schema instead of trying `db dump`.

### `.vercelignore` gotchas
- **Date:** 2026-04-09
- **Problem:** Initially forgot to block `backups/`, `scripts/`, `docs/legal/`, `ux-audit/`. Vercel deploys the ENTIRE repo by default.
- **Root Cause:** Mental model was "Vercel deploys what I commit" — but it deploys everything in the repo, ignoring only what's in `.vercelignore`.
- **Fix:** Added explicit blocks for all sensitive folders. Verify via `curl -I https://site/path` — expect 404 for blocked paths.
- **Rule:** Treat `.vercelignore` as a critical security boundary. Any folder with user data, credentials, internal docs, or audit reports MUST be explicitly blocked. Re-verify after every new folder is added to the project.

### PostgreSQL VIEW defaults to SECURITY DEFINER
- **Date:** 2026-04-07
- **Problem:** `referral_leaderboard` and `campaign_performance` views bypassed RLS on underlying tables (`referrals`, `ad_campaigns`), because views without explicit `security_invoker=true` default to DEFINER behavior in older PG versions.
- **Fix:** `CREATE VIEW ... WITH (security_invoker = true) AS ...` — the caller's privileges apply to underlying tables, so RLS is enforced.
- **Rule:** Every `CREATE VIEW` that joins across RLS-protected tables MUST include `WITH (security_invoker = true)`. Supabase is PG15+ which has better defaults, but explicit is safer.

### WITH CHECK for immutable columns
- **Date:** 2026-04-09
- **Problem:** Users could escalate to admin via `Profiles.update(myId, {role:'admin'})` from browser console. The RLS UPDATE policy only checked WHO, not WHAT.
- **Fix:** Migration 052 — `WITH CHECK (role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid()))`. This makes `role` immutable via self-update. Admin can still change roles via service_role.
- **Rule:** For any column that represents privilege/trust (role, is_admin, permissions), add `WITH CHECK` that compares new value to current value. `USING` alone is insufficient.

### Partial-update RPC needs COALESCE on EVERY column, including TEXT NOT NULL
- **Date:** 2026-04-13
- **Problem:** Migration 058 created `admin_automations_upsert(rule JSONB)` which wraps most columns in `COALESCE(rule->>'X', X)` so partial JSON payloads (toggle button sends `{id, is_enabled}` only) preserve the existing value of unsent fields. But `name` and `description` were assigned without COALESCE: `name = rule->>'name'`. When the toggle sends a partial payload, `rule->>'name'` returns NULL → UPDATE tries `name = NULL` → `NOT NULL` constraint violation → toggle silently fails on every click in the UI.
- **Root Cause:** Inconsistent application of the COALESCE pattern. The dev (me) applied it to scalar/boolean/JSONB fields by reflex but skipped the two TEXT fields, probably because they "felt" simple. The full-rule save path always sends `name` so testing didn't catch it; the smoke test used a service-role REST PATCH that bypassed the RPC entirely.
- **Fix:** Migration 059 — `CREATE OR REPLACE FUNCTION` with `name = COALESCE(rule->>'name', name)` and same for `description`. Two-line change.
- **Rule:** **Any RPC that accepts a JSONB payload for upsert MUST wrap EVERY column in COALESCE on the UPDATE branch — no exceptions for "obviously required" fields.** The contract is "missing key = preserve existing", not "missing key = NULL". Verify by writing one test that sends a payload with `id` + ONE other field and asserts every other column survives unchanged. The fact that the full-save path always sends every field is irrelevant — partial payloads are a normal use case (toggles, bulk patches, optimistic concurrency).

### Smoke test that bypasses the actual code path doesn't count
- **Date:** 2026-04-13
- **Problem:** During the Smart Automations E2E verification, I manipulated the test rule via service-role `/rest/v1/automation_rules?id=eq.X` PATCH to flip `is_enabled` and tweak the cron. The engine fired correctly, the audit log lit up, and I declared victory. But the test never exercised the `admin_automations_upsert` RPC at all — which is the path the live UI uses. The COALESCE bug above shipped to production undetected because of this gap.
- **Root Cause:** Convenience. Service-role PATCH is one curl away; calling the RPC with a real admin JWT requires logging into the admin panel. I took the shortcut and lost coverage of the function body.
- **Fix:** Found the bug an hour later via field-by-field cross-reference, shipped migration 059 before the user touched the UI.
- **Rule:** When verifying an admin-only feature, **the verification must execute the same path the production frontend uses** — including the RPC, including the auth check. If you can't get a real JWT in a script, at minimum read every code path the UI will hit (RPC body, middleware, validators) and trace through it manually with the exact payload shape the UI sends. Service-role REST is for setup and teardown, not for verifying business logic.

### Silent backup failure — battery + Hebrew path + no alerting
- **Date:** 2026-04-13
- **Problem:** `BeitVmetaplim-DailyBackup` Task Scheduler task ran daily at 07:00 but produced **zero successful backups for 20 days** (24/03 → 12/04). Failure was completely silent — email reports only fire on success, no WhatsApp, no log. User would have lost 20 days of CRM data in a disaster.
- **Root Causes (three independent bugs compounding):**
  1. Task had `DisallowStartIfOnBatteries=true` + `StopIfGoingOnBatteries=true`. Laptop was on battery at 07:00 most days → task simply didn't run. CLAUDE.md *already* documented this exact lesson under Night Automation, but the backup task was created without the fix.
  2. Task used `py` (the Python launcher) which depends on PATH. When Task Scheduler couldn't resolve it under certain conditions → ERROR_FILE_NOT_FOUND (0x80070002).
  3. Hebrew path `שולחן העבודה` in the script argument intermittently broke Task Scheduler arg parsing — even when fully quoted. Short 8.3 paths (e.g. `913C~1\BEIT-V~1\scripts\BACKUP~1.PY`) work reliably.
- **Fix:**
  1. `Set-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable` on both backup tasks.
  2. Replaced `py` with full path to `python.exe` (`C:\Users\saraa\AppData\Local\Programs\Python\Python313\python.exe`).
  3. Get 8.3 short path via `(New-Object -ComObject Scripting.FileSystemObject).GetFile($path).ShortPath` and pass that as the script argument.
  4. Added 3-layer alerting: per-table try/except, top-level try/except → WhatsApp via Green API crm-bot instance (7103533485), independent watchdog `scripts/check_backup_health.py` running daily 09:00 that alerts if no fresh ZIP within 26h. `backups/backup-runs.log` for at-a-glance history.
- **Rule:** **Any** Windows Scheduled Task that runs Python on this machine MUST: (1) use full python.exe path, not `py`; (2) use 8.3 short path for the script if its full path contains Hebrew; (3) set `AllowStartIfOnBatteries` + `StartWhenAvailable`; (4) emit a heartbeat to a log file on every run AND have an independent watchdog that fires WhatsApp if the heartbeat is stale. Schedulers that "ran" but returned a nonzero exit code count as silent failures — never trust the absence of an error message.

### lead_attribution rows ≠ unique people
- **Date:** 2026-04-19
- **Problem:** Dashboard showed "398 leads in 30 days" — but the real number was 209 unique people. Each person generates multiple lead_attribution rows (profile + questionnaire + sometimes patient/contact_request). Source bars summed to 332 instead of 209.
- **Root Cause:** `COUNT(*)` counts rows. One person = 2-3 rows across tables. The source grouping (`GROUP BY source`) counted DISTINCT per group, but the same person appeared in multiple groups with different sources.
- **Fix:** (1) `DISTINCT ON (person_key)` CTE picks ONE best row per person (preferring non-direct sources). (2) KPI uses `COUNT(DISTINCT COALESCE(phone, email, id))`. (3) Source bars now sum exactly to total.
- **Rule:** **Any query on lead_attribution MUST use unique-person logic** — `COALESCE(NULLIF(phone,''), NULLIF(email,''), id::text)` as the person key. Never `COUNT(*)` for "how many people" questions. Cross-table joins are legitimate (same person = patient + learner), so row count is always inflated.

### ensureProfile() was a data black hole
- **Date:** 2026-04-19
- **Problem:** ~70% of signups (Google OAuth + email/password) had zero traffic source data. The dashboard showed most people as "(direct)" even though many came from campaigns.
- **Root Cause:** `ensureProfile()` in supabase-client.js creates a profile row on signup but never read `getFullAttribution()` or `getUtmData()`, and never created a `lead_attribution` row. Only form submissions via `submit-lead` Edge Function got attribution.
- **Fix:** (1) ensureProfile() now saves utm_source/medium/campaign to profiles table AND creates lead_attribution row with full first/last touch data. (2) signInWithGoogle() preserves UTM params in the OAuth redirect URL. (3) RLS policy added for authenticated INSERT on lead_attribution (restricted to own profile).
- **Rule:** **Any code path that creates a user/lead record MUST also create a lead_attribution row.** There are currently two paths: submit-lead Edge Function (forms) and ensureProfile() (auth signup). If a third path is added, it must include attribution.

### EXECUTE without INTO doesn't set FOUND in plpgsql
- **Date:** 2026-04-19
- **Problem:** DB trigger `prevent_double_submit()` used `EXECUTE format(...) USING NEW.phone; IF FOUND THEN RAISE...` — but FOUND was never set, so duplicates passed through.
- **Root Cause:** In PostgreSQL plpgsql, `EXECUTE` only sets `FOUND` when used with `INTO`. Without `INTO`, `FOUND` stays false regardless of whether the query returned rows.
- **Fix:** Changed to `EXECUTE ... INTO existing_id USING NEW.phone; IF existing_id IS NOT NULL THEN RAISE...`
- **Rule:** In plpgsql triggers using dynamic SQL, always `EXECUTE ... INTO variable` and check the variable, never rely on `FOUND` with bare `EXECUTE`.

### UTM source fragmentation (fb/ig/facebook/instagram)
- **Date:** 2026-04-19
- **Problem:** Same Meta platform recorded as `fb`, `ig`, `facebook`, `instagram`, or `meta` in UTM params. Admin reports queried only `'facebook'` or `'instagram'`, silently missing the shorthand variants.
- **Fix:** (1) Added `_normalizeSource()` in marketing-tools.js to map `fb→facebook`, `ig→instagram`, `meta→facebook` on capture. (2) Migration to normalize existing records in all tables.
- **Rule:** Always normalize UTM sources at capture time (marketing-tools.js `_captureThisTouch()`). The canonical values are lowercase full names: `facebook`, `instagram`, `youtube`, `google`, `tiktok`.

### CORS `*` wildcard violates own policy
- **Date:** 2026-04-09
- **Problem:** `gemini-mentor` and `ai-chat` had `Access-Control-Allow-Origin: '*'` — CLAUDE.md explicitly warns against this but code predated the rule.
- **Fix:** Dynamic `getCorsHeaders(req)` that checks `req.headers.get('Origin')` against ALLOWED_ORIGINS whitelist, falls back to first allowed origin if unmatched.
- **Rule:** No Edge Function should use CORS `*`. Copy the `getCorsHeaders` helper from `ga4-analytics` or `submit-lead`. Add localhost only via env var check, never hardcoded.
