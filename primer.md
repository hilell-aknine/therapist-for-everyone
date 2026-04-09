# Primer — Beit V'Metaplim
> Last updated: 2026-04-09 by Claude Code

## Current State
- **Status:** Active — security hardening phase 2 complete
- **Last task completed:** Full security audit + 2-phase fix rollout (migrations 049-053, 5 Edge Functions hardened, 6 JS files updated). 8/8 verification tests passed.
- **Next planned task:** Non-critical audit items if desired — NLP game bugs (XP farming, hearts, daily challenge), dead code cleanup, CSP header, missing CSS files on some pages
- **Blocking issues:** None

## Recent Changes
| Date | What Changed | Files Affected |
|------|-------------|----------------|
| 2026-04-09 | Security phase 2: auth/CORS/XSS/privilege escalation/Turnstile/Sheets token/404.html/vercelignore/auth race | migrations 052-053, 5 Edge Functions, admin-paid.js, admin-auth.js, admin-state.js, supabase-config.js, .vercelignore, 404.html |
| 2026-04-07 | Security phase 1: RLS policies, column REVOKE, admin RPC functions | migrations 049-051, 5 admin JS files (use db.rpc instead of select('*') for sensitive tables) |

## Security Architecture (post-audit)
- **Sensitive columns REVOKEd** from `authenticated` role: `therapists.questionnaire`, `therapists.signature_data`, `questionnaire_submissions.{weakness,challenge,what_is_therapist,what_touched_you}`, `portal_questionnaires.{motivation_tip,main_challenge,vision_one_year}`, `signed_contracts.{signer_id_number,signature_data}`
- **Admin access pattern:** JS uses `db.rpc('admin_get_*_full')` SECURITY DEFINER functions (verify `profiles.role='admin'`) to read sensitive data
- **Edge Functions:** All use explicit ALLOWED_ORIGINS whitelist (no wildcard CORS). gemini-mentor requires auth + 100/day rate limit via `ai_chat_usage` with `source='mentor'`
- **Turnstile:** submit-lead + submit-contract log CRITICAL error if `TURNSTILE_SECRET_KEY` missing (instead of silently disabling)
- **Privilege escalation blocked:** Migration 052 `WITH CHECK` on profiles UPDATE policy prevents self-role-change
- **Sheets API token:** Moved from `supabase-config.js` to Supabase Secrets, accessed via `sheets-sync` Edge Function (admin-only)

## Active Branches
- `master` — production, auto-deploys to Vercel on push

## Environment Notes
- **Deploy JS changes:** `git push origin master` → Vercel auto-deploy
- **Deploy Edge Functions:** `npx supabase functions deploy <name> --no-verify-jwt`
- **Apply migrations:** `npx supabase db push --include-all`
- **Set secrets:** `npx supabase secrets set KEY=value` (use `--env-file` for Windows-safe JSON)
- **Docker:** NOT required for deploys (warning but succeeds). Required only for local `db dump` / `db reset`

## Open Questions
- Admin auth via `tempClient` (admin-auth.js:10) creates a second Supabase client — could be consolidated with `db` from admin-state.js
- `therapists.user_id` column does not exist in live DB — matchmaking platform only, no therapist login. Migration 050 dropped the dead policies.
