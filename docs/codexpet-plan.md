# CodexPet 生成方案

## 目标

把参考图里的像素商务人物，转成一个可以用于桌面、App 或网页的陪伴型 pet 形象。

CodexPet 的核心识别点：

- 黑色卷发
- 深蓝西装
- 浅紫衬衫
- 自信但友好的表情
- Q 版像素比例
- 可作为助手、提示角色或任务反馈角色

## 已完成素材

素材目录：

```text
assets/codexpet/
  codexpet-sheet.png
  codexpet-preview.png
  manifest.json
  idle.png
  wave.png
  thinking.png
  run.png
  jump.png
  crouch.png
  point.png
  celebrate.png
```

`codexpet-sheet.png` 是原始 sprite sheet。其他 8 张 PNG 是已经切出的透明背景单动作素材。

## Codex Pet 导入状态

已经生成 Codex app 读取的 pet 包：

```text
/Users/yangtiechui/.codex/pets/codexpet/
  pet.json
  spritesheet.webp
```

`spritesheet.webp` 符合 Codex pet 固定格式：

```text
1536 x 1872
8 columns x 9 rows
192 x 208 per cell
transparent background
```

当前版本是“可导入可显示”的兼容版。它使用现有 8 个动作素材组成 9 行状态，部分行通过重复、轻微位移或镜像组成基础动画。后续如果需要更自然的动画，可以再生成每个状态的完整逐帧动作。

## 状态设计

| 状态 | 文件 | 使用场景 |
| --- | --- | --- |
| idle | `idle.png` | 默认待机 |
| wave | `wave.png` | 打招呼、欢迎 |
| thinking | `thinking.png` | 等待、思考、AI 回复中 |
| run | `run.png` | 执行动作、跳转、加载 |
| jump | `jump.png` | 成功反馈 |
| crouch | `crouch.png` | 休息、隐藏、低打扰模式 |
| point | `point.png` | 指引、提示、强调按钮 |
| celebrate | `celebrate.png` | 任务完成、达成目标 |

## 生成 Prompt

```text
Create a cute chibi pixel-art desktop pet based on the reference character.

The character is a tiny confident businessman mascot with black curly hair, tan skin, navy blue suit, lavender shirt, black shoes, expressive eyebrows, and a friendly confident smile.

Make the character look like a small app companion pet, with an oversized head, compact body, readable silhouette, and cute proportions.

Generate a clean pixel-art sprite sheet with 8 consistent poses arranged in a 4x2 grid:
idle standing, waving hello, thinking, running, jumping, crouching, pointing forward, celebrating.

Style: retro game pixel art, crisp pixels, limited color palette, dark outline, consistent proportions across every pose, polished sprite design.

Background: plain light gray or transparent-style flat background.

Do not include text, watermark, logos, extra characters, weapons, or realistic rendering.
```

## 接入建议

前端可以用一个状态字段控制显示哪张图：

```ts
type CodexPetState =
  | "idle"
  | "wave"
  | "thinking"
  | "run"
  | "jump"
  | "crouch"
  | "point"
  | "celebrate";
```

建议行为映射：

```text
页面空闲: idle
用户进入页面: wave
AI 生成中: thinking
执行任务中: run
普通成功: jump
完成重要任务: celebrate
需要提示用户: point
用户最小化助手: crouch
```

## 后续升级

下一版可以继续做：

- 每个状态 2-6 帧的动画序列
- 统一尺寸的 sprite atlas
- 透明 WebP 版本
- React / Vue / Expo 组件
- 拖拽、眨眼、跟随鼠标、点击反馈
