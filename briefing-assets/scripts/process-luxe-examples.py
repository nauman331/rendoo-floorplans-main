#!/usr/bin/env python3
"""
Process the 10 "HOF Leidschendam" 2D Luxe template images from
public/references/2d-luxe/output-4/seperated jpeg/ into gallery-ready
floorplan images — cropping away the HOF logo, metadata table, and
disclaimer so only the plan remains, on a white canvas.

Run from repo root:
  python3 briefing-assets/scripts/process-luxe-examples.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "public" / "references" / "2d-luxe" / "output-4" / "seperated jpeg"
DST = REPO / "public" / "references" / "2d-luxe-examples"

TARGET_W = 1600
TARGET_H = 1066

# The HOF template has the plan in the upper portion and the metadata /
# branding / disclaimer block in the lower portion. The exact ratio holds
# for all 10 source images (all 7016x4961). Portrait-plan variants like
# A-30 push the HOF logo further up, so we crop tighter than the header
# band suggests.
#
# Fractional crop (left, top, right, bottom).
PLAN_CROP = (0.03, 0.02, 0.97, 0.55)

# Labels for the gallery — filename-derived; m²/address is per-unit metadata
# we could OCR later if we want to show the full HOF caption.
NAMES: dict[str, str] = {
    "A-21.jpg": "HOF Leidschendam — A21 (59 m²)",
    "A-22.jpg": "HOF Leidschendam — A22",
    "A-23.jpg": "HOF Leidschendam — A23 (55 m²)",
    "A-24.jpg": "HOF Leidschendam — A24",
    "A-25.jpg": "HOF Leidschendam — A25 (63 m²)",
    "A-26.jpg": "HOF Leidschendam — A26",
    "A-27.jpg": "HOF Leidschendam — A27 (54 m²)",
    "A-28.jpg": "HOF Leidschendam — A28",
    "A-29.jpg": "HOF Leidschendam — A29",
    "A-30.jpg": "HOF Leidschendam — A30 (61 m²)",
}

# Shared caption block that Nick wants us to preserve alongside every 2D
# Luxe sample (it's the template signature Rendoo wants visible in-product).
SHARED_CAPTION = (
    "HOF Leidschendam — donkere lijnen, zalm/terracotta meubels, "
    "aardse beige vloeren. Warme luxe uitstraling."
)


def fit_on_canvas(img: Image.Image, w: int, h: int, bg=(255, 255, 255)) -> Image.Image:
    img = img.convert("RGB")
    img.thumbnail((w, h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2))
    return canvas


def trim_white(img: Image.Image, threshold: int = 245) -> Image.Image:
    gray = img.convert("L")
    mask = gray.point(lambda v: 0 if v >= threshold else 255)
    bbox = mask.getbbox()
    return img.crop(bbox) if bbox else img


def process_one(src_name: str) -> Path | None:
    src = SRC / src_name
    if not src.exists():
        print(f"  skip — missing: {src}", file=sys.stderr)
        return None

    img = Image.open(src).convert("RGB")
    w, h = img.size
    l, t, r, b = PLAN_CROP
    img = img.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
    img = trim_white(img, threshold=250)
    img = fit_on_canvas(img, TARGET_W, TARGET_H)

    DST.mkdir(parents=True, exist_ok=True)
    out = DST / src_name.replace(".jpg", "") / ""
    out_path = DST / src_name.lower()
    img.save(out_path, "JPEG", quality=88, optimize=True)
    print(f"  {src_name} -> {out_path.relative_to(REPO)}  ({img.size[0]}x{img.size[1]})")
    return out_path


def main() -> int:
    print(f"Processing 2D Luxe examples from {SRC.relative_to(REPO)}")
    items = []
    for name in sorted(NAMES.keys()):
        out = process_one(name)
        if not out:
            continue
        items.append(
            {
                "id": name.replace(".jpg", "").lower(),
                "image": f"/references/2d-luxe-examples/{out.name}",
                "label": NAMES[name],
                "caption": SHARED_CAPTION,
            }
        )

    (DST / "manifest.json").write_text(json.dumps(items, indent=2))
    print(f"Wrote manifest: {(DST / 'manifest.json').relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
