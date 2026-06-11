#!/usr/bin/env python3
"""
Green API quota canary — Beit V'Metaplim portal welcome WhatsApp.

Probes the PORTAL Green API instance (the one used by the
send-welcome-whatsapp Edge Function) once a day by calling checkWhatsapp
on a known number that's guaranteed to be on WhatsApp (Hillel's own
phone). If the response indicates the instance is broken — quota
exhausted, not authorized, account blocked — sends an email alert to
Hillel via Gmail Apps Script.

Why this exists: Green API does not expose remaining-quota as a number
through their API, only through their web dashboard. The only externally
detectable signal is "checkWhatsapp suddenly returns non-ok invokeStatus".
So this canary fires the moment the system breaks, not in advance.

Idempotency: state is tracked in scripts/green-api-canary.state.json.
- First time broken → email sent, state flipped to "broken".
- Still broken on subsequent runs → silent, unless 3+ days since last
  alert (re-alert in case the first one was missed).
- Recovered → email sent ("✅ Green API is back"), state flipped to "ok".

Runs daily 09:00 via Windows Scheduled Task BeitVmetaplim-GreenApiCanary.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


def _load_env_local():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_env_local()

# Portal Green API — the instance being monitored
PORTAL_URL = os.environ["PORTAL_GREEN_API_URL"]
PORTAL_INSTANCE = os.environ["PORTAL_GREEN_API_INSTANCE"]
PORTAL_TOKEN = os.environ["PORTAL_GREEN_API_TOKEN"]

# Gmail Apps Script — alert channel (independent of Green API, so it still
# works when Green API is the thing that's broken)
GMAIL_API_URL = os.environ["GMAIL_API_URL"]
GMAIL_API_TOKEN = os.environ["GMAIL_API_TOKEN"]
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "htjewelry.a474@gmail.com")

# Hillel's number — known to be on WhatsApp, used as the probe target.
PROBE_PHONE = "972549116092"

STATE_FILE = Path(__file__).resolve().parent / "green-api-canary.state.json"
REALERT_AFTER_DAYS = 3


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_state():
    if not STATE_FILE.exists():
        return {"last_status": "ok", "last_alert_at": None, "last_check_at": None, "last_reason": None}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"last_status": "ok", "last_alert_at": None, "last_check_at": None, "last_reason": None}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def probe_green_api():
    """Returns (is_ok: bool, reason: str). reason is human-readable Hebrew."""
    url = f"{PORTAL_URL}/waInstance{PORTAL_INSTANCE}/checkWhatsapp/{PORTAL_TOKEN}"
    body = json.dumps({"phoneNumber": int(PROBE_PHONE)}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} — {e.reason}"
    except Exception as e:
        return False, f"שגיאת רשת: {type(e).__name__}: {str(e)[:120]}"

    # Green API returns invokeStatus when something is wrong (quota, auth, etc).
    invoke_status = (data.get("invokeStatus") or {}).get("status")
    if invoke_status and invoke_status != "ok":
        description = (data.get("invokeStatus") or {}).get("description", "")
        return False, f"invokeStatus: {invoke_status} ({description})"

    # Normal flow — checkWhatsapp returns existsWhatsapp boolean
    if "existsWhatsapp" not in data:
        return False, f"תשובה לא צפויה: {json.dumps(data)[:200]}"

    return True, "ok"


def send_email(subject, html_body):
    # Apps Script action is 'send' with an 'html' param (NOT 'sendEmail'/'htmlBody')
    params = urllib.parse.urlencode({
        "action": "send",
        "token": GMAIL_API_TOKEN,
        "to": NOTIFY_EMAIL,
        "subject": subject,
        "body": subject,
        "html": html_body,
    })
    url = f"{GMAIL_API_URL}?{params}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def alert_broken(reason):
    # No emoji in subject — gmail-api project rule (URL encoding gotcha)
    subject = "Green API נשבר — אוטומציית welcome WhatsApp לא עובדת"
    body = f"""
    <div dir='rtl' style='font-family:Heebo,sans-serif;max-width:600px;'>
      <h2 style='color:#dc3545;'>🚨 Green API portal instance לא מגיב כצפוי</h2>
      <p>הקנרית היומית בדקה את ה-instance שמשמש את <code>send-welcome-whatsapp</code>
         וקיבלה תגובה לא תקינה. כל הרשמה חדשה לפורטל מהרגע הזה <b>לא תקבל הודעת
         WhatsApp עד שתפתור.</b></p>

      <h3>פרטים</h3>
      <ul>
        <li><b>Instance:</b> {PORTAL_INSTANCE}</li>
        <li><b>סיבה:</b> {reason}</li>
        <li><b>זמן בדיקה:</b> {now_iso()}</li>
      </ul>

      <h3>מה לבדוק</h3>
      <ol>
        <li>לוח הבקרה: <a href='https://console.green-api.com/'>console.green-api.com</a> →
            בחר instance {PORTAL_INSTANCE} → בדוק "Methods used" + "Days remaining"</li>
        <li>אם הסטטוס מנותק → לחץ "Restart instance" או סרוק QR מחדש בטלפון</li>
        <li>אם quota פג → חידוש מנוי / שדרוג חבילה</li>
        <li>לאחר תיקון: הקנרית הבאה (מחר 09:00) תשלח אישור התאוששות. אפשר להריץ
            ידנית: <code>py scripts/check_green_api_quota.py</code></li>
      </ol>

      <p style='color:#6c757d;font-size:12px;margin-top:24px;'>
        נשלח אוטומטית מ-check_green_api_quota.py | Beit V'Metaplim
      </p>
    </div>
    """
    return send_email(subject, body)


def alert_recovered():
    subject = f"✅ Green API חזר — אוטומציית welcome WhatsApp עובדת"
    body = f"""
    <div dir='rtl' style='font-family:Heebo,sans-serif;max-width:600px;'>
      <h2 style='color:#28a745;'>✅ Green API portal instance עובד שוב</h2>
      <p>הקנרית היומית בדקה ו-instance {PORTAL_INSTANCE} מגיב תקין.
         הרשמות חדשות יתחילו לקבל הודעת WhatsApp שוב.</p>

      <p><b>זמן בדיקה:</b> {now_iso()}</p>

      <p style='color:#6c757d;font-size:12px;margin-top:24px;'>
        נשלח אוטומטית מ-check_green_api_quota.py | Beit V'Metaplim
      </p>
    </div>
    """
    return send_email(subject, body)


def should_realert(state):
    """Re-alert if it's been > REALERT_AFTER_DAYS since the last broken-alert."""
    last_alert = state.get("last_alert_at")
    if not last_alert:
        return True
    try:
        last_dt = datetime.fromisoformat(last_alert)
        return datetime.now(timezone.utc) - last_dt > timedelta(days=REALERT_AFTER_DAYS)
    except Exception:
        return True


def main():
    state = load_state()
    is_ok, reason = probe_green_api()
    state["last_check_at"] = now_iso()
    state["last_reason"] = reason

    if is_ok:
        if state.get("last_status") == "broken":
            print(f"RECOVERED — sending recovery email. Previous reason: {state.get('last_reason')}")
            try:
                alert_recovered()
            except Exception as e:
                print(f"Failed to send recovery email: {e}")
        state["last_status"] = "ok"
        state["last_alert_at"] = None
        save_state(state)
        print(f"OK — Green API instance {PORTAL_INSTANCE} responding normally.")
        sys.exit(0)

    # is_ok is False — broken
    was_broken_already = state.get("last_status") == "broken"
    state["last_status"] = "broken"

    if was_broken_already and not should_realert(state):
        save_state(state)
        print(f"STILL BROKEN — silent (last alert < {REALERT_AFTER_DAYS}d ago). Reason: {reason}")
        sys.exit(1)

    print(f"BROKEN — sending email alert. Reason: {reason}")
    try:
        alert_broken(reason)
        state["last_alert_at"] = now_iso()
    except Exception as e:
        print(f"Failed to send broken alert email: {e}")

    save_state(state)
    sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {type(e).__name__}: {e}")
        sys.exit(3)
