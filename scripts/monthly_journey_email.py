# -*- coding: utf-8 -*-
"""Monthly "Your Journey" email — Spotify-Wrapped-style personal summary per learner.

Sends each learner (>=1 completed lesson) a branded RTL email with their personal
numbers for the previous calendar month + a CTA back to the portal (UTM-tagged).
Two variants: active (celebrate) / dormant (protect-your-investment).

Delivery: Gmail Apps Script web app (GET, action=send + html param — POST breaks
on Google's redirect, documented project lesson). Quota ~100 recipients/day,
~10 sends/min → max BATCH_PER_RUN per run + SEND_INTERVAL_SEC sleep between sends.

Scheduling model: a DAILY scheduled task runs this script; it only acts on days
1-ACTIVE_THROUGH_DAY of the month, draining the send list ~85/day until done
(state file per month prevents duplicates). Any other day → instant exit.
If the month's list is not fully drained by the last active day → WhatsApp alert.

Run modes:
  py scripts/monthly_journey_email.py --test      # one 🧪 email to NOTIFY_EMAIL only, no state
  py scripts/monthly_journey_email.py --dry-run   # compute + print summary, no send
  py scripts/monthly_journey_email.py             # real batched send (day-gated)
  py scripts/monthly_journey_email.py --force     # real send, ignore day gate (manual drain)
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = Path(__file__).resolve().parent / "journey_state"
STATE_DIR.mkdir(exist_ok=True)
OPTOUT_FILE = STATE_DIR / "optout.json"
LOG_FILE = STATE_DIR / "log.txt"

BATCH_PER_RUN = 85          # stay under Gmail's ~100/day (backup reports share the quota)
SEND_INTERVAL_SEC = 7       # ~8-9/min, under the ~10/min Apps Script send limit
ACTIVE_THROUGH_DAY = 6      # drain window: days 1-6 of each month
PORTAL_URL = ("https://www.therapist-home.com/pages/course-library.html"
              "?utm_source=email&utm_medium=email&utm_campaign=monthly_journey")

HEB_MONTHS = {1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני",
              7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר"}


def load_env():
    env_file = PROJECT_ROOT / ".env.local"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def log(msg):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def whatsapp_alert(text):
    """Failure alert to Hillel — same Green API instance the backup script uses."""
    try:
        url = (f"{os.environ['GREEN_API_URL']}/waInstance{os.environ['GREEN_API_INSTANCE']}"
               f"/sendMessage/{os.environ['GREEN_API_TOKEN']}")
        body = json.dumps({"chatId": f"{os.environ['ALERT_PHONE']}@c.us",
                           "message": text}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:  # alert failure must never crash the run
        log(f"WhatsApp alert failed: {e}")


def sb_get(path):
    url = os.environ["SUPABASE_URL"].rstrip("/") + path
    req = urllib.request.Request(url, headers={
        "apikey": os.environ["SUPABASE_SERVICE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_KEY"],
        "Accept-Profile": "public"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def fetch_all(path_base):
    rows, offset = [], 0
    while True:
        batch = sb_get(f"{path_base}&limit=1000&offset={offset}")
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


# ── Data assembly ────────────────────────────────────────────────────────────

def build_learners(report_year, report_month):
    """Return (learners, facts) — personal numbers per learner + true population facts."""
    progress = fetch_all("/rest/v1/course_progress?select=user_id,lesson_number,course_type,completed_at")

    by_user = defaultdict(set)      # all-time distinct lessons
    month_by_user = defaultdict(set)  # distinct lessons completed in report month
    prefix = f"{report_year:04d}-{report_month:02d}"
    for r in progress:
        uid = r.get("user_id")
        if not uid:
            continue
        key = (r.get("course_type"), r.get("lesson_number"))
        by_user[uid].add(key)
        if (r.get("completed_at") or "").startswith(prefix):
            month_by_user[uid].add(key)

    uids = list(by_user.keys())

    profiles = {}
    for i in range(0, len(uids), 50):
        chunk = ",".join(f'"{u}"' for u in uids[i:i + 50])
        for p in sb_get(f"/rest/v1/profiles?id=in.({chunk})&select=id,email,full_name,role"):
            profiles[p["id"]] = p

    game = defaultdict(lambda: {"longest_streak": 0, "xp": 0})
    for i in range(0, len(uids), 50):
        chunk = ",".join(f'"{u}"' for u in uids[i:i + 50])
        for g in sb_get(f"/rest/v1/nlp_game_players?user_id=in.({chunk})"
                        "&select=user_id,longest_streak,xp"):
            cur = game[g["user_id"]]
            cur["longest_streak"] = max(cur["longest_streak"], g.get("longest_streak") or 0)
            cur["xp"] += g.get("xp") or 0

    # the learner's own words from the signup questionnaire (595/595 filled — verified live)
    quests = {}
    q_total = 0
    for q in fetch_all("/rest/v1/portal_questionnaires"
                       "?select=user_id,vision_one_year,main_challenge,why_nlp"):
        q_total += 1
        if q.get("user_id"):
            quests[q["user_id"]] = q

    # rank by all-time lessons for the percentile line
    totals_sorted = sorted((len(v) for v in by_user.values()), reverse=True)

    def clean_quote(text):
        """Their own words, safe for inline quoting: single line, sane length.
        Capped at 80 chars — Hebrew inflates ~9x when percent-encoded and the whole
        email travels in a GET URL (~8K hard limit at Apps Script)."""
        t = " ".join((text or "").split())
        # junk filter: one-word / very short answers are usually keyboard mash
        # ("צגלל", "כק׳כק׳כק׳") — quoting those back looks broken, skip them
        if len(t) < 8 or len(t.split()) < 2:
            return ""
        if len(t) > 80:
            cut = t[:80]
            t = cut[:cut.rfind(" ")] + "..." if " " in cut else cut + "..."
        return t

    learners = []
    for uid in uids:
        p = profiles.get(uid) or {}
        email = (p.get("email") or "").strip()
        if not email or "@" not in email:
            continue
        total = len(by_user[uid])
        rank = totals_sorted.index(total) + 1  # best rank for that total
        top_pct = max(5, math.ceil(rank / len(totals_sorted) * 100 / 5) * 5)
        q = quests.get(uid) or {}
        learners.append({
            "user_id": uid,
            "email": email,
            "first_name": (p.get("full_name") or "").split()[0] if p.get("full_name") else "",
            "total_lessons": total,
            "month_lessons": len(month_by_user.get(uid, set())),
            "longest_streak": game[uid]["longest_streak"],
            "top_pct": top_pct,
            "vision": clean_quote(q.get("vision_one_year")),
            "challenge": clean_quote(q.get("main_challenge")),
        })

    facts = {
        "registered": q_total,           # everyone who filled the signup questionnaire
        "learners": len(learners),       # actually started learning (>=1 lesson)
        "month_active": sum(1 for l in learners if l["month_lessons"] > 0),
    }
    return learners, facts


# ── Email building ───────────────────────────────────────────────────────────

def escapeq(text):
    """HTML-escape a learner-written quote for safe inline embedding."""
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def stat_row(value, label):
    return (f'<td align="center" style="padding:10px 6px;">'
            f'<div style="font-size:34px;font-weight:700;color:#003B46;line-height:1;">{value}</div>'
            f'<div style="font-size:13px;color:#5b7177;margin-top:6px;">{label}</div></td>')


def build_email(learner, month_name, facts, test_marker=""):
    """Return (subject, plain_text, html). Kept compact — HTML travels in a GET URL.

    Copy rules (Hillel, 2026-07-19): no em-dashes in learner-facing text; quote the
    learner's OWN questionnaire words back to them; every comparison number must be
    a real computed fact, never invented.
    """
    name = learner["first_name"] or "לומד יקר"
    active = learner["month_lessons"] > 0
    vision = escapeq(learner["vision"])
    challenge = escapeq(learner["challenge"])

    stats = []
    if active:
        stats.append(stat_row(learner["month_lessons"], f"שיעורים ב{month_name}"))
    stats.append(stat_row(learner["total_lessons"], "שיעורים בסך הכל במסע"))
    if learner["longest_streak"] >= 2:
        stats.append(stat_row(learner["longest_streak"], "ימי הרצף הכי ארוך"))
    if learner["top_pct"] <= 50:
        stats.append(stat_row(f"{100 - learner['top_pct']}%", "מהלומדים השלימו פחות ממך"))

    # their own words, quoted back (the most personal line in the email)
    if vision:
        vision_line = (f'כשהצטרפת כתבת לנו מה אתה רוצה שיקרה בעוד שנה: '
                       f'<span style="color:#00606B;font-weight:700;">"{vision}"</span>. '
                       f'זה לא נשכח. הנה כמה התקדמת לשם:')
    else:
        vision_line = f"ככה נראה המסע שלך בפורטל עד עכשיו:"

    # NOTE: no emojis in subjects — the Gmail Apps Script GET channel mangles
    # astral-plane chars (arrive as ������). Hebrew itself is fine.
    if active:
        subject = f"{name}, אתה בין {learner['top_pct']}% המתמידים של בית המטפלים" \
            if learner["top_pct"] <= 50 else f"{name}, החודש שלך בבית המטפלים"
        proud_line = (f"ורק שתדע מה זה אומר: ב{month_name} נכנסו ללמוד "
                      f"{facts['month_active']} אנשים בלבד מתוך {facts['learners']} "
                      f"לומדים בפורטל. אתה אחד מהם. זו לא סטטיסטיקה, זו זהות: "
                      f"אתה מהאנשים שמתחילים וגם ממשיכים.")
        cta_line = "בוא נמשיך מאיפה שעצרת." if not challenge else \
            (f'כתבת שהאתגר שלך הוא "{challenge}". '
             f"כל שיעור שאתה מסיים הוא עוד צעד בדיוק לשם.")
    else:
        subject = f"{name}, {learner['total_lessons']} השיעורים שלך מחכים לך"
        proud_line = (f"ועובדה אחת ששווה שתדע: {facts['registered']} אנשים נרשמו לפורטל, "
                      f"אבל רק {facts['learners']} באמת התחילו ללמוד. אתה כבר בפנים, "
                      f"עם {learner['total_lessons']} שיעורים מאחוריך. את זה אף אחד לא לוקח ממך.")
        cta_line = "מספיק שיעור אחד קטן כדי לחזור לתנועה. הכל שמור בדיוק איפה שעזבת." \
            if not challenge else \
            (f'כשנרשמת כתבת שהאתגר שלך הוא "{challenge}". '
             f"הוא לא נפתר מעצמו. שיעור אחד היום מחזיר אותך לדרך.")

    if test_marker:
        subject = f"{test_marker} {subject}"

    html = f"""<div dir="rtl" style="background:#E8F1F2;padding:24px 12px;font-family:'Heebo',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d7e3e5;">
<div style="background:#003B46;padding:18px 24px;border-bottom:3px solid #D4AF37;">
<span style="color:#E8F1F2;font-size:20px;font-weight:700;">בית המטפלים</span>
</div>
<div style="padding:24px;color:#1f2d30;font-size:16px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#003B46;">שלום {name},</p>
<p style="margin:0 0 18px;">{vision_line}</p>
<table role="presentation" width="100%" style="border-collapse:collapse;background:#f4f8f9;border-radius:10px;"><tr>{''.join(stats)}</tr></table>
<p style="margin:18px 0 0;">{proud_line}</p>
<p style="margin:14px 0 22px;">{cta_line}</p>
<div style="text-align:center;">
<a href="{PORTAL_URL}" style="display:inline-block;background:#D4AF37;color:#003B46;font-weight:700;font-size:16px;padding:13px 34px;border-radius:8px;text-decoration:none;">חזרה למסע שלי ←</a>
</div>
</div>
<div style="padding:14px 24px;background:#f4f8f9;color:#5b7177;font-size:12px;border-top:1px solid #e2ecee;">
נשלח מצוות בית המטפלים · <a href="https://www.therapist-home.com" style="color:#00606B;">www.therapist-home.com</a><br>
לא רוצה לקבל את הסיכום החודשי? פשוט השב למייל הזה עם המילה "הסר".
</div>
</div>
</div>"""

    # plain body kept MINIMAL on purpose — it rides in the same GET URL as the HTML
    # and only shows in text-only clients (rare). The HTML is the real email.
    plain_lines = [f"שלום {name},",
                   f"סיימת {learner['total_lessons']} שיעורים במסע שלך בבית המטפלים.",
                   f"חזרה למסע שלך: {PORTAL_URL}",
                   'להסרה: השב למייל זה עם המילה "הסר".']
    return subject, "\n".join(plain_lines), html


URL_BUDGET = 7800  # Apps Script GET URLs 400 above ~8K; keep headroom


def encoded_len(to, subject, plain, html):
    return len(urllib.parse.urlencode({
        "token": "X" * 60, "action": "send", "to": to, "subject": subject,
        "body": plain, "html": html, "name": "בית המטפלים"}))


def build_email_safe(learner, month_name, facts, test_marker=""):
    """Build the email; if the encoded GET URL would overflow, retry without quotes."""
    subject, plain, html = build_email(learner, month_name, facts, test_marker)
    if encoded_len(learner["email"], subject, plain, html) > URL_BUDGET:
        stripped = dict(learner, vision="", challenge="")
        subject, plain, html = build_email(stripped, month_name, facts, test_marker)
    return subject, plain, html


def send_gmail(to, subject, plain, html):
    params = urllib.parse.urlencode({
        "token": os.environ["GMAIL_API_TOKEN"],
        "action": "send",
        "to": to,
        "subject": subject,
        "body": plain,
        "html": html,
        "name": "בית המטפלים",
    })
    url = f"{os.environ['GMAIL_API_URL']}?{params}"
    with urllib.request.urlopen(url, timeout=45) as resp:
        raw = resp.read().decode()
    try:
        result = json.loads(raw)
    except Exception:
        raise RuntimeError(f"Apps Script returned non-JSON: {raw[:200]}")
    if not result.get("success"):
        raise RuntimeError(f"Apps Script error: {result.get('error') or raw[:200]}")


# ── Main flow ────────────────────────────────────────────────────────────────

def main():
    load_env()
    test_mode = "--test" in sys.argv
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    today = datetime.now()
    if not (test_mode or dry_run or force) and today.day > ACTIVE_THROUGH_DAY:
        return 0  # outside the monthly drain window — silent daily no-op

    # report period = the calendar month that just ended
    first_of_month = today.replace(day=1)
    prev = first_of_month - timedelta(days=1)
    month_name = HEB_MONTHS[prev.month]
    state_file = STATE_DIR / f"{prev.year:04d}-{prev.month:02d}.json"

    try:
        learners, facts = build_learners(prev.year, prev.month)
        optout = set(json.loads(OPTOUT_FILE.read_text(encoding="utf-8"))) if OPTOUT_FILE.exists() else set()
        learners = [l for l in learners if l["email"].lower() not in optout]
        active_n = sum(1 for l in learners if l["month_lessons"] > 0)
        log(f"period={prev.year}-{prev.month:02d} learners={len(learners)} "
            f"active={active_n} dormant={len(learners) - active_n} optout={len(optout)}")

        if dry_run:
            for l in sorted(learners, key=lambda x: -x["total_lessons"])[:10]:
                print(f"  {l['first_name']:<10} {l['email']:<35} month={l['month_lessons']} "
                      f"total={l['total_lessons']} streak={l['longest_streak']} top={l['top_pct']}%")
            return 0

        if test_mode:
            notify = os.environ.get("NOTIFY_EMAIL", "htjewelry.a474@gmail.com")
            quoted = [l for l in learners if l["vision"] and l["challenge"]] or learners
            sample = max(quoted, key=lambda x: x["month_lessons"])         # active variant
            dormant = next((l for l in sorted(quoted, key=lambda x: -x["total_lessons"])
                            if l["month_lessons"] == 0), None)             # dormant variant
            for variant, l in [("פעיל", sample), ("רדום", dormant)]:
                if not l:
                    continue
                subject, plain, html = build_email_safe(l, month_name, facts,
                                                        test_marker=f"[בדיקה, גרסת {variant}]")
                send_gmail(notify, subject, plain, html)
                log(f"TEST sent to {notify} (variant={variant}, sample={l['email']})")
                time.sleep(SEND_INTERVAL_SEC)
            return 0

        # real batched send
        sent = set(json.loads(state_file.read_text(encoding="utf-8"))) if state_file.exists() else set()
        pending = [l for l in learners if l["email"].lower() not in sent]
        if not pending:
            log("month fully drained — nothing to send")
            return 0

        batch = pending[:BATCH_PER_RUN]
        failures = 0
        for l in batch:
            try:
                subject, plain, html = build_email_safe(l, month_name, facts)
                send_gmail(l["email"], subject, plain, html)
                sent.add(l["email"].lower())
                state_file.write_text(json.dumps(sorted(sent), ensure_ascii=False), encoding="utf-8")
            except Exception as e:
                failures += 1
                log(f"send FAILED for {l['email']}: {e}")
                if failures >= 5:
                    raise RuntimeError(f"aborting after {failures} consecutive-ish failures")
            time.sleep(SEND_INTERVAL_SEC)

        remaining = len(pending) - len(batch)
        log(f"batch done: sent={len(batch) - failures} failed={failures} remaining={remaining}")

        if remaining > 0 and today.day >= ACTIVE_THROUGH_DAY and not force:
            whatsapp_alert(f"⚠️ מייל המסע החודשי: נגמר חלון השליחה ונשארו {remaining} "
                           f"לומדים שלא קיבלו. להריץ ידנית עם --force.")
        return 0

    except Exception as e:
        log(f"FATAL: {e}")
        whatsapp_alert(f"🔴 מייל המסע החודשי של בית המטפלים נכשל: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
