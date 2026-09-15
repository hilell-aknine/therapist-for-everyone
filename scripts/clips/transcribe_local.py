"""Local Hebrew transcription with word-level timestamps (faster-whisper, CPU).

Why this exists: ElevenLabs Scribe is the better Hebrew engine, but the account hit
0 credits on 2026-09-15 and the key is scoped without account-read, so the failure only
shows up as a 401 mid-run. This is the free fallback.

The timings produced here are used to LOCATE a candidate window inside a long lesson.
They are never the final clip boundaries -- those come from ffmpeg silencedetect
(snap_boundaries.py), which is exact and deterministic.

Usage:
    python transcribe_local.py work/m1l4.mp3 work/m1l4
Writes <out>.words.json (word-level) and <out>.blocks.txt (readable, 45s blocks).
"""
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel

MODEL = "medium"          # cached locally; large-v3 would need a 3GB download
BLOCK_SECONDS = 45.0


def fmt(t: float) -> str:
    m, s = divmod(int(t), 60)
    return f"{m:02d}:{s:02d}"


def main() -> None:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])

    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(src),
        language="he",
        beam_size=1,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        word_timestamps=True,
        condition_on_previous_text=False,   # stops runaway repetition on long lectures
    )

    words, segs = [], []
    for seg in segments:
        segs.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
        for w in (seg.words or []):
            words.append({"start": w.start, "end": w.end, "w": w.word.strip()})
        # progress to stderr so the background log shows life on a 27-minute file
        print(f"{fmt(seg.start)}  {seg.text.strip()[:70]}", file=sys.stderr, flush=True)

    out.with_suffix(".words.json").write_text(
        json.dumps({"source": src.name, "duration": info.duration,
                    "model": MODEL, "words": words, "segments": segs},
                   ensure_ascii=False),
        encoding="utf-8")

    # Readable transcript in fixed time blocks -- this is what gets read when choosing windows.
    lines, block_start, buf = [], 0.0, []
    for s in segs:
        if s["start"] - block_start >= BLOCK_SECONDS and buf:
            lines.append(f"[{fmt(block_start)}] " + " ".join(buf))
            block_start, buf = s["start"], []
        buf.append(s["text"])
    if buf:
        lines.append(f"[{fmt(block_start)}] " + " ".join(buf))
    out.with_suffix(".blocks.txt").write_text("\n\n".join(lines), encoding="utf-8")

    print(f"OK {out.name}: {len(words)} words, {info.duration:.1f}s")


if __name__ == "__main__":
    main()
