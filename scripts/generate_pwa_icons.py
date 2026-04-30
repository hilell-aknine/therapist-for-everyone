"""Generate PWA icons from existing logo-square.png.

Outputs:
  assets/pwa-icon-192.png        — 192x192 with deep-petrol background
  assets/pwa-icon-512.png        — 512x512 with deep-petrol background
  assets/pwa-icon-maskable-512.png — 512x512 with logo at 70% (safe zone)
  assets/apple-touch-icon-180.png — 180x180 opaque, slight rounded look

Run from project root:
  python scripts/generate_pwa_icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "logo-square.png"
OUT_DIR = ROOT / "assets"
BG = (0, 59, 70, 255)  # #003B46 deep petrol

def make_icon(out_path: Path, size: int, logo_scale: float = 0.85):
    """logo_scale: fraction of canvas the logo occupies (0.85 normal, 0.65 maskable)."""
    canvas = Image.new("RGBA", (size, size), BG)
    logo = Image.open(SRC).convert("RGBA")
    target_w = int(size * logo_scale)
    aspect = logo.height / logo.width
    target_h = int(target_w * aspect)
    if target_h > size * logo_scale:
        target_h = int(size * logo_scale)
        target_w = int(target_h / aspect)
    logo_resized = logo.resize((target_w, target_h), Image.LANCZOS)
    x = (size - target_w) // 2
    y = (size - target_h) // 2
    canvas.paste(logo_resized, (x, y), logo_resized)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"  wrote {out_path.name} ({size}x{size}, logo {target_w}x{target_h})")

def main():
    print(f"Source: {SRC}")
    print(f"Output: {OUT_DIR}")
    make_icon(OUT_DIR / "pwa-icon-192.png", 192, 0.85)
    make_icon(OUT_DIR / "pwa-icon-512.png", 512, 0.85)
    make_icon(OUT_DIR / "pwa-icon-maskable-512.png", 512, 0.65)
    make_icon(OUT_DIR / "apple-touch-icon-180.png", 180, 0.85)
    print("Done.")

if __name__ == "__main__":
    main()
