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
Project: בית המטפלים — פורטל מטפלים לכולם
English name: Therapist Home  (decided 2026-08-27 — the name on certificates, logo and all English-facing copy.
                               "Therapists for Everyone" is the old alias — do not use it in new work.)
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
  ├── Sidebar: dynamic module per master session (מפגש N — title) + חוברות (6)
  ├── Welcome grid: video cards grouped by module + workbook cards
  ├── Video player: YouTube embed + prev/next + tabs section
  │   ├── הערות אישיות — per-lesson notes (Supabase user_notes, key: notes_master_{videoId})
  │   ├── העוזר האישי — AI chat with master lesson context → ai-chat Edge Function
  │   ├── חומרי עזר — links to workbooks, summaries-master/, master-practice.html
  │   └── משחק תרגול — CTA to nlp-game.html
  └── PDF viewer: signed URLs from Supabase Storage bucket "workbooks" (5-10min expiry)
```

### Gating
- `checkPaidRole()` queries `profiles.role` — shows master switcher only for `paid_customer` or `admin`
- `masterModules` array: nested structure, one entry per master session (lessonNumber, lessonTitle, color, chapters[]). YouTube IDs from playlist PLupBH8H284loAoWV2O98enTuCFG3fs01J.
- `masterLessons` derived flat list (`masterModules.flatMap(m => m.chapters)`) preserves the legacy `masterLessons[i]` API used by navigation, notes, and AI chat code.
- `getMasterModuleInfo(flatIndex)` helper returns `{module, moduleIndex, chapterIndex, chapter}` — use whenever you need module context (label, notes metadata, exports).
- New session is added by appending an entry to `masterModules`. Module 1 (מפגש 1) is staged but not yet inserted — pending YouTube upload.
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

## Monthly Journey Email ("החודש שלך")

Spotify-Wrapped-style personal monthly summary emailed to every learner with >=1
completed lesson (340 as of 2026-07), with a UTM-tagged CTA back to the portal.

- **Script:** `scripts/monthly_journey_email.py` — reads `course_progress` (source of truth,
  distinct lessons) + `profiles` (name/email) + `nlp_game_players` (longest_streak).
  Two variants: active (celebrate month) / dormant (protect-your-investment). Modes:
  `--test` (2 🧪 samples to NOTIFY_EMAIL), `--dry-run`, `--force` (ignore day gate).
- **Delivery:** Gmail Apps Script GET (`action=send` + `html` param) — same contract as
  the `send-email` Edge Function fallback. Quota ~100/day shared with backup reports →
  85/run, 7s between sends. When Resend DNS is verified, switching = route through Resend.
- **Scheduling:** schtasks `BeitVmetaplim-MonthlyJourneyEmail` runs DAILY 09:30 (8.3 path),
  but the script acts only on days 1-6, draining ~85/day with a per-month state file
  (`scripts/journey_state/YYYY-MM.json`, gitignored — contains learner emails). Undrained
  by day 6 → WhatsApp alert. Failure → WhatsApp alert (Green API, same as backup).
- **Opt-out:** learner replies "הסר" → add their email to `scripts/journey_state/optout.json`.

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

## Micro-lesson feed — "בשתי דקות" (`#feed`)

A continuous feed of ≤2-minute clips cut from the FREE practitioner course, for learners
who will not start a 30-minute lesson. Public: `#feed` and `#feed/<topic>` are on the
`authGate()` guest pass alongside `#master-sales`.

**A clip is a time range, not a file.** `{ videoId, start, end }` points into a lesson
video already published on the channel — no re-cutting, no uploads. This is a direct
reaction to `pages/master-practice.html`, which shipped 49 freshly-uploaded clip ids of
which **44 played the wrong video** and was deleted 2026-07-19. A wrong boundary here is
a wrong number, fixable in one line.

- **Catalog:** `js/clips-catalog.js` — GENERATED by `scripts/clips/build_catalog.py`
  between the `CLIPS:BEGIN` / `CLIPS:END` markers. Exposes `window.ClipsCatalog`.
  Self-validates under `?dev=1`. Pipeline + its traps: `scripts/clips/README.md`.
- **Own player.** The feed builds its own `YT.Player` in `#feedMount` and never touches
  `_ytPlayer`. Sharing it would fire `markLessonCompleted()` for a 27-minute lesson every
  time a 90-second clip ended (`_ytInit`'s ENDED handler), and `clearVideoState()` blanks
  `#plIframe` on every view switch.
- **One instance, reused.** Unmuted autoplay needs a gesture; `#feedUnlock` is that
  gesture and every later clip arrives via `loadVideoById` on the SAME instance. Rebuilding
  the iframe per clip is blocked from clip 2 onward on iOS.
- **The end is polled, not trusted.** YouTube's `&end=` is unreliable → 250 ms poll,
  stop at `end - 0.15`, plus a wall-clock backstop for the documented PWA/in-app-webview
  case where the IFrame API never answers. Measured overshoot on localhost: 0.00-0.03 s.
- **Progress:** `course_type = 'nlp-clips'`, `video_id = clip:<ytid>:<start>` (synthetic —
  `course_progress` is `UNIQUE(user_id, video_id)` and the bare id belongs to the lesson).
  Completion needs the guard to fire AND ≥70% real playback; pressing "הבא" credits nothing.
  `getStudyStreak()` does not filter `course_type`, so **a clip feeds the flame** — that is
  the point. `getWeeklyStats()` explicitly excludes `'nlp-clips'` so "שיעורים השבוע" keeps
  meaning lessons. Buddy matching filters `'nlp-practitioner'` and is unaffected.
- **`markClipCompleted()`, never `markLessonCompleted()`** — the latter fires
  `PopupManager.notifyLessonComplete()`, i.e. the master upsell, which at one clip per two
  minutes is a popup storm.
- **Leaving the feed** is caught by a MutationObserver on `body.class`, not by a
  `stopFeed()` call at each of the eight view-switch sites.
- **`window._feedDebug`** (localhost + `?dev=1` only): `stops()` returns the overshoot
  ledger, `state()` the live player state, `seek()` drives it. Use it to measure the end
  guard rather than assume it.
- ⚠️ **Rebuilding the catalog requires a `CACHE_NAME` bump in `sw.js`** — a stale cached
  catalog renders "עוד אין כאן קטעים" with no error at all.

## Study Buddy ("ללמוד עם חבר")

Connects learners who are at roughly the same point in the practitioner course.
Migration: `20260802120000_study_buddy_matching.sql` (+ consent popup row in `...121000`).

**Privacy model — do not weaken any of these three:**
1. **Double opt-in.** A phone number is only ever returned by `buddy_connections()`, which
   requires an `accepted` row, which only the TARGET can create. Asking alone gets nothing.
2. **First name only** before a match. `buddy_matches()` / `buddy_incoming()` return no
   user_id, phone, email or surname — matches carry an opaque `buddy_pair_token(me, them)`.
3. **Consent required to appear at all**, asked only at 3+ completed lessons.

**Access pattern:** `study_buddy_prefs` and `study_buddy_requests` have RLS enabled with
**no policy for `authenticated`** (admin SELECT only). There is deliberately no `.from()`
path from the browser — everything goes through 8 SECURITY DEFINER RPCs:
`buddy_status`, `buddy_set_opt_in`, `buddy_matches`, `buddy_request`, `buddy_incoming`,
`buddy_respond`, `buddy_cancel`, `buddy_connections`. The helpers
(`buddy_lessons_done`, `buddy_last_active`, `buddy_pair_token`) are revoked from
`authenticated` — never grant them.

**Matching rule (v2, `20260915140000_buddy_matching_v2.sql`):** position = DISTINCT
completed `course_progress` rows for `course_type='nlp-practitioner'`, excluding
`last_watched%` bookkeeping rows. `lesson_number` is per-module and is NOT a global
position — do not use it. Candidates must be **active within 30 days** (down from 90) and
are ranked by a **penalty score first, lesson gap second**: has-ever-answered-a-request,
holds-no-unanswered-request, and active-within-14-days each score a point.

⚠️ **Do not widen the 30-day window back out "so the screen isn't empty".** That was v1's
reasoning and it was wrong. Pairing a learner with a low-perseverance peer makes them stop
studying *earlier* and perform *worse* than studying alone
([Negative Peer Effects in Online Learning](https://ideas.repec.org/p/dpr/wpaper/1242r.html)),
so a dormant candidate is harmful, not merely weak. An empty screen is the correct output;
`reason: 'no_active_candidates'` + `buddy_event_log` make it visible. v1's premise ("the
pool is ~98 people") was also just false — the opted-in pool is 9.

Reciprocity matters because both sides must agree: accounting for the target's likelihood
of accepting roughly doubled success in comparable two-sided systems, and popular targets
congest the market. Hence `inbox_pending < 2` excludes anyone sitting on 2+ unanswered
requests.

**`buddy_last_active()` deliberately spans every `course_type`**, which now includes the
`nlp-clips` micro-lesson feed. A learner working through 2-minute clips is showing up, and
that is what perseverance means here. (Position still counts practitioner lessons only.)

**Guardrails:** 3 requests/day per user; one row per ordered pair, so a **declined** request
blocks re-asking forever (anti-harassment, not a bug); opting out cancels pending requests
in both directions but keeps already-accepted connections.

**Pending requests expire after 14 days** — `buddy_expire_stale()`, pg_cron `buddy_expire_stale`
daily 03:30. It ARCHIVES to `buddy_request_archive` then DELETEs, and the delete is the
point: the unique pair index means an unanswered request freezes that pair forever, and in
a 9-person pool three stuck requests froze a third of the market. **Silence is not a "no"**
— only never-answered rows expire; a decline is an answer and still blocks permanently.

**Before inviting anyone, call `buddy_pool_health()`** (admin). `matchable_now` is the only
number that matters; `verdict: 'too_thin_to_invite'` fires under 4. Inviting learners into a
pool with no active candidates spends the one chance you get and lands them on an empty screen.

### Usage logging (`buddy_event_log`, 2026-09-15)

`buddy_status` / `buddy_matches` / `buddy_incoming` / `buddy_connections` are **VOLATILE**
(they were STABLE) so they can write one row per (user, event, Israel-local day) with a hit
counter. Safe because the browser reaches them via `supabaseClient.rpc()` = POST;
PostgREST only demands STABLE/IMMUTABLE for GET — **never add `{ get: true }` to those calls.**
`buddy_log()` swallows every exception: telemetry must not be able to break the feature.

`connections_viewed` is THE metric — `buddy_connections()` is the only place a phone number
is returned, so a hit means someone opened the screen holding their buddy's number, and
distinct days per user answers "do they come back". Admin readout: `buddy_usage_report()`,
or `scripts/buddy_usage_report.py`. Table is admin-SELECT only, contains no contact details.

Why it exists: client-side impressions were not being recorded (`popup_events` holds **3**
rows for `study_buddy_consent` against 12 people who actually answered), so "how many of
the eligible were ever asked" was unrecoverable. Nothing before 2026-09-15 can be answered.

**Live baseline 2026-09-15** (verified, not estimated): 318 learners with ≥1 lesson · 161
eligible (3+) · 23 active within 21 days · 12 answered the consent question · 9 opted in ·
4 accepted connections between 5 people. Of those 5, **1 kept learning**; 3 of 4 pairs had a
side that completed nothing afterwards and 2 accepted while already dormant. Co-study check
across all pairs: 0 shared lessons, 0 completions within 6h. ⚠️ `course_progress` is far
over 1000 rows — **paginate**, or every aggregate silently comes from a 1000-row sample
(this produced a wrong "75 eligible" before it was caught).

**UI:** `#buddy` view in `course-library-v2.html` (`body.view-buddy`), sidebar item
`sbBuddyItem` with a pending-request badge. Note the `.lms-buddy [hidden]{display:none
!important}` rule — without it the section classes out-rank the UA `[hidden]` rule and
"hidden" sections render anyway.

### Study-buddy notifications (built 2026-08-02) — EMAIL

Exactly two messages exist: `request` (someone asked to study with you) and `accepted`
(they said yes — sent to both sides). No digests, no re-engagement nudges.
Migration `20260802130000_study_buddy_notifications.sql` + Edge Function `buddy-notify`
+ cron `20260802140000_study_buddy_notify_cron.sql`.

**Channel is EMAIL, not WhatsApp — both Green API lines are unusable for learners:**
- portal instance `7103515939` — **expired** (known parked state).
- crm-bot instance `7103533485` — **free tariff, 3 correspondents only**. It can message
  Hillel and two other numbers; every learner fails with 466. A test send to Hillel
  succeeds and proves nothing. Verified 2026-08-02 by a canary run that failed on its
  first learner.
All 98 matchable learners have an email on file. Delivery reuses the `send-email`
provider chain (Resend → Gmail Apps Script) inline; it does not call `send-email`, which
is admin-JWT gated by design.

**⚠️ Apps Script mailer has a hard payload limit.** The whole message goes as a GET query
string and Hebrew costs ~6 URL-encoded chars per letter. Measured live 2026-08-02:
**5,667-char URL → 200, 7,467-char URL → 400.** Keep any Apps Script mail body small
(`MAX_URL_CHARS = 5000` in the seed script). It also enforces a **per-minute** rate limit
— "Rate limit exceeded" is transient, NOT the daily cap; pause and retry rather than
aborting the run.

**🔴 Consequence found while building this:** `scripts/monthly_journey_email.py` builds a
~52,000-character URL and has therefore been failing with HTTP 400 for **every** learner
(see `scripts/journey_state/log.txt`, failing at least 2026-08-01 and 2026-08-02). The
monthly "החודש שלך" email to 340 learners is not going out. Fix = shrink the HTML or
switch that script to Resend.

- Queue `study_buddy_notifications`, filled by triggers on `study_buddy_requests`, so any
  path that creates a request notifies. Unique on `(request_id, user_id, kind)` — a retry
  can never double-send. Answering before the ping goes out marks it
  `skipped/answered_before_send`.
- Guards in `buddy-notify`: service_role token only (checks the JWT **role claim**, not a
  string compare against `SUPABASE_SERVICE_ROLE_KEY` — those legitimately differ),
  `study_buddy_settings.notifications_enabled` kill switch, 09:00–20:00 Asia/Jerusalem,
  1 message per recipient per 24h, `profiles.whatsapp_opt_out` (reused as the single
  "leave me alone" flag), 8 per run at 6.5s spacing.
- **Messages never carry contact details** — both templates link into the portal, so a
  forwarded email cannot leak a phone number.
- **This repo is public**: the cron migration reads the service key from Supabase Vault
  (`buddy_notify_service_key`). Never inline a service key in `supabase/migrations/`.

**Seeding:** `scripts/study_buddy_seed_invite.py` — the one-time email that opens the
pool. Dry run by default; `--send` required, refuses outside 09:00–20:00, records every
send in `scripts/journey_state/buddy_seed_sent.json` so a re-run cannot mail anyone twice,
and stops on the daily quota. Sent 2026-08-02.

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

## Practice-Game Data in Admin

**Tab**: "משחק תרגול" — a sub-tab in the Learning group (`js/admin/admin-game.js`). Shows per-player NLP-game data in plain Hebrew: level, XP, day-streak, lessons finished, correct/wrong + accuracy %, course, and relative "last played". Summary cards + CSV export.

**Source**: reads `nlp_game_players` (full save-state, keyed on `user_id`+`course_id`) joined to `profiles` (name/phone/email). The `admin_full_player` RLS policy lets the admin client read all rows. `nlp_game_leaderboard` holds the summary/ranking (only `total_xp` from it was surfaced before this tab, via `admin-portal-questionnaires.js`). Both tables key `user_id` = `profiles.id`.

## User Roles
| Role | Access |
|------|--------|
| `admin` | Full access to all data and dashboard |
| `therapist` | Own profile + assigned patients |
| `patient` | Own profile + assigned therapist |
| `student_lead` | Learning portal (redirected to portal-questionnaire if not filled) |
| `paid_customer` | Master course (20 lessons) + workbooks + AI tutor + notes |
