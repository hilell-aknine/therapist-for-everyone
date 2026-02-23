# Q6: CSS Architecture — SEVERE DUPLICATION

## Current state:
- `/css/` has only 2 files: `theme.css` (215 lines) + `accessibility.css` (135 lines)
- **~4,400 lines** of pure copy-paste across ~55 HTML files
- Each page duplicates: `:root` tokens (~30 lines), navbar (~26 lines), grain overlay, reveal animations, body reset

## Duplication breakdown:
- ~80 lines duplicated per marketing page x ~55 pages = ~4,400 lines
- Missing files: `components.css` (navbar, footer, grain), `layout.css` (hero, sections)
- `accessibility.css` missing from ~15 pages

## High-value extractions:
1. Move `:root` alias variables into `theme.css` (saves 30 lines x 55 pages)
2. Create `css/components.css` with navbar, grain, reveal, body reset (saves 50 lines x 30 pages)
3. Create `css/navbar.css` for the shared navigation component
