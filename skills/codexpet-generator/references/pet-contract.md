# Codex Custom Pet Reference

Runtime files:

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/pet.json
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/spritesheet.webp
```

Atlas:

- Format: WebP with alpha
- Size: 1536x1872
- Grid: 8 columns x 9 rows
- Cell: 192x208

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

Minimal `pet.json`:

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A custom Codex pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

Shareable install package:

```text
my-pet/
  pet.json
  spritesheet.webp
```

The receiving user copies the `my-pet` folder to:

```text
~/.codex/pets/my-pet/
```
