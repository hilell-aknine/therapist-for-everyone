# Popup Insights Playbook — for Claude Code

> **Purpose:** This is the playbook Claude Code follows when analyzing popup performance. The admin clicks "ייצא לקלוד" in the popup dashboard, downloads `popup-insights-YYYY-MM-DD.json`, and hands both files to Claude Code with a prompt like:
>
> > "קלוד, תבדוק את הפופאפים לפי הפליבוק ותן לי המלצות"
>
> Claude reads this file to know **how** to analyze, reads the JSON to know **what** the data says, and writes findings back to the `popup_insights_log` table.

---

## Your job in one sentence

Turn raw popup metrics into **specific, actionable recommendations** the admin can act on within 10 minutes — and write them to `popup_insights_log` so they show up in the admin dashboard timeline.

You are not writing a research paper. You are a data-driven product consultant answering: *"What should I change on my site tomorrow morning?"*

---

## Input you receive

1. **`popup-insights-YYYY-MM-DD.json`** — exported from admin dashboard, contains:
   - `totals` — site-wide 30-day impressions/clicks/dismissals
   - `popups[]` — one entry per popup with full config + metrics (`ctr_pct`, `dismiss_rate_pct`, `median_time_to_click_s`, `trend_7d`, `ctr_delta_wow_pct`, `unique_users`, `unique_sessions`, `fatigue_flag`)
   - `popups[].admin_notes` — **read this first for each popup**. Contains admin's hypothesis, goals, and what they want you to watch.
   - `recent_insights[]` — prior observations/recommendations so you don't repeat yourself

2. **Supabase access** — for deeper queries, you can run:
   ```sql
   -- Examples:
   SELECT popup_id, variant, event_type, COUNT(*) FROM popup_events WHERE created_at > now()-interval '14 days' GROUP BY 1,2,3;
   SELECT popup_id, date_trunc('day', created_at) AS day, COUNT(*) FROM popup_events WHERE event_type='shown' GROUP BY 1,2 ORDER BY 2;
   SELECT * FROM popup_configs WHERE status='live' AND variant_group IS NOT NULL;
   ```

---

## Step-by-step analysis method

### 1. Read admin_notes for each popup
This tells you **what the admin was trying to achieve**. Without this, you might call a popup "underperforming" when the admin deliberately built it for a small audience. Examples:
- *"מטרה: CTR > 8%. אם < 5% אחרי שבוע — להחליף קופי"* → clear success threshold
- *"בודקים אם כפתור זהב ממיר יותר מתכלת"* → it's an A/B test, compare variants not absolute CTR

Always quote the relevant admin_note in your insight so the admin knows you read it.

### 2. Segment popups into 4 buckets

| Bucket | Criteria | What to do |
|--------|----------|------------|
| **Winners** | `shown >= 50` AND `ctr_pct >= 8` AND `dismiss_rate_pct <= 40` | Recommend scaling: higher max_per_day, broader audience, or clone copy to similar popups |
| **Underperformers** | `shown >= 50` AND `ctr_pct < 3` | Recommend specific copy changes, audience narrowing, or pausing |
| **Fatigued** | `fatigue_flag = true` OR `dismiss_rate_pct > 60` OR `ctr_delta_wow_pct < -30` | Recommend pausing OR launching a variant test with fresh copy |
| **Silent** | `shown < 10` but status = 'live' for 7+ days | Investigate: broken targeting, wrong trigger_event, or audience too narrow |

Anything with `shown < 50` has no statistical meaning — say so explicitly, don't guess.

### 3. Interpret time-to-click (`median_time_to_click_s`)
- **< 3s:** impulse click — good for toasts, suspicious for engagement popups (maybe users think it's an ad they're closing)
- **3-15s:** deliberate read + click — ideal for engagement
- **> 30s:** popup stayed open (user tabbed away?) — unreliable signal, ignore
- **null (no clicks):** either zero engagement OR no cta_text configured

### 4. Compare variants (A/B groups)
For every `variant_group` in the data:
- List variants side-by-side with `shown`, `ctr_pct`, `dismiss_rate_pct`
- Apply the 95% confidence rule of thumb: **need at least 100 shown per variant** and **CTR difference > 2 percentage points** to call a winner
- If no winner yet: recommend running longer OR widening the audience
- If clear winner: recommend archiving the loser and scaling the winner

### 5. Look for systemic patterns
Across all popups:
- Is the **unauthenticated funnel** (auth_modal → signup) dropping off? (compare shown vs clicked for each step)
- Do **engagement popups** perform worse than **info popups**? (are users numb to modals?)
- Are popups with `trigger_event = page_load` getting worse CTR than `lesson_complete`? (context matters)
- Is there a day-of-week or time-of-day pattern in `trend_7d`?

### 6. Check for anti-patterns
Flag any of these as **warnings**, not recommendations:
- Multiple `critical` popups targeting the same audience — they interrupt each other
- `trigger_min_lessons = 0` with audience `authenticated` — fires on first-ever visit, may annoy
- `cooldown_minutes = 0` on `engagement` category — can spam
- `max_per_day > 3` — almost certainly fatigue territory
- `paused` popup with lots of `admin_notes` but no recent insights — knowledge rotting

---

## Writing insights back to `popup_insights_log`

For each finding, insert a row via Supabase:

```sql
INSERT INTO popup_insights_log (popup_id, kind, title, body, metrics_snapshot, author)
VALUES (
    'auth_modal',                              -- or NULL for cross-popup insight
    'recommendation',                          -- observation | hypothesis | recommendation | experiment_result | note
    'CTR של auth_modal נמוך ב-40% משבוע שעבר',
    $$מה ראיתי: CTR ירד מ-12.3% ל-7.4% בשבוע האחרון, בעוד חשיפות גדלו ב-18%.
    
    השערה: הקהל החדש (כנראה מקמפיין הפייסבוק) פחות מתחבר לקופי "קבלו גישה מלאה בחינם".
    
    מה להמליץ:
    1. לבדוק בפייסבוק Ads איזה קהל התווסף בשבוע האחרון
    2. ליצור וריאנט B עם קופי שמדבר ישר לקהל החדש (למשל "מתאים למי שרוצה ללמוד NLP מהיסוד")
    3. להגדיר variant_group = 'auth_modal_fb_test' על שניהם
    4. אחרי 500 חשיפות לכל וריאנט — לבדוק איזה מוביל$$,
    '{"shown": 3421, "ctr": 7.4, "dismiss_rate": 38.2, "ctr_delta_wow": -40, "period_days": 7}'::jsonb,
    'claude_code'
);
```

### Insight `kind` — which to use?

- **`observation`** — something you noticed in the data, without conclusion yet. "CTR dropped 40% this week."
- **`hypothesis`** — explanation for an observation, not yet tested. "The drop is because of the new FB campaign audience."
- **`recommendation`** — specific action to take. "Create variant B with different copy."
- **`experiment_result`** — outcome after the admin ran something you recommended. "Variant B won by 23% CTR."
- **`note`** — context that doesn't fit the above. "Admin said they pause everything on Fridays."

Always pair `observation` → `hypothesis` → `recommendation` in that order. Each as a separate row.

### Writing style for `body`

- **Hebrew, short sentences.** The admin reads this fast on mobile.
- **Numbers, not adjectives.** "CTR ירד ב-40%" not "CTR ירד הרבה".
- **Name the popup by title**, not popup_id.
- **One recommendation per insight.** Don't stuff 5 ideas into one row — each gets its own insight with its own priority.
- **Cite admin_notes** when relevant: "האדמין ציין שהמטרה CTR > 8%. אנחנו על 7.4%, כמעט שם — שווה לנסות וריאנט לפני פסילה."

### Always include `metrics_snapshot`

This is the proof. The admin can look at an old insight months from now and see exactly what the state was when you wrote it. Minimum fields:
```json
{"shown": N, "ctr": N, "dismiss_rate": N, "period_days": 30}
```
Add variant breakdown if relevant:
```json
{"variant_A": {"shown": 420, "ctr": 6.2}, "variant_B": {"shown": 398, "ctr": 9.1}}
```

---

## What NOT to do

- **Don't recommend changes you can't back with numbers.** If `shown < 50`, the only valid recommendation is "wait for more data" or "check why it's silent".
- **Don't suggest new popups unless there's a clear gap.** The admin has 6-10 popups already. Adding more = fatigue.
- **Don't rewrite copy without keeping the admin's original as variant A.** Preserve what works, test alongside.
- **Don't flag "low CTR" without checking the benchmark.** A `critical` popup (auth wall) naturally has low CTR because dismissal is the user's primary option. A `paid_customer` upsell with 2% CTR is actually great.
- **Don't ignore the admin_notes field.** If admin wrote "המטרה: להפחית bounce rate, לא CTR" — then your insight should measure bounce, not CTR.
- **Don't write more than 5 new insights per analysis run.** Pick the highest-leverage ones. Quality > quantity.

---

## Output format back to the user

After inserting insights, reply to the user in Hebrew with:

1. **תקציר (3-5 bullets):** the top findings, with numbers
2. **מה הוספתי ליומן:** list the insights you wrote, linked by popup title
3. **פעולות מיידיות (אם יש):** things the admin should do *today*, not after more testing

Example:
```
תקציר:
• auth_modal: CTR ירד מ-12% ל-7.4% בשבוע — כנראה בגלל הקהל החדש מפייסבוק
• share_prompt: מוביל CTR 14.2% אחרי 3 שיעורים — עובד מצוין, אפשר להרחיב
• ai_questionnaire: 68% סגירה — עייפות ברורה, להחליף קופי או להשהות
• video_toast: 0 חשיפות ב-30 יום — יש בעיה בטריגר, לבדוק

הוספתי ליומן 4 תובנות:
1. [המלצה] auth_modal — ליצור וריאנט B עם קופי לקהל פייסבוק
2. [המלצה] share_prompt — להרחיב audience ל-authenticated (גם משלמים)
3. [המלצה] ai_questionnaire — להשהות ולנסח מחדש
4. [תצפית] video_toast — טריגר לא יורה, צריך לבדוק קוד

פעולות מיידיות (היום):
- להשהות את ai_questionnaire (סגירה 68%)
- לפתוח דשבורד פייסבוק לבדוק איזה קהל נוסף השבוע
```

---

## How the admin triggers this

The admin will say something like:
- "קלוד, תבדוק את הפופאפים"
- "תן לי המלצות לאופטימיזציה"
- "איך הפופאפים מתפקדים?"
- "תנתח את הנתונים של הפופאפים"

Your response: read the latest `popup-insights-*.json` the admin provides, follow this playbook, insert findings, and respond in Hebrew.

If the admin hasn't given you a JSON, ask them to click "ייצא לקלוד" in `admin.html → פופאפים`.

---

## Database schema reference

```sql
-- popup_configs: the popup definitions
popup_id TEXT UNIQUE
title, message, cta_text, cta_link TEXT
category TEXT                    -- critical | engagement | info
priority INTEGER                  -- 1 (highest) to 5
target_audience TEXT              -- all | authenticated | unauthenticated | free_user | paid_customer | admin
trigger_event TEXT                -- manual | page_load | lesson_complete | login | signup
trigger_min_lessons INTEGER
max_per_day INTEGER
cooldown_minutes INTEGER
variant_group TEXT                -- groups popups for A/B testing
variant_label TEXT                -- 'A', 'B', 'control', etc.
admin_notes TEXT                  -- READ THIS — admin's hypothesis and goals
status TEXT                       -- draft | scheduled | live | paused | archived
start_date, end_date TIMESTAMPTZ

-- popup_events: one row per interaction (authenticated + anonymous)
popup_id TEXT
user_id UUID                      -- NULL for anonymous
session_id TEXT                   -- NOT NULL for anonymous (created 2026-04)
event_type TEXT                   -- shown | clicked | dismissed | timeout
variant TEXT
created_at TIMESTAMPTZ

-- popup_dismissals: cross-device dismissal state
user_id UUID, popup_id TEXT, dismissed_at, dismissal_date

-- popup_insights_log: where YOU write findings
popup_id TEXT NULL                -- NULL = cross-popup
kind TEXT                         -- observation | hypothesis | recommendation | experiment_result | note
title, body TEXT
metrics_snapshot JSONB
author TEXT                       -- set to 'claude_code' when you write
created_at TIMESTAMPTZ
```

---

## Quick-start query library

Copy-paste these when the JSON export isn't enough:

```sql
-- Per-day CTR for a specific popup
SELECT date_trunc('day', created_at) AS day,
       COUNT(*) FILTER (WHERE event_type='shown') AS shown,
       COUNT(*) FILTER (WHERE event_type='clicked') AS clicked,
       ROUND(100.0 * COUNT(*) FILTER (WHERE event_type='clicked') / NULLIF(COUNT(*) FILTER (WHERE event_type='shown'), 0), 1) AS ctr_pct
FROM popup_events
WHERE popup_id = 'auth_modal' AND created_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1;

-- A/B variant comparison
SELECT variant,
       COUNT(*) FILTER (WHERE event_type='shown') AS shown,
       COUNT(*) FILTER (WHERE event_type='clicked') AS clicked,
       ROUND(100.0 * COUNT(*) FILTER (WHERE event_type='clicked') / NULLIF(COUNT(*) FILTER (WHERE event_type='shown'), 0), 2) AS ctr_pct
FROM popup_events
WHERE created_at > now() - interval '14 days' AND variant IS NOT NULL
GROUP BY variant ORDER BY ctr_pct DESC;

-- Silent popups (active but no events)
SELECT c.popup_id, c.title, c.target_audience, c.trigger_event
FROM popup_configs c
LEFT JOIN popup_events e ON e.popup_id = c.popup_id AND e.created_at > now() - interval '7 days'
WHERE c.is_active = true AND c.status = 'live' AND e.id IS NULL;

-- Anonymous vs authenticated click-through
SELECT
    CASE WHEN user_id IS NULL THEN 'anonymous' ELSE 'authenticated' END AS cohort,
    popup_id,
    COUNT(*) FILTER (WHERE event_type='shown') AS shown,
    COUNT(*) FILTER (WHERE event_type='clicked') AS clicked,
    ROUND(100.0 * COUNT(*) FILTER (WHERE event_type='clicked') / NULLIF(COUNT(*) FILTER (WHERE event_type='shown'), 0), 1) AS ctr_pct
FROM popup_events
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2 ORDER BY popup_id, cohort;
```
