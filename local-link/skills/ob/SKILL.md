---
name: ob
description: 将对话内容、Excalidraw 或 Mermaid 图表存档到 Obsidian vault（默认 Chaos）。触发词："存档到 Obsidian"、"保存到 Chaos"、"ob 存档"、"记下这个"、"存到 chaos"、"画个图存到 ob"、"excalidraw 存档"、"画流程图保存"、"mermaid 存档"、"画架构图到 ob"。
argument-hint: "[--target <vault>] <content>"
disable-model-invocation: true
---

将重要内容或图表存档到 Obsidian。

## 参数

- `--target <vault>`：目标 vault，默认 `chaos`。vault 路径映射：
  - `chaos` → `~/Github/Obsidian/Chaos/`
  - 新增 vault 时在此登记路径
  - 未登记的 vault 名 → 视为 `~/Github/Obsidian/<vault>/`（自动创建）

## 内容类型（按上下文与关键词识别）

- 含 mermaid 代码块或 "mermaid" → 见 `references/mermaid.md`
- 含 "excalidraw" / "画图" / "流程图" / "架构图" / "思维导图" / "关系图" 等 → 见 `references/excalidraw.md`
- 其他 → 本文档的通用 Workflow

## 需存档内容来源

- 如果用户输入明确了内容，使用用户输入
- 如果上下文涉及了文档（如 `*.md`），则完整拷贝相关文档，可能是多份
- 如果无法判断，使用 Ask 工具询问用户

## Workflow

如果是拷贝文件：`cp` 源文件到目标路径 → `Read` 前 50 行 → 若无 frontmatter 则 `sed -i` 追加头。

否则按以下格式生成：

1. 确定文件名 — 基于主题生成 `{task-name}.md`，长度限制 50 字符，去除特殊字符（图表类型可加类型后缀，如 `{主题}.flowchart.md`）
2. 确定元信息 —
   ```markdown
   ---
   created: {ISO8601}
   source: claude-code-conversation
   tags: [{target}, archive]
   ---

   {content}
   ```
3. `mkdir -p <vault 路径>` 确保目录存在
4. 写入文件（已存在时询问是否覆盖）
5. 确认 — 告知完整路径和内容概要
