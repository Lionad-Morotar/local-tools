---
name: git-commit
description: 分批提交 Git 变更的完整工作流。当用户说"提交这个文件"、"帮我 commit"、"分批提交"、"整理提交计划"、"staged 的文件"、"git 提交"时触发
---

## 工作步骤

创建一个 subagent 完成以下步骤

1. 从用户输入抽取要提交的内容，从如“帮我提交本次修改”，此类上下文推理用户想要提交的文件的路径（可能是多个）为变量 `$files`
2. 根据文件路径确定仓库位置，目标文件可能在 submodule 中，而非主仓库
3. 当前已经暂存的**原始 staged** 文件 `$original_staged_files`，可能和 `$files` 有交集
4. 对 `$files` 中每个待提交文件查看 diff，按**修改意图**分批并整理，整理计划后，向用户展示
5. 使用 Ask 工具向用户确认提交计划，确认后提交
6. 恢复原始 staged 状态 `$original_staged_files`
