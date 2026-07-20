# Excalidraw 图表存档

当内容类型为 Excalidraw 图表时，按本规范生成并存档。通用存档流程（vault 路径、文件名、确认）见 `../SKILL.md`。

## Workflow

1. **识别意图** — 从对话中提取用户要绘制的内容描述
2. **选择图表类型** — 流程图、思维导图、层级图、关系图、架构图、时间线图、矩阵图等
3. **生成图表** — 调用 excalidraw-diagram 技能逻辑生成 JSON
4. **构建文件** — Obsidian 模式（默认）：
   ```markdown
   ---
   excalidraw-plugin: parsed
   tags: [excalidraw, {target}]
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
5. **写入文件** — 路径：`<vault 路径>/{主题}.{类型}.md`，如 `用户登录流程.flowchart.md`
6. **确认** — 告知路径、图表类型和使用说明

## Design Rules

遵循 excalidraw-diagram 技能规范：

- 文本使用 `fontFamily: 5`（Excalifont）
- 双引号 `"` 替换为 `『』`，圆括号 `()` 替换为 `「」`
- 配色：浅蓝 `#a5d8ff`（输入）、浅绿 `#b2f2bb`（成功）、浅橙 `#ffd8a8`（警告）、浅紫 `#d0bfff`（处理中）
- 画布范围：0-1200 x 0-800 像素
