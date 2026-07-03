# flow-dev worktree 模式

`--worktree` 启用时，`flow-dev` 在隔离的 git worktree 中执行完整开发流程，保证主仓库工作区始终干净。

## 变量定义

| 变量 | 含义 | 获取方式 |
|---|---|---|
| `<repo-root>` | 原项目 git 根目录 | `git rev-parse --show-toplevel`（进入 worktree 前记录） |
| `<working-dir>` | 当前实际工作目录 | worktree 模式下为 worktree 路径；非 worktree 模式下为 `<repo-root>` |
| `<original-branch>` | 创建 worktree 前当前分支 | `git branch --show-current` |
| `<worktree-branch>` | worktree 内部分支 | `worktree-<task-slug>`（由 `EnterWorktree` 创建） |

## 进入 worktree

1. 若当前路径已在 worktree（路径含 `.claude/worktrees/`），直接使用当前 worktree，记录 `<repo-root>` 与 `<original-branch>`。
2. 若未在 worktree：
   - 使用 `EnterWorktree` 创建名为 `<task-slug>` 的 worktree，基分支用 `head`（继承当前本地 HEAD）。
   - 确保 `<repo-root>/.gitignore` 包含 `.claude/worktrees/`（无则追加，不覆盖已有规则）。
3. 禁止同一分支同时存在多个 worktree。

## 上下文继承

- 将 `<repo-root>` 下的 `.env*`、`.env.local` 等本地环境文件复制或软链接到 `<working-dir>`。
- 子代理、外部命令（ck/cg、npm/pnpm、测试脚本）默认以 `<working-dir>` 为 cwd。

## 退出策略

`flow-dev` 的 worktree 退出行为**与 CLAUDE.md 通用 quit worktree workflow 不同**：

- 默认在最终报告后询问：是否将当前 worktree 的改动合并回 `<original-branch>` 并清理 worktree，以便在原分支 review。
- 若用户同意：
  1. 在 `<working-dir>` 中确保所有改动已提交。
  2. 切回 `<repo-root>` 的 `<original-branch>`。
  3. 执行 `git merge --no-ff <worktree-branch>`（trunk-based 项目按 CLAUDE.md 使用 `--no-ff`）。
  4. 使用 `ExitWorktree` 的 `action: "remove"` 退出并清理 worktree。
- 若用户选择保留：
  1. 使用 `ExitWorktree` 的 `action: "keep"`，仅恢复原始 cwd。
  2. 保留 worktree 目录与分支供手动 review。

如需保留未提交改动，请选择 keep；此时再按 CLAUDE.md 的 quit worktree workflow 处理亦可。

## 注意事项

- `EnterWorktree` 创建的 worktree 目录默认位于 `.claude/worktrees/<task-slug>/`。
- 合并前不要先调用 `ExitWorktree remove`，否则 `<worktree-branch>` 会被删除，无法完成 merge。
- 非 worktree 模式下，`<working-dir>` 直接等于 `<repo-root>`，文档路径与原先一致。
