#!/usr/bin/env python3
"""
Backup watchdog — Beit V'Metaplim
Checks that a fresh backup ZIP exists in backups/ within the last 26 hours.
If not, sends a WhatsApp alert to Hillel via Green API.
Runs daily at 09:00 via Windows Scheduled Task BeitVmetaplim-BackupHealthCheck.
This is independent of backup-supabase.py — it catches the case where the
backup script crashes before it can self-report.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta
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

# Secrets come from .env.local (gitignored), same as backup-supabase.py.
# No hardcoded fallback: a missing token must fail loudly, not ship in the repo.
GREEN_API_URL = os.environ.get("GREEN_API_URL", "https://7103.api.greenapi.com")
GREEN_API_INSTANCE = os.environ["GREEN_API_INSTANCE"]
GREEN_API_TOKEN = os.environ["GREEN_API_TOKEN"]
ALERT_PHONE = os.environ.get("ALERT_PHONE", "972549116092")

# Backup root moved OFF OneDrive 2026-06-03 (patient PII must not sync to cloud).
# Must match BACKUP_ROOT in backup-supabase.py.
BACKUP_ROOT = Path(r"C:\AtomicBusiness\backups\beit-vmetaplim-backups")
MAX_AGE_HOURS = 26


def send_whatsapp(message):
    url = f"{GREEN_API_URL}/waInstance{GREEN_API_INSTANCE}/sendMessage/{GREEN_API_TOKEN}"
    body = json.dumps({"chatId": f"{ALERT_PHONE}@c.us", "message": message}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=15).read()


def main():
    if not BACKUP_ROOT.exists():
        send_whatsapp(f"🚨 watchdog: תיקיית הגיבויים לא קיימת — {BACKUP_ROOT}")
        sys.exit(2)

    zips = sorted(BACKUP_ROOT.glob("backup_*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not zips:
        send_whatsapp("🚨 watchdog: אין אף קובץ גיבוי בתיקייה. הגיבוי האוטומטי לא רץ או נכשל.")
        sys.exit(2)

    newest = zips[0]
    age = datetime.now() - datetime.fromtimestamp(newest.stat().st_mtime)
    if age > timedelta(hours=MAX_AGE_HOURS):
        last_str = datetime.fromtimestamp(newest.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
        hours = int(age.total_seconds() // 3600)
        send_whatsapp(
            f"🚨 watchdog: אין גיבוי טרי ב-{MAX_AGE_HOURS} השעות האחרונות.\n"
            f"גיבוי אחרון: {last_str} (לפני {hours} שעות)\n"
            f"בדקי את BeitVmetaplim-DailyBackup ב-Task Scheduler."
        )
        sys.exit(1)

    print(f"OK — newest backup: {newest.name} ({int(age.total_seconds() // 3600)}h old)")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            send_whatsapp(f"🚨 watchdog crashed: {type(e).__name__}: {str(e)[:150]}")
        except Exception:
            pass
        sys.exit(3)
