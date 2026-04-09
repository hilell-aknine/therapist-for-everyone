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

### CORS `*` wildcard violates own policy
- **Date:** 2026-04-09
- **Problem:** `gemini-mentor` and `ai-chat` had `Access-Control-Allow-Origin: '*'` — CLAUDE.md explicitly warns against this but code predated the rule.
- **Fix:** Dynamic `getCorsHeaders(req)` that checks `req.headers.get('Origin')` against ALLOWED_ORIGINS whitelist, falls back to first allowed origin if unmatched.
- **Rule:** No Edge Function should use CORS `*`. Copy the `getCorsHeaders` helper from `ga4-analytics` or `submit-lead`. Add localhost only via env var check, never hardcoded.
