# Discovery: Visual Consistency, Colors & Typography

## CRITICAL FINDINGS

### C-01: Brand Color Value Drift — Homepage
- `index.html` defines `--deep-petrol: #0E5660` (should be `#003B46`)
- All other pages use the correct `#003B46`
- Homepage hero, footer, navbar rendered in wrong shade

### C-02: Multiple Color Forks — Homepage
- `--dusty-aqua`: `#2A727C` (homepage) vs `#2F8592` (everywhere else)
- `--muted-teal`: `#005C66` (homepage) vs `#00606B` (everywhere else)
- `--gold`: `#D8AF47` (homepage) vs `#D4AF37` (everywhere else)
- `--gold-light`: `#E1B13F` (homepage) vs `#E6C65A` (everywhere else)

### C-03: Free Portal Has Own Color Fork
- `free-portal.html` also uses `--deep-petrol: #0E5660` (not canonical)
- Adds unique non-brand tokens: `--sidebar-dark: #0a3a42`, `--success: #00b894`, `--light-gray: #f8f9fa`

## HIGH FINDINGS

### H-01: Button Border-Radius Inconsistency
- Main pages: `border-radius: 10px`
- Landing pages: `border-radius: 50px` (pill shape)

### H-02: `.btn-ghost` vs `.btn-outline` — Same Concept, Different Names
- `index.html`: `.btn-ghost` (border 1.5px, opacity 0.25)
- `about.html`: `.btn-outline` (border 2px, opacity 0.4)

### H-04: Font Family Not Loaded on Landings
- Landing pages only load Heebo, not Frank Ruhl Libre (display font)

### H-05: Hero H1 Font Size Divergence
- Homepage: `clamp(3.2rem, 7vw, 5.5rem)` — very large
- Training: `clamp(2rem, 4.5vw, 2.8rem)` — nearly half
- No documented type scale

### H-06: Section Title (H2) Inconsistency
- 4 different max values across pages: 2.8rem, 2.5rem, 2.3rem, 2rem

## MEDIUM FINDINGS

### M-01: Background Page Color Inconsistency
- Homepage/about/training: `var(--cream)` (#FAF8F4)
- Courses: `var(--deep-petrol)` (dark)
- Landings: radial gradient
- Portal: `#f8f9fa` (light gray)

### M-02: Non-Brand Colors
- `--coral: #FF6F61` on landing pages
- `#81C784` (Material Design green) in courses.html

### M-04: Shadow Value Inconsistency
- Homepage: 60px blur, 0.12 opacity (dramatic)
- Sub-pages: 40px blur, 0.08 opacity (restrained)
- Portal: tokenized `--shadow-sm/md/lg`

### M-05: Navbar backdrop-filter Inconsistency
- Homepage: no blur initially, only on scroll
- Inner pages: blur from start

### M-07: Footer Copyright/Brand Name Error
- `about.html`: "© 2024 מטפל לכל אחד" (wrong year + old brand name)
- `index.html`: "© 2026 בית המטפלים" (correct)

## LOW FINDINGS
- L-01: `--purple-soft: #9B72CF` only on homepage (social pillar)
- L-02: Hardcoded `#7B5EA7` for social hover
- L-03: `--sidebar-dark: #0a3a42` orphaned token in portal
- L-04: Raw rgba colors instead of CSS variable tokens for borders
- L-05: Inline styles on landing CTA buttons

## QUESTIONS
1. Homepage color fork — intentional or accident?
2. Portal color fork — legacy from different design era?
3. Landing pages — intentionally different visual language?
4. courses.html dark body background — intentional?
5. `.btn-ghost` vs `.btn-outline` — merge them?
6. Frank Ruhl Libre not loaded on landings — display-font elements used?
7. `#81C784` green — need a semantic `--status-success` token?
8. `--purple-soft` — promote to brand token?
9. Three shadow systems — which is the target standard?
10. Footer brand name — which is current?
