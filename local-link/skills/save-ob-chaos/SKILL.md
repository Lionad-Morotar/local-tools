---
name: save-ob-chaos
description: 将对话内容快速存档到 Obsidian Chaos 文件夹。触发词："存档到 Obsidian"、"保存到 Chaos"、"ob 存档"、"记下这个"、"保存这段内容"、"存到 chaos"。
---

# Save to Obsidian Chaos

将对话中的重要内容存档到 `/Users/lionad/Github/Obsidian/Chaos/`。

## Workflow

1. **识别存档内容**：
   1.1 如果用户输入明确了需存档内容，使用用户输入
   1.2 如果上下文涉及了文档，如 `*.md`，则完整保存相关文档，可能是多份
   1.3 如果无法判断存档内容，使用 Ask 工具询问用户
2. **生成文件名** - 基于主题生成 `{task-name}.md`，长度限制 50 字符，去除特殊字符
3. **构建内容** - 使用以下格式：
   ```markdown
   ---
   created: {ISO8601}
   source: claude-code-conversation
   tags: [chaos, archive]
   ---

   {content}
   ```
4. **写入文件** - 路径：`/Users/lionad/Github/Obsidian/Chaos/{taskname}.md`
5. **确认** - 告知完整路径和内容概要

## Implementation

- 使用 `mkdir -p /Users/lionad/Github/Obsidian/Chaos` 确保目录存在
- 使用 Write 工具写入文件
- 文件已存在时询问是否覆盖或重命名
