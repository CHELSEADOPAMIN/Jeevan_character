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


def remove_flat_background(image: Image.Image, tolerance: int = 26) -> Image.Image:
    """Make a flat corner background transparent.

    This is mainly for gpt-image-2, which may return a plain light background
    instead of transparent pixels. It samples the four corners and removes
    pixels close to the brightest corner color.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    corners = [
        pixels[0, 0],
        pixels[image.width - 1, 0],
        pixels[0, image.height - 1],
        pixels[image.width - 1, image.height - 1],
    ]
    bg = max(corners, key=lambda px: px[0] + px[1] + px[2])

    def matches_background(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        if a == 0:
            return False
        distance = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
        return distance <= tolerance and r + g + b > 600

    visited: set[tuple[int, int]] = set()
    queue: list[tuple[int, int]] = []

    def enqueue(x: int, y: int) -> None:
        if (x, y) in visited or not matches_background(x, y):
            return
        visited.add((x, y))
        queue.append((x, y))

    for x in range(image.width):
        enqueue(x, 0)
        enqueue(x, image.height - 1)
    for y in range(1, image.height - 1):
        enqueue(0, y)
        enqueue(image.width - 1, y)

    for x, y in queue:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < image.width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < image.height:
            enqueue(x, y + 1)
    return image


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
        crop = remove_flat_background(crop)
        crop = trim_alpha(crop)
        crop.save(args.out / f"{pose}.png")

    print(f"Extracted {len(pose_map)} poses to {args.out}")


if __name__ == "__main__":
    main()
