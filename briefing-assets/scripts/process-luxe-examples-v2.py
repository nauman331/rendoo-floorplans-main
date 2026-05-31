#!/usr/bin/env python3
"""
Process the new (April 2026) batch of 10 2D Luxe example images.

Each source image has a serif-font label in the bottom-left ("Warm",
"Brown", "Moody", "Scandi", "Neutral", "Classic", "Luxe", "Rustic",
"Cosy", "Warm Luxe"). We:

  1. White out the bottom-left text region so the trim step doesn't
     pick it up as content.
  2. trim_white() to tighten to the actual plan bbox.
  3. Letterbox onto a consistent 1600x1066 white canvas.

The labels themselves live in lib/style-examples.ts as the gallery
captions, so removing them from the image doesn't lose information.

Run from repo root:
  python3 briefing-assets/scripts/process-luxe-examples-v2.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "public" / "references" / "2d-luxe-examples-raw"
DST = REPO / "public" / "references" / "2d-luxe-examples"

TARGET_W = 1600
TARGET_H = 1066

# Filename → display label (used both as the gallery title AND as the
# caption tag we put next to the image since it was removed from the plan).
LABELS: dict[str, str] = {
    "warm.jpg": "Warm",
    "brown.jpg": "Brown",
    "moody.jpg": "Moody",
    "scandi.jpg": "Scandi",
    "neutral.jpg": "Neutral",
    "classic.jpg": "Classic",
    "luxe.jpg": "Luxe",
    "rustic.jpg": "Rustic",
    "cosy.png": "Cosy",
    "warm-luxe.png": "Warm Luxe",
}

# Rectangles to whitewash before trimming, expressed as fractions
# (left, top, right, bottom). Some labels sit bottom-LEFT (Warm, Brown,
# Moody, Scandi, Neutral, Luxe, Warm Luxe) and some sit bottom-RIGHT
# (Classic, Rustic, Cosy), so we wipe both corners. We deliberately
# avoid the middle bottom strip — that's where some plans have a
# "balkon" label that's part of the floorplan.
LABEL_MASKS = [
    (0.0, 0.82, 0.30, 1.0),   # bottom-left
    (0.70, 0.82, 1.0, 1.0),   # bottom-right
]


def whitewash_label(img: Image.Image) -> Image.Image:
    """Paint white rectangles over the bottom-corner label regions."""
    img = img.convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    for l, t, r, b in LABEL_MASKS:
        box = (int(w * l), int(h * t), int(w * r), int(h * b))
        draw.rectangle(box, fill=(255, 255, 255))
    return img


def trim_white(img: Image.Image, threshold: int = 245) -> Image.Image:
    gray = img.convert("L")
    mask = gray.point(lambda v: 0 if v >= threshold else 255)
    bbox = mask.getbbox()
    return img.crop(bbox) if bbox else img


def fit_on_canvas(img: Image.Image, w: int, h: int, bg=(255, 255, 255)) -> Image.Image:
    img = img.convert("RGB")
    img.thumbnail((w, h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2))
    return canvas


def slug(name: str) -> str:
    base = name.rsplit(".", 1)[0]
    return base.replace(" ", "-").replace("_", "-").lower()


def process_one(src_name: str) -> tuple[Path, str] | None:
    src = SRC / src_name
    if not src.exists():
        print(f"  skip — missing: {src}", file=sys.stderr)
        return None

    img = Image.open(src)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    else:
        img = img.convert("RGB")

    img = whitewash_label(img)
    img = trim_white(img, threshold=246)
    img = fit_on_canvas(img, TARGET_W, TARGET_H)

    DST.mkdir(parents=True, exist_ok=True)
    out_name = f"{slug(src_name)}.jpg"
    out = DST / out_name
    img.save(out, "JPEG", quality=88, optimize=True)
    print(f"  {src_name} -> {out.relative_to(REPO)}  ({img.size[0]}x{img.size[1]})")
    return out, LABELS[src_name]


def main() -> int:
    print(f"Processing v2 luxe examples from {SRC.relative_to(REPO)}")

    # Wipe old A-21..A-30 outputs so the gallery is purely the new set.
    if DST.exists():
        for f in DST.glob("a-*.jpg"):
            f.unlink()
            print(f"  removed legacy {f.name}")

    items = []
    for name in LABELS.keys():
        result = process_one(name)
        if not result:
            continue
        out, label = result
        items.append(
            {
                "id": out.stem,
                "image": f"/references/2d-luxe-examples/{out.name}",
                "label": label,
            }
        )

    (DST / "manifest.json").write_text(json.dumps(items, indent=2))
    print(f"Wrote manifest: {(DST / 'manifest.json').relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
