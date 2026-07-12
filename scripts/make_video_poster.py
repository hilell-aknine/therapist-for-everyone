# -*- coding: utf-8 -*-
"""
Self-host the intro video's poster frame.

After the click-to-play facade landed, the LCP element on the sales page became
the YouTube thumbnail (i.ytimg.com/.../maxresdefault.jpg) — and it took ~3s to
arrive, because it is a 1280x720 JPEG from a third-party host we cannot preload
early or compress. That simply moved the bottleneck.

This pulls the frame once and stores it as a compressed WebP on our own domain,
so it can be preloaded with the HTML and served from the same connection.

  py scripts/make_video_poster.py
"""
import io
import pathlib
import urllib.request
from PIL import Image

VIDEO_ID = "Kktx3L-3uqs"
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "master-sales" / "intro-poster.webp"
# 780px wide covers the 680px max-width slot at 2x on a phone.
TARGET_W = 780

sources = [
    f"https://i.ytimg.com/vi/{VIDEO_ID}/maxresdefault.jpg",
    f"https://i.ytimg.com/vi/{VIDEO_ID}/hqdefault.jpg",
]

raw = None
for url in sources:
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            raw = r.read()
        print(f"fetched {url} ({len(raw)/1024:.0f} KB)")
        break
    except Exception as e:
        print(f"  {url} failed: {e}")

if not raw:
    raise SystemExit("could not fetch any thumbnail")

im = Image.open(io.BytesIO(raw)).convert("RGB")
w, h = im.size
print(f"source: {w}x{h}")

# hqdefault is 4:3 with black bars — crop to the 16:9 the player shows.
if abs(w / h - 16 / 9) > 0.1:
    new_h = round(w * 9 / 16)
    top = (h - new_h) // 2
    im = im.crop((0, top, w, top + new_h))
    print(f"cropped to 16:9 -> {im.size[0]}x{im.size[1]}")

if im.width > TARGET_W:
    im = im.resize((TARGET_W, round(im.height * TARGET_W / im.width)), Image.LANCZOS)

OUT.parent.mkdir(parents=True, exist_ok=True)
im.save(OUT, "WEBP", quality=80, method=6)
print(f"\nwrote {OUT.relative_to(OUT.parents[2])}  {OUT.stat().st_size/1024:.0f} KB  {im.size[0]}x{im.size[1]}")
print("(the YouTube original was ~100KB and took ~3s from i.ytimg.com)")
