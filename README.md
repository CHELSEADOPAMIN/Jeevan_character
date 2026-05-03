# CodexPet 中文安装说明

CodexPet 是一个基于像素商务人物生成的 Codex 自定义 pet。这个仓库同时包含：

- Codex 自定义 pet 运行文件
- CodexPet 插件资源包
- 单独 PNG 动作素材
- HTML 预览 demo

## 发送给朋友的文件

把这个压缩包发给朋友：

```text
dist/codexpet-plugin.zip
```

压缩包里包含：

```text
plugins/codexpet/
.agents/plugins/marketplace.json
pets/codexpet/
```

真正让 Codex 识别 pet 的核心文件是：

```text
pets/codexpet/pet.json
pets/codexpet/spritesheet.webp
```

## 安装方式一：只安装成 Codex Pet

适合只想把 CodexPet 作为 Codex 里的 pet 使用。

1. 解压 `codexpet-plugin.zip`。

2. 找到解压后的目录：

```text
pets/codexpet/
```

里面应该有：

```text
pet.json
spritesheet.webp
```

3. 打开自己的用户目录。

macOS 通常是：

```text
/Users/你的用户名/
```

4. 找到或创建这个目录：

```text
~/.codex/pets/
```

如果没有 `.codex` 或 `pets` 文件夹，就手动创建。

5. 把解压出来的 `pets/codexpet` 整个文件夹复制进去。

最终文件结构必须是：

```text
~/.codex/pets/codexpet/pet.json
~/.codex/pets/codexpet/spritesheet.webp
```

不要变成下面这种多套了一层的结构：

```text
~/.codex/pets/codexpet/codexpet/pet.json
```

这是错误的。

6. 重启 Codex。

7. 如果当前 Codex 版本支持自定义 pet，就可以在 pet 选择里看到：

```text
CodexPet
```

## 安装方式二：同时安装插件资源包

适合想让 Codex 也能识别这个素材包、技能说明和 demo 的朋友。

1. 解压 `codexpet-plugin.zip`。

2. 复制插件目录。

从解压目录里找到：

```text
plugins/codexpet/
```

复制到：

```text
~/plugins/codexpet/
```

最终结构：

```text
~/plugins/codexpet/.codex-plugin/plugin.json
~/plugins/codexpet/assets/
~/plugins/codexpet/skills/
~/plugins/codexpet/README.md
```

3. 配置本地插件 marketplace。

打开或创建：

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

如果这个文件已经存在，就只需要把下面这段加入 `plugins` 数组：

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

4. 同时安装 pet 文件。

把解压出来的：

```text
pets/codexpet/
```

复制到：

```text
~/.codex/pets/codexpet/
```

5. 重启 Codex。

## 快速检查

安装完成后，检查这两个文件是否存在：

```text
~/.codex/pets/codexpet/pet.json
~/.codex/pets/codexpet/spritesheet.webp
```

`pet.json` 内容应该类似：

```json
{
  "id": "codexpet",
  "displayName": "CodexPet",
  "description": "Your personal pixel companion generated from your suited character.",
  "spritesheetPath": "spritesheet.webp"
}
```

## 常见问题

如果 Codex 里没显示：

1. 确认路径没有多套一层 `codexpet`。
2. 确认已经重启 Codex。
3. 确认当前 Codex 版本支持自定义 pet。
4. 确认文件名是 `pet.json` 和 `spritesheet.webp`。
5. 确认 `pet.json` 里的 `"spritesheetPath": "spritesheet.webp"` 和实际文件名一致。

## 本地预览

项目里也有一个 HTML 预览页：

```text
examples/codexpet-demo.html
```

插件包内的预览页是：

```text
plugins/codexpet/examples/index.html
```

直接用浏览器打开即可查看和切换 CodexPet 的动作状态。
