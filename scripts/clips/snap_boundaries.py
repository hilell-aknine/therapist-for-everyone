"""Move each clip boundary onto a real pause in the audio -- in one direction only.

Reuses the measurement from scripts/master_audit/snap_to_silence.py, which is already
proven on this course: silence is defined RELATIVE to the speaker's own level, because
the room has constant background noise from air conditioning and forty people, so an
absolute dB threshold finds nothing.

What is different here, and it is the whole point:

    a clip start may only move EARLIER, a clip end may only move LATER.

The chapter cutter snaps symmetrically because a chapter boundary is shared -- whatever
one chapter loses the next one gains. A clip is not shared. Symmetric snapping on a
120-second clip eats the first word of the idea or the last word of the punchline, and
the documented failure in lesson-to-playlist was exactly that: "snapping to the merely
nearest silence cut five seconds of speech off the first clip in testing."

So the clip only ever grows into the surrounding pause. Worst case it carries a little
extra air, which is inaudible. It can never swallow speech.

Usage:
    python snap_boundaries.py candidates.json work/m1l4.mp3 --out snapped.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "master_audit"))
from snap_to_silence import decode, silences  # noqa: E402  (proven measurement, reused as-is)

sys.stdout.reconfigure(encoding="utf-8")

PAD = 0.35          # air kept on each side after landing in the pause
SEARCH = 2.5        # how far we are willing to travel to find a pause
MIN_LEN, MAX_LEN = 60.0, 160.0

# 🔴 SEARCH and the cost functions below were rewritten on 2026-09-15 after the first
# judged round, and the reason matters more than the numbers.
#
# The first version searched 8 seconds and scored candidates as
# "pause length minus a quarter-second-per-second travel penalty", i.e. it would happily
# travel two seconds to reach a pause 0.1s longer. In Hebrew classroom speech two seconds
# is a whole clause, so it kept landing in the NEIGHBOURING sentence:
#   · "מיקוד שליטה פנימי" ended 4.8s late, inside the next principle
#     ("והדבר החמישי והאחרון, תוצאה אקולוגית")
#   · "מטרה ספציפית" started 1.0s early and opened on the previous sentence's tail
#     ("זה ספציפי. אנחנו רוצים...")
#   · the anorexia clip pulled in a stray joke from the room ("...נשארת בשבת")
# Ten of thirteen candidates failed the judge on boundary while scoring 8-9 on content.
#
# The chosen boundary is now the NEAREST admissible pause, full stop; pause length is only
# a tiebreak worth at most half a second of travel, and nothing travels beyond 2.5s. A
# transcript with 2-minute chunk granularity already puts us within a second of the real
# sentence edge, so a long journey is evidence the aim was wrong, not an opportunity.


def _runs(audio, centre, back, fwd):
    """Silence runs near `centre`, in absolute seconds."""
    t0 = max(0.0, centre - back)
    pcm = decode(audio, t0, back + fwd)
    if pcm.size < 8000:
        return []
    return [(t0 + a, t0 + b) for a, b in silences(pcm)]


def _tiebreak(pause_len):
    """A longer pause is worth travelling for, but never more than half a second."""
    return 0.5 * min(pause_len, 1.0)


def snap_start(audio, t):
    """Earliest-moving snap: land just after a pause that ENDS at or before t."""
    cands = [r for r in _runs(audio, t, SEARCH, 1.0) if r[1] <= t + 0.20]
    if not cands:
        return t, 0.0, None
    best = min(cands, key=lambda r: abs(t - r[1]) - _tiebreak(r[1] - r[0]))
    new = max(0.0, best[1] - PAD)
    return new, new - t, best[1] - best[0]


def snap_end(audio, t):
    """Later-moving snap: land just before a pause that STARTS at or after t."""
    cands = [r for r in _runs(audio, t, 1.0, SEARCH) if r[0] >= t - 0.20]
    if not cands:
        return t, 0.0, None
    best = min(cands, key=lambda r: abs(r[0] - t) - _tiebreak(r[1] - r[0]))
    new = best[0] + PAD
    return new, new - t, best[1] - best[0]


def ms(s):
    return f"{int(s)//60}:{int(s)%60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidates")
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    rows = json.load(open(a.candidates, encoding="utf-8"))
    print(f"{'#':<4}{'התחלה':>18}{'סיום':>18}{'אורך':>9}   כותרת")
    for i, r in enumerate(rows, 1):
        s, ds, plen_s = snap_start(a.audio, float(r["start"]))
        e, de, plen_e = snap_end(a.audio, float(r["end"]))
        r["start"], r["end"] = round(s, 2), round(e, 2)
        r["seconds"] = round(e - s, 2)
        r["snap"] = {"start_delta": round(ds, 2), "end_delta": round(de, 2),
                     "start_pause": round(plen_s, 2) if plen_s else None,
                     "end_pause": round(plen_e, 2) if plen_e else None}
        flag = ""
        if plen_s is None or plen_e is None:
            flag = "  ⚠ לא נמצאה שתיקה"
        if not (MIN_LEN <= r["seconds"] <= MAX_LEN):
            flag += f"  ⚠ אורך חריג"
        print(f"{i:<4}{ms(s)+f' ({ds:+.1f})':>18}{ms(e)+f' ({de:+.1f})':>18}"
              f"{ms(r['seconds']):>9}   {r.get('title','')}{flag}")

    json.dump(rows, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n{len(rows)} מועמדים -> {a.out}")


if __name__ == "__main__":
    main()
