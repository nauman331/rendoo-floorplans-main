#!/usr/bin/env python3
"""
Process the 7 Dropbox-sourced 2D Basic example floorplans into
gallery-ready images: consistent white background, consistent target
aspect ratio, with template/compass cruft cropped out where needed.

Run from repo root:
  python3 briefing-assets/scripts/process-basic-examples.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "public" / "references" / "2d-basic-examples-raw"
DST = REPO / "public" / "references" / "2d-basic-examples"

# Target canvas: 3:2 landscape — common floorplan aspect, fits 2-col gallery.
TARGET_W = 1600
TARGET_H = 1066  # ~3:2

# Per-image crops expressed as fractions (left, top, right, bottom) of the
# source. Values tuned by eye from the raw Dropbox images so we isolate the
# actual plan area and drop headers, logos, compasses, metadata blocks.
CROPS: dict[str, tuple[float, float, float, float] | None] = {
    # Situation plan — already has white bg, small north arrow is tiny and
    # sits inside the plan frame, leave as-is.
    "01-situatie.png": None,
    # Type S FLOW — clean, already white background.
    "02-type-s-flow.jpg": None,
    # Type A — clean, already white.
    "03-a.png": None,
    # GreenGallery template. Crop out top header (logo/RENDER/compass) and
    # bottom footer (LOGO WEBSITE DISCLAIMER + scale bar). The compass
    # lingers just below the header band so we reach down past it.
    "04-c30301.png": (0.12, 0.27, 0.93, 0.87),
    # F. De Pakmeester — floor plan is upper-left, metadata + compass bottom
    # right. Crop down to the plan region only.
    "05-fd.png": (0.13, 0.28, 0.84, 0.80),
    # C2 — clean, white background, no cruft.
    "06-c2.png": None,
    # H4 — compass top-right. Trim it off.
    "07-h4.png": (0.18, 0.10, 0.80, 0.84),
}

# Human-friendly labels shown in the gallery.
LABELS: dict[str, str] = {
    "01-situatie.png": "Situatietekening — groen & rustig",
    "02-type-s-flow.jpg": "Type S — warm & compact",
    "03-a.png": "Type A — neutraal & licht",
    "04-c30301.png": "Aardetinten — zand & olijf",
    "05-fd.png": "Strak & modern — grijs/bruin",
    "06-c2.png": "Minimalistisch — zandtint",
    "07-h4.png": "Kleurvol — blauwe accenten",
}


def fit_on_canvas(img: Image.Image, w: int, h: int, bg=(255, 255, 255)) -> Image.Image:
    """Letterbox img onto a w×h white canvas, preserving aspect ratio."""
    img = img.convert("RGB")
    img.thumbnail((w, h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), bg)
    x = (w - img.width) // 2
    y = (h - img.height) // 2
    canvas.paste(img, (x, y))
    return canvas


def trim_white(img: Image.Image, threshold: int = 245) -> Image.Image:
    """Trim near-white borders so the plan fills the frame."""
    gray = img.convert("L")
    # Invert so content = bright, then getbbox finds content bounds.
    mask = gray.point(lambda v: 0 if v >= threshold else 255)
    bbox = mask.getbbox()
    if bbox:
        return img.crop(bbox)
    return img


def process_one(src_name: str) -> Path:
    src = SRC / src_name
    if not src.exists():
        print(f"  skip — missing: {src}", file=sys.stderr)
        return None  # type: ignore[return-value]

    img = Image.open(src)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    else:
        img = img.convert("RGB")

    crop = CROPS.get(src_name)
    if crop is not None:
        l, t, r, b = crop
        w, h = img.size
        box = (int(w * l), int(h * t), int(w * r), int(h * b))
        img = img.crop(box)

    img = trim_white(img, threshold=248)
    img = fit_on_canvas(img, TARGET_W, TARGET_H)

    DST.mkdir(parents=True, exist_ok=True)
    out_name = src_name.rsplit(".", 1)[0] + ".jpg"
    out = DST / out_name
    img.save(out, "JPEG", quality=88, optimize=True)
    print(f"  {src_name} -> {out.relative_to(REPO)}  ({img.size[0]}x{img.size[1]})")
    return out


def main() -> int:
    print(f"Processing 2D Basic examples from {SRC.relative_to(REPO)}")
    outs = []
    for name in sorted(CROPS.keys()):
        out = process_one(name)
        if out:
            outs.append((name, out.name))

    # Also dump a small JSON manifest so the frontend can import it.
    manifest = DST / "manifest.json"
    import json
    items = []
    for src_name, out_name in outs:
        items.append(
            {
                "id": src_name.rsplit(".", 1)[0],
                "image": f"/references/2d-basic-examples/{out_name}",
                "label": LABELS.get(src_name, src_name),
            }
        )
    manifest.write_text(json.dumps(items, indent=2))
    print(f"Wrote manifest: {manifest.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
