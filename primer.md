# Primer — Beit V'Metaplim
> Last updated: 2026-04-12 by Claude Code

## Current State
- **Status:** Active — popup management system v2 complete, ready for deploy
- **Last task completed:** Popup system overhaul for measurement + optimization. Migrations 054-057, popup-manager.js rewritten, admin-popups.js expanded with CSV/JSON export + insights timeline, new popup-preview.html iframe, Claude Code playbook at docs/popup-insights.md
- **Next planned task:** Run `npx supabase db push --include-all` to apply migrations 054-057, then `git push origin master` to deploy. Verify anonymous session logging works (incognito → auth_modal should insert row with session_id in popup_events).
- **Blocking issues:** None

## Recent Changes
| Date | What Changed | Files Affected |
|------|-------------|----------------|
| 2026-04-12 | Popup system v2: anonymous session tracking, A/B variants, cross-device dismissals, status lifecycle, insights log, Claude Code export, funnel metrics, 7-day sparklines, bulk ops, CSV export, iframe preview | migrations 054-057, popup-manager.js, admin-popups.js, admin.html, course-library.html, pages/popup-preview.html (new), docs/popup-insights.md (new), .vercelignore |
| 2026-04-09 | Security phase 2: auth/CORS/XSS/privilege escalation/Turnstile/Sheets token/404.html/vercelignore/auth race | migrations 052-053, 5 Edge Functions, admin-paid.js, admin-auth.js, admin-state.js, supabase-config.js, .vercelignore, 404.html |
| 2026-04-07 | Security phase 1: RLS policies, column REVOKE, admin RPC functions | migrations 049-051, 5 admin JS files (use db.rpc instead of select('*') for sensitive tables) |

## Popup System v2 — Quick Reference
- **Anonymous event logging:** PopupManager generates session_id in sessionStorage (`popup_session_id`) and inserts popup_events with user_id=NULL. RLS policy in migration 054 allows this only when session_id is present.
- **Triggers:** `PopupManager.notifyLessonComplete()` / `notifySignup()` / auto-fired `page_load` / `login` (on auth transition). Admin creates popups with `trigger_event` column, no code changes needed.
- **A/B tests:** Set `variant_group` + `variant_label` on multiple popups. PopupManager picks sticky per session (sessionStorage `popup_variant_choice`).
- **Cross-device dismiss:** `popup_dismissals` table synced to localStorage `popup_history` on login.
- **Claude Code analysis:** Admin clicks "ייצא לקלוד" → downloads JSON → gives to Claude Code with `docs/popup-insights.md` playbook → Claude inserts findings into `popup_insights_log` table → they appear in admin dashboard timeline.
- **Admin notes field:** Every popup has `admin_notes` — hypothesis/goals for Claude to read first.

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
