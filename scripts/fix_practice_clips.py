# -*- coding: utf-8 -*-
"""
Quarantine the mislabeled practice clips.

Verified 2026-07-12 against YouTube oEmbed: only 5 of the 49 clip IDs actually
play the video their title promises. The other 44 point at full master lecture
chapters (e.g. "תרגול זוגות - סוויש" plays "מפגש 9 · סוויש סיכום ושאלות"), so a
paying customer clicking a practice drill gets a 30-minute lecture instead.

  master-practice.html   -> id becomes 'PLACEHOLDER' (isRenderable() already hides
                            these and the header counts adjust automatically);
                            the wrong id is kept in wrongId for future remapping.
  course-library-v2.html -> the mirror list has no placeholder filter, so the 44
                            wrong rows are removed outright.

Re-run after the real clips are uploaded and remapped. Idempotent.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRACTICE = ROOT / "pages" / "master-practice.html"
PORTAL = ROOT / "pages" / "course-library-v2.html"

# The only IDs whose real YouTube title matches the title we show.
VERIFIED = {
    "hf5ctSNgAk4",  # תרגול זוגות - שיבוש, סוויש ודיקנס
    "Aims2i2UA2E",  # הדגמת שיבוש אסטרטגיה - דיבור עצמי שלילי
    "An-Tk5YL79o",  # הדגמת מחולל התנהגות - קימה בבוקר
    "klmJ4OSBGos",  # הנחיות - שלבי מחולל ההתנהגות
    "12MZ5SXzPcg",  # תרגול זוגות - מחולל התנהגות
}


def fix_practice():
    html = PRACTICE.read_text(encoding="utf-8")
    hits = {"kept": 0, "quarantined": 0}

    def sub(m):
        vid = m.group(1)
        # 'PLACEHOLDER' is itself 11 chars, so an already-quarantined clip matches
        # the ID pattern. Leave it alone or a re-run would double-wrap it.
        if vid == "PLACEHOLDER":
            hits["quarantined"] += 1
            return m.group(0)
        if vid in VERIFIED:
            hits["kept"] += 1
            return m.group(0)
        hits["quarantined"] += 1
        return f"{{ id: 'PLACEHOLDER', wrongId: '{vid}',"

    out = re.sub(r"\{\s*id:\s*'([A-Za-z0-9_\-]{11})',", sub, html)
    PRACTICE.write_text(out, encoding="utf-8")
    print(f"master-practice.html   kept {hits['kept']}, quarantined {hits['quarantined']}")


def fix_portal():
    lines = PORTAL.read_text(encoding="utf-8").splitlines(keepends=True)
    out, removed, kept = [], 0, 0
    row = re.compile(r"^\s*\{\s*id:'([A-Za-z0-9_\-]{11})',\s*t:'.*\},?\s*$")
    for line in lines:
        m = row.match(line)
        if not m:
            out.append(line)
            continue
        if m.group(1) in VERIFIED:
            kept += 1
            out.append(line)
        else:
            removed += 1
    PORTAL.write_text("".join(out), encoding="utf-8")
    print(f"course-library-v2.html kept {kept}, removed {removed}")


if __name__ == "__main__":
    fix_practice()
    fix_portal()
