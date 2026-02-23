# UX Audit Report — בית המטפלים (Beit V'Metaplim)
### Date: 2026-02-19 | Methodology: Multi-Agent Deep Analysis

---

## Executive Summary

דוח זה מציג ביקורת UX מקיפה של אתר "בית המטפלים" — פורטל קהילתי לחיבור מטופלים עם מטפלים. הביקורת בוצעה באמצעות 4 סוכני Discovery מקבילים ו-7 סוכני Investigation ממוקדים, שסרקו 57 קבצי HTML, 2 קבצי CSS ו-6 קבצי JavaScript.

**מספרים מרכזיים:**
- **7 ממצאים קריטיים** (דורשים טיפול מיידי)
- **18 ממצאים בדחיפות גבוהה**
- **22 ממצאים בדחיפות בינונית**
- **12 ממצאים בדחיפות נמוכה**
- **~57 דפי HTML** נסרקו
- **~20 דפים** עם בעיות ניגודיות צבע (WCAG AA)
- **~4,400 שורות CSS** כפולות שניתן לחסוך

---

## Table of Contents

1. [Security & Data Integrity](#1-security--data-integrity)
2. [Visual Consistency & Brand](#2-visual-consistency--brand)
3. [Color Contrast & Accessibility](#3-color-contrast--accessibility)
4. [Navigation & Information Architecture](#4-navigation--information-architecture)
5. [Forms & Interactions](#5-forms--interactions)
6. [Responsive & Mobile UX](#6-responsive--mobile-ux)
7. [Performance & Architecture](#7-performance--architecture)
8. [Prioritized Action Plan](#8-prioritized-action-plan)

---

## 1. Security & Data Integrity

### CRITICAL: Debug Mode Active in Production
**Files:** `patient-step2.html`, `patient-step3.html`, `patient-step4.html`

Step-guard validation commented out with `// DEBUG MODE - disabled validation`. A user can navigate directly to `patient-step4.html` and submit a completely empty record to the `patients` table in Supabase.

**Attack path:** Open step4 → check 2 checkboxes → draw scribble → submit → empty patient record created.

**Fix:** Uncomment the step guards in all 3 files.

### CRITICAL: Old Forms Create Duplicate Records
**Files:** `patient-onboarding.html`, `therapist-onboarding.html` (root level)

Two older onboarding forms exist alongside the new step-based flows. Both write to the same Supabase tables (`patients`, `therapists`) with no duplicate protection. No unique constraint exists on `phone` or `full_name`.

**Risk:** Same person fills old form + new form = 2 database rows, no link between them.

**Fix:** Redirect old forms to new flows, add unique constraint on `phone` column.

### HIGH: Therapist WhatsApp Placeholder Number
**File:** `therapist-step4.html` line 579

Success screen links to `+972501234567` — a non-existent placeholder number. Patient flow correctly uses `972549116092`.

**Impact:** Every completing therapist who clicks WhatsApp reaches nobody.

---

## 2. Visual Consistency & Brand

### Color System Status: Functional Despite Stale Code

**Good news:** Both `index.html` and `free-portal.html` have a "Theme Bridge" that overrides their stale inline hex values with correct `var(--t-*)` tokens from `theme.css`. The wrong colors (e.g., `#0E5660`) are dead code and don't render.

**Action needed:** Clean up dead hex values in both files for maintainability.

### Button Shape Inconsistency
| Pages | `border-radius` | Visual |
|-------|-----------------|--------|
| Main pages (index, about, training, etc.) | `10px` | Rounded rectangle |
| Landing pages (patient, therapist) | `50px` | Full pill shape |

**Fix:** Standardize to one value via `--btn-radius` token in `theme.css`.

### Secondary Button Naming Conflict
- `index.html`: `.btn-ghost` (border 1.5px, opacity 0.25)
- `about.html`: `.btn-outline` (border 2px, opacity 0.4)

Same concept, different names and values. Should be unified into a single `.btn-outline` in shared CSS.

### Font Loading Gap on Landing Pages
Landing pages only load Heebo, not Frank Ruhl Libre (display font). Any `var(--font-display)` reference falls back to browser serif.

### Typography Scale: No Shared System
| Element | Homepage | Training | About | Portal |
|---------|----------|----------|-------|--------|
| H1 max | 5.5rem | 2.8rem | 3.5rem | 2.8rem (fixed) |
| H2 max | 2.8rem | 2.5rem | 2.5rem | — |

Homepage H1 is nearly **double** the training page H1. No documented type scale exists.

### Footer Branding Mismatch
| Pages | Copyright | Brand Name |
|-------|-----------|------------|
| index.html, free-portal.html | © 2026 | בית המטפלים |
| about.html, training.html, project-lobby.html | © 2024 | מטפל לכל אחד |

---

## 3. Color Contrast & Accessibility

### CRITICAL: Gold #D4AF37 Fails WCAG AA on Light Backgrounds

| Background | Contrast Ratio | Result |
|-----------|---------------|--------|
| White (#FFF) | **2.0:1** | FAIL (needs 4.5:1) |
| Cream (#FAF8F4) | **2.1:1** | FAIL |
| Muted-teal (#00606B) | **2.3:1** | FAIL (normal text) |
| Deep-petrol (#003B46) | **5.8:1** | PASS |

**Affected elements (~40+ across 20 files):**
- `.section-eyebrow` — every marketing page
- `.logo-text span` — every page with navbar
- `.nav-links a.active` — every page
- Step progress labels (`.step.active`) — all registration steps
- `.testimonial-name` — training.html
- `.highlight-box .box-title` — all 15 summary pages
- `.role-badge` — profile.html

**Recommended fix:** Add `--t-gold-text: #8B6914` (~4.6:1 on white) for text-on-light contexts. Keep `--t-gold` for backgrounds, borders, and text-on-dark.

### HIGH: Focus Indicators Removed on Form Inputs
`patient-step1.html` sets `outline: none` on all inputs, replacing it with a `box-shadow` at 10% opacity — nearly invisible. `accessibility.css` is loaded but its styles are overridden by the inline `<style>` block.

### HIGH: Form Labels Not Associated with Inputs
All patient/therapist step forms use `<label>` without `for` attribute. Screen readers cannot announce labels when inputs are focused.

### Missing ARIA Attributes
| Element | Issue | Pages Affected |
|---------|-------|----------------|
| Skip link | Missing on 7/8 pages | All except index.html |
| `<main>` landmark | Missing | All marketing pages |
| `<nav aria-label>` | Missing | All marketing pages |
| Mobile menu `aria-expanded` | Missing | All marketing pages |
| Toast `role="alert"` | Missing | All form pages |
| Progress stepper `aria-current` | Missing | All registration steps |

---

## 4. Navigation & Information Architecture

### Dual Registration Systems
```
ACTIVE (linked from nav):
  landing-patient → join-patient → patient-intro → step1 → step2 → step3 → step4

GHOST (no nav links, still functional):
  patient-onboarding.html (root) — submits to same table
  therapist-onboarding.html (root) — submits to same table
```

### Learning Portal: Fragmented Entry Points
```
index.html nav "קורסים בחינם" → learning-portal.html (marketing page)
                                    ↓ CTA click
                                 free-portal.html (actual course player)

about.html link → free-portal.html (skips marketing page)
```

Four learning sub-pages exist with no unified navigation between them:
- `free-portal.html` (course player)
- `learning-portal.html` (marketing landing)
- `learning-booklets.html` (orphaned — only reachable from homepage footer)
- `learning-summaries.html` (orphaned — same)

### Portal is a Walled Garden
`free-portal.html` has no standard navbar. Users inside the course player cannot navigate to Training, About, or other sections without going back to the homepage first.

### Login Page Hidden
`pages/login.html` is not linked from any main navbar. Only accessible from the portal profile dropdown or direct URL.

### Navbar Label Inconsistency
- Homepage: "קורסים בחינם"
- Inner pages: "קורסים מקצועים בחינם" (also typo: "מקצועים" should be "מקצועיים")

### Unused Pages
- `thank-you.html` — no flow redirects to it (step4 pages show inline success)
- `pages/courses.html` — in footers but not nav, overlaps with learning-portal

### Eligibility Criteria Contradiction
- `project-lobby.html`: "ללוחמים, נפגעי נובה ומי שנחשף לאירועי ה-7 באוקטובר"
- `patient-intro.html`: "אנשים שחווים קושי ואתגרים כלכליים"

---

## 5. Forms & Interactions

### Validation Gaps

| Issue | Severity | Files |
|-------|----------|-------|
| Step guards disabled (debug mode) | CRITICAL | patient-step2/3/4 |
| Email validation accepts `test@invalid` | CRITICAL | patient-step1 |
| Phone regex allows commas (`[2-4,8-9]`) | MEDIUM | patient-step1 |
| No age validation on birth_date (18+ required) | MEDIUM | patient-step1, therapist-step1 |
| Therapist checkboxes not validated | HIGH | therapist-step1 |
| Therapy type no validation | HIGH | patient-step3 |
| `practice_start_year` max hardcoded to 2026 | LOW | therapist-step1 |

### Error Handling
- **Toast-only feedback** — no inline field errors on submit. Mobile users must scroll up to find the problem field.
- **Generic network error** — "שגיאה בשליחת הטופס. נסה שוב." — no detail about what failed or if data was partially saved.
- **No autocomplete attributes** on any input across all forms.

### Signature Canvas Issues
- Canvas clears on mobile rotation (resizeCanvas resets width → clears content) but `hasSignature` stays true → blank image submitted
- No alternative for motor-disabled users (WCAG 2.5.1 requires alternatives for path-based gestures)

### Scroll-to-Unlock Legal Text
The legal text box in step4 requires scrolling to bottom to unlock checkboxes. **Not keyboard-accessible** — Tab key skips past the scrollable div.

---

## 6. Responsive & Mobile UX

### Breakpoint Fragmentation
| Page Type | Breakpoints | Gap |
|-----------|-------------|-----|
| Marketing (index, about, training) | 768px, 480px | No tablet (769-1023px) |
| Forms (patient steps) | 600px only | No 480px, no tablet |
| Landing pages | 600px only | No 480px, no tablet |
| Portal (free-portal) | 1024px, 768px, 480px | Complete |
| All pages | — | No 375px (iPhone SE) |

### Touch Targets Below 44px Minimum
- Footer links: `padding: 0.35rem 0` → ~22px height
- Popup close button: 32x32px
- Nav links mobile: ~40px height (borderline)

### RTL Issues
- Mixed physical/logical CSS properties (some use `right:`, some use `inset-inline-end:`)
- `.scroll-hint` centering uses `left: 50%` (physical) — incorrect in RTL

---

## 7. Performance & Architecture

### CSS Duplication: ~4,400 Lines
- Only 2 shared CSS files exist: `theme.css` (215 lines) + `accessibility.css` (135 lines)
- **~80 lines duplicated per page** (`:root` tokens, navbar, grain overlay, reveal animations)
- **55 pages x 80 lines = ~4,400 lines** of pure copy-paste
- No `components.css`, no `navbar.css`, no `layout.css`

### Render-Blocking Resources
- Font Awesome loaded synchronously on 6/8 main pages (only `free-portal.html` loads async)
- Supabase SDK loaded synchronously without `preload` hint
- No `preconnect` to Cloudflare CDN (Font Awesome)

### Missing Performance Optimizations
- No `loading="lazy"` on images
- No `preload` for critical fonts (woff2)
- No OG/social meta tags (affects WhatsApp link previews)
- SVG grain overlay with `feTurbulence` filter GPU-intensive on low-end mobile
- `scroll-behavior: smooth` not guarded by `prefers-reduced-motion`

---

## 8. Prioritized Action Plan

### P0 — Security Fixes (Do Immediately)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 1 | **Re-enable step guards** — uncomment debug mode blocks | patient-step2/3/4.html | 5 min |
| 2 | **Fix therapist WhatsApp** — replace placeholder `972501234567` | therapist-step4.html | 1 min |
| 3 | **Redirect old forms** — `patient-onboarding.html` → `pages/patient-intro.html`, `therapist-onboarding.html` → `pages/therapist-step1.html` | 2 root files | 10 min |

### P1 — Accessibility Critical (Next Sprint)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 4 | **Add `--t-gold-text: #8B6914`** dark gold token for text-on-light | css/theme.css + update all `color: var(--gold)` on light backgrounds | 2 hours |
| 5 | **Add `for` attributes** on all form labels | patient-step1-4, therapist-step1-4 | 1 hour |
| 6 | **Add skip links + `<main>`** to all marketing pages | ~8 pages | 30 min |
| 7 | **Add `aria-expanded` + `aria-label`** to mobile menu button | ~8 pages | 20 min |
| 8 | **Add `role="alert"` + `aria-live="polite"`** to all toast elements | ~12 pages | 20 min |
| 9 | **Fix focus indicators** — remove `outline: none` override on form inputs | patient-step1-4 | 15 min |

### P2 — UX Polish (This Month)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 10 | **Standardize button radius** — `--btn-radius: 10px` in theme.css | theme.css + landing pages | 30 min |
| 11 | **Fix footer branding** — update to "© 2026 בית המטפלים" everywhere | about, training, project-lobby | 10 min |
| 12 | **Fix navbar label** — "קורסים מקצועיים בחינם" (typo fix) or simplify | ~6 pages | 10 min |
| 13 | **Fix email validation** — proper regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | patient-step1, therapist-step1 | 15 min |
| 14 | **Fix phone regex** — `[2-489]` not `[2-4,8-9]` | patient-step1 | 5 min |
| 15 | **Add `autocomplete` attributes** to form inputs | all step pages | 30 min |
| 16 | **Standardize nav link to portal** — decide: `learning-portal.html` or `free-portal.html` | ~8 pages | 20 min |
| 17 | **Add inline field errors** on submit (not just toast) | patient-step1-4 | 1 hour |
| 18 | **Add age validation** — block under-18 on birth_date | patient-step1, therapist-step1 | 20 min |

### P3 — Architecture (This Quarter)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 19 | **Create `css/components.css`** — extract navbar, grain, reveal, body reset | New file + update ~30 pages | 4 hours |
| 20 | **Move `:root` aliases into theme.css** — eliminate inline token duplication | theme.css + ~55 pages | 3 hours |
| 21 | **Async Font Awesome** everywhere — copy portal pattern | ~6 pages | 30 min |
| 22 | **Add `preconnect` hints** for Cloudflare, Supabase CDN | ~8 pages | 15 min |
| 23 | **Add OG meta tags** for WhatsApp/social sharing | main pages | 1 hour |
| 24 | **Standardize breakpoints** — unified 1024/768/480/375 | ~30 pages | 4 hours |
| 25 | **Signature canvas fallback** — typed-name alternative for motor disabilities | patient-step4, therapist-step4 | 2 hours |
| 26 | **Keyboard-accessible legal scroll** — `tabindex="0"` on moral-box | patient-step4, therapist-step4 | 15 min |

---

## Appendix: Files Analyzed

### Discovery Agents (4)
1. Visual Consistency & Colors — 8 core HTML files
2. Navigation & User Flows — 15 HTML files
3. Forms & Interactions — 8 form pages + portal
4. Responsive & Accessibility — 8 pages + CSS/JS files

### Investigation Agents (7)
1. Homepage color fork → ACCIDENTAL (dead code)
2. Portal color fork → CORRECT (theme bridge active)
3. Debug mode → CONFIRMED vulnerability
4. Dead links → join-patient/therapist exist as redirects
5. Gold contrast → 20+ files, 40+ elements fail WCAG AA
6. Old forms risk → DUPLICATE data confirmed
7. CSS duplication → ~4,400 lines duplicated

### Total scope: ~57 HTML files, 2 CSS files, 6 JS files

---

*Generated by multi-agent UX audit pipeline on 2026-02-19*
*Methodology adapted from Night-Research Pyramid Swarm strategy*
