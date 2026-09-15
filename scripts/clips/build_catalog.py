"""Write the approved clips into js/clips-catalog.js.

Only rows that BOTH passed the double Gemini judge AND carry "approved": true are
written. The approval flag is set by hand after Hillel goes through the table -- a clip
that a model liked is a candidate, not a decision. That order is the whole reason this
pipeline exists: the page this replaces shipped 49 clips nobody had checked and 44 of
them played the wrong video.

The clip id is derived from the video and the start second, so rebuilding the catalog
from the same approved set always produces the same ids -- and the ids are what
course_progress rows are keyed on. Change this scheme and every learner's clip progress
is orphaned.

Usage:
    python build_catalog.py work/m1l4.judged.json work/m3l5.judged.json
    python build_catalog.py ... --include-unapproved   # local preview only
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CATALOG = Path(__file__).resolve().parents[2] / "js" / "clips-catalog.js"
BEGIN, END = "/* CLIPS:BEGIN", "/* CLIPS:END */"


def clip_id(row):
    return "c-m{}l{}-{:04d}".format(row["module"], row["lessonIdx"] + 1, int(round(row["start"])))


def js(value):
    """JSON is a subset of JS object literal syntax for these values, so this is safe."""
    return json.dumps(value, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("judged", nargs="+")
    # --preview writes EVERY candidate, judged or not, approved or not. It exists so the
    # feed can be driven in a real browser before the judge has finished -- checking that
    # a clip actually stops on its end second is a mechanical test that does not need the
    # content to be good. Never build the deployed catalog with it.
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()

    rows, skipped = [], []
    for path in a.judged:
        for r in json.load(open(path, encoding="utf-8")):
            if a.preview:
                rows.append(r)
                continue
            if not r.get("audio_pass"):
                skipped.append((r.get("title", "?"), r.get("audio_reason", "נפסל בשיפוט")))
                continue
            if not r.get("approved"):
                skipped.append((r.get("title", "?"), "ממתין לאישור הלל"))
                continue
            rows.append(r)

    rows.sort(key=lambda r: (r["module"], r["lessonIdx"], r["start"]))

    lines = []
    for i, r in enumerate(rows):
        lines.append(
            "    { id: %s, videoId: %s,\n"
            "      start: %s, end: %s,\n"
            "      title: %s,\n"
            "      hook: %s,\n"
            "      topic: %s, module: %d, lessonIdx: %d, order: %d }"
            # Tenths, not whole seconds. The pause a boundary has to land inside can be
            # 0.22s long — rounding to the nearest second walks straight back into speech.
            % (js(clip_id(r)), js(r["videoId"]),
               round(float(r["start"]), 1), round(float(r["end"]), 1),
               js(r["title"]), js(r.get("hook", "")),
               js(r["topic"]), r["module"], r["lessonIdx"], i + 1)
        )

    src = CATALOG.read_text(encoding="utf-8")
    # A preview build must announce itself INSIDE the artefact. A generated file that
    # looks identical whether or not a human signed off is how "written" gets mistaken
    # for "approved".
    banner = ("  /* ⚠️ PREVIEW BUILD — contains clips Hillel has NOT approved. Rebuild without\n"
              "     --preview before this ships. */\n" if a.preview else "")
    block = ("  /* CLIPS:BEGIN — everything between these markers is rewritten by build_catalog.py */\n"
             + banner
             + "  var CLIPS = [\n" + ",\n".join(lines) + ("\n" if lines else "") + "  ];\n  " + END)
    new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, src, flags=re.S)
    if new == src and lines:
        print("שגיאה: לא נמצאו הסמנים CLIPS:BEGIN / CLIPS:END בקובץ הקטלוג")
        return 1
    CATALOG.write_text(new, encoding="utf-8")

    print(f"נכתבו {len(rows)} קטעים ל-{CATALOG.name}")
    for r in rows:
        secs = int(round(r["end"] - r["start"]))
        print(f"  {clip_id(r):<18} {secs//60}:{secs%60:02d}  {r['title']}")
    if skipped:
        print(f"\nלא נכנסו ({len(skipped)}):")
        for t, why in skipped:
            print(f"  {t[:44]:<44} {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
