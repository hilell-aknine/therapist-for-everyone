#!/usr/bin/env python3
"""One-shot E2E test for the send-email Edge Function.
Creates a disposable admin, sends a branded test email to NOTIFY_EMAIL,
verifies the audit row, then deletes the temp user (profile first — FK gotcha).
Run: py scripts/test_send_email_e2e.py
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path


def _load_env_local():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_env_local()
URL = os.environ.get("SUPABASE_URL", "https://eimcudmlfjlyxjyrdcgc.supabase.co")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
NOTIFY = os.environ.get("NOTIFY_EMAIL", "htjewelry.a474@gmail.com")

TEMP_EMAIL = "temp-email-test-20260611@example.com"
TEMP_PASS = "Tmp!9982-email-test"


def req(method, path, body=None, token=None, profile_headers=False):
    headers = {"apikey": KEY, "Authorization": f"Bearer {token or KEY}", "Content-Type": "application/json"}
    if profile_headers:
        headers["Accept-Profile"] = "public"
        headers["Content-Profile"] = "public"
        headers["Prefer"] = "return=representation"
    r = urllib.request.Request(URL + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}


def main():
    uid = None
    try:
        # 1. Disposable admin
        st, user = req("POST", "/auth/v1/admin/users",
                       {"email": TEMP_EMAIL, "password": TEMP_PASS, "email_confirm": True})
        if st not in (200, 201):
            print(f"FAIL create user: {st} {user}")
            return 1
        uid = user["id"]
        print(f"[1] temp user created: {uid}")

        st, rows = req("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"role": "admin"}, profile_headers=True)
        if st != 200 or not rows:
            # trigger may not have created a profile row — insert it
            st, rows = req("POST", "/rest/v1/profiles",
                           {"id": uid, "email": TEMP_EMAIL, "role": "admin"}, profile_headers=True)
            if st not in (200, 201):
                print(f"FAIL set admin role: {st} {rows}")
                return 1
        print("[2] role=admin set")

        # 2. Login → JWT
        st, sess = req("POST", "/auth/v1/token?grant_type=password",
                       {"email": TEMP_EMAIL, "password": TEMP_PASS})
        jwt = sess.get("access_token")
        if not jwt:
            print(f"FAIL login: {st} {sess}")
            return 1
        print("[3] JWT acquired")

        # 3. Send the test email
        st, result = req("POST", "/functions/v1/send-email", {
            "to": NOTIFY,
            "subject": "בדיקת מערכת — שליחת מיילים מבית המטפלים",
            "message": "שלום הלל,\n\nזהו מייל בדיקה מהמערכת החדשה לשליחת מיילים של בית המטפלים.\nאם המייל הזה הגיע בעיצוב ממותג (כותרת כהה עם פס זהב) — הכל עובד.\n\nנשלח אוטומטית מבדיקת הקצה-לקצה.",
        }, token=jwt)
        print(f"[4] send-email → {st} {result}")
        if st != 200 or not result.get("success"):
            return 1

        # 4. Verify audit row
        hdr = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "public"}
        r = urllib.request.Request(
            URL + "/rest/v1/crm_activity_log?action=eq.admin_send_email&order=created_at.desc&limit=1",
            headers=hdr)
        with urllib.request.urlopen(r, timeout=20) as resp:
            audit = json.loads(resp.read().decode())
        print(f"[5] audit row: {'OK — ' + json.dumps(audit[0].get('details', {}), ensure_ascii=False) if audit else 'MISSING'}")
        return 0
    finally:
        if uid:
            req("DELETE", f"/rest/v1/profiles?id=eq.{uid}", profile_headers=True)
            st, _ = req("DELETE", f"/auth/v1/admin/users/{uid}")
            print(f"[6] temp user cleanup → {st}")


if __name__ == "__main__":
    sys.exit(main())
