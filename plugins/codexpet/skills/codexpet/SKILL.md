---
name: codexpet
description: Use the CodexPet pixel companion asset pack in local app, web, desktop-pet, or UI work. Trigger when the user asks for CodexPet, a pet character, a companion mascot, or state-based pixel pet assets from this plugin.
---

# CodexPet Skill

CodexPet is a local pixel-art companion asset pack.

Use these assets when the user wants:

- a CodexPet companion in a web/app UI
- a desktop pet prototype
- a state-based mascot for loading, success, tips, and idle states
- a pixel-art character based on the user's suited reference character

## Asset Paths

All paths are relative to the plugin root:

```text
assets/codexpet/codexpet-sheet.png
assets/codexpet/codexpet-preview.png
assets/codexpet/manifest.json
assets/codexpet/idle.png
assets/codexpet/wave.png
assets/codexpet/thinking.png
assets/codexpet/run.png
assets/codexpet/jump.png
assets/codexpet/crouch.png
assets/codexpet/point.png
assets/codexpet/celebrate.png
```

## State Mapping

Use this mapping by default:

```text
idle: default resting state
wave: greeting or onboarding
thinking: waiting, loading, or AI reasoning
run: executing an action
jump: small success feedback
crouch: resting, hiding, or minimized mode
point: guidance or tips
celebrate: completed task or major success
```

## Implementation Guidance

Prefer transparent single-state PNG files for UI integration.

Use `assets/codexpet/manifest.json` when the consuming app should load states dynamically.

Use `image-rendering: pixelated` in web UIs so the pixel art stays crisp.

For a simple preview, open:

```text
examples/index.html
```
