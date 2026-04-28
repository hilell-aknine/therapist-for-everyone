# Primer — Beit V'Metaplim
> Last updated: 2026-04-28 by Claude Code

## Current State
- **Status:** Active — Training program lead UX overhaul (dedicated tab + inline pipeline button + overview card).
- **Last task completed:** Training-leads UX organization (2026-04-28, follow-up to CRM fix):
  - **New sidebar nav-item "🎓 לידי הכשרה"** (`pages/admin.html`): routes to portal-q view with `request_type='training'` filter pre-applied + sort by date desc. Badge turns red with weekly-count when fresh leads waiting (gold + total otherwise).
  - **Inline Pipeline button per row** (`js/admin/admin-portal-questionnaires.js` renderPortalQuestionnaires): added 10th column "פעולות" with WhatsApp link + gold `fa-filter-circle-dollar` button → `movePortalQToPipeline()`. Hidden when status='client'. Colspans corrected from 11 → 10.
  - **Overview card on home** (`pages/admin.html`): new prominent gold-bordered "לידי הכשרה" card showing total/this-week/uncalled with "חדש" red badge when this-week > 0. Sits before "ניהול לידים" card.
  - **`enterTrainingLeadsView()` / `enterAllLeadsView()`** globals (admin-portal-questionnaires.js): orchestrate switchView('learning') + filter set + page-title swap + table-title swap. Wait-loop for lazy-load on first visit.
  - **`updatePqStats()`** extended: computes training totals/week/uncalled and writes badges (sidebar `#training-leads-badge`, overview `#ov-training-*`, `#ov-training-new-badge`).
  - **course-library.html in-portal training form** (line 8350): added mirror_table to sales_leads + UTM/landing_url capture (matches training.html pattern).
  - cache-buster bumped to `?v=6`.
- **Prior task — CRM training program lead visibility fix (2026-04-28):**
  - **Bug 1 — RPC `admin_get_all_leads()` v3** (`supabase/migrations/20260428100000_admin_get_all_leads_v3.sql`): contact_request data (`request_type`, `message`) now LEFT JOIN LATERAL'd onto profile rows, so registered users who later filled the training form get the "טופס הכשרה" badge. Source 2 dedup also matches by email (not just phone). Before: training leads from registered users were invisible — phone-dedup excluded their contact_request and source 1 hardcoded `request_type=NULL`.
  - **Bug 2 — `pages/training.html` mirror to sales_leads** (line 684): the training landing form now dual-writes via `submit-lead` Edge Function's `mirror_table` mechanism (contact_requests + sales_leads). Before: only contact_requests, so 0 of the 8 training leads in the backup reached Pipeline. Also captures UTM + landing_url.
  - **Bug 3 — request_type filter** (`pages/admin.html` + `js/admin/admin-portal-questionnaires.js`): new dropdown "סוג ליד" in ניהול לידים tab (training/patient/general/course-feedback/portal_questionnaire). cache-buster bumped to `?v=5`.
  - **Deploy:** code via `git push origin master` (Vercel auto-deploy), migration via `npx supabase db push --include-all`.
- **Prior task — Course-library proposed UX redesign (2026-04-26, single big PR):**
  - **Header:** New primary CTA "המשך בשיעור הבא" (deep-petrol gradient, gold play icon, shows next-uncompleted lesson title). Old gold "תוכנית הכשרה" CTA demoted to outline secondary. "חזרה לאתר" → icon-only with title tooltip.
  - **Sidebar progressive disclosure:** `renderSyllabus()` now opens only the module containing `currentModuleIndex` (or first module with unfinished lessons for new users). `selectLesson()` collapses all other modules. New "↓ קפיצה לשיעור הנוכחי" teal pill appears once a lesson is active; scrolls active lesson into view + 1s gold pulse animation.
  - **Continue Learning hero:** Replaces old `.wd-banner`. Deep-petrol gradient with subtle SVG grid pattern. 220px thumbnail (mqdefault.jpg from YouTube CDN) + content (label/title/meta/CTA/progress bar). Three states: first-start ("התחילו את המסע"), in-progress ("השיעור הבא שלך"), all-done ("כל הכבוד! סיימת את הקורס").
  - **Quick stats row:** 3 cards — 🔥 ימי רצף (`localStorage('study_streak')` with consecutive-day logic), ⏱️ זמן שנותר (sums `parseDuration(lesson.duration)` for uncompleted), 📚 מודול נוכחי (e.g. `3/8`).
  - **Compact dashboard cards:** Bulletin collapsed-by-default (60px tall, "ראה הכל" toggle expands). Intro video has "צפיתי ✓" button → `localStorage('intro_video_watched')` flips it to mini banner with "פתח שוב". New compact `wd-affiliate-compact` card linking to full ambassador dashboard. Leaderboard rebuilt as 3-column horizontal podium (medal/name/count) with "תודה על ההפצה" footer.
  - **Community empty state:** Replaced bare "אין פוסטים" with chips ("💡 שתפו תובנה" / "❓ שאלה" / "🎯 חוויה") + post button that focuses the composer.
  - **Notes split view:** New floating "📝 הצג הערות" toggle on lesson view (top-left of `.lesson-split-main`). Side panel `<aside id="lessonSplitNotes">` with second textarea `#notesSideTextarea` synced bidirectionally with the original `#notesTextarea`. State persists in `localStorage('notes_panel_open')`. CSS Grid: `.video-section.notes-open { grid-template-columns: 2fr minmax(320px,1fr) }`. Notes tab hidden on desktop ≥1281px (still visible on mobile).
  - **Lesson end panel:** "סמן כהושלם" toggle button below the nav bar — `toggleLessonComplete()` adds/removes from `completedLessons` array. Tip shows auto-mark behavior (45s).
  - **Focus mode:** New top-right toggle on `.lesson-split-main`. `body.focus-mode` hides header + sidebar + share-banner + feedback FAB; video fills the viewport. Esc exits.
  - **Keyboard shortcuts:** `setupKeyboardShortcuts()` wired on DOMContentLoaded. `←` next, `→` prev (RTL), `Space` play/pause via YT IFrame API, `F` focus mode, `N` notes panel, `Esc` exit focus/close notes, `Ctrl+S` insert `[mm:ss]` timestamp into notes from current video time.
  - **YouTube IFrame API:** Async-loaded in `<head>`. `playVideo()` adds `enablejsapi=1&origin=...` to embed URL. `tryAttachYtPlayer()` creates `window._ytPlayer = new YT.Player('videoPlayer', ...)` after iframe loads. Works for keyboard space + Ctrl+S timestamps.
  - **Floating buttons cleanup:** Feedback FAB compacted to 44px icon-only circle. Mobile sidebar toggle untouched (already desktop-hidden).
  - **No backend changes** — all UI. No migrations, no Edge Functions touched.
  - **Validation:** Tag balance OK (354 div, 75 button, 14 script, etc.). Inline JS parses cleanly via `new Function`. File grew 7,829 → 9,135 lines.
- **Multi-day overhaul (2026-04-16 → 2026-04-20, 30+ commits) — prior:**
  - **Dashboard consolidation:** 16 tabs → 9. Sidebar: ניהול לידים → Pipeline → לקוחות משלמים → מיזם → מקורות תנועה → כלים. Merged traffic sub-tabs (Attribution/GA4/IG/Campaigns).
  - **Unified leads:** New RPC `admin_get_all_leads()` shows ALL profiles + contact_requests in one table. Source column, inline status dropdown, advanced filters (gender/age/city/date/occupation).
  - **Data accuracy:** Replaced hardcoded hero stats with real Supabase RPC. Fixed Google leads logic. Badge defaults "…" instead of fake "0". Promise.allSettled for error resilience. GA4 cache invalidation.
  - **Social cause integration:** 3 legal docs (patient/therapist agreements + privacy policy) uploaded to Supabase Storage. PDFs embedded in patient-step4 + therapist-step4. `agreement_signed_at` tracking. registration.html redirects to patient-step1. Fixed missing patient columns (military_role, referral_source, session_style, photo_url, commitment_confirmed, truth_confirmed). WhatsApp number updated to 972512940781.
  - **Popup system fixes:** Cooldown minutes→ms conversion. Anon RLS for popup_configs. Scheduled status fix. auth_wall DB row added. Training CTA popup after 5 lessons.
  - **Performance:** Deferred 6 scripts. Lazy images. Community comments limit 500→100.
  - **Design system:** Glass button components (btn--gold/teal/clear/purple/dark/icon/pill) in components.css. LMS portal demo at /demo-portal/ with 3 variations.
  - **CRM bot:** Updated report templates (ניהול לידים/Pipeline/משלמים structure). Added diagnostic button (stethoscope) for automations.
  - **Admin fixes:** Modal overflow fix. Portal-q title→"ניהול לידים". Pipeline points to sales_leads (not funnel). Popups tab restored. Training CTA button in course header.
- **Next planned task:** (a) Implement LMS portal glass design (V1/V2/V3 — user reviewing demo). (b) Dark mode fixes for admin modals. (c) Deploy CRM bot updates to Fly.io. (d) Meta CAPI activation (needs access token).
- **Blocking issues:** Fly.io auth expired (need `fly auth login`). Meta CAPI token not yet created.

## Recent Changes
| Date | What Changed | Files Affected |
|------|-------------|----------------|
| 2026-04-28 | Training-leads UX overhaul: dedicated sidebar tab + overview card + inline pipeline button per row + fresh-week badge counter; course-library.html in-portal form also mirrors to sales_leads | pages/admin.html, pages/course-library.html, js/admin/admin-portal-questionnaires.js |
| 2026-04-28 | Training program lead visibility fix: RPC v3 surfaces contact_request data on profile rows, training.html mirrors to sales_leads (Pipeline), new request_type filter in admin | migration 20260428100000 (new), pages/training.html, pages/admin.html, js/admin/admin-portal-questionnaires.js |
| 2026-04-20 | Patient form fix: added missing columns (military_role, referral_source, session_style, photo_url, commitment_confirmed, truth_confirmed). Updated WhatsApp to 972512940781. Better submit-lead error messages. Modal overflow fix. LMS design demo deployed. | patient-step4.html, admin-styles.css, demo-portal/*, 2 migrations |
| 2026-04-19 | Dashboard consolidation (16→9 tabs), unified leads RPC, social cause legal docs, popup fixes (cooldown/RLS/scheduled/auth_wall), training CTA popup, performance (defer scripts), community audit, automation diagnostic button, CRM bot report templates updated | admin.html, admin-utils.js, admin-portal-questionnaires.js, admin-popups.js, popup-manager.js, course-library.html, components.css, crm-bot/analytics+reports, 10+ migrations |
| 2026-04-16 | Analytics accuracy overhaul: real hero stats, traffic tab wired, demographics, error handling, Google leads fix, badge defaults | index.html, admin.html, admin-segments.js, admin-analytics.js, admin-state.js, migrations |
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
