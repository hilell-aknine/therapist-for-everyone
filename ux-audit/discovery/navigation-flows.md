# Discovery: Navigation, Information Architecture & User Flows

## CRITICAL FINDINGS

### C1: Dual Parallel Patient Entry Flows
- `landing-patient.html` → `pages/join-patient.html` → `pages/patient-intro.html` (canonical)
- `patient-onboarding.html` (root) — older, completely separate form, still functional
- Ghost form submits data to Supabase, unreachable from nav

### C2: `therapist-onboarding.html` is Dead-End Orphan
- No navigation link points to it
- Contains working form that submits to Supabase
- `landing-therapist.html` CTA goes directly to `pages/therapist-step1.html`

### C3: Two Separate Learning Portal Pages
- `index.html` nav → `pages/learning-portal.html` (marketing page)
- `about.html` links → `pages/free-portal.html` (actual course player)
- Inconsistent entry points

### C4: Login Page Not Linked from Main Navbar
- `pages/login.html` unreachable from any main navbar
- Only accessible from portal profile dropdown or direct URL

## HIGH FINDINGS

### H1: `thank-you.html` Unused
- No active flow redirects to it
- Both step4 pages show inline success views instead

### H2: `pages/courses.html` in Footer but Not Navbar
- Appears in multiple footers
- Never in main nav (nav has "קורסים בחינם" → learning-portal.html instead)
- Redundant with learning-portal.html

### H3: Learning Sub-Pages Orphaned
- `pages/learning-booklets.html` and `pages/learning-summaries.html`
- Only reachable from homepage footer
- No path from learning portal or course player

### H4: Portal Has No Standard Navbar — Users Trapped
- Custom course-player header with only: logo → home, back to site
- Cannot navigate to Training, About, etc. from inside portal

### H5: Therapist WhatsApp Placeholder Number
- `therapist-step4.html`: `972501234567` (fake)
- `patient-step4.html`: `972549116092` (correct)

### H6: `patient-intro.html` Has No Standard Navbar
- Custom header, no logo link, no breadcrumb
- Doesn't indicate it's step 0 of 4

### H7: Legal Gate Has No Back Button or Context
- Only navigation: logo → homepage
- No explanation of what user is signing

## MEDIUM FINDINGS

### M1: Navbar Label Inconsistency
- Homepage: "קורסים בחינם"
- Inner pages: "קורסים מקצועים בחינם" (also typo: "מקצועים" → "מקצועיים")

### M2: Footer Copyright/Brand Mismatch
- about/training/project-lobby: "© 2024 מטפל לכל אחד"
- index/portal: "© 2026 בית המטפלים"

### M3: Step1 Back Button Skips Intro
- `patient-step1.html` back → `landing-patient.html` (skips `patient-intro.html`)

### M4: No Visible Forward Navigation in Steps 2-4
- Progression is JS-only, no visible `<a>` links
- If JS fails, no way forward

### M5: Anon Key Hardcoded in step4 Files
- Inconsistent with rest of site using `supabase-client.js`

### M6: Eligibility Criteria Contradictory
- `project-lobby.html`: war veterans, Oct 7 victims
- `patient-intro.html`: financial hardship

### M7: `join-therapist.html` Redundant Redirect
- Just redirects to `therapist-step1.html`
- Landing already links directly

## LOW FINDINGS
- L1: `learning-portal.html` is extra unnecessary click
- L2: Step3 has two competing back behaviors
- L3: Portal "back to portal" reloads same page
- L4: `thank-you.html` has no suggested next steps
- L5: `about.html` title uses old brand name

## QUESTIONS
1. Is `patient-onboarding.html` still in use or should be removed?
2. Is `therapist-onboarding.html` still in use?
3. What's the canonical patient entry point?
4. Should nav link go directly to `free-portal.html`?
5. Login page — intentionally hidden from main nav?
6. Purpose of `thank-you.html`?
7. Which eligibility criteria is correct?
8. Was `courses.html` removed from navbar intentionally?
9. Are booklets/summaries part of learning experience?
10. Therapist WhatsApp placeholder — known bug?
