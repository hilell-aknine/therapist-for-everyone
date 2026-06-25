#!/usr/bin/env python3
"""
Funnel watchdog — Beit V'Metaplim
=================================
Catches the class of bug where a lead/registration form breaks SILENTLY in
production and no one notices because leads simply stop arriving.

It runs THREE layers of checks against the LIVE site (not the repo), so it
also catches deploy drift:

  1. Backend contract  — submit-lead must be alive AND still enforcing Turnstile.
                         A POST with no token must return 403. If it 5xx's,
                         times out, or (worse) returns 200, that's a problem.
  2. Frontend wiring   — every public page that POSTs to submit-lead MUST also
                         load the Turnstile widget and send `turnstileToken`.
                         This is exactly the bug that took the questionnaire
                         down (form posted, but never sent a token -> 403).
  3. Known regressions — pages must not write the dropped `roles:` column to
                         profiles (made the portal signup upsert fail silently).

On ANY failure it sends ONE WhatsApp to Hillel and exits non-zero.
Zero junk: it never creates a real lead.

Run daily via Windows Scheduled Task (see install note at bottom).
Independent of any one form — add a page to PAGES and it's covered.
"""

import json
import sys
import urllib.request
import urllib.error

# ---- WhatsApp alert (same Green API instance as the backup watchdog) --------
GREEN_API_URL = "https://7103.api.greenapi.com"
GREEN_API_INSTANCE = "7103533485"
GREEN_API_TOKEN = "83960338d380459ca79eb37e2b08c4639479d22c643144779f"
ALERT_PHONE = "972549116092"

SITE = "https://www.therapist-home.com"
FUNCTIONS_URL = "https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6"
    "ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0."
    "ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw"
)

# Public pages that capture leads / registrations. Each entry says what the
# page's HTML must (and must not) contain. Add new lead forms here.
PAGES = [
    {
        "name": "שאלון התאמה",
        "url": f"{SITE}/pages/questionnaire-form.html",
        "must_have": ["submit-lead", "turnstileToken", "challenges.cloudflare.com"],
        "must_not_have": [],
    },
    {
        "name": "הרשמה לפורטל (v2)",
        "url": f"{SITE}/pages/free-portal-v2.html",
        # signs up via auth, then redirects to portal-questionnaire; must still
        # gate with Turnstile and must NOT write the dropped `roles:` column.
        "must_have": ["turnstileToken", "challenges.cloudflare.com"],
        "must_not_have": ["roles: ['student_lead']", 'roles: ["student_lead"]'],
    },
]


def send_whatsapp(message):
    url = f"{GREEN_API_URL}/waInstance{GREEN_API_INSTANCE}/sendMessage/{GREEN_API_TOKEN}"
    body = json.dumps({"chatId": f"{ALERT_PHONE}@c.us", "message": message}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json"}
    )
    urllib.request.urlopen(req, timeout=15).read()


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "funnel-watchdog/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def check_backend(failures):
    """submit-lead must be alive and still rejecting tokenless POSTs (403)."""
    url = f"{FUNCTIONS_URL}/submit-lead"
    body = json.dumps({
        "table": "questionnaire_submissions",
        "data": {"full_name": "watchdog probe", "phone": "0500000000"},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "apikey": ANON_KEY,
                 "Origin": SITE},
    )
    try:
        urllib.request.urlopen(req, timeout=20)
        # 2xx with NO token means Turnstile protection is OFF — security hole.
        failures.append(
            "submit-lead קיבל שליחה ללא אימות והחזיר הצלחה — הגנת ה-Turnstile כבויה!"
        )
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return  # healthy: alive and enforcing
        failures.append(
            f"submit-lead מחזיר שגיאה לא צפויה: HTTP {e.code} (ציפינו 403)."
        )
    except Exception as e:
        failures.append(
            f"submit-lead לא נגיש (ה-Edge Function אולי נפל): {type(e).__name__}."
        )


def check_pages(failures):
    for p in PAGES:
        try:
            status, html = fetch(p["url"])
        except Exception as e:
            failures.append(f"\"{p['name']}\" לא נטען: {type(e).__name__}.")
            continue
        if status != 200:
            failures.append(f"\"{p['name']}\" מחזיר HTTP {status} (לא 200).")
            continue
        for token in p["must_have"]:
            if token not in html:
                failures.append(
                    f"\"{p['name']}\" חסר רכיב חובה בקוד החי: '{token}'. "
                    f"הטופס כנראה שבור."
                )
        for token in p["must_not_have"]:
            if token in html:
                failures.append(
                    f"\"{p['name']}\" מכיל קוד פגום שאמור היה להימחק: '{token}'."
                )


def main():
    failures = []
    check_backend(failures)
    check_pages(failures)

    if failures:
        msg = "🚨 בדיקת משפך לידים נכשלה (בית המטפלים):\n\n" + "\n".join(
            f"• {f}" for f in failures
        ) + "\n\nלידים אולי לא נכנסים כרגע — כדאי לבדוק מיד."
        send_whatsapp(msg)
        print("FAIL:\n" + "\n".join(failures))
        sys.exit(1)

    print("OK — funnel healthy (backend enforcing, all forms wired).")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            send_whatsapp(f"🚨 funnel-watchdog crashed: {type(e).__name__}: {str(e)[:150]}")
        except Exception:
            pass
        sys.exit(3)
