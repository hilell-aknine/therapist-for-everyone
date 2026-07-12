# -*- coding: utf-8 -*-
"""
Shrink the images the site actually ships, in place.

Measured on a throttled phone (2026-07-12): logo-square.png was 101KB and is
displayed at 40px; logo.png was 51KB at 62px; the hero images were 124-220KB.
Together they were most of the non-YouTube weight on every page.

In place, same filenames: 21 HTML files reference these paths and rewriting all
of them would be a much bigger blast radius than re-encoding the bytes.

Originals are kept in assets/_original/ (gitignored) so this is reversible.
Run:  py scripts/optimize_images.py [--apply]
Without --apply it only reports what it would do.
"""
import sys
import shutil
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
BACKUP = ASSETS / "_original"

# (path, max_width, format-specific quality)
# Max width = roughly 3x the largest size the image is ever displayed at, so it
# still looks sharp on a retina phone.
TARGETS = [
    ("logo-square.png", 256, None),
    ("logo.png", 200, None),
    ("logo-light.png", 256, None),
    ("hero-bg-clean.webp", 1200, 78),
    ("free-portal-hero.webp", 1100, 78),
    ("master-sales/ram-stage-solo.jpg", 960, 80),
]

apply = "--apply" in sys.argv
if apply:
    BACKUP.mkdir(parents=True, exist_ok=True)

total_before = total_after = 0
print(f"{'file':<34}{'before':>10}{'after':>10}{'saved':>10}   size")
print("-" * 78)

for rel, max_w, quality in TARGETS:
    src = ASSETS / rel
    if not src.exists():
        print(f"{rel:<34}  MISSING — skipped")
        continue

    before = src.stat().st_size
    im = Image.open(src)
    w, h = im.size

    if w > max_w:
        im = im.resize((max_w, round(h * max_w / w)), Image.LANCZOS)

    fmt = src.suffix.lower()
    tmp = src.with_suffix(src.suffix + ".tmp")
    if fmt == ".png":
        # Palette mode collapses a logo's colours to a fraction of the bytes with
        # no visible change, and keeps the alpha channel.
        out = im.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE)
        out.save(tmp, "PNG", optimize=True)
    elif fmt == ".webp":
        im.save(tmp, "WEBP", quality=quality, method=6)
    else:
        im.convert("RGB").save(tmp, "JPEG", quality=quality, optimize=True, progressive=True)

    after = tmp.stat().st_size
    if after >= before:
        tmp.unlink()
        print(f"{rel:<34}{before/1024:>9.0f}K{'—':>10}{'already optimal':>10}")
        continue

    total_before += before
    total_after += after
    pct = 100 * (before - after) / before
    print(f"{rel:<34}{before/1024:>9.0f}K{after/1024:>9.0f}K{pct:>9.0f}%   {w}x{h} -> {im.size[0]}x{im.size[1]}")

    if apply:
        dest = BACKUP / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.copy2(src, dest)
        tmp.replace(src)
    else:
        tmp.unlink()

print("-" * 78)
saved = total_before - total_after
print(f"{'TOTAL':<34}{total_before/1024:>9.0f}K{total_after/1024:>9.0f}K{saved/1024:>9.0f}K saved")
print("\n(dry run — pass --apply to write)" if not apply else "\napplied. originals in assets/_original/")
