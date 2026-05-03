#!/usr/bin/env python3
"""Extract named pose PNGs from a generated platformer sprite sheet.

This assumes the source image is an evenly spaced 4x4 or 8x2 sprite sheet.
It keeps alpha when present and writes pose files expected by build_pet_atlas.py.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


POSES_4X4 = {
    "idle": (0, 0),
    "run": (1, 0),
    "wave": (2, 0),
    "jump": (3, 0),
    "crouch": (0, 1),
    "thinking": (1, 1),
    "point": (2, 1),
    "celebrate": (3, 1),
}

POSES_8X2 = {
    "idle": (0, 0),
    "run": (1, 0),
    "wave": (2, 0),
    "jump": (3, 0),
    "crouch": (4, 0),
    "thinking": (5, 0),
    "point": (6, 0),
    "celebrate": (7, 0),
}


def trim_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getbbox()
    if not bbox:
        return image
    return image.crop(bbox)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--grid", choices=("4x4", "8x2"), default="4x4")
    args = parser.parse_args()

    image = Image.open(args.sheet).convert("RGBA")
    cols, rows = (4, 4) if args.grid == "4x4" else (8, 2)
    pose_map = POSES_4X4 if args.grid == "4x4" else POSES_8X2

    cell_w = image.width // cols
    cell_h = image.height // rows
    args.out.mkdir(parents=True, exist_ok=True)

    for pose, (col, row) in pose_map.items():
        crop = image.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        crop = trim_alpha(crop)
        crop.save(args.out / f"{pose}.png")

    print(f"Extracted {len(pose_map)} poses to {args.out}")


if __name__ == "__main__":
    main()
