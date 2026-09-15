"""Have Gemini listen to each candidate clip as if it were the only thing it ever heard.

This is the gate that the deleted master-practice.html never had. That page shipped 49
clips of which 44 played a different video than the title promised, because nothing ever
checked the artefact -- only the plan.

Two rules are baked in, both learned the hard way on this course:

1. THE JUDGE IS NOT STABLE. The same seam scored 4 on one pass and 8 on the next, on
   byte-identical input. So every clip is judged TWICE and only an agreeing verdict
   counts. A disagreement is reported as a disagreement, never averaged into a number
   that looks decisive.

2. GEMINI IS NOT A CLOCK. It is asked what it HEARS, never when. Its transcription of the
   opening and closing line is used purely as an alignment receipt: if the transcript we
   planned against had drifted, the words it reports will not be the words we expected,
   and the clip is rejected. Every timestamp in this pipeline comes from ffmpeg.

Audio mode is the default and costs almost nothing (~32 tokens/second, so a 2-minute clip
is roughly 4k tokens). Video mode is for the finalists only and answers a different
question: is there anything to look at, or is this two minutes of a static wall.

Usage:
    python judge_clips.py snapped.json work/m1l4.mp3 --out judged.json
    python judge_clips.py judged.json  --video work/m1l4.mp4 --out judged_video.json
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
SKILL = r"C:\Users\saraa\.claude\skills\ai-video-analyzer"
PASS_SCORE = 7

AUDIO_PROMPT = """זהו קטע שנחתך מתוך שיעור מוקלט בקורס NLP בעברית, מול קהל בכיתה.
הקטע אמור לעמוד בפני עצמו: לומד שלא צפה בשיעור נכנס, שומע רק אותו, ויוצא עם רעיון אחד שלם.

הקשב לקטע במלואו ושפוט אותו כאילו זה כל מה ששמעת בחיים. אל תשלים פערים מהידע שלך.

החזר JSON בלבד, בדיוק במבנה הזה:
{
 "heard_opening": "המשפט הראשון שנשמע, מילה במילה",
 "heard_closing": "המשפט האחרון שנשמע, מילה במילה",
 "opens_clean": true/false,
 "ends_clean": true/false,
 "one_complete_idea": true/false,
 "needs_prior_context": true/false,
 "jargon_unexplained": ["מונחים מקצועיים שנאמרו בלי הסבר בתוך הקטע"],
 "room_only": true/false,
 "takeaway": "משפט אחד: מה הלומד לוקח מכאן",
 "standalone_value": 0-10,
 "verdict": "מתאים" או "גבול לא נקי" או "לא עומד בפני עצמו"
}

כללי שיפוט:
- opens_clean=false אם מתקיים אחד מאלה: הקטע נפתח באמצע משפט · המשפט הראשון מפנה למשהו שלא נשמע ("זה קשה" בלי שנאמר מה, "ההנחה הזאת", "הוא אמר לי") · הקטע עונה על שאלה שלא נשמעה.
  **מילת חיבור בפתיחה איננה פסילה כשלעצמה.** המרצה פותח כמעט כל משפט ב"ו", "אז" או "עכשיו". אם המשפט שלם ומובן לבדו, opens_clean=true גם אם הוא מתחיל ב"ואני רוצה לומר" או "אז בעצם".
- ends_clean=false אם המשפט האחרון נקטע · אם הקטע פותח נושא חדש שלא נסגר · או אם הוא נגמר בשאלת בדיקה לכיתה שלא נענית ("כאן כולם מבינים?", "יש שאלות?"). סיום כזה משאיר את הצופה בבית תלוי באוויר.
- needs_prior_context=true אם צריך משהו שנאמר לפני הקטע כדי להבין אותו.
- room_only=true רק אם אי אפשר להפיק מהקטע ערך בלי להיות בכיתה: תרגיל בזוגות, התייחסות למשתתף מסוים, או תרגיל שחציו נעשה לפני הקטע ולכן השורה התחתונה שלו חסרת משמעות לצופה.
  שים לב: דמיון מודרך שצופה יחיד יכול לעשות בבית מול המסך ולקבל ממנו את כל התוצאה הוא **לא** room_only. הוא בדיוק סוג הערך שאנחנו מחפשים.
- standalone_value: כמה ערך אמיתי לומד מקבל מהקטע הזה לבדו. 10 = רעיון שלם ושימושי. 0 = לוגיסטיקה, הפסקה, או דיבור בלי תוכן.
"""

VIDEO_PROMPT = """זהו קטע מתוך שיעור NLP מוקלט שעומד להיות מוצג בפורטל לימודי.
בדוק רק את הצד הוויזואלי.

החזר JSON בלבד:
{
 "instructor_on_screen": true/false,
 "board_or_slide_readable": true/false,
 "static_or_dead_frame": true/false,
 "other_people_prominent": true/false,
 "visual_notes": "משפט אחד",
 "visual_ok": true/false
}
- static_or_dead_frame=true אם רוב הקטע הוא מסך קפוא, מסך שחור, או פריים בלי שום דבר לראות.
- other_people_prominent=true אם משתתפים בקורס מצולמים בקלוז אפ ולא רק ברקע.
"""


def cut_audio(src, start, end, dst):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-i", src,
                    "-t", f"{end - start:.2f}", "-ac", "1", "-ar", "16000",
                    "-b:a", "48k", dst], check=True)


def cut_video(src, start, end, dst):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-i", src,
                    "-t", f"{end - start:.2f}", "-vf", "scale=420:-2", "-r", "4",
                    "-crf", "34", "-an", dst], check=True)


def ask(path, prompt):
    r = subprocess.run(["node", "scripts/analyze.mjs", path, prompt, "--json"],
                       cwd=SKILL, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = (r.stdout or "").strip()
    i, j = out.find("{"), out.rfind("}")
    if i < 0:
        return {"error": (out or r.stderr or "")[-160:]}
    try:
        return json.loads(out[i:j + 1])
    except json.JSONDecodeError:
        return {"error": out[i:i + 160]}


def agree_audio(a, b):
    """Both runs must land on the same verdict and both must clear the bar."""
    if "error" in a or "error" in b:
        return False, "שגיאת מודל"
    if a.get("verdict") != b.get("verdict"):
        return False, f"אי הסכמה: {a.get('verdict')} מול {b.get('verdict')}"
    if a.get("verdict") != "מתאים":
        return False, a.get("verdict", "נפסל")
    if min(a.get("standalone_value", 0), b.get("standalone_value", 0)) < PASS_SCORE:
        return False, f"ציון נמוך: {a.get('standalone_value')}/{b.get('standalone_value')}"
    for k in ("opens_clean", "ends_clean", "one_complete_idea"):
        if not (a.get(k) and b.get(k)):
            return False, f"נכשל ב-{k}"
    if a.get("needs_prior_context") or b.get("needs_prior_context"):
        return False, "דורש הקשר קודם"
    if a.get("room_only") or b.get("room_only"):
        return False, "עובד רק בכיתה"
    return True, "עבר"


def ms(s):
    return f"{int(s)//60}:{int(s)%60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidates")
    ap.add_argument("media", nargs="?")
    ap.add_argument("--video", help="video file; switches to the visual round")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    rows = json.load(open(a.candidates, encoding="utf-8"))
    src = a.video or a.media
    visual = bool(a.video)
    tmp = tempfile.mkdtemp(prefix="clipjudge_")
    passed = 0

    for i, r in enumerate(rows, 1):
        start, end = float(r["start"]), float(r["end"])
        ext = "mp4" if visual else "mp3"
        path = os.path.join(tmp, f"c{i:02d}.{ext}")
        (cut_video if visual else cut_audio)(src, start, end, path)

        if visual:
            v = ask(path, VIDEO_PROMPT)
            r["visual"] = v
            ok = bool(v.get("visual_ok")) and not v.get("static_or_dead_frame")
            r["visual_pass"] = ok
            print(f"{i:<3}{'✅' if ok else '❌'}  {ms(start)}  {r.get('title','')}"
                  f"  · {v.get('visual_notes', v.get('error',''))[:70]}")
        else:
            run1 = ask(path, AUDIO_PROMPT)
            run2 = ask(path, AUDIO_PROMPT)
            ok, why = agree_audio(run1, run2)
            r["audio_runs"] = [run1, run2]
            r["audio_pass"], r["audio_reason"] = ok, why
            r["takeaway"] = run1.get("takeaway", "")
            r["heard_opening"] = run1.get("heard_opening", "")
            r["heard_closing"] = run1.get("heard_closing", "")
            score = f"{run1.get('standalone_value','?')}/{run2.get('standalone_value','?')}"
            print(f"{i:<3}{'✅' if ok else '❌'}  {ms(start)}-{ms(end)}  "
                  f"{r.get('title','')[:34]:<34} {score:>6}  {why}")
            if ok:
                print(f"       פתיחה: {r['heard_opening'][:80]}")
        passed += 1 if (r.get("visual_pass") if visual else r.get("audio_pass")) else 0

    json.dump(rows, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n{passed}/{len(rows)} עברו -> {a.out}")


if __name__ == "__main__":
    main()
