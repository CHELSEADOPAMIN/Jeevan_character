#!/usr/bin/env python3
"""Build a Codex pet atlas from transparent pose PNGs.

Expected input pose names, with fallbacks:
  idle.png
  run.png
  wave.png
  jump.png
  crouch.png or failed.png
  thinking.png or waiting.png
  point.png or review.png

Output:
  spritesheet.webp, 1536x1872, 8 columns x 9 rows, 192x208 cells.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps


CELL_W = 192
CELL_H = 208
COLS = 8
ROWS = 9
ATLAS_W = CELL_W * COLS
ATLAS_H = CELL_H * ROWS


ROW_SPECS = [
    ("idle", ("idle",), False),
    ("running-right", ("run", "running", "running-right"), False),
    ("running-left", ("run-left", "running-left", "run", "running"), True),
    ("waving", ("wave", "waving", "idle"), False),
    ("jumping", ("jump", "jumping", "run"), False),
    ("failed", ("failed", "crouch", "sad", "idle"), False),
    ("waiting", ("thinking", "waiting", "idle"), False),
    ("running", ("run", "running", "running-right"), False),
    ("review", ("point", "review", "thinking", "idle"), False),
]


def find_pose(pose_dir: Path, names: Iterable[str]) -> Path:
    for name in names:
        for suffix in (".png", ".webp"):
            path = pose_dir / f"{name}{suffix}"
            if path.exists():
                return path
    raise FileNotFoundError(f"Missing pose. Tried: {', '.join(names)}")


def fit_to_cell(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)

    max_w = int(CELL_W * 0.82)
    max_h = int(CELL_H * 0.88)
    scale = min(max_w / image.width, max_h / image.height, 1.0)
    new_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(new_size, Image.Resampling.LANCZOS)

    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    x = (CELL_W - image.width) // 2
    y = CELL_H - image.height - 10
    cell.alpha_composite(image, (x, y))
    return cell


def shifted_frame(cell: Image.Image, frame_index: int, row_name: str) -> Image.Image:
    offsets = {
        "idle": [(0, 0), (0, -1), (0, 0), (0, 1), (0, 0), (0, -1), (0, 0), (0, 1)],
        "waving": [(0, 0), (1, -1), (0, -1), (-1, 0), (0, 0), (1, -1), (0, -1), (-1, 0)],
        "waiting": [(0, 0), (0, 0), (0, -1), (0, -1), (0, 0), (0, 1), (0, 1), (0, 0)],
        "failed": [(0, 2), (0, 3), (0, 2), (0, 4), (0, 3), (0, 2), (0, 3), (0, 2)],
        "jumping": [(0, 0), (0, -6), (1, -12), (1, -18), (0, -14), (-1, -8), (0, -3), (0, 0)],
        "review": [(0, 0), (1, 0), (2, 0), (1, 0), (0, 0), (1, -1), (2, -1), (1, 0)],
    }
    if "running" in row_name:
        seq = [(-5, 0), (-3, -2), (0, 0), (3, -2), (5, 0), (3, 1), (0, 0), (-3, 1)]
    else:
        seq = offsets.get(row_name, offsets["idle"])

    dx, dy = seq[frame_index % len(seq)]
    frame = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    frame.alpha_composite(cell, (dx, dy))
    return frame


def build_atlas(pose_dir: Path, output: Path, contact_sheet: Path | None = None) -> dict:
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    used: dict[str, str] = {}

    for row, (row_name, fallbacks, mirror) in enumerate(ROW_SPECS):
        pose_path = find_pose(pose_dir, fallbacks)
        image = Image.open(pose_path).convert("RGBA")
        if mirror and pose_path.stem not in {"run-left", "running-left"}:
            image = ImageOps.mirror(image)
        cell = fit_to_cell(image)
        used[row_name] = str(pose_path)

        for col in range(COLS):
            frame = shifted_frame(cell, col, row_name)
            atlas.alpha_composite(frame, (col * CELL_W, row * CELL_H))

    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, "WEBP", lossless=True, quality=100, method=6)

    if contact_sheet:
        contact_sheet.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(contact_sheet, "PNG")

    return {
        "ok": True,
        "output": str(output),
        "width": ATLAS_W,
        "height": ATLAS_H,
        "cell": [CELL_W, CELL_H],
        "rows": [spec[0] for spec in ROW_SPECS],
        "used": used,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pose_dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    result = build_atlas(args.pose_dir, args.output, args.contact_sheet)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
