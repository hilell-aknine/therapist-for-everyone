"""
Verify Phase 2 — attribution triggers + RPC v4.

Runs the 5 verification queries from the plan via Supabase service-role REST
and reports results to stdout. Cleans up its own test row.
"""
import os
import sys
import json
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
    "Prefer": "return=representation",
}


def req(method: str, path: str, body=None, params=None, extra_headers=None):
    url = f"{URL}/rest/v1{path}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    r = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def section(title):
    print(f"\n{'='*70}\n{title}\n{'='*70}")


# ─── Test 1: Trigger fires on synthetic portal_questionnaires INSERT ────────
section("Test 1: portal_questionnaires AFTER INSERT trigger fires")

# enqueue_qualified_lead trigger requires NEW.user_id to be non-NULL (bug in
# its v_profile RECORD handling) — find an admin profile to attach the test row
# to. We'll delete our portal_q + attribution row but NEVER touch the profile.
status, profiles = req(
    "GET",
    "/profiles",
    params={"role": "eq.admin", "select": "id,email", "limit": "1"},
)
if status >= 300 or not profiles:
    print(f"FAIL: couldn't find admin profile for test (status={status}): {profiles}")
    sys.exit(1)
admin_id = profiles[0]["id"]
print(f"  Using admin profile id={admin_id} ({profiles[0]['email']})")

test_phone = f"+97250000{int(time.time()) % 10000:04d}"
print(f"  Inserting test portal_q row with phone={test_phone}")

status, body = req(
    "POST",
    "/portal_questionnaires",
    body={
        "user_id": admin_id,
        "phone": test_phone,
        "utm_source": "facebook",
        "utm_medium": "paid_social",
        "utm_campaign": "phase2_test",
        "how_found": "Instagram",
        "status": "new",
    },
)
if status >= 300:
    print(f"FAIL: insert returned {status}: {body}")
    sys.exit(1)

inserted_id = body[0]["id"]
print(f"  Inserted portal_q row id={inserted_id}")

# ─── Test 2: Verify lead_attribution row was auto-created ───────────────────
section("Test 2: lead_attribution row was auto-created by trigger")

status, body = req(
    "GET",
    "/lead_attribution",
    params={
        "linked_table": "eq.portal_questionnaires",
        "linked_id": f"eq.{inserted_id}",
        "select": "linked_id,last_utm_source,last_utm_medium,last_utm_campaign,self_reported_source,phone",
    },
)
print(f"  Status={status} Result={json.dumps(body, ensure_ascii=False)}")
if status >= 300 or not body:
    print("FAIL: no attribution row found")
elif (
    body[0]["last_utm_source"] != "facebook"
    or body[0]["last_utm_medium"] != "paid_social"
    or body[0]["last_utm_campaign"] != "phase2_test"
    or body[0]["self_reported_source"] != "Instagram"
):
    print(f"FAIL: attribution row has wrong values: {body[0]}")
else:
    print("  PASS: trigger created attribution row with all expected fields")

# ─── Cleanup test rows ──────────────────────────────────────────────────────
section("Cleanup")

s1, _ = req("DELETE", "/lead_attribution", params={"linked_table": "eq.portal_questionnaires", "linked_id": f"eq.{inserted_id}"})
s2, _ = req("DELETE", "/portal_questionnaires", params={"id": f"eq.{inserted_id}"})
# Also delete the contact_request that was auto-created by the existing
# trg_questionnaire_to_contact_request trigger (and its attribution row).
s3, contacts = req("GET", "/contact_requests", params={"phone": f"eq.{test_phone}", "select": "id"})
if isinstance(contacts, list):
    for c in contacts:
        req("DELETE", "/lead_attribution", params={"linked_table": "eq.contact_requests", "linked_id": f"eq.{c['id']}"})
        req("DELETE", "/contact_requests", params={"id": f"eq.{c['id']}"})
    print(f"  Deleted lead_attribution (status={s1}), portal_questionnaires (status={s2}), {len(contacts)} contact_request(s)")
else:
    print(f"  Deleted lead_attribution (status={s1}), portal_questionnaires (status={s2})")

# ─── Test 3: Gap-window backfill — count missing attribution rows post-29.4 ─
section("Test 3: Gap-window backfill — should be 0 leads missing attribution after 2026-04-29")

# Use RPC if available, otherwise count manually
status, body = req(
    "GET",
    "/portal_questionnaires",
    params={
        "select": "id,utm_source,how_found,created_at",
        "created_at": "gt.2026-04-29",
        "or": "(utm_source.not.is.null,how_found.not.is.null)",
    },
)
print(f"  Found {len(body) if isinstance(body, list) else 0} portal_q rows since 29.4 with source data")

if isinstance(body, list) and body:
    ids = [r["id"] for r in body]
    # Check which ones have attribution
    s2, attr = req(
        "GET",
        "/lead_attribution",
        params={
            "select": "linked_id",
            "linked_table": "eq.portal_questionnaires",
            "linked_id": f"in.({','.join(ids)})",
        },
    )
    have_attr = {r["linked_id"] for r in attr} if isinstance(attr, list) else set()
    missing = [i for i in ids if i not in have_attr]
    print(f"  Of those, {len(have_attr)} have attribution rows, {len(missing)} missing")
    if missing:
        print(f"  FAIL: missing attribution for ids: {missing[:5]}{'...' if len(missing)>5 else ''}")
    else:
        print("  PASS: every post-29.4 portal_q with source data has attribution")

# ─── Test 4: RPC v4 returns new utm_medium + utm_campaign columns ──────────
section("Test 4: admin_get_all_leads() v4 returns utm_medium + utm_campaign")

# RPC needs admin auth — test via service role JWT bypass not possible here
# Instead, peek at column names via PostgREST OpenAPI definition
status, body = req(
    "POST",
    "/rpc/admin_get_all_leads",
    body={},
    extra_headers={"Prefer": "return=representation"},
)
if status == 401 or status == 403:
    print("  Skipped: RPC requires admin role (service-role can't impersonate auth.uid())")
    print("  Manual verification: log in as admin and check Network tab in admin.html")
elif status >= 300:
    print(f"  Status={status} Body={body}")
elif isinstance(body, list) and body:
    sample = body[0]
    has_medium = "utm_medium" in sample
    has_campaign = "utm_campaign" in sample
    print(f"  utm_medium present: {has_medium}, utm_campaign present: {has_campaign}")
    # Find a row that actually has medium populated
    with_med = [r for r in body if r.get("utm_medium")]
    print(f"  Total rows: {len(body)}, rows with utm_medium populated: {len(with_med)}")
    if with_med:
        print(f"  Sample row: utm_source={with_med[0].get('utm_source')}, "
              f"utm_medium={with_med[0].get('utm_medium')}, "
              f"utm_campaign={with_med[0].get('utm_campaign')}")
    print("  PASS" if has_medium and has_campaign else "FAIL: missing columns in RPC output")
else:
    print(f"  Empty result. status={status}")

# ─── Test 5: Pre-29.4 backfill is intact (sanity check) ─────────────────────
section("Test 5: Sanity check — count portal_q attribution rows total")

status, body = req(
    "GET",
    "/lead_attribution",
    params={
        "select": "linked_id",
        "linked_table": "eq.portal_questionnaires",
    },
    extra_headers={"Range-Unit": "items", "Prefer": "count=exact"},
)
print(f"  portal_questionnaires attribution rows: status={status}, sample_size={len(body) if isinstance(body, list) else 'n/a'}")

print("\n" + "="*70)
print("VERIFICATION COMPLETE")
print("="*70)
