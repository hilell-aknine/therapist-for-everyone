# One-shot: update the training_cta popup_configs row via PostgREST (service_role) + verify.
# Change 2026-06-17 (per Hillel): fire after EVERY completed lesson (min_lessons 1),
# loosen the cap, and point the CTA at the in-portal Master sales page (#master-sales)
# instead of straight to Cardcom. Surgical single-row UPSERT — does NOT touch other rows.
import re
import json
import urllib.request

BASE = "https://eimcudmlfjlyxjyrdcgc.supabase.co/rest/v1/popup_configs"

key = None
with open(r"C:\Users\saraa\.secrets\onedrive\beit-vmetaplim_.env.local", encoding="utf-8") as f:
    for line in f:
        m = re.match(r"\s*SUPABASE_SERVICE_(?:ROLE_)?KEY\s*=\s*(\S+)", line)
        if m:
            key = m.group(1).strip().strip('"').strip("'")
assert key, "no service key found"

HEADERS = {
    "apikey": key,
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
}

row = {
    "popup_id": "training_cta",
    "title": "מוכן להעמיק את ההתפתחות האישית שלך?",
    "message": "סיימת עוד שיעור — כל הכבוד. תכנית המאסטר לוקחת אותך עמוק לתוך הכלים, אל השינוי האמיתי בחיים שלך, בקשרים, ובראש.",
    "cta_text": "לפרטים על תכנית המאסטר",
    "cta_link": "#master-sales",
    "category": "engagement",
    "priority": 3,
    "is_active": True,
    "status": "live",
    "target_audience": "free_user",
    "trigger_event": "lesson_complete",
    "trigger_min_lessons": 1,
    "max_per_day": 10,
    "cooldown_minutes": 1,
    "description_he": "פופאפ שדרוג למאסטר (התפתחות אישית), נפתח אחרי כל שיעור שהושלם למשתמש חינמי, מוביל לדף המכירה של המאסטר בתוך הפורטל.",
    "admin_notes": "changed 2026-06-17: fire every lesson (min_lessons 1, cap loosened) + CTA -> in-portal sales page instead of Cardcom",
}

req = urllib.request.Request(
    BASE + "?on_conflict=popup_id",
    data=json.dumps([row]).encode(),
    headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    print("UPSERT:", r.status)

req2 = urllib.request.Request(
    BASE + "?popup_id=eq.training_cta&select=popup_id,status,is_active,target_audience,trigger_event,trigger_min_lessons,max_per_day,cooldown_minutes,cta_link",
    headers=HEADERS,
)
with urllib.request.urlopen(req2) as r:
    print("VERIFY:", r.read().decode())
