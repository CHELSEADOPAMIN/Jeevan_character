#!/usr/bin/env python3
"""Extract named pose PNGs from a generated platformer sprite sheet.

This assumes the source image is an evenly spaced 4x4 or 8x2 sprite sheet.
It keeps alpha when present and writes pose files expected by build_pet_atlas.py.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

POSE_EXTRACT_BLEED_RATIO = 0.08


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


def rect_overlap_area(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> int:
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])
    return max(0, right - left) * max(0, bottom - top)


def keep_focused_foreground(image: Image.Image, focus_rect: tuple[int, int, int, int]) -> Image.Image:
    """Drop neighboring-cell fragments from a bleed crop while keeping the focused pose."""
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    labels = [0] * (width * height)
    components: list[dict[str, int]] = []
    label = 0

    for start in range(width * height):
        if labels[start] or pixels[start % width, start // width][3] <= 8:
            continue

        label += 1
        queue = [start]
        labels[start] = label
        area = 0
        left = width
        top = height
        right = -1
        bottom = -1

        for index in queue:
            x = index % width
            y = index // width
            area += 1
            left = min(left, x)
            top = min(top, y)
            right = max(right, x)
            bottom = max(bottom, y)

            neighbors = []
            if x > 0:
                neighbors.append(index - 1)
            if x + 1 < width:
                neighbors.append(index + 1)
            if y > 0:
                neighbors.append(index - width)
            if y + 1 < height:
                neighbors.append(index + width)

            for next_index in neighbors:
                if labels[next_index]:
                    continue
                nx = next_index % width
                ny = next_index // width
                if pixels[nx, ny][3] <= 8:
                    continue
                labels[next_index] = label
                queue.append(next_index)

        bounds = (left, top, right + 1, bottom + 1)
        components.append({
            "label": label,
            "area": area,
            "overlap": rect_overlap_area(bounds, focus_rect),
        })

    if len(components) <= 1:
        return image

    focused = [component for component in components if component["overlap"] > 0]
    keep_components = focused or [max(components, key=lambda component: component["area"])]
    keep = {component["label"] for component in keep_components}

    for index, component_label in enumerate(labels):
        if component_label and component_label not in keep:
            x = index % width
            y = index // width
            r, g, b, _ = pixels[x, y]
            pixels[x, y] = (r, g, b, 0)

    return image


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


def fill_enclosed_alpha_holes(image: Image.Image, alpha_threshold: int = 8) -> Image.Image:
    """Fill transparent holes enclosed by opaque sprite pixels.

    Exterior transparency is preserved. Only fully enclosed transparent pixels
    inside the character silhouette are made opaque again.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size

    def is_transparent(x: int, y: int) -> bool:
        return pixels[x, y][3] <= alpha_threshold

    exterior: set[tuple[int, int]] = set()
    queue: list[tuple[int, int]] = []

    def enqueue(x: int, y: int) -> None:
        if (x, y) in exterior or not is_transparent(x, y):
            return
        exterior.add((x, y))
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)

    for x, y in queue:
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    holes = {
        (x, y)
        for y in range(height)
        for x in range(width)
        if is_transparent(x, y) and (x, y) not in exterior
    }
    pending = set(holes)

    while pending:
        progressed = False
        for x, y in list(pending):
            samples = []
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if (nx, ny) == (x, y) or (nx, ny) in pending:
                        continue
                    r, g, b, a = pixels[nx, ny]
                    if a > alpha_threshold:
                        samples.append((r, g, b))

            if not samples:
                continue

            count = len(samples)
            pixels[x, y] = (
                round(sum(sample[0] for sample in samples) / count),
                round(sum(sample[1] for sample in samples) / count),
                round(sum(sample[2] for sample in samples) / count),
                255,
            )
            pending.remove((x, y))
            progressed = True

        if not progressed:
            for x, y in pending:
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 255)
            pending.clear()

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
    bleed_x = max(4, int(cell_w * POSE_EXTRACT_BLEED_RATIO))
    bleed_y = max(4, int(cell_h * POSE_EXTRACT_BLEED_RATIO))
    args.out.mkdir(parents=True, exist_ok=True)

    for pose, (col, row) in pose_map.items():
        cell_left = col * cell_w
        cell_top = row * cell_h
        left = max(0, cell_left - bleed_x)
        top = max(0, cell_top - bleed_y)
        right = min(image.width, cell_left + cell_w + bleed_x)
        bottom = min(image.height, cell_top + cell_h + bleed_y)
        crop = image.crop((left, top, right, bottom))
        crop = remove_flat_background(crop)
        crop = keep_focused_foreground(
            crop,
            (cell_left - left, cell_top - top, cell_left - left + cell_w, cell_top - top + cell_h),
        )
        crop = fill_enclosed_alpha_holes(crop)
        crop = trim_alpha(crop)
        crop.save(args.out / f"{pose}.png")

    print(f"Extracted {len(pose_map)} poses to {args.out}")


if __name__ == "__main__":
    main()
