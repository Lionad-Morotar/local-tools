---
name: move-project
description: 把项目迁移到新目录，并同步所有按项目绝对路径索引的数据（Claude Code 会话历史、缓存、配置，以及编辑器与工具的路径记录），避免迁移后会话丢失或工具跳错路径。
disable-model-invocation: true
---

# Move Project

把项目迁到新目录，并同步所有"按项目绝对路径索引"的 per-project 数据。路径一变这些数据全部失配，本 skill 保证会话历史不丢、配置不错位、工具不跳错路径。

## 核心概念

许多工具按**项目绝对路径**索引数据，路径变了索引就断。迁移 = 搬项目 + 让所有索引跟上。

Claude Code 的索引规则是关键：绝对路径中的 `/` 全替换为 `-`。如 `/Users/x/foo` → `-Users-x-foo`。编码按**字符串路径**算、不解析软链——同一物理项目经两条路径访问会各产生一份编码目录与会话，互不相通。

## 迁移前盘点（必做）

先确认**真实物理路径**：用 `readlink -f` 或比对 `stat` 的 inode 排除软链——"看似两个副本、实则同一物理目录"很常见，把软链当副本会迁错对象。以用户**实际打开项目**的路径作为编码基准，而非软链别名。

再摸清哪些数据绑了旧路径，不要假设清单完备——逐项排查：

- Claude Code 会话历史：`~/.claude/projects/<编码>`
- Claude Code 缓存：`~/Library/Caches/claude-cli-nodejs/<编码>`
- `~/.claude.json`：`projects` 对象，key 是绝对路径
- Claude Code 项目列表：`~/.config/projects.json`（若已注册）
- 编辑器与工具的路径记录：VS Code Project Manager / Favorites / 最近工作区、zoxide 访问历史等
- claude-mem（`~/.claude-mem/claude-mem.db`）：按 **git toplevel 的 basename** 索引 project，**搬家不改名无需迁移**；仅改目录名时才需归并 `observations.project` 与 `sdk_sessions.project`

## 执行顺序

1. **停占用进程** — 检查并停止占用旧目录的进程（如 git fsmonitor daemon），否则 mv 异常。
2. **搬项目** — `mv` 到新位置。同卷为原子操作，跨卷为复制。
3. **同步索引** — 重命名各编码目录、改配置文件 key、清工具路径残留。
4. **验证** — 新位置 git 健康、会话文件完整、新编码目录存在、旧位置已清空。

## 关键约束

- **配置文件改动前备份**，写临时文件 + 断言（JSON 合法、目标 key 已迁移、其余字段未动）通过后才覆盖——这类文件常被运行时进程持有。
- **进程占用** — 迁移前确认无活跃 session 持有旧路径（lsof/ps），否则会话状态损坏。
- **命名冲突** — 目标若已有同名或相关项目，先与用户确认并存还是取代。
- **每次以盘点为准** — 编码规则、缓存与配置路径因 OS 与工具版本而异，不照搬固定清单。
