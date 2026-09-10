#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מיפוי התקדמות של לומדי המאסטר אחרי חיתוך מחדש של מפגש.

הרקע
-----
מפגשים 1-4 נחתכו מחדש ב-09.2026. החיתוך החדש מייצר מזהי YouTube חדשים,
ולכן שורות ההתקדמות הקיימות ב-course_progress (שמפתחן הוא video_id) מצביעות
על פרקים שכבר לא מוצגים בפורטל. התוצאה: לומד שסיים מפגש שלם רואה אותו
כאילו לא נצפה מעולם.

מה הסקריפט עושה
---------------
קורא את רשימת הפרקים הישנה והחדשה **מהגיט עצמו**, ולא מרשימה מודבקת ביד,
כדי שהוא יישאר נכון גם כשייחתכו מפגשים 5 עד 10. לכל מפגש שהשתנה הוא מחשב
לכל לומד איזה חלק מהמפגש הוא סיים, וזוקף לו את אותו חלק מהפרקים החדשים.

⚠️ זו הערכה, לא תרגום מדויק. גבולות הפרקים זזו, ולכן פרק ישן אינו מתאים
לפרק חדש אחד. לכן:
  • **עיגול כלפי מטה.** מי שסיים 5 מתוך 9 מקבל 5 מתוך 10 ולא 6. עדיף
    לזכות בחסר מאשר לסמן כנצפה משהו שלא נצפה.
  • **מי שסיים הכול מקבל הכול.** זה המקרה היחיד שאינו הערכה.
  • **שום שורה קיימת לא נמחקת.** השורות הישנות נשארות כיתומות ולא מזיקות.
    למחוק אותן בנפרד עם --purge-orphans, אחרי שווידאת שהמיפוי נראה נכון.

הרצה
----
    set BVM_ENV_FILE=<נתיב לקובץ ה-env עם SUPABASE_SERVICE_KEY>
    py scripts/remap_master_progress.py                 # יבש, לא כותב כלום
    py scripts/remap_master_progress.py --apply         # כותב
    py scripts/remap_master_progress.py --apply --purge-orphans

⚠️ להריץ **אחרי** פריסת ה-Edge Function עם החיתוך החדש, לא לפניה. כל עוד
הפונקציה הישנה חיה, הפרקים הישנים הם הפרקים האמיתיים ומיפוי מוקדם יסמן
ללומדים פרקים שעדיין לא קיימים אצלם.

תמיד נשמר גיבוי JSON של כל שורות המאסטר של הלומדים המושפעים לפני כתיבה,
תחת scripts/journey_state/ (התיקייה ב-gitignore, היא מכילה נתוני לומדים).
"""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TS_PATH = "supabase/functions/get-master-lessons/index.ts"
COURSE_TYPE = "nlp-master"
STATE_DIR = os.path.join(HERE, "journey_state")


# ---------------------------------------------------------------- git parsing

def git_show(ref: str, path: str) -> str:
    out = subprocess.run(
        ["git", "-C", REPO, "show", f"{ref}:{path}"],
        capture_output=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"git show {ref}:{path} נכשל -> {out.stderr.decode(errors='replace')[:200]}")
    return out.stdout.decode("utf-8", errors="replace")


def parse_master_modules(src: str):
    """{lessonNumber: [video_id, ...]} מתוך MASTER_MODULES בלבד."""
    start = src.find("const MASTER_MODULES")
    if start < 0:
        raise SystemExit("לא נמצא MASTER_MODULES בקובץ")
    end = src.find("const TECHNIQUES_MODULES", start)
    region = src[start:end if end > 0 else len(src)]

    modules = {}
    # כל בלוק מתחיל ב-lessonNumber ונמשך עד ה-lessonNumber הבא
    parts = re.split(r"\blessonNumber\s*:\s*(\d+)\s*,", region)
    # parts = [prefix, num, body, num, body, ...]
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        body = parts[i + 1]
        ids = re.findall(r"\bid\s*:\s*'([^']+)'", body)
        if ids:
            modules[num] = ids
    if not modules:
        raise SystemExit("לא נמצאו פרקים ב-MASTER_MODULES")
    return modules


# ------------------------------------------------------------------ supabase

def _load_env_file(path):
    """טוען קובץ env לתוך os.environ בלי לדרוס ערך שכבר הוגדר."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def load_env():
    """אותה קונבנציה כמו backup-supabase.py: משתני סביבה, ואז .env.local
    בשורש הפרויקט. הריפו ציבורי ולכן אין כאן שום נתיב או מפתח קשיח.
    למי שמריץ מקומית ומחזיק את הסודות מחוץ לפרויקט: אפשר להצביע על הקובץ
    עם BVM_ENV_FILE, או פשוט לייצא SUPABASE_SERVICE_KEY לפני ההרצה."""
    _load_env_file(os.environ.get("BVM_ENV_FILE", ""))
    _load_env_file(os.path.join(REPO, ".env.local"))

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit(
            "חסרים SUPABASE_URL / SUPABASE_SERVICE_KEY.\n"
            "הגדר אותם כמשתני סביבה, או הצבע על קובץ env עם BVM_ENV_FILE."
        )
    return url.rstrip("/"), key


class Rest:
    def __init__(self, url, key):
        self.url = url
        self.h = {
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Accept-Profile": "public",
            "Content-Profile": "public",
            "Accept": "application/json",
        }

    def _call(self, method, path, body=None, prefer=None):
        h = dict(self.h)
        data = None
        if body is not None:
            h["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode()
        if prefer:
            h["Prefer"] = prefer
        req = urllib.request.Request(self.url + "/rest/v1/" + path, headers=h, data=data, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else []
        except urllib.error.HTTPError as e:
            raise SystemExit(f"Supabase {method} {path[:60]} -> HTTP {e.code}: {e.read().decode()[:300]}")

    def get(self, path):
        return self._call("GET", path)

    def upsert(self, table, rows, on_conflict):
        return self._call(
            "POST",
            f"{table}?on_conflict={on_conflict}",
            rows,
            prefer="resolution=merge-duplicates,return=representation",
        )

    def delete(self, path):
        return self._call("DELETE", path, prefer="return=representation")


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old-ref", default="origin/master",
                    help="הגרסה שהלומדים למדו לפיה (ברירת מחדל: origin/master)")
    ap.add_argument("--new-ref", default="HEAD",
                    help="הגרסה עם החיתוך החדש (ברירת מחדל: HEAD)")
    ap.add_argument("--apply", action="store_true", help="כתיבה בפועל")
    ap.add_argument("--purge-orphans", action="store_true",
                    help="מחיקת שורות ההתקדמות הישנות אחרי המיפוי")
    args = ap.parse_args()

    old = parse_master_modules(git_show(args.old_ref, TS_PATH))
    new = parse_master_modules(git_show(args.new_ref, TS_PATH))

    changed = {n: (old[n], new[n]) for n in sorted(set(old) & set(new)) if old[n] != new[n]}
    only_old = sorted(set(old) - set(new))
    print(f"מפגשים בגרסה הישנה: {len(old)} · בחדשה: {len(new)}")
    if only_old:
        print(f"⚠️ מפגשים שקיימים רק בישנה ולכן לא ימופו: {only_old}")
    if not changed:
        print("אין מפגש שהשתנה. אין מה למפות.")
        return
    print(f"מפגשים שנחתכו מחדש: {sorted(changed)}\n")

    url, key = load_env()
    db = Rest(url, key)

    old_ids = [vid for n in changed for vid in changed[n][0]]
    q = "course_progress?select=*&course_type=eq." + COURSE_TYPE + \
        "&video_id=in.(" + ",".join(old_ids) + ")"
    rows = db.get(urllib.parse.quote(q, safe="=?&()*,.-_"))
    if not rows:
        print("לא נמצאה אף שורת התקדמות שמצביעה על הפרקים הישנים. אין מה למפות.")
        return

    users = sorted({r["user_id"] for r in rows})
    names = {}
    profs = db.get("profiles?select=id,full_name&id=in.(" + ",".join(users) + ")")
    for p in profs:
        names[p["id"]] = p.get("full_name") or p["id"][:8]

    # --- גיבוי: כל שורות המאסטר של הלומדים המושפעים, לא רק אלה שנוגעים בהן
    os.makedirs(STATE_DIR, exist_ok=True)
    allq = "course_progress?select=*&course_type=eq." + COURSE_TYPE + \
           "&user_id=in.(" + ",".join(users) + ")"
    backup_rows = db.get(urllib.parse.quote(allq, safe="=?&()*,.-_"))
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(STATE_DIR, f"master-progress-backup-{stamp}.json")
    with open(backup_path, "w", encoding="utf-8") as fh:
        json.dump({"taken_at": stamp, "old_ref": args.old_ref, "new_ref": args.new_ref,
                   "rows": backup_rows}, fh, ensure_ascii=False, indent=2)
    print(f"גיבוי: {len(backup_rows)} שורות -> {backup_path}\n")

    by_user = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)

    to_upsert = []
    print(f"{'לומד':<18}{'מפגש':<7}{'סיים ישן':<11}{'ייזקף חדש':<12}הערה")
    print("-" * 78)
    for uid in users:
        urows = by_user[uid]
        for n in sorted(changed):
            o_ids, n_ids = changed[n]
            mine = [r for r in urows if r["video_id"] in o_ids]
            done = [r for r in mine if r.get("completed")]
            if not done:
                continue
            frac = len(done) / len(o_ids)
            k = len(n_ids) if len(done) == len(o_ids) else int(frac * len(n_ids))
            note = "מפגש שלם" if len(done) == len(o_ids) else f"{frac:.0%} מהמפגש, מעוגל מטה"
            print(f"{names.get(uid, uid[:8]):<18}{n:<7}{f'{len(done)}/{len(o_ids)}':<11}{f'{k}/{len(n_ids)}':<12}{note}")
            if k == 0:
                continue
            stamps = [r.get("completed_at") for r in done if r.get("completed_at")]
            when = max(stamps) if stamps else dt.datetime.now(dt.timezone.utc).isoformat()
            for idx, vid in enumerate(n_ids[:k]):
                to_upsert.append({
                    "user_id": uid,
                    "video_id": vid,
                    "course_type": COURSE_TYPE,
                    "lesson_number": idx + 1,
                    "completed": True,
                    "completed_at": when,
                })

    print("-" * 78)
    print(f"סה\"כ שורות שייכתבו: {len(to_upsert)} · לומדים: {len(users)}")

    if not args.apply:
        print("\nריצה יבשה. לא נכתב כלום. להרצה אמיתית: --apply")
        return

    if to_upsert:
        # onConflict זהה ל-markVideoWatched בפורטל, כדי שהשורות ייראו זהות
        written = db.upsert("course_progress", to_upsert, "user_id,video_id")
        print(f"\n✅ נכתבו {len(written)} שורות.")

    if args.purge_orphans:
        dq = "course_progress?course_type=eq." + COURSE_TYPE + \
             "&video_id=in.(" + ",".join(old_ids) + ")"
        gone = db.delete(urllib.parse.quote(dq, safe="=?&()*,.-_"))
        print(f"🧹 נמחקו {len(gone)} שורות יתומות. הגיבוי נשמר ב-{backup_path}")

    # אימות חי: קריאה מחדש, לא הסתמכות על התשובה של הכתיבה
    check_ids = sorted({r["video_id"] for r in to_upsert})
    if check_ids:
        vq = "course_progress?select=user_id,video_id,completed&course_type=eq." + COURSE_TYPE + \
             "&video_id=in.(" + ",".join(check_ids) + ")"
        back = db.get(urllib.parse.quote(vq, safe="=?&()*,.-_"))
        ok = sum(1 for r in back if r.get("completed"))
        print(f"אימות מהמסד: {ok} שורות מסומנות כהושלמו מתוך {len(to_upsert)} שנשלחו.")


if __name__ == "__main__":
    sys.exit(main())
