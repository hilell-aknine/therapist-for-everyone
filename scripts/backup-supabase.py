#!/usr/bin/env python3
"""
Supabase Backup Script — Beit V'Metaplim
Backs up all tables + storage buckets to local folder with timestamps.
Sends email report via Gmail API + uploads ZIP to Google Drive.
Run daily via cron or manually: py scripts/backup-supabase.py
"""

import json
import os
import sys
import shutil
import traceback
import zipfile
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
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

# ─── Config (secrets loaded from .env.local — gitignored) ───
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://eimcudmlfjlyxjyrdcgc.supabase.co")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

GMAIL_API_URL = os.environ["GMAIL_API_URL"]
GMAIL_API_TOKEN = os.environ["GMAIL_API_TOKEN"]
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "htjewelry.a474@gmail.com")

# WhatsApp failure alert (Green API — crm-bot instance)
GREEN_API_URL = os.environ.get("GREEN_API_URL", "https://7103.api.greenapi.com")
GREEN_API_INSTANCE = os.environ["GREEN_API_INSTANCE"]
GREEN_API_TOKEN = os.environ["GREEN_API_TOKEN"]
ALERT_PHONE = os.environ.get("ALERT_PHONE", "972549116092")

TABLES = [
    # Core CRM
    "profiles",
    "contact_requests",
    "legal_consents",
    # Learning portal
    "course_progress",
    "user_notes",
    "ai_chat_usage",
    "lessons",
    "portal_questionnaires",
    # Referrals / ambassadors
    "referrals",
    # CRM bot
    "crm_bot_phones",
    "crm_bot_access",
    "bot_utm_configs",
    "bot_automation_configs",
    "crm_activity_log",
    # Popups full system
    "popup_configs",
    "popup_events",
    "popup_dismissals",
    "popup_insights_log",
    # Game
    "nlp_game_leaderboard",
    "nlp_game_players",
    # Archived 2026-05-17 (renamed via migration 20260517100000_archive_dead_tables.sql).
    # Kept in backup so the rows remain captured. Move to a separate archive bucket later.
    "_archive_patients",
    "_archive_therapists",
    "_archive_appointments",
    "_archive_subscriptions",
    "_archive_signed_contracts",
    "_archive_sales_leads",
    "_archive_questionnaire_submissions",
    "_archive_crm_notes",
    "_archive_crm_payments",
    "_archive_ad_campaigns",
    "_archive_community_categories",
    "_archive_community_members",
    "_archive_community_posts",
    "_archive_community_comments",
    "_archive_community_likes",
    "_archive_matches",
]

STORAGE_BUCKETS = [
    "workbooks",
    "contracts",
    "therapist-documents",
    "community-images",
    "legal-docs",
    "automation-assets",
    "ig-publishing",
]

# Backup root — inside OneDrive for auto-sync
BACKUP_ROOT = Path.home() / "OneDrive" / "שולחן העבודה" / "beit-vmetaplim" / "backups"

# Keep last N backups
MAX_BACKUPS = 30

# Google Drive folder name for backups
DRIVE_FOLDER_NAME = "beit-vmetaplim-backups"


def send_whatsapp_alert(message):
    """Send a WhatsApp alert to Hillel via Green API. Best-effort, never raises."""
    try:
        url = f"{GREEN_API_URL}/waInstance{GREEN_API_INSTANCE}/sendMessage/{GREEN_API_TOKEN}"
        body = json.dumps({
            "chatId": f"{ALERT_PHONE}@c.us",
            "message": message,
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
        })
        urllib.request.urlopen(req, timeout=15).read()
        return True
    except Exception as e:
        print(f"  ⚠ WhatsApp alert failed: {e}")
        return False


def append_run_log(status, details):
    """Append one line per run to backups/backup-runs.log."""
    try:
        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
        log_path = BACKUP_ROOT / "backup-runs.log"
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"{ts}\t{status}\t{details}\n"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        print(f"  ⚠ Run log write failed: {e}")


def api_request(url, headers=None):
    """Make GET request and return parsed JSON."""
    if headers is None:
        headers = {}
    headers.update({
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Accept-Profile": "public",
    })
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        print(f"  ERROR {e.code}: {body[:200]}")
        return None


def backup_table(table_name, backup_dir):
    """Download all rows from a table and save as JSON. Returns row count or -1 on failure."""
    print(f"  📋 {table_name}...", end=" ", flush=True)

    all_rows = []
    offset = 0
    page_size = 1000

    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table_name}?select=*&limit={page_size}&offset={offset}"
        data = api_request(url)
        if data is None:
            print("FAILED")
            return -1
        all_rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size

    filepath = backup_dir / f"{table_name}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2, default=str)

    print(f"{len(all_rows)} rows")
    return len(all_rows)


def backup_storage_bucket(bucket_name, backup_dir):
    """List and download all files from a storage bucket."""
    print(f"  📦 bucket:{bucket_name}...", end=" ", flush=True)

    url = f"{SUPABASE_URL}/storage/v1/object/list/{bucket_name}"
    req = urllib.request.Request(
        url,
        data=json.dumps({"prefix": "", "limit": 1000}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "apikey": SERVICE_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req)
        files = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"FAILED ({e.code})")
        return 0

    bucket_dir = backup_dir / f"storage_{bucket_name}"
    bucket_dir.mkdir(exist_ok=True)

    count = 0
    for file_info in files:
        name = file_info.get("name", "")
        if not name or file_info.get("id") is None:
            continue

        dl_url = f"{SUPABASE_URL}/storage/v1/object/{bucket_name}/{name}"
        dl_req = urllib.request.Request(dl_url, headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "apikey": SERVICE_KEY,
        })
        try:
            dl_resp = urllib.request.urlopen(dl_req)
            file_path = bucket_dir / name
            with open(file_path, "wb") as f:
                f.write(dl_resp.read())
            count += 1
        except urllib.error.HTTPError:
            print(f"\n    ⚠ Failed: {name}", end="")

    print(f"{count} files")
    return count


def backup_auth_users(backup_dir):
    """Backup auth.users via admin API."""
    print("  👤 auth.users...", end=" ", flush=True)

    all_users = []
    page = 1

    while True:
        url = f"{SUPABASE_URL}/auth/v1/admin/users?page={page}&per_page=50"
        data = api_request(url)
        if data is None:
            print("FAILED")
            return 0
        users = data.get("users", [])
        if not users:
            break
        all_users.extend(users)
        page += 1

    filepath = backup_dir / "auth_users.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(all_users, f, ensure_ascii=False, indent=2, default=str)

    print(f"{len(all_users)} users")
    return len(all_users)


def create_zip(backup_dir, timestamp):
    """Create a ZIP archive of the backup folder."""
    zip_path = BACKUP_ROOT / f"backup_{timestamp}.zip"
    print(f"\n[ZIP] Creating {zip_path.name}...", end=" ", flush=True)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in backup_dir.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(backup_dir))

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"{size_mb:.1f} MB")
    return zip_path


def upload_to_drive(zip_path):
    """Upload ZIP to Google Drive via GWS CLI."""
    gws = Path.home() / "tools" / "gws" / "gws.exe"
    if not gws.exists():
        print("  ⚠ GWS CLI not found, skipping Drive upload")
        return False

    print(f"\n[Drive] Uploading {zip_path.name}...", end=" ", flush=True)

    import subprocess

    # Find or create backup folder
    result = subprocess.run(
        [str(gws), "drive", "files", "list", "--params",
         json.dumps({"q": f"name = '{DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", "pageSize": 1})],
        capture_output=True, text=True, encoding="utf-8"
    )

    folder_id = None
    try:
        data = json.loads(result.stdout)
        files = data.get("files", [])
        if files:
            folder_id = files[0]["id"]
    except (json.JSONDecodeError, KeyError):
        pass

    if not folder_id:
        # Create folder
        result = subprocess.run(
            [str(gws), "drive", "files", "create", "--json",
             json.dumps({"name": DRIVE_FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"})],
            capture_output=True, text=True, encoding="utf-8"
        )
        try:
            data = json.loads(result.stdout)
            folder_id = data.get("id")
        except (json.JSONDecodeError, KeyError):
            print("FAILED (couldn't create folder)")
            return False

    if not folder_id:
        print("FAILED (no folder)")
        return False

    # Upload file
    result = subprocess.run(
        [str(gws), "drive", "files", "create",
         "--json", json.dumps({"name": zip_path.name, "parents": [folder_id]}),
         "--upload", str(zip_path)],
        capture_output=True, text=True, encoding="utf-8"
    )

    try:
        data = json.loads(result.stdout)
        if data.get("id"):
            print(f"OK (id: {data['id'][:12]}...)")
            return True
        elif data.get("error"):
            print(f"FAILED ({data['error'].get('message', 'unknown')})")
            return False
    except (json.JSONDecodeError, KeyError):
        pass

    print("FAILED")
    return False


def send_email_report(timestamp, total_rows, total_files, table_details, drive_ok):
    """Send backup report via Gmail Apps Script API."""
    print(f"\n[Email] Sending report to {NOTIFY_EMAIL}...", end=" ", flush=True)

    # Build table rows for the report
    table_html = ""
    for name, count in table_details.items():
        color = "#28a745" if count > 0 else ("#dc3545" if count == -1 else "#6c757d")
        status = f"{count} rows" if count >= 0 else "FAILED"
        table_html += f"<tr><td style='padding:4px 12px;border-bottom:1px solid #eee;'>{name}</td><td style='padding:4px 12px;border-bottom:1px solid #eee;color:{color};font-weight:600;'>{status}</td></tr>"

    drive_status = "✅ הועלה ל-Google Drive" if drive_ok else "⚠️ לא הועלה ל-Drive (GWS לא מחובר)"

    # Keep HTML compact to fit URL length limits
    lines = "\n".join([f"{name}: {count} rows" if count >= 0 else f"{name}: FAILED" for name, count in table_details.items()])
    html_body = f"<div dir='rtl' style='font-family:Heebo,sans-serif;'><h2>גיבוי בית המטפלים — {timestamp}</h2><p><b>{total_rows}</b> שורות | <b>{total_files}</b> קבצים</p><p>{drive_status}</p><pre>{lines}</pre></div>"

    params = urllib.parse.urlencode({
        "action": "sendEmail",
        "token": GMAIL_API_TOKEN,
        "to": NOTIFY_EMAIL,
        "subject": f"🔒 גיבוי בית המטפלים — {timestamp} — {total_rows} שורות",
        "htmlBody": html_body,
    })

    url = f"{GMAIL_API_URL}?{params}"
    req = urllib.request.Request(url)

    try:
        resp = urllib.request.urlopen(req)
        result = resp.read().decode("utf-8")
        if "success" in result.lower() or resp.status == 200:
            print("OK")
            return True
        else:
            print(f"FAILED ({result[:100]})")
            return False
    except Exception as e:
        print(f"FAILED ({e})")
        return False


def cleanup_old_backups():
    """Keep only the last MAX_BACKUPS backup folders."""
    if not BACKUP_ROOT.exists():
        return

    # Clean folders
    dirs = sorted([d for d in BACKUP_ROOT.iterdir() if d.is_dir()], reverse=True)
    for old_dir in dirs[MAX_BACKUPS:]:
        shutil.rmtree(old_dir)
        print(f"  🗑 Deleted old backup: {old_dir.name}")

    # Clean old ZIP files too
    zips = sorted([f for f in BACKUP_ROOT.glob("backup_*.zip")], key=lambda f: f.stat().st_mtime, reverse=True)
    for old_zip in zips[MAX_BACKUPS:]:
        old_zip.unlink()
        print(f"  🗑 Deleted old ZIP: {old_zip.name}")


def main():
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    backup_dir = BACKUP_ROOT / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)

    print(f"{'='*50}")
    print(f"🔒 Supabase Backup — {timestamp}")
    print(f"📁 Saving to: {backup_dir}")
    print(f"{'='*50}")

    total_rows = 0
    total_files = 0
    table_details = {}
    failed_tables = []

    # 1. Auth users
    print("\n[1/5] Auth Users")
    try:
        auth_count = backup_auth_users(backup_dir)
    except Exception as e:
        print(f"  ⚠ auth.users backup failed: {e}")
        auth_count = -1
    if auth_count > 0:
        total_rows += auth_count
    table_details["auth_users"] = auth_count
    if auth_count < 0:
        failed_tables.append("auth_users")

    # 2. Database tables
    print(f"\n[2/5] Database Tables ({len(TABLES)})")
    for table in TABLES:
        try:
            count = backup_table(table, backup_dir)
        except Exception as e:
            print(f"  ⚠ {table} crashed: {e}")
            count = -1
        if count >= 0:
            total_rows += count
        table_details[table] = count
        if count < 0:
            failed_tables.append(table)

    # 3. Storage buckets
    print(f"\n[3/5] Storage Buckets ({len(STORAGE_BUCKETS)})")
    for bucket in STORAGE_BUCKETS:
        total_files += backup_storage_bucket(bucket, backup_dir)

    # 4. Write summary
    summary = {
        "timestamp": timestamp,
        "tables": TABLES,
        "buckets": STORAGE_BUCKETS,
        "total_rows": total_rows,
        "total_files": total_files,
        "table_details": table_details,
    }
    with open(backup_dir / "_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # 5. Create ZIP
    zip_path = create_zip(backup_dir, timestamp)

    # 6. Upload to Google Drive
    print("\n[4/5] Google Drive Upload")
    drive_ok = upload_to_drive(zip_path)

    # 7. Send email report
    print("\n[5/5] Email Report")
    send_email_report(timestamp, total_rows, total_files, table_details, drive_ok)

    # 8. Cleanup old backups
    print(f"\n[Cleanup] Keeping last {MAX_BACKUPS} backups")
    cleanup_old_backups()

    print(f"\n{'='*50}")
    print(f"✅ Backup complete: {total_rows} rows + {total_files} files")
    print(f"📁 Local: {backup_dir}")
    print(f"☁️  Drive: {'OK' if drive_ok else 'Skipped'}")
    print(f"📧 Email: {NOTIFY_EMAIL}")
    if failed_tables:
        print(f"⚠️  Tables failed: {', '.join(failed_tables)}")
    print(f"{'='*50}")

    # Run log + partial-failure alert
    ok_count = len(TABLES) + 1 - len(failed_tables)  # +1 for auth_users
    total_count = len(TABLES) + 1
    if failed_tables:
        append_run_log("PARTIAL", f"{ok_count}/{total_count} tables OK | failed: {','.join(failed_tables)} | zip: {zip_path.name}")
        send_whatsapp_alert(
            f"⚠️ גיבוי בית המטפלים הצליח חלקית ({timestamp})\n"
            f"{ok_count}/{total_count} טבלאות נשמרו.\n"
            f"נכשלו: {', '.join(failed_tables)}\n"
            f"ZIP: {zip_path.name}"
        )
    else:
        append_run_log("OK", f"{ok_count}/{total_count} tables | {total_rows} rows | zip: {zip_path.name}")


def _safe_stdout():
    """Reconfigure stdout to UTF-8 if possible (fails silently under Task Scheduler)."""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


if __name__ == "__main__":
    _safe_stdout()
    try:
        main()
    except Exception as e:
        tb = traceback.format_exc()
        print(f"\n❌ FATAL: {e}\n{tb}")
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
        append_run_log("FAIL", f"fatal: {type(e).__name__}: {str(e)[:200]}")
        send_whatsapp_alert(
            f"🚨 גיבוי בית המטפלים נכשל לחלוטין ({ts})\n"
            f"{type(e).__name__}: {str(e)[:200]}"
        )
        sys.exit(1)
