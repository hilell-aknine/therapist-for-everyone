# Discovery: Responsive Design, Mobile UX, Performance & Accessibility

## CRITICAL FINDINGS

### Skip Link Missing on 7 of 8 Pages
- Only `index.html` has `<a class="skip-link">`
- about, training, project-lobby, landings, steps, portal — all missing

### Gold #D4AF37 on White/Cream Fails WCAG AA
- Contrast ratio: ~2.0:1 (needs 4.5:1 for body text)
- Affects: `.section-eyebrow`, `.pillar-number`, `.founder-role`, `.testimonial-name`, active nav links
- Pervasive across every page

## HIGH FINDINGS

### `<main>` Landmark Absent on Most Pages
- Only `free-portal.html` has `<main>` element
- Marketing pages go straight to `<section>` + `<footer>`

### `<nav>` Missing `aria-label` on Marketing Pages
- Cannot distinguish between nav and footer links for screen readers

### Mobile Menu Button Missing `aria-expanded`
- No `aria-expanded`, no `aria-controls`, no `aria-label`
- Portal sidebar toggle correctly has these — not replicated in main nav

### `input:focus outline: none` — Focus Indicator Removed
- patient-step1: replaces outline with barely-visible box-shadow (10% opacity)
- `accessibility.css` loaded but overridden by inline styles

### Font Awesome Render-Blocking on 6 Pages
- Only `free-portal.html` loads async with `media="print" onload`
- All others synchronous

### Inline CSS Volume: 800-2500+ Lines Per Page
- Navbar CSS copy-pasted across 6+ pages
- No shared external stylesheet for components

### Footer Touch Targets Too Small
- `padding: 0.35rem 0` = ~22px height (needs 44px)

### Form Labels Missing `for` Attribute
- All patient-step forms: `<label>` not associated with `<input>`
- Screen readers can't announce labels on focus

### Progress Stepper Not Semantic
- Uses `<div>` not `<ol>`, no `aria-current="step"`

### Gold on Muted-Teal Fails (~2.3:1)
- `.cta-box h2 span { color: var(--gold); }` on teal background

## MEDIUM FINDINGS

### Breakpoint Inconsistency
- Marketing pages: 768px + 480px
- Form pages: 600px only
- Portal: 1024px + 768px + 480px
- No tablet breakpoint (769-1023px) on most pages
- No 375px breakpoint for small phones

### `<div class="mobile-cta-group">` Inside `<ul>` Without `<li>`
- Violates HTML spec, breaks AT list parsing

### Hero Paragraphs `opacity: 0` Without JS Fallback
- about.html, training.html: `.hero p { opacity: 0; }` — invisible without JS

### Required Field Asterisk Has No Explanation
- No "* שדות חובה" note anywhere

### Scroll-to-Unlock Legal Text Not Keyboard Accessible
- No way to scroll `moral-box` div via keyboard
- Tab key skips past it

### `scroll-behavior: smooth` Without Motion Query Guard
- Not wrapped in `@media (prefers-reduced-motion: no-preference)`

### Popup Close Button 32x32px (Below 44px Minimum)

### Focus Trap May Include Hidden Elements
- Portal modal focus trap queries all buttons/inputs without filtering `display:none`

### FAQ Accordion Not Keyboard Accessible
- training.html: `<div>` with `cursor: pointer`, not `<button>`

### No `preconnect` to Cloudflare CDN (Font Awesome)

### No OG/Social Meta Tags on Any Page
- Affects WhatsApp/Facebook link previews

## LOW FINDINGS
- Logo `alt` text duplicates adjacent text (double reading)
- No `loading="lazy"` on images
- Physical margin/padding directions instead of logical properties
- `mobile-web-app-capable` meta tag inconsistency
- `backdrop-filter` no `@supports` fallback
- Continuous animations on mobile (but `prefers-reduced-motion` respected)

## QUESTIONS
1. Shared CSS architecture planned?
2. Gold contrast — accept tradeoff or fix?
3. Font Awesome async — why only on portal?
4. Skip links — intentionally omitted from inner pages?
5. Mobile nav aria-expanded — in scope?
6. Form labels `for` attribute — fix planned?
7. Scroll-to-unlock — alternative for keyboard users?
8. Tablet breakpoint (900px) needed?
9. Battery-saving animation pausing planned?
10. OG/social meta tags priority?
