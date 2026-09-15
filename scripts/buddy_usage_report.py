# -*- coding: utf-8 -*-
"""
דוח שימוש בחברותא — "האם מי שיש לו חיבור באמת משתמש בזה?"

מריצים:  py scripts/buddy_usage_report.py

הדוח נשען על buddy_event_log, שנוסף ב-20260915120000_buddy_event_log.sql.
המדד המכריע הוא connections_viewed: כל שורה כזאת היא אדם שפתח את המסך שבו
מופיע הטלפון של החברותא שלו. מספר הימים השונים לאדם = האם הוא חוזר לזה.

שימו לב: אין רישום לפני 15.09.2026. שאלות על התקופה שקדמה לכך אינן ניתנות
לשחזור, ולכן צריך לתת לזה שבועיים לפני שמסיקים מסקנה.
"""
import collections
import datetime
import io
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    env = {}
    with io.open(os.path.join(ROOT, ".env.local"), encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
URL = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY") or ENV["SUPABASE_SERVICE_KEY"]
# Accept-Profile חובה לטבלאות חדשות, אחרת PostgREST מחפש בסכימה הלא נכונה
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept-Profile": "public"}


def get(table, query=""):
    u = URL + "/rest/v1/" + table + ("?" + query if query else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print("  שגיאה מול %s: %s %s" % (table, e.code, e.read().decode("utf-8")[:200]))
        return []


def main():
    log = get("buddy_event_log",
              "select=user_id,event,day,hits,first_at,last_at,meta&order=day&limit=100000")
    if not log:
        print("אין עדיין שום רישום. הרישום הותקן ב-15.09.2026, תנו לזה שבועיים.")
        return

    days = sorted({r["day"] for r in log})
    print("=" * 74)
    print("דוח שימוש בחברותא")
    print("רישום פעיל מ-%s עד %s  (%d ימים עם פעילות)" % (days[0], days[-1], len(days)))
    print("=" * 74)

    # מי מחובר למי
    acc = get("study_buddy_requests",
              "select=requester_id,target_id,responded_at&status=eq.accepted")
    connected = {p for r in acc for p in (r["requester_id"], r["target_id"])}
    ids = connected | {r["user_id"] for r in log}
    names = {}
    if ids:
        pr = get("profiles", "select=id,full_name&id=in.(" + ",".join(ids) + ")")
        names = {p["id"]: (p.get("full_name") or "?") for p in pr}

    by_user = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in log:
        by_user[r["user_id"]][r["event"]].append(r)

    # ---- השאלה המרכזית ----
    print("\n[1] האם מי שיש לו חיבור חוזר להסתכל עליו")
    if not connected:
        print("    אין חיבורים פעילים.")
    for u in sorted(connected, key=lambda x: names.get(x, "")):
        views = [r for r in by_user[u].get("connections_viewed", [])
                 if (r["meta"] or {}).get("count", 0) > 0]
        opens = sum(r["hits"] for r in views)
        mark = "🟢" if len(views) >= 2 else ("🟡" if views else "🔴")
        print("    %s %-20s ימים שפתח: %-3d  פתיחות: %-3d  אחרון: %s" % (
            mark, names.get(u, u[:8])[:20], len(views), opens,
            max((r["last_at"][:10] for r in views), default="מעולם")))

    # ---- הדנומינטור שחסר עד עכשיו ----
    print("\n[2] כמה בכלל הגיעו למצב שאפשר לשאול אותם")
    status = [r for r in log if r["event"] == "status"]
    seen = {r["user_id"] for r in status}
    unasked = {r["user_id"] for r in status if (r["meta"] or {}).get("asked") is False}
    prefs = get("study_buddy_prefs", "select=user_id,opted_in")
    print("    לומדים כשירים שנכנסו לפורטל : %d" % len(seen))
    print("    מתוכם שעוד לא נשאלו          : %d" % len(unasked))
    print("    ענו על ההצעה (סה\"כ במערכת)   : %d" % len(prefs))
    print("    אמרו כן                      : %d" % sum(1 for p in prefs if p["opted_in"]))

    # ---- מסך ריק ----
    print("\n[3] מסך ההתאמות")
    mv = [r for r in log if r["event"] == "matches_viewed"]
    empty = [r for r in mv if (r["meta"] or {}).get("count", 0) == 0]
    print("    אנשים שפתחו את מסך ההתאמות   : %d" % len({r["user_id"] for r in mv}))
    print("    פעמים שהמסך היה ריק          : %d  <-- אם זה גבוה, הבריכה קטנה מדי"
          % sum(r["hits"] for r in empty))

    # ---- בקשות שנראו ולא נענו ----
    print("\n[4] בקשות ממתינות")
    iv = [r for r in log if r["event"] == "incoming_viewed"
          and (r["meta"] or {}).get("count", 0) > 0]
    print("    אנשים שראו בקשה שמחכה להם    : %d" % len({r["user_id"] for r in iv}))
    pend = get("study_buddy_requests",
               "select=target_id,created_at&status=eq.pending&order=created_at")
    today = datetime.date.today()
    for p in pend:
        age = (today - datetime.date(*map(int, p["created_at"][:10].split("-")))).days
        saw = "ראה ולא ענה" if p["target_id"] in {r["user_id"] for r in iv} else "לא נכנס בכלל"
        print("      %-20s ממתין %-3d יום   %s" % (
            names.get(p["target_id"], p["target_id"][:8])[:20], age, saw))


if __name__ == "__main__":
    main()
