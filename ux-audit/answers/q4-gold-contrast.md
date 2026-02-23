# Q4: Gold #D4AF37 Contrast Audit — PERVASIVE FAILURE

## Verdict: ~20 HTML files affected, ~40+ elements fail WCAG AA

### Contrast ratios:
- Gold on white (#FFF): **2.0:1** — FAIL (needs 4.5:1)
- Gold on cream (#FAF8F4): **2.1:1** — FAIL
- Gold on deep-petrol (#003B46): **5.8:1** — PASS
- Gold on muted-teal (#00606B): **2.3:1** — FAIL for normal text

### Top priority failures (readable text on light backgrounds):
- `.section-eyebrow` on cream — every marketing page
- `.logo-text span` on white nav — every page
- `.nav-links a.active` on white nav — every page
- Step labels (.step.active) on white — all patient/therapist steps
- `.testimonial-name` on white cards — training.html
- `.highlight-box .box-title` on white — all 15 summary pages
- `.role-badge.patient` on cream cards — profile.html
- Various gold inline text in about.html, courses.html

### PASS (no action needed):
- All landing pages (dark gradient backgrounds)
- All dashboard pages (dark theme)
- Admin panel (dark sidebar)
- Hero sections with dark backgrounds

## Recommended fix:
Add `--t-gold-text: #8B6914` (darker gold, ~4.6:1 on white) for text-on-light contexts.
Keep `--t-gold` for backgrounds, borders, and text-on-dark.
