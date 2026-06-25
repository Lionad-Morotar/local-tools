---
name: save-ob-chaos-excalidraw
description: 绘制 Excalidraw 图表并存档到 Obsidian Chaos 文件夹。触发词："画个图存到 Obsidian"、"excalidraw 存档"、"画个流程图保存"、"画图存到 chaos"、"创建图表并存档"、"画架构图到 ob"。
argument-hint: <diagram description>
disable-model-invocation: true
---

# Save Excalidraw to Obsidian Chaos

绘制 Excalidraw 图表并存档到 `~/Github/Obsidian/Chaos/`。

## Workflow

1. **识别意图** - 从对话中提取用户要绘制的内容描述
2. **选择图表类型** - 流程图、思维导图、层级图、关系图、架构图、时间线图、矩阵图等
3. **生成图表** - 调用 excalidraw-diagram 技能逻辑生成 JSON
4. **构建文件** - Obsidian 模式（默认）：
   ```markdown
   ---
   excalidraw-plugin: parsed
   tags: [excalidraw, chaos]
   created: {ISO8601}
   ---
   ==⚠ Switch to EXCALIDRAW VIEW... ⚠==
   # Excalidraw Data
   ## Text Elements
   %%
   ## Drawing
   ```json
   {excalidraw-json}
   ```
   %%
   ```
5. **写入文件** - 路径：`~/Github/Obsidian/Chaos/{taskname}.md`
6. **确认** - 告知路径、图表类型和使用说明

## Design Rules

遵循 excalidraw-diagram 技能规范：
- 文本使用 `fontFamily: 5`（Excalifont）
- 双引号 `"` 替换为 `『』`，圆括号 `()` 替换为 `「」`
- 配色：浅蓝 `#a5d8ff`（输入）、浅绿 `#b2f2bb`（成功）、浅橙 `#ffd8a8`（警告）、浅紫 `#d0bfff`（处理中）
- 画布范围：0-1200 x 0-800 像素

## Implementation

- 使用 `mkdir -p ~/Github/Obsidian/Chaos` 确保目录存在
- 文件名格式：`{主题}.{类型}.md`，如 `用户登录流程.flowchart.md`
