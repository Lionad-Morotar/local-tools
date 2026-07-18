---
name: move-project
description: 把项目迁移到新目录，并同步所有按项目绝对路径索引的数据（Claude Code 会话历史、缓存、配置，以及编辑器与工具的路径记录），避免迁移后会话丢失或工具跳错路径。
argument-hint: <source path> <target path>
disable-model-invocation: true
---

# Move Project

把项目迁到新目录，并同步所有"按项目绝对路径索引"的 per-project 数据。路径一变这些数据全部失配，本 skill 保证会话历史不丢、配置不错位、工具不跳错路径。

## 核心概念

许多工具按**项目绝对路径**索引数据，路径变了索引就断。迁移 = 搬项目 + 让所有索引跟上。

Claude Code 的索引规则是关键：绝对路径中的 `/` 全替换为 `-`。如 `/Users/x/foo` → `-Users-x-foo`。编码按**字符串路径**算、不解析软链——同一物理项目经两条路径访问会各产生一份编码目录与会话，互不相通。

claude-mem 的索引规则不同：它按 **git toplevel 的 basename** 索引 project。搬家不改名无需迁移；仅改目录名时才需归并 `observations.project` 与 `sdk_sessions.project`。

## 迁移前盘点

### 1. 确认真实物理路径

用 `readlink -f` 或比对 `stat` 的 inode 排除软链——"看似两个副本、实则同一物理目录"很常见，把软链当副本会迁错对象。以用户**实际打开项目**的路径作为编码基准，而非软链别名。

### 2. 调查目标环境

不要假设目标只是一个空目录。必须先摸清目标目录的约定，否则搬过去会破坏现有结构。

必查项：

- 目标路径是否已是 git 仓库或 git 仓库的子目录？运行 `git rev-parse --show-toplevel`。
- 目标目录中现有子项目是普通目录、git submodule、worktree 还是 subtree？
  - `ls -la <target-parent>/*/.git`：若出现 `.git` 文件且内容为 `gitdir: ...`，说明是 submodule。
  - `cat <target-root>/.gitmodules`：读取 submodule URL 与路径命名模式。
  - `git ls-files <target-parent>/<existing-child>`：若只返回目录本身，说明是 submodule gitlink。
- 目标目录的命名约定是什么？（前缀、日期格式、kebab-case 规则）
- 目标仓库是否有 README、CLAUDE.md、agents.md 或类似约定文档？**优先读取这些文件**，它们通常明确记录子项目组织方式、命名规范、remote 命名模式。
- 子项目是否必须拥有独立 remote？remote 命名模式是什么？（如 `demo-<name>`）
- 子项目默认 private 还是 public？是否需要用户明确可见性？

### 3. 排查路径索引数据

不要假设清单完备——逐项排查：

- Claude Code 会话历史：`~/.claude/projects/<编码>`
- Claude Code 缓存：`~/Library/Caches/claude-cli-nodejs/<编码>`
- `~/.claude.json`：`projects` 对象，key 是绝对路径
- Claude Code 项目列表：`~/.config/projects.json`（若已注册）
- 编辑器与工具的路径记录：VS Code Project Manager / Favorites / 最近工作区、zoxide 访问历史等
- claude-mem（`~/.claude-mem/claude-mem.db`）：按 git toplevel basename 索引

## 执行顺序

### 阶段 1：停占用进程

不是所有占用都必须停止。分级处理：

| 类型 | 示例 | 处理方式 |
|---|---|---|
| 必须自动停止 | node dev server、git fsmonitor daemon、build watcher、测试进程 | `lsof +D <old-path>` 定位后停止 |
| 需用户知情 | VS Code、Cursor、JetBrains、Typora 等前台编辑器 | 提醒用户迁移后重新打开新路径，不强制关闭 |
| 可容忍 | 只读打开的文件、shell cwd | `mv` 后句柄自然失效，无需预处理 |

迁移前用 `lsof +D <old-path>` 输出占用清单，明确告诉用户哪些需要其手动配合。

### 阶段 2：搬项目

同卷 `mv` 为原子操作，跨卷为复制。

- 普通目录：直接 `mv <old> <new>`。
- 保留 gitignore 的本地目录（如 `zRefs`、`.output`、`dist`）应一并迁移，除非用户明确不要。
- `node_modules`、`.pnpm-store` 通常不迁移，目标位置重新安装。
- 若目标为 git submodule 集合，见下方"场景 A"。

### 阶段 3：同步索引

按顺序执行：

1. 备份 `~/.claude.json`、`~/.config/projects.json`、`~/.claude-mem/claude-mem.db`。
2. 修改 `~/.claude.json` 中 projects 的 key：旧路径 → 新路径。
3. 修改 `~/.config/projects.json` 中的 `rootPath`。
4. 重命名 Claude Code 会话目录：`~/.claude/projects/<旧编码>` → `~/.claude/projects/<新编码>`。
5. 重命名 Claude Code 缓存目录：`~/Library/Caches/claude-cli-nodejs/<旧编码>` → `~/Library/Caches/claude-cli-nodejs/<新编码>`。
6. 替换会话历史与缓存中的旧绝对路径文本：

   ```bash
   find ~/.claude/projects/<新编码> -type f \( -name '*.jsonl' -o -name '*.txt' \) -print0 \
     | xargs -0 perl -pi -e 's|<old-path>|<new-path>|g'
   
   find ~/Library/Caches/claude-cli-nodejs/<新编码> -type f \( -name '*.jsonl' -o -name '*.txt' -o -name '*.json' \) -print0 \
     | xargs -0 perl -pi -e 's|<old-path>|<new-path>|g'
   ```

7. 若目录名改变，归并 claude-mem：

   ```bash
   sqlite3 ~/.claude-mem/claude-mem.db "
   DROP TRIGGER observations_au;
   UPDATE observations SET project = '<new-basename>' WHERE project = '<old-basename>';
   UPDATE sdk_sessions SET project = '<new-basename>' WHERE project = '<old-basename>';
   CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
     INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
     VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
     INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
     VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
   END;
   "
   ```

8. 清理 zoxide 等工具路径残留：`zoxide remove <old-path>`（如有记录）。

### 阶段 4：验证

- [ ] 旧路径在 `~/.claude.json`、`~/.config/projects.json`、Claude 编码目录、缓存目录中无残留。
- [ ] 新路径在所有上述索引中正确存在。
- [ ] `git status`、`git log` 在新位置正常工作。
- [ ] 若为 submodule：`git submodule status` 显示正确的 gitlink 与 commit。
- [ ] 若为 submodule：`.gitmodules` 包含正确条目，父仓库 `.git/config` 同步。
- [ ] `git check-ignore` 验证 `zRefs`、`.output`、`dist`、`node_modules` 被正确忽略。
- [ ] 被保留的 gitignore 目录确实存在于新位置。
- [ ] claude-mem 中旧 project 名称为 0 条，新 project 名称数量正确。
- [ ] session 历史与缓存文件中无旧绝对路径文本残留。
- [ ] 旧目录已清空或按用户要求保留为软链/备份。

## 常见场景处理

### 场景 A：目标为 git submodule 集合

若目标目录中现有子项目都是 submodule（`.git` 为文件、父仓库存在 `.gitmodules`），按此流程：

1. 明确 remote 决策（需用户确认）：
   - 是否创建新 remote？
   - remote 命名是否符合目标约定？
   - 仓库可见性 private / public？
   - 是否在本次迁移中执行 `git push`？
2. 若需要，创建 GitHub/GitLab remote 并设为对应可见性。
3. 在目标子目录内添加 remote：`git remote add origin <url>`。
4. 若用户同意本次 push：commit 必要变更（如 `.gitignore`）并 push。
5. 在父仓库中注册 submodule：
   - 优先使用 `git submodule add <url> <path>`。
   - 若 `<path>` 已存在，**先完整备份到独立位置**，删除已存在目录，让 `git submodule add` 创建标准结构，再把本地工作目录内容合并回去。
   - **禁止直接 `mv <project>/.git <parent>/.git/modules/<path>`**，极易因目录已存在或嵌套而损坏。
6. 若标准命令失败，使用 `git update-index --add --cacheinfo 160000,<commit-sha>,<path>` 手动写入 gitlink。
7. 在父仓库中 stage 并 commit `.gitmodules` 与 gitlink。

### 场景 B：目标为普通目录

直接 `mv`，然后按需创建或更新目标父仓库的 `.gitignore`，确保 `node_modules`、构建产物等不被意外提交。

### 场景 C：跨卷迁移

`mv` 会变成复制 + 删除。对大仓库建议用 `rsync -aP --exclude=node_modules <old>/ <new>/`，然后验证文件完整性再删除旧目录。

## 关键约束

- **配置文件改动前备份**，写临时文件 + 断言（JSON 合法、目标 key 已迁移、其余字段未动）通过后才覆盖——这类文件常被运行时进程持有。
- **修改 .git 结构前必须备份 .git 目录**：`cp -a <project>/.git /tmp/<project>-git-backup-$(date +%s)`。
- **分阶段删除**：不要 `rm -rf` 可能包含唯一数据的目录。先移动到临时区，验证新结构可用后再删除。
- **命名冲突**：目标若已有同名或相关项目，先与用户确认并存还是取代。
- **每次以盘点为准**：编码规则、缓存与配置路径因 OS 与工具版本而异，不照搬固定清单。

## 用户必须拍板的决策

以下选择会显著影响迁移结果，skill 不应替用户默认：

1. 目标子项目命名（是否使用日期前缀、具体日期选择）。
2. 是否创建 remote、remote 名称、可见性、是否立即 push。
3. 是否迁移被 gitignore 的大目录（如 `zRefs` 可能很大）。
4. 是否保留旧目录作为软链或备份。
5. 如何处理目标仓库中已有的未提交改动。
6. 是否同步迁移 `~/.config/projects.json` 等编辑器项目列表。
