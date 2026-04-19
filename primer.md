# Primer — Beit V'Metaplim
> Last updated: 2026-04-16 by Claude Code

## Current State
- **Status:** Active — Full data accuracy overhaul for paid campaigns complete. Unique lead counting, CAPI tracking, dedup prevention, attribution on all signups.
- **Last task completed:** Campaign data accuracy overhaul (2026-04-19, 10+ commits). Full audit and fix of all tracking gaps for paid Meta campaigns. Key changes: (1) submit-lead Edge Function: same-table dedup (24h), phone validation, mirror_table for atomic dual inserts, (2) CAPI CompleteRegistration events on all forms (patient-step4, therapist-step4, thank-you, questionnaire-form) with browser↔server event_id dedup, (3) ensureProfile() now saves UTM + creates lead_attribution row for every new signup (was missing for ~70% of users), (4) Google OAuth preserves UTM params in redirect URL, (5) Traffic dashboard: counts unique people not rows (367 people, not 611 rows), source bars sum to 100%, paid/organic badges, theme-aware CSS, (6) UTM normalization (fb→facebook, ig→instagram), (7) DB trigger prevent_double_submit() as safety net, (8) Full backfill of all 611 lead_attribution records.
- **Next planned task:** (a) Phase 2 of Smart Automations — event-driven triggers. (b) Monitor first paid campaign data in Meta Events Manager. (c) Deploy popup v2 migrations 054-057.
- **Blocking issues:** None

## Recent Changes
| Date | What Changed | Files Affected |
|------|-------------|----------------|
| 2026-04-19 | Campaign data accuracy: dedup (Edge Function + DB trigger), phone validation, CAPI on all forms, ensureProfile() attribution, OAuth UTM preservation, unique people count in dashboard, UTM normalization, source dedup per person, theme-aware CSS, marketing-tools.js on sign-contract + nlp-game, consent-gate inline pixels, full lead_attribution backfill (611 records) | submit-lead/index.ts, supabase-client.js, marketing-tools.js, admin-traffic.js/css, patient-step4.js, therapist-step4.js, patient-flow.js, thank-you.html, questionnaire-form.html, sign-contract.html, nlp-game.html, registration.js, 8 new migrations |
| 2026-04-16 | Analytics accuracy overhaul: real hero stats (public_site_stats RPC), traffic tab wired, 4 demographic breakdowns (gender/age/purpose/city), error handling fixes, console error fixes. Commits 4e4024a, 81262d5. | index.html, admin.html, admin-segments.js, admin-analytics.js, admin-state.js, admin-settings.js, admin-traffic.js/css (wired), migrations 066+067+funnel fixes |
| 2026-04-14 | Segments: abandonment KPI + re-engage shortcut. Audit verdict = abandonment, not leak. Commit fef72b9. | migration 063 (new), js/admin/admin-segments.js, js/admin/admin-automations.css |
| 2026-04-14 | Segments: count from all 5 registration tables (fix "אתמול 0" bug — profiles-only query was missing anonymous form tables). Commit 3ddb4db. | migration 062 (new), js/admin/admin-segments.js |
| 2026-04-14 | Segments: flat theme-aware redesign for accessibility (var(--card)/var(--text) instead of hardcoded aqua tints). Commit a1254f8. | js/admin/admin-automations.css, js/admin/admin-segments.js |
| 2026-04-14 | Segments & Filters tab: KPI strip + 4 breakdown panels + custom filter builder backed by `admin_segments_overview()` RPC. Commit f958fea. | migration 061 (new), js/admin/admin-segments.js (new), js/admin/admin-automations.css, js/admin/admin-utils.js, pages/admin.html |
| 2026-04-14 | Smart Automations UX polish: live match count + card audience badges + brand palette sweep + clone/cron-validation/race-guard/dedup. Commit ba5e255. | js/admin/admin-automations.js, js/admin/admin-automations.css |
| 2026-04-13 | Smart Automations Engine: rule builder admin tab + crm-bot engine + 2 migrations. Commit a98e560. | migrations 058 + 059 (new), js/admin/admin-automations.{js,css} (new), pages/admin.html, js/admin/admin-utils.js, crm-bot/src/services/automation-engine.js (new, deployed to Fly), crm-bot/src/scheduler/cron.js, crm-bot/server.js |
| 2026-04-13 | Backup hardening: 35 tables, try/except, WhatsApp alerts, run log, watchdog, fixed Task Scheduler battery + Hebrew path issues | scripts/backup-supabase.py, scripts/check_backup_health.py (new), CLAUDE.md, Windows Task Scheduler (BeitVmetaplim-DailyBackup + BeitVmetaplim-BackupHealthCheck) |
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
