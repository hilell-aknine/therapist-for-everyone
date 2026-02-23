# Q1: Homepage Color Fork — ACCIDENTAL

## Verdict: Dead code, not rendering wrong colors

The homepage loads `theme.css` (line 19), then declares stale values (#0E5660, #D8AF47) in inline `<style>` (lines 22-36), but immediately overrides them with a "Theme Bridge" (lines 42-55) that maps to the correct `var(--t-*)` tokens from theme.css.

**CSS cascade means the bridge wins.** The stale hex values are dead code — they never render.

Same pattern exists in `free-portal.html` — both have the bridge, both render correct colors.

## Action: Delete stale hex values from both files (dead code cleanup)
