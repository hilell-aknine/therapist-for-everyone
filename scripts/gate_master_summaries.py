# -*- coding: utf-8 -*-
"""
Move the master-summary page bodies into the private `workbooks` bucket and
replace each page with an empty shell that fetches its body through a signed URL.

Before: the server returned the full paid summary to any anonymous GET; the
`paid-gate.js` script only hid it with CSS afterwards.
After: an anonymous GET returns a shell with no course content.

Idempotent — safe to re-run. Backs each page up to scripts/_summaries_backup/.
Run once, then `git push` (Vercel redeploys the shells).
"""
import os
import re
import sys
import pathlib
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "pages" / "summaries-master"
BACKUP = ROOT / "scripts" / "_summaries_backup"
ENV = pathlib.Path(r"C:\Users\saraa\.secrets\onedrive\beit-vmetaplim_.env.local")

BUCKET = "workbooks"
PREFIX = "summaries-master/"


def load_env():
    creds = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$", line)
        if m:
            creds[m.group(1)] = m.group(2).strip()
    url, key = creds.get("SUPABASE_URL"), creds.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY")
    return url.rstrip("/"), key


SHELL = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <!-- Paid content. The body is NOT in this file: it is fetched from the private
         `workbooks` bucket via a signed URL that Storage RLS grants only to
         paid_customer/admin. An anonymous request gets this empty shell. -->
    <style id="pg-hide">html{{visibility:hidden!important}}</style>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="../../js/supabase-config.js"></script>
    <script src="../../js/paid-content.js" defer></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>{title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script>(function(){{var t=localStorage.getItem('beit-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}})();</script>
    <link rel="stylesheet" href="../../css/theme.css">
    <script src="../../js/theme-toggle.js" defer></script>
    <link rel="stylesheet" href="../../css/summaries-master.css">
</head>
<body>
    <div id="pc-content"></div>
</body>
</html>
"""

BODY_RE = re.compile(r"<body[^>]*>(.*)</body>", re.S | re.I)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)
SHELL_MARK = "paid-content.js"


def main():
    base, key = load_env()
    BACKUP.mkdir(parents=True, exist_ok=True)
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    pages = sorted(PAGES.glob("*.html"))
    if not pages:
        sys.exit(f"No pages under {PAGES}")

    for page in pages:
        html = page.read_text(encoding="utf-8")

        if SHELL_MARK in html:
            print(f"skip   {page.name} (already a shell)")
            continue

        body = BODY_RE.search(html)
        title = TITLE_RE.search(html)
        if not body:
            print(f"WARN   {page.name} has no <body> — left untouched")
            continue

        fragment = body.group(1).strip()
        (BACKUP / page.name).write_text(html, encoding="utf-8")

        # Upload the body to the private bucket (service key bypasses RLS).
        up = requests.post(
            f"{base}/storage/v1/object/{BUCKET}/{PREFIX}{page.name}",
            headers={**headers, "Content-Type": "text/html; charset=utf-8",
                     "x-upsert": "true"},
            data=fragment.encode("utf-8"),
            timeout=30,
        )
        if up.status_code not in (200, 201):
            print(f"FAIL   {page.name} upload {up.status_code}: {up.text[:200]}")
            continue

        page.write_text(
            SHELL.format(title=title.group(1).strip() if title else "בית המטפלים"),
            encoding="utf-8",
        )
        print(f"gated  {page.name} ({len(fragment):,} chars -> {BUCKET}/{PREFIX}{page.name})")

    print("\nDone. Commit + push to redeploy the shells.")


if __name__ == "__main__":
    main()
