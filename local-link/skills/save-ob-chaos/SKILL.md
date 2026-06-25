---
name: save-ob-chaos
description: 将对话内容快速存档到 Obsidian Chaos 文件夹。触发词："存档到 Obsidian"、"保存到 Chaos"、"ob 存档"、"记下这个"、"保存这段内容"、"存到 chaos"。
argument-hint: <content to save>
disable-model-invocation: true
---

将重要内容存档到我的 Obsidian 文档归档处。

* $target_valt: `mkdir -p ~/Github/Obsidian/Chaos`
* 需存档内容：
  - 如果用户输入明确了需存档内容，使用用户输入
  - 如果上下文涉及了文档，如 `*.md`，则完整拷贝相关文档，可能是多份
  - 如果无法判断存档内容，使用 Ask 工具询问用户

## Workflow

如果是拷贝文件：`cp` 源文件到目标路径 → `Read` 前 50 行 → 若无 frontmatter 则 `sed -i` 追加头。

否则按照以下格式生成内容：

1. 确定文件名 - 基于主题生成 `{task-name}.md`，长度限制 50 字符，去除特殊字符
2. 确定元信息 - 使用以下格式：
   ```markdown
   ---
   created: {ISO8601}
   source: claude-code-conversation
   tags: [chaos, archive]
   ---

   {content}
   ```
3. 写入文件（已存在时询问否覆盖）
4. 确认 - 告知完整路径和内容概要
