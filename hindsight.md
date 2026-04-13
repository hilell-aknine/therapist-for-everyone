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

### CORS `*` wildcard violates own policy
- **Date:** 2026-04-09
- **Problem:** `gemini-mentor` and `ai-chat` had `Access-Control-Allow-Origin: '*'` — CLAUDE.md explicitly warns against this but code predated the rule.
- **Fix:** Dynamic `getCorsHeaders(req)` that checks `req.headers.get('Origin')` against ALLOWED_ORIGINS whitelist, falls back to first allowed origin if unmatched.
- **Rule:** No Edge Function should use CORS `*`. Copy the `getCorsHeaders` helper from `ga4-analytics` or `submit-lead`. Add localhost only via env var check, never hardcoded.
