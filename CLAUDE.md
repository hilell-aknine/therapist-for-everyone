# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup Protocol (run BEFORE any work)
1. Read `primer.md` — current state, last task, next planned task
2. Read `hindsight.md` — known pitfalls to avoid
3. Run `git log --oneline -10` — recent commits
4. Run `git status --short` — uncommitted changes
5. Only then start the user's task

## Session Rules
- **After every successful task:** update `primer.md` (Last task, Next planned, Recent Changes)
- **After hitting an unexpected error or wasting >10 min:** add entry to `hindsight.md`
- **Never repeat a mistake** already documented in `hindsight.md`

## Quick Reference
```
Project: Therapists for Everyone (בית המטפלים — פורטל מטפלים לכולם)
Stack: Static HTML/JS + Supabase + Vercel
Live: https://www.therapist-home.com/
Repo: https://github.com/hilell-aknine/therapist-for-everyone
Deploy: git push origin master → Vercel auto-deploys
Supabase: https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc
```

## Commands
```bash
# Deploy (auto via Vercel on push to master)
git push origin master

# Supabase
npx supabase db push --include-all              # Apply migrations (--include-all for out-of-order)
npx supabase functions deploy <name> --no-verify-jwt  # Deploy Edge Function
npx supabase secrets set --env-file .env.local   # Set secrets (Windows-safe)

# Backup (manual — also runs daily at 07:00 via Windows Scheduled Task)
py scripts/backup-supabase.py                    # Full backup: DB + Storage + email report
```

## Architecture

**Static site** — no build step, no framework. HTML files served directly by Vercel. All JS is vanilla, loaded via `<script>` tags.

### Core JS Modules
- `js/supabase-client.js` — **Single source** for Supabase init, Auth helpers, CourseProgress, Referrals, UI utilities (toast, loading)
- `js/supabase-config.js` — Public config (URL, anon key, Turnstile site key, Sheets API)
- `js/auth-guard.js` — Role-based access control, legal consent checks, redirect logic
- `js/marketing-tools.js` — Cookie consent v2 (`cookie_consent_v2` localStorage key), GA4, Meta Pixel, UTM/ref capture
- `js/popup-manager.js` — Central popup orchestrator (priority queue, cooldown, daily limits, audience targeting)

### NLP Game (biggest subsystem)
```
pages/nlp-game.html            # Game page — loads everything below
js/nlp-game-knowledge.js       # Course knowledge base for AI mentor
js/nlp-game-data-m[1-7].js     # Per-module data (lessons, readings, exercises)
js/nlp-game-data.js             # Assembler — combines MODULE_1..7 into MODULES array
js/nlp-game.js                  # Game engine (~3200 lines) — StoryGame class
js/nlp-game-leaderboard.js      # Leaderboard module (IIFE → window.NLPLeaderboard)
css/nlp-game.css                # All game styles (~4700 lines)
assets/game/                    # AI-generated visuals (127 images + videos)
docs/transcripts/per-lesson/    # Source transcripts for reading sections
```

**Game engine** (`StoryGame` class): manages screens (home/module/reading/exercise/stats/profile), hearts/XP/streak, 8 exercise types, AI mentor chat, leaderboard sync.

**Bottom navigation**: 4 tabs (Home, Stats, Trophy, Profile). Hides during exercises via `body.game-fullscreen`.

**AI Mentor** (`GeminiMentor` class): calls `gemini-mentor` Edge Function. System prompt loaded from `nlp-game-knowledge.js`. Dual-provider: Gemini direct → OpenRouter fallback.

### Supabase Edge Functions
| Function | Purpose |
|----------|---------|
| `gemini-mentor` | AI chat — Gemini + OpenRouter dual-provider with retry |
| `ga4-analytics` | GA4 Data API proxy (admin-only, Israel timezone) |
| `submit-lead` | Turnstile-verified anonymous form submissions |
| `submit-contract` | Contract signing with Turnstile verification |
| `ai-chat` | Legacy AI chat endpoint |
| `get-lessons` | Course lesson data API |

### Key Supabase Tables
- `profiles` — user profiles (role CHECK: admin/therapist/patient/student_lead/student/sales_rep/paid_customer)
- `patients`, `therapists` — intake forms
- `portal_questionnaires` — learning portal registration
- `nlp_game_leaderboard` — game rankings (RLS: authenticated SELECT, own-row write)
- `nlp_game_players` — player save data
- `course_progress`, `ai_chat_usage`, `user_notes` — learning tracking
- `subscriptions`, `signed_contracts` — paid customer system
- `referrals`, `referral_leaderboard` (view) — ambassador/referral program
- `popup_configs`, `popup_events` — popup management system (admin CRUD + analytics)

## Core Policies

### Security
- **Anonymous form submissions** route through Edge Functions with Cloudflare Turnstile — never direct anon INSERT
- **Never add `WITH CHECK (true)` on anon INSERT policies**
- **`.vercelignore`** blocks: `supabase/`, `sql/`, `docs/specs/`, `CLAUDE.md`
- **Admin auth**: `profiles.role === 'admin'` check (not just session existence) — admin.html is deployed but auth-guarded
- **Secrets**: Supabase Secrets only — never hardcoded, no fallback tokens in source

### Lead Capture
- Onboarding forms do NOT require login — data saved as lead
- Legal gate required only for dashboard access, not form filling

### Content Language
- UI: Hebrew (RTL). Code: English.
- Public pages use warm language ("קהילה", "פרויקט") — formal "חברה" ONLY in legal docs
- NLP game content: everyday examples only — NO business language (לקוח, מכירה, עסק)

## Branding
```css
--deep-petrol: #003B46;
--muted-teal: #00606B;
--dusty-aqua: #2F8592;
--frost-white: #E8F1F2;
--gold: #D4AF37;
font-family: 'Heebo', sans-serif;  /* body */
font-family: 'Frank Ruhl Libre';   /* display/headlines */
```

## Lessons Learned
- **Supabase RLS**: Always add DELETE policies with CRUD. Silent denial on unauthorized ops.
- **Supabase REST API**: New tables need `Accept-Profile: public` / `Content-Profile: public` headers.
- **Edge Functions run in UTC**: Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })` for Israel dates.
- **GA4 `activeUsers`**: Never sum daily rows for totals — use aggregate query with no dimensions.
- **Vercel**: Never use `permanent` + `statusCode` together in `vercel.json`.
- **Supabase Storage**: Hebrew filenames are invalid keys — use English filenames only.
- **Cookie consent v2**: `cookie_consent_v2` localStorage key with values `all` or `essential`.
- **`db push` with out-of-order migrations**: Use `--include-all` flag.
- **NLP game data files**: Every property line MUST end with comma. Missing commas before `wrongExplanations` broke the entire game (57 instances fixed).
- **supabase-client.js must be loaded**: If a page uses `window.CourseProgress`, `window.Referrals`, or `window.Auth`, it needs `<script src="../js/supabase-client.js"></script>`. Missing this caused progress to never save to DB.
- **CORS in Edge Functions**: Never use `'*'` wildcard. Use explicit origin whitelist. Fallback to first allowed origin, not `*`.
- **RLS audit**: `WITH CHECK (true)` on any table = open door. Service role bypasses RLS anyway, so these policies are redundant AND dangerous.

## NLP Game Content Rules
- All reading/exercise content from `docs/transcripts/per-lesson/moduleX_lessonY.txt`
- NO invented NLP content — transcript-based only
- `wrongExplanations` must be ARRAY with `null` at correct answer index
- 8 exercise types: multiple-choice, fill-blank, match, compare, order, identify, improve, scenario
- Lesson titles MUST match `course-library.html`
- Instructor is רם (Ram), NOT Hillel

## Paid Customer / Master Course System

### Architecture
```
course-library.html  → masterView (hidden by default)
  ├── Sidebar: חלק א׳ ערכים (1-10) + חלק ב׳ היפנוזה וטראנס (11-20) + חוברות (6)
  ├── Welcome grid: video cards split by part + workbook cards
  ├── Video player: YouTube embed + prev/next + tabs section
  │   ├── הערות אישיות — per-lesson notes (Supabase user_notes, key: notes_master_{videoId})
  │   ├── העוזר האישי — AI chat with master lesson context → ai-chat Edge Function
  │   ├── חומרי עזר — links to workbooks, summaries-master/, master-practice.html
  │   └── משחק תרגול — CTA to nlp-game.html
  └── PDF viewer: signed URLs from Supabase Storage bucket "workbooks" (5-10min expiry)
```

### Gating
- `checkPaidRole()` queries `profiles.role` — shows master switcher only for `paid_customer` or `admin`
- `masterLessons` array: 20 YouTube videos (from playlist PLupBH8H284loAoWV2O98enTuCFG3fs01J)
- `masterWorkbooks` array: 6 PDFs in private Supabase Storage bucket

### Related Files
- `js/admin/admin-paid.js` — admin panel for managing subscriptions
- `pages/sign-contract.html` — digital signature + Turnstile → `submit-contract` Edge Function
- `pages/learning-master.html` — standalone paywall landing page (₪8,880)
- `pages/summaries-master/` — 7 lesson summary pages
- `pages/master-practice.html` — 49 practice clips in 15 categories

### Backup System
- `scripts/backup-supabase.py` — full DB + Storage backup to `backups/` (inside OneDrive)
- 35 tables backed up (auth.users + 34 public tables — full CRM, sales, popups, community, bot logs, ambassadors)
- Per-table try/except — one bad table never kills the whole run
- Top-level try/except + WhatsApp alert to 972549116092 (Green API crm-bot instance) on any failure or partial failure
- `backups/backup-runs.log` — append-only history (timestamp, status, details) — quick health check
- `scripts/check_backup_health.py` — independent watchdog, alerts WhatsApp if no fresh ZIP within 26h
- **Windows Scheduled Tasks (must use 8.3 short paths + full python.exe path — Hebrew paths break Task Scheduler arg parsing):**
  - `BeitVmetaplim-DailyBackup` — daily 07:00, runs `backup-supabase.py`
  - `BeitVmetaplim-BackupHealthCheck` — daily 09:00, runs `check_backup_health.py`
  - Both: `AllowStartIfOnBatteries=true` + `StartWhenAvailable=true` (battery=disallow caused 20-day silent failure 2026-03-24 → 2026-04-12)
- Sends email report to `htjewelry.a474@gmail.com` via Gmail Apps Script API on success
- Keeps last 30 backups, creates ZIP archive per run

## PopupManager System

Central orchestrator (`js/popup-manager.js`) manages all popups, modals, toasts, and banners.

**Key concepts:**
- **Priority queue**: 1=critical (auth, offline, cookie) → 5=low (toasts). Higher interrupts lower.
- **Categories**: `critical` bypasses all limits; `engagement` respects cooldown + daily cap (3/day); `info` lightweight
- **Audience targeting**: `all`, `authenticated`, `unauthenticated`, `free_user`, `paid_customer`, `admin`
- **User context**: Call `PopupManager.setUser({ isAuthenticated, role })` on auth state change
- **Memory**: `localStorage('popup_history')` tracks what was shown per day

**Adding a new popup:**
1. Register in `course-library.html` init block: `PopupManager.register('my_popup', { priority, category, targetAudience, show, hide })`
2. Add config row in `popup_configs` table (admin can also do this via dashboard)
3. Request display: `PopupManager.request('my_popup')` — manager handles queue/cooldown/audience

**Admin panel** (`js/admin/admin-popups.js`): CRUD for popup configs, toggle active/inactive, live preview mockup, per-popup stats (impressions, CTR, dismiss rate), scheduling with start/end dates.

## Referral / Ambassador Program

**Flow:** User shares `course-library.html?ref=UUID` → `marketing-tools.js` captures to `localStorage('referrer_data')` → on signup/login, `ensureProfile()` in `supabase-client.js` calls `saveReferral()` → INSERT to `referrals` table → leaderboard updates.

**Key files:**
- `js/marketing-tools.js` — captures `?ref=` param, exposes `window.getReferrerId()`
- `js/supabase-client.js` — `window.Referrals` module (getLink, getMyCount, getLeaderboard)
- `pages/course-library.html` — ambassador tab UI (sidebar item, link card, WhatsApp share, leaderboard)
- `js/admin/admin-referrals.js` — admin stats tab

**Important:** `pages/free-portal.html` has an inline `<head>` script that captures `?ref=` BEFORE the auth redirect. This was a critical bug fix — do not remove it.

## Admin Dashboard

**Architecture**: `pages/admin.html` + modular JS in `js/admin/`:
- `admin-utils.js` — view switching via `VIEW_GROUPS` object, shared helpers (date grouping, formatDate, escapeHtml)
- `admin-state.js` — loads all data in parallel via `Promise.all()`
- `admin-auth.js` — checks `profiles.role === 'admin'`

**Adding a new admin tab:**
1. Add nav-item in `admin.html` sidebar with `onclick="switchView('myview')"`
2. Add `<div id="myview-view" class="hidden">` container in admin.html
3. Register in `admin-utils.js` → `VIEW_GROUPS`: `'myview': { views: ['myview'], header: null, default: 'myview' }`
4. Add lazy-load hook in `switchView()`: `if (view === 'myview') loadMyView()`
5. Create `js/admin/admin-myview.js`, add `<script>` tag in admin.html

**Pattern**: All admin modules use 5-min cache (`cache + cacheTime + CACHE_TTL`), `db` global (Supabase client from admin-state.js), date grouping via `groupByDate()`.

## Course Progress Tracking

**Dual storage**: localStorage (offline-first) + Supabase `course_progress` table (persistent).

**Critical**: `js/supabase-client.js` MUST be loaded in `course-library.html` for progress to sync to Supabase. Without it, `window.CourseProgress` is undefined and `mergeProgress()` silently returns.

**Flow**: Video plays 45s → `markLessonCompleted()` → saves to localStorage + Supabase UPSERT. On login, `mergeProgress()` does bi-directional sync (union of localStorage + Supabase). Failed syncs go to `pendingSync` localStorage queue.

**Admin view**: `js/admin/admin-learners.js` shows per-user progress (completed lessons, watch time, last activity).

## User Roles
| Role | Access |
|------|--------|
| `admin` | Full access to all data and dashboard |
| `therapist` | Own profile + assigned patients |
| `patient` | Own profile + assigned therapist |
| `student_lead` | Learning portal (redirected to portal-questionnaire if not filled) |
| `paid_customer` | Master course (20 lessons) + workbooks + AI tutor + notes |
