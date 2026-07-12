# -*- coding: utf-8 -*-
"""
Who are the hottest learners, and what is stopping them from buying?

Scores every registered learner on what they actually DID (lessons finished, watch
time, game activity, questions to the AI mentor, notes taken, how recently), so the
Master pitch can be aimed at the people who already invested — instead of pushing
the same generic popup at all 589 of them.

Pulls Clarity alongside it (rage clicks, dead clicks, scroll depth) so the friction
they hit is in the same picture.

  py scripts/hot_learners.py
Writes: docs/hot-learners-<date>.md  (+ prints a WhatsApp-ready summary)
"""
import json
import re
import pathlib
import datetime
import collections
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
SECRETS = pathlib.Path(r"C:\Users\saraa\.secrets\onedrive\beit-vmetaplim_.env.local")
CLARITY_SECRETS = pathlib.Path(r"C:\Users\saraa\.secrets\beit-vmetaplim.env")
CLARITY_DIR = ROOT / "scripts" / "clarity-data"

TODAY = datetime.date.today()


def env(path):
    d = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$", line)
        if m:
            d[m.group(1)] = m.group(2).strip()
    return d


c = env(SECRETS)
BASE = c["SUPABASE_URL"].rstrip("/")
KEY = c["SUPABASE_SERVICE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "public"}


def fetch_all(table, select, extra=None):
    """Page through a table — several of these are bigger than the 1000-row default."""
    rows, offset = [], 0
    while True:
        params = {"select": select, "limit": "1000", "offset": str(offset)}
        if extra:
            params.update(extra)
        r = requests.get(f"{BASE}/rest/v1/{table}", params=params, headers=H, timeout=60)
        if r.status_code >= 400:
            print(f"  ! {table}: HTTP {r.status_code} {r.text[:90]}")
            return rows
        batch = r.json()
        rows += batch
        if len(batch) < 1000:
            return rows
        offset += 1000


print("pulling live data...")
# Column names verified against the live schema — do not guess them.
profiles = fetch_all("profiles", "id,full_name,email,phone,role,created_at")
progress = fetch_all("course_progress", "user_id,video_id,course_type,completed,watched_seconds,updated_at")
quest = fetch_all("portal_questionnaires", "user_id,why_nlp,main_challenge,how_found,study_time,occupation,created_at")
notes = fetch_all("user_notes", "user_id,updated_at")
game = fetch_all("nlp_game_players", "user_id,xp,streak,completed_lessons,updated_at")
chat = fetch_all("ai_chat_usage", "user_id,message_count,date")

print(f"  profiles={len(profiles)} progress={len(progress)} questionnaires={len(quest)} "
      f"notes={len(notes)} game={len(game)} chat={len(chat)}")

paid = {p["id"] for p in profiles if p.get("role") == "paid_customer"}
staff = {p["id"] for p in profiles if p.get("role") == "admin"}

# ---- build the score -------------------------------------------------------
lessons = collections.Counter()
watch = collections.Counter()
last_seen = {}
for r in progress:
    u = r.get("user_id")
    if not u:
        continue
    if r.get("completed"):
        lessons[u] += 1
    watch[u] += (r.get("watched_seconds") or 0)
    ts = r.get("updated_at")
    if ts and (u not in last_seen or ts > last_seen[u]):
        last_seen[u] = ts

notes_n = collections.Counter(r["user_id"] for r in notes if r.get("user_id"))
# ai_chat_usage is one row per user per day, with a message count on it.
chat_n = collections.Counter()
for r in chat:
    if r.get("user_id"):
        chat_n[r["user_id"]] += (r.get("message_count") or 0)
game_by = {r["user_id"]: r for r in game if r.get("user_id")}
quest_by = {r["user_id"]: r for r in quest if r.get("user_id")}


def days_since(ts):
    if not ts:
        return 999
    try:
        d = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00")).date()
        return (TODAY - d).days
    except Exception:
        return 999


# Merge duplicate accounts before scoring.
# 21 real people hold two accounts, almost always an email typo at signup
# (".con" for ".com", "walla.com.com"). Their progress is SPLIT across both, so
# scoring per-account understates exactly the people we care about most: one
# learner shows up twice with 44 and 28 lessons when he really has 72.
PLACEHOLDER_PHONE = "0500000000"


def person_key(p):
    ph = re.sub(r"\D", "", p.get("phone") or "")
    if ph and ph != PLACEHOLDER_PHONE:
        return "p:" + ph[-9:]
    return "id:" + p["id"]


people = collections.defaultdict(list)
for p in profiles:
    if p["id"] in paid or p["id"] in staff:
        continue
    people[person_key(p)].append(p)

merged_count = sum(1 for v in people.values() if len(v) > 1)

scored = []
for key, accounts in people.items():
    ids = [a["id"] for a in accounts]
    n_les = sum(lessons[i] for i in ids)
    n_chat = sum(chat_n[i] for i in ids)
    n_notes = sum(notes_n[i] for i in ids)
    games = [game_by[i] for i in ids if i in game_by]
    if n_les == 0 and not games and n_chat == 0:
        continue  # never engaged at all — do not inflate the list

    xp = max([g.get("xp") or 0 for g in games] or [0])
    streak = max([g.get("streak") or 0 for g in games] or [0])
    stamps = [last_seen.get(i) for i in ids if last_seen.get(i)] + \
             [g.get("updated_at") for g in games if g.get("updated_at")]
    recency = min([days_since(s) for s in stamps] or [999])

    # Watch time is deliberately NOT scored: only 110 of 2,396 progress rows carry
    # any watched_seconds at all and the maximum is 6 seconds, so the column is not
    # actually being written. Scoring it would just add noise.
    # Finishing lessons is the strongest signal of intent; mentor questions and notes
    # mean he is working rather than watching; recency decides if he is reachable now.
    score = (
        n_les * 6
        + n_chat * 4
        + n_notes * 5
        + min(xp / 100, 20)
        + streak * 2
        + (25 if recency <= 7 else 12 if recency <= 30 else 0)
    )
    best = max(accounts, key=lambda a: lessons[a["id"]])
    scored.append({
        "id": best["id"],
        "all_ids": ids,
        "accounts": len(ids),
        "name": best.get("full_name") or "—",
        "phone": best.get("phone") or "",
        "email": best.get("email") or "",
        "lessons": n_les,
        "chat": n_chat,
        "notes": n_notes,
        "xp": xp,
        "streak": streak,
        "days_ago": recency,
        "score": round(score, 1),
        "q": next((quest_by[i] for i in ids if i in quest_by), {}),
    })

scored.sort(key=lambda x: -x["score"])
print(f"  merged {merged_count} people who hold more than one account")

# ---- pick the threshold from the data, not from a guess --------------------
by_lessons = collections.Counter(s["lessons"] for s in scored)
active_30d = [s for s in scored if s["days_ago"] <= 30]
hot = [s for s in scored if s["lessons"] >= 5 and s["days_ago"] <= 45]
warm = [s for s in scored if 1 <= s["lessons"] < 5]

print(f"\nengaged at all: {len(scored)}  |  active last 30d: {len(active_30d)}")
print(f"HOT (>=5 lessons, seen in 45d): {len(hot)}")
print(f"warm (1-4 lessons): {len(warm)}")

# ---- Clarity ---------------------------------------------------------------
clarity_lines = []
snaps = sorted(CLARITY_DIR.glob("*.json")) if CLARITY_DIR.exists() else []
if snaps:
    latest = json.loads(snaps[-1].read_text(encoding="utf-8"))
    clarity_lines.append(f"מקור: {snaps[-1].name} (Clarity חושף רק 3 ימים אחורה)")
    for metric in (latest.get("overall") or []):
        if not isinstance(metric, dict):
            continue
        name = metric.get("metricName")
        info = (metric.get("information") or [{}])[0]
        if name in ("Traffic", "ScrollDepth", "EngagementTime"):
            clarity_lines.append(f"{name}: {json.dumps(info, ensure_ascii=False)}")
        if name in ("RageClickCount", "DeadClickCount", "ExcessiveScroll", "QuickbackClick"):
            clarity_lines.append(f"⚠️ {name}: {json.dumps(info, ensure_ascii=False)}")
else:
    clarity_lines.append("אין קבצי Clarity מקומיים — הרץ scripts/clarity_pull.py")

# ---- report ----------------------------------------------------------------
out = ROOT / "docs" / f"hot-learners-{TODAY}.md"
out.parent.mkdir(exist_ok=True)

L = []
L.append(f"# מי הלומדים החמים · {TODAY}\n")
L.append(f"נבדקו **{len(profiles)}** משתמשים. {len(paid)} כבר קנו. "
         f"**{len(scored)}** עשו משהו בפועל בקורס.\n")
L.append("## הקהל\n")
L.append(f"- 🔥 **חמים ({len(hot)})** — סיימו 5+ שיעורים ונראו ב-45 הימים האחרונים.")
L.append(f"- 🌡️ פושרים ({len(warm)}) — התחילו, 1-4 שיעורים.")
L.append(f"- 💤 שאר הנרשמים — נרשמו ולא נגעו בקורס.\n")

L.append("## 20 השמות החמים ביותר\n")
L.append("| # | שם | טלפון | שיעורים | שאלות למנטור | הערות | לפני (ימים) | חשבונות | ציון |")
L.append("|---|-----|-------|---------|--------------|-------|-------------|---------|------|")
for i, s in enumerate(hot[:20], 1):
    dup = "⚠️ 2" if s["accounts"] > 1 else "1"
    L.append(f"| {i} | {s['name']} | {s['phone']} | {s['lessons']} | "
             f"{s['chat']} | {s['notes']} | {s['days_ago']} | {dup} | {s['score']} |")

L.append("\n## ⚠️ שני באגים שהדוח חשף\n")
L.append("- **זמן צפייה לא נרשם.** מתוך 2,396 רשומות התקדמות, רק 110 עם זמן צפייה כלשהו, "
         "והמקסימום הוא 6 שניות. המערכת מסמנת \"הושלם\" אבל לא מודדת צפייה בפועל. "
         "לכן המדד הזה לא נכלל בניקוד — הוא חסר ערך.")
L.append(f"- **{merged_count} אנשים עם חשבון כפול.** בדרך כלל טעות הקלדה במייל בהרשמה "
         "(`.con` במקום `.com`). ההתקדמות מפוצלת בין החשבונות, ולכן הם נראו פחות חמים ממה שהם. "
         "הדוח הזה מאחד אותם לפי טלפון.")

L.append("\n## מה מאפיין אותם (מתוך השאלון שלהם)\n")
for field, title in (("why_nlp", "למה NLP"), ("main_challenge", "האתגר המרכזי"),
                     ("how_found", "מאיפה הגיעו"), ("occupation", "עיסוק")):
    vals = collections.Counter((s["q"].get(field) or "").strip() for s in hot if s["q"].get(field))
    if vals:
        top = " · ".join(f"{v} ({n})" for v, n in vals.most_common(4))
        L.append(f"- **{title}:** {top}")

L.append("\n## התפלגות: כמה שיעורים סיימו\n")
for n in sorted(by_lessons):
    if n == 0:
        continue
    L.append(f"- {n} שיעורים: {by_lessons[n]} אנשים")

L.append("\n## מה Clarity מראה\n")
for line in clarity_lines:
    L.append(f"- {line}")

out.write_text("\n".join(L), encoding="utf-8")
print(f"\nwrote {out}")

# ---- WhatsApp-ready summary ------------------------------------------------
print("\n" + "=" * 60)
print("WHATSAPP SUMMARY")
print("=" * 60)
top5 = hot[:5]
print(f"🔥 {len(hot)} לומדים חמים (5+ שיעורים, פעילים)")
print(f"🌡️ {len(warm)} פושרים (1-4 שיעורים)")
print(f"💤 {len(profiles) - len(scored) - len(paid)} נרשמו ולא פתחו את הקורס")
print("\nהחמישייה הפותחת:")
for s in top5:
    print(f"  {s['name']} — {s['lessons']} שיעורים, לפני {s['days_ago']} ימים")

json_out = ROOT / "docs" / f"hot-learners-{TODAY}.json"
json_out.write_text(json.dumps({"hot": hot, "warm_count": len(warm),
                                "engaged": len(scored), "total": len(profiles)},
                               ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nfull data: {json_out}")
