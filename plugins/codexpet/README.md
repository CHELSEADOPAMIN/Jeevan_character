# CodexPet Plugin

CodexPet is a local Codex plugin package containing a pixel-art companion pet generated from the supplied reference character.

## 中文安装说明

发送给朋友的压缩包：

```text
dist/codexpet-plugin.zip
```

### 方式一：只安装成 Codex Pet

1. 解压 `codexpet-plugin.zip`。
2. 找到解压后的 `pets/codexpet/`。
3. 把整个 `codexpet` 文件夹复制到：

```text
~/.codex/pets/codexpet/
```

最终结构必须是：

```text
~/.codex/pets/codexpet/pet.json
~/.codex/pets/codexpet/spritesheet.webp
```

不要复制成：

```text
~/.codex/pets/codexpet/codexpet/pet.json
```

4. 重启 Codex。
5. 如果当前 Codex 版本支持自定义 pet，就可以看到 `CodexPet`。

### 方式二：同时安装插件资源包

1. 解压 `codexpet-plugin.zip`。
2. 复制：

```text
plugins/codexpet/
```

到：

```text
~/plugins/codexpet/
```

3. 打开或创建：

```text
~/.agents/plugins/marketplace.json
```

如果文件不存在，可以写入：

```json
{
  "name": "local-user-plugins",
  "interface": {
    "displayName": "Local User Plugins"
  },
  "plugins": [
    {
      "name": "codexpet",
      "source": {
        "source": "local",
        "path": "./plugins/codexpet"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

如果文件已经存在，只把下面这段加入 `plugins` 数组：

```json
{
  "name": "codexpet",
  "source": {
    "source": "local",
    "path": "./plugins/codexpet"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

4. 仍然需要把 `pets/codexpet/` 复制到：

```text
~/.codex/pets/codexpet/
```

5. 重启 Codex。

### 快速检查

安装后确认这两个文件存在：

```text
~/.codex/pets/codexpet/pet.json
~/.codex/pets/codexpet/spritesheet.webp
```

如果 Codex 里没显示，优先检查路径是否多套了一层 `codexpet`，然后重启 Codex。

## Contents

```text
plugins/codexpet/
  .codex-plugin/plugin.json
  README.md
  assets/
    icon.png
    logo.png
    screenshot1.png
    screenshot2.png
    codexpet/
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
  examples/
    index.html
  skills/
    codexpet/
      SKILL.md
```

## Import Into Codex

This package has also been installed as a Codex custom pet at:

```text
~/.codex/pets/codexpet/
  pet.json
  spritesheet.webp
```

Restart Codex after this package is written. If your Codex build supports custom pets, `CodexPet` should appear as a selectable local pet.

This repo also includes a plugin marketplace entry at:

```text
.agents/plugins/marketplace.json
```

The entry points to:

```text
./plugins/codexpet
```

If your Codex environment reads repo-local marketplace files, this plugin is ready to discover from this workspace.

For a home-local install, copy the `plugins/codexpet` folder to:

```text
~/plugins/codexpet
```

Then add an entry in:

```text
~/.agents/plugins/marketplace.json
```

using:

```json
{
  "name": "codexpet",
  "source": {
    "source": "local",
    "path": "./plugins/codexpet"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

## Usage

Open the local preview:

```text
examples/index.html
```

Use state PNGs from:

```text
assets/codexpet/
```

Recommended web CSS:

```css
.codexpet {
  image-rendering: pixelated;
}
```

Recommended state names:

```text
idle, wave, thinking, run, jump, crouch, point, celebrate
```

## Codex Pet Runtime Files

The runtime pet files are:

```text
pets/codexpet/build/spritesheet.png
pets/codexpet/qa/contact-sheet.png
```

The installed Codex copy is:

```text
~/.codex/pets/codexpet/pet.json
~/.codex/pets/codexpet/spritesheet.webp
```
