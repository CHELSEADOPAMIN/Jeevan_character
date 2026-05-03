---
name: codexpet-generator
description: Generate a Codex custom pet from user-provided character artwork, photos of a person, sprite sheets, portraits, mascot images, or reference images. Use when the user asks to turn a photo/person/character into an 8-bit platformer sprite sheet, make a Codex pet package, create pet.json and spritesheet.webp, convert image materials into Codex pet format, package a pet for friends, or validate/install a custom Codex pet.
---

# CodexPet Generator

## Goal

Turn supplied character artwork into a complete Codex custom pet package:

- generated 8-bit platformer sprite sheet when starting from a single photo
- `pet.json`
- `spritesheet.webp`
- optional preview/contact sheet
- optional install zip
- short non-technical install instructions

## Codex Pet Contract

Create the runtime pet files at:

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/pet.json
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/spritesheet.webp
```

The atlas must be:

- `1536x1872`
- 8 columns x 9 rows
- each cell `192x208`
- transparent background
- WebP format

Rows:

1. idle
2. running-right
3. running-left
4. waving
5. jumping
6. failed
7. waiting
8. running
9. review

## Workflow

1. Inspect the user-provided material.
   - If it is already a sprite sheet, crop or extract poses.
   - If it is one photo/reference only, generate an 8-bit platformer sprite sheet first, then extract poses.
   - Preserve recognizable identity: silhouette, clothing, hair, colors, accessories, and overall style.

2. For a single photo of a person or character, create a sprite sheet source image.
   - Use image generation when available.
   - Ask for a clean 8-bit platformer sprite sheet, not a portrait.
   - Keep the same outfit, hair, face cues, body proportions, and color palette across all poses.
   - Request a plain or transparent background and evenly spaced frames.
   - Prefer 4 columns x 4 rows or 8 columns x 2 rows so frames are easy to crop.
   - Include poses: idle, walk/run, jump, crouch/fail, wave, thinking/waiting, point/review, celebrate.

Use this prompt shape:

```text
Generate a clean 8-bit pixel art platformer sprite sheet for this person.
Preserve the person's recognizable hairstyle, face shape, outfit colors, and overall silhouette.
Create a cute small game character suitable for a desktop pet.
Use consistent proportions and the same character design in every frame.
Include these poses: idle standing, running right, running left or mirrored run, waving, jumping, crouching or failed, thinking or waiting, pointing or reviewing, celebrating.
Place frames on a transparent or plain light background, evenly spaced, no labels, no text, no UI, no shadows outside the sprite, crisp pixel-art edges.
```

3. Produce at least these pose assets as transparent PNGs:
   - `idle.png`
   - `run.png`
   - `wave.png`
   - `jump.png`
   - `crouch.png` or `failed.png`
   - `thinking.png` or `waiting.png`
   - `point.png` or `review.png`
   - `celebrate.png` if useful for preview/docs

4. Build the Codex atlas.
   - Prefer using `scripts/build_pet_atlas.py`.
   - Use the pose map to repeat/offset frames when the source has fewer than 72 unique animation frames.
   - Mirror `running-right` to create `running-left` when no left-facing art exists.

5. Create `pet.json`.

```json
{
  "id": "<pet-id>",
  "displayName": "<Display Name>",
  "description": "<Short description>",
  "spritesheetPath": "spritesheet.webp"
}
```

6. Validate.
   - If available, run the local hatch pet validator:

```bash
python3 ~/.codex/vendor_imports/skills/skills/.curated/hatch-pet/scripts/validate_atlas.py <pet-dir>/spritesheet.webp --json-out <output-dir>/validation.json
```

   - Confirm dimensions, alpha channel, WebP format, and cell layout.

7. Package.
   - For normal users, the only required files are `pet.json` and `spritesheet.webp`.
   - Put them under `<pet-id>/` in a zip if sharing with non-technical users.
   - Include README instructions only when the user asks for a distributable package.

## Output Structure

Use this structure inside the working repo unless the user requests another path:

```text
pets/<pet-id>/
  pet.json
  spritesheet.webp
  build/spritesheet.png
  qa/contact-sheet.png
  qa/validation.json
assets/<pet-id>/
  idle.png
  run.png
  wave.png
  jump.png
  crouch.png
  thinking.png
  point.png
  celebrate.png
dist/<pet-id>-pet-only.zip
```

## Non-Technical Sharing Notes

When writing install instructions for friends, say this clearly:

- They only need `pet.json` and `spritesheet.webp`.
- The two files must stay together in one folder named after the pet, for example `codexpet`.
- On Mac, the final path should be:

```text
~/.codex/pets/<pet-id>/pet.json
~/.codex/pets/<pet-id>/spritesheet.webp
```

- Restart Codex after copying.
- If the pet does not appear, check for an accidental double folder such as:

```text
~/.codex/pets/<pet-id>/<pet-id>/pet.json
```

## Visual Quality Bar

- Keep the pet readable at small UI size.
- Use transparent backgrounds for pose PNGs and final atlas.
- Avoid changing the character identity between poses.
- When starting from a real photo, stylize the person as an original pixel pet; preserve broad visual cues without trying to make a photorealistic likeness.
- Prefer simple, bold animation offsets over tiny detail changes.
- Use preview images/contact sheets so the user can inspect the result before sharing.

## Scripts

Use `scripts/build_pet_atlas.py` when pose PNGs already exist. Read the script only if customization is needed.
