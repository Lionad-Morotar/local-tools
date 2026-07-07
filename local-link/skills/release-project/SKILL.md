---
name: release-project
description: 项目版本发布流程指导，帮助用户完成版本规划、Changelog 管理、版本号升级、Git 标签创建和 npm 首次发布准备。Use when: (1) 用户需要发布新版本 (2) 需要创建版本发布流程 (3) 需要管理版本号和 Changelog (4) 需要自动化版本发布 (5) 需要识别分支模型并确保发版分支同步 (6) 首次 npm 发布准备
argument-hint: [--changelog-only] [--sync-to <target-branch>]
---

# Release Project

指导项目版本发布的完整流程，从版本规划到 Git 标签创建。

## 前置要求

- 当前仓库使用 Git 进行版本控制
- 项目配置了 `package.json`（Node.js 项目）或相应的版本管理文件
- 分支模型可识别（第 1 步调用 `recognize-codebase-branch-flow` 技能自动判定 trunk-based 或 release-branch）

## Changelog-only 模式

传入 `--changelog-only` 时，仅执行「3. Changelog 整理」中的 `[Unreleased]` 维护，**跳过用户确认、不升级版本号、不打 Git 标签、不推送**，整理完即结束。把“整理变更条目”与“真正发版”解耦，供自动化流程（如 `flow-north-star-loop`）在开发过程中增量沉淀 changelog。

该模式下：
- 只更新 `## [Unreleased]` 区块（遵循 Keep a Changelog 分类、正交合并、`[internal]` 标记）
- 自动确认，不暂停询问
- 不触碰版本号、Git tag、远程推送
- 完整发版流程（版本号升级、打 tag、test→main 合并、npm 发布）仍由用户**不带**该参数调用本技能完成

## Branch-sync 模式（`--sync-to <target-branch>`）

传入 `--sync-to release` 时，**仅执行分支同步**，跳过版本规划、Changelog 整理、版本号升级、Git 标签创建和 npm 发布。用于把当前分支（如 `dev`）的最新内容同步到目标分支（如 `release`），以便 Jenkins 等 CI/CD 触发运行。

该模式下：

- 不升级版本号、不打 tag、不写 Changelog
- 先 `git fetch` 确保判断准确
- 检测当前分支与目标分支的相对位置，自动选择 **fast-forward** 或 **non-fast-forward merge**
- 同步完成后切回源分支
- 如果目标分支不存在，询问是否基于当前分支创建

### 同步路径决策

```bash
# 当前分支领先目标分支（ff 可能）
AHEAD=$(git log --oneline <target>..<current> | wc -l)

# 目标分支领先当前分支
BEHIND=$(git log --oneline <current>..<target> | wc -l)
```

| 状态 | 决策 |
|-----|------|
| `AHEAD > 0 && BEHIND == 0` | 当前分支是目标分支的祖先，执行 `--ff-only` 同步 |
| `AHEAD == 0 && BEHIND > 0` | 目标分支已经领先，无需同步，直接结束 |
| `AHEAD > 0 && BEHIND > 0` | 两分支分叉，按项目 merge style 执行 `--no-ff` merge 或询问用户 |
| `AHEAD == 0 && BEHIND == 0` | 两分支一致，无需同步，直接结束 |

### fast-forward 同步

```bash
git checkout <target-branch>
git merge <source-branch> --ff-only
git push origin <target-branch>
```

### non-fast-forward 同步

分叉时按项目 merge style 选择：

- **trunk-based 项目**（如 github flow，主分支为发布分支）：`git merge <source-branch> --no-ff -m "chore: sync <source> into <target>"`
- **持续在 dev/release 分支集成的项目**：优先使用 fast-forward；若无法 ff，询问用户是 `--no-ff` merge 还是先把源分支 rebase 到目标分支后再同步

### 通用保护

1. 同步前检查工作区是否干净；不干净则拒绝或让用户先提交
2. 同步前确保源分支已 `git push origin <source-branch>`
3. 同步后切回源分支
4. push 失败时（如目标分支受保护）立即报告，不继续后续发版流程

## 工作流程

```
┌─────────────────┐
│  0. 分支检查     │
│  (识别分支模型,  │
│   确保发版分支)  │
└────────┬────────┘
         ▼
┌─────────────────┐
│  1. 版本规划     │
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. Changelog   │
│    整理         │
└────────┬────────┘
         │
         ▼
   ┌──────────┐
   │ 用户确认  │
   └────┬─────┘
        │ 确认后继续
        ▼
┌─────────────────┐
│  3. 版本号升级   │
└────────┬────────┘
         ▼
┌─────────────────┐
│  4. Git 提交    │
│   & 标签        │
└────────┬────────┘
         ▼
┌─────────────────┐
│  5. 首次发布    │
│    检测&准备    │
└─────────────────┘
```

## 1. 分支检查

**目标**：识别项目分支模型，据此选择发版路径，并确保发版分支干净且与远程同步。

### 1.1 识别分支模型

自动调用 `recognize-codebase-branch-flow` 技能分析当前项目分支模型，获取其 `branch_model` 判定：

**明确映射**（直接走对应路径，无需询问）：

| recognize 输出 | 发版路径 |
|---------------|---------|
| `github flow` | Trunk-based（main 直接打 tag） |
| `gitflow` | Release-branch（develop → release → main） |

**模糊映射**（`gitlab flow` / `无显著模型` / `自建模式`）或 recognize 调用失败：自动执行轻量探测——
1. 检测长期 `release`/`develop` 分支：`git branch -a --list '*release*' '*develop*'`
2. 检测最近 tag 落在哪个分支：`git tag -l 'v*' --sort=-v:refname | head -1` → `git branch --contains <tag>`
3. tag 位置优先于分支名（tag 反映真实发版行为，分支名可能误导）

探测有定论则自动选路径；探测仍无定论才询问用户。

### 1.2 Trunk-based 路径（github flow 等）

主分支（main/master）直接打 tag 发版：

1. **确认在主分支**：
   ```bash
   git branch --show-current
   ```
   不在主分支则 `git checkout main`

2. **拉取最新（仅快进）**：
   ```bash
   git pull --ff-only origin main
   ```

3. **验证工作区干净**：`git status`，确保无未提交变更

### 1.3 Release-branch 路径（gitflow 等）

有长期 release 分支用于发版准备：

1. **检查当前分支**：`git branch --show-current`，不在 release 则 `git checkout release`

2. **确保 release 分支最新**：

   **情况 A：开发在 develop/feature 分支**
   ```bash
   git fetch origin
   git merge origin/develop --no-ff -m "chore: merge develop into release"
   ```

   **情况 B：已在 release 分支开发**
   ```bash
   git pull origin release
   ```

3. **验证工作区干净**：`git status`，确保无未提交变更

### 1.4 分支同步决策

仅当 1.1 映射结果需要询问时，使用 Ask 工具确认：
- "检测到分支模型为 `X`，应走 [Trunk-based/Release-branch] 路径，是否正确？"
- "当前开发是否在 develop/feature 分支？需要合并到 release 吗？"
- "是否需要创建 release 分支？（如果不存在）"

### 1.5 Alpha / Prerelease 分支策略

当发布的版本是 prerelease（版本号含 `-`，如 `0.4.0-alpha.2`）时：

- 如果当前分支是 feature / alpha 专用分支（非 `main`/`master`/`release`），**直接在该分支上打 tag 发版，不合并回 main**。
- 版本号升级、Changelog、Git 提交与标签都在当前分支完成。
- 推送时使用当前分支：`git push origin <当前分支> --tags`。

只有在发 **stable** 版本时，才需要把变更合并到 `main`（trunk-based）或 `release`（gitflow）后再打 tag。

### 1.6 test 分支合并（flow-north-star-loop 产物）

当项目存在长期 `test` 分支作为自动化开发循环（`flow-north-star-loop`）的集积分支时，发版前需先把 `test` 上已通过 e2e 验证的变更合并到发版分支——这填补 nsl-loop 产出（`test`）与发版（`main` 打 tag）之间的缝隙：

1. **检测 test 分支**：`git branch --list test`
2. **检测待合并变更**：`git log --oneline <发版分支>..test`（若含 `feat/nsl-epic/*` 章鱼合并痕迹，确认是 nsl 产物）
3. **合并**：
   - trunk-based：`git checkout main && git merge --no-ff test -m "chore: merge test into main for release"`
   - gitflow：合并到 `release` 分支
4. **无 test 分支或无差异**：跳过本步，按常规流程发版

### 1.7 `--sync-to` 分支同步

当传入 `--sync-to <target-branch>` 时，本技能进入**纯分支同步模式**，不执行版本号、Changelog、tag 等发版操作。

#### 执行流程

1. **记录源分支**：
   ```bash
   SOURCE=$(git branch --show-current)
   TARGET=<用户传入的目标分支>
   ```

2. **拉取远端最新状态**：
   ```bash
   git fetch origin
   ```

3. **检查目标分支是否存在**：
   - 本地：`git branch --list "$TARGET"`
   - 远端：`git ls-remote --heads origin "$TARGET"`
   - 都不存在：询问用户是否创建；若确认，执行 `git checkout -b "$TARGET"`

4. **确保远端 tracking 存在**：
   - 若本地有目标分支但没有 tracking：`git branch -u origin/"$TARGET" "$TARGET"`
   - 若只有远端有目标分支：`git checkout -t origin/"$TARGET"`

5. **计算相对位置**：
   ```bash
   AHEAD=$(git rev-list --count "$TARGET".."$SOURCE")
   BEHIND=$(git rev-list --count "$SOURCE".."$TARGET")
   ```

6. **根据相对位置执行同步**：

   **A）`AHEAD > 0 && BEHIND == 0`（可 fast-forward）**
   ```bash
   git checkout "$TARGET"
   git merge "$SOURCE" --ff-only
   git push origin "$TARGET"
   ```

   **B）`AHEAD == 0 && BEHIND > 0`（目标分支已领先）**
   - 报告：`"$TARGET" 已领先 "$SOURCE" $BEHIND 个提交，无需同步`
   - 结束流程

   **C）`AHEAD == 0 && BEHIND == 0`（已一致）**
   - 报告：`"$SOURCE" 与 "$TARGET" 已经一致`
   - 结束流程

   **D）`AHEAD > 0 && BEHIND > 0`（分叉，无法 ff）**
   - 调用 `recognize-codebase-branch-flow` 识别分支模型
   - 若模型为 `github flow` / `trunk-based`：默认 `git merge "$SOURCE" --no-ff -m "chore: sync $SOURCE into $TARGET"`
   - 若模型为持续集成的 dev/release 流：询问用户 `--no-ff` merge 还是 rebase 后再同步
   - 执行 merge 后 `git push origin "$TARGET"`

7. **切回源分支**：
   ```bash
   git checkout "$SOURCE"
   ```

#### 与其他模式的互斥

`--sync-to` 与 `--changelog-only` 不能同时使用。若同时传入，向用户确认以哪个为准，或默认 `--sync-to` 优先并报告冲突。

## 2. 版本规划

确定版本类型（遵循 Semantic Versioning）：

| 版本类型 | 适用场景 | 版本变化示例 |
|---------|---------|-------------|
| `patch` | Bug 修复、小幅改动 | `1.0.0` → `1.0.1` |
| `minor` | 新功能（向后兼容） | `1.0.0` → `1.1.0` |
| `major` | 破坏性变更 | `1.0.0` → `2.0.0` |

## 3. Changelog 整理

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

### 核心原则

- 更新日志是写给**人**而非机器的
- 每个版本都应该有独立的入口
- 同类改动应该分组放置
- 新版本在前，旧版本在后
- 使用 ISO 8601 日期格式：`YYYY-MM-DD`

### 标准格式

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 新添加的功能

### Changed
- 对现有功能的变更

### Deprecated
- 已经不建议使用，即将移除的功能

### Removed
- 已经移除的功能

### Fixed
- 对 bug 的修复

### Security
- 对安全性的改进

## [1.0.0] - 2024-01-15

### Added
- 正式发布版本
```

### 变动类型说明

| 类型 | 说明 |
|-----|------|
| `Added` | 新添加的功能 |
| `Changed` | 对现有功能的变更 |
| `Deprecated` | 已经不建议使用，即将移除的功能 |
| `Removed` | 已经移除的功能 |
| `Fixed` | 对 bug 的修复 |
| `Security` | 对安全性的改进 |

### Unreleased 区块

在文档最上方维护 `## [Unreleased]` 区块：
- 记录即将发布的变更内容
- 发布新版本时，将内容移动至新版本区块
- 保持空区块（无内容时保留标题）

### YANKED 版本

对于因重大 bug 或安全原因撤下的版本：

```markdown
## [0.0.5] - 2014-12-13 [YANKED]
```

### 检查清单与用户确认

更新 Changelog 后，**必须等待用户确认**再继续下一步（`--changelog-only` 模式下跳过此确认，自动结束流程，不执行后续版本号升级与 Git 提交）：

1. 向用户展示 Changelog 变更内容
2. 询问用户是否需要修改
3. 只有在用户确认后才继续版本号升级和 Git 提交

**检查清单**：
- [ ] 所有变更按正确类型分类
- [ ] 日期格式为 ISO 8601（`YYYY-MM-DD`）
- [ ] 包含 `[Unreleased]` 区块
- [ ] 空类别已移除（无内容时不保留标题）
- [ ] 版本号链接到对比页面（可选）
- [ ] 所有内容正交：同一功能的新增与后续修复应合并为一条面向价值的条目，避免同一改动拆成多条
  - 反例：`- 增加交互式 pager` 与 `- 修复 pager footer 渲染异常` 应合并为 `- 为 supports/list 增加交互式 pager`
- [ ] 非终端用户可见的变更已标记 `[internal]`：维护脚本、CI、内部工具、模式生成等不向最终用户暴露的条目，前缀 `[internal]`
  - 示例：`- [internal] watch-patterns 重启时通过持久化 hash 缓存避免全量重新上传`
- [ ] **用户已确认 Changelog 内容**

## 4. 版本号升级

根据项目类型选择升级方式：

**单包项目**：
```bash
# 使用 npm version
npm version [patch|minor|major]

# 或使用 standard-version
npx standard-version --release-as [patch|minor|major]
```

**Monorepo 项目**：
- 使用 changesets: `npx changeset version`
- 使用 lerna: `npx lerna version [patch|minor|major]`
- 或使用包管理器的 workspaces 命令

**版本号同步**：
- 代码中的版本号（如 CLI 工具、Server 配置）
- 文档中的版本引用
- lockfile 更新

**Prerelease 版本**（版本号含 `-`，如 alpha/beta/rc）：
- 升级同系列用 `npm version prerelease --no-git-tag-version`（如 alpha.2 → alpha.3）；误用 `npm version patch` 会跨出该系列直奔 stable
- `--no-git-tag-version` 让版本号与 CHANGELOG 进同一个 `release:` commit，避免 npm version 自动产生只含 package.json 的孤点 commit

## 5. Git 提交与标签

标准发布提交：

```bash
# 提交所有变更
git add .
git commit -m "release: v<版本号>"

# 创建标签
git tag -a "v<版本号>" -m "Release v<版本号>"

# 推送到远程（stable 版本通常推 main；alpha/prerelease 直接推当前 feature 分支）
git push origin main --tags
# 或
git push origin <当前分支> --tags
```

## 6. 首次发布检测 & npm 准备

**触发时机**：完成 "Git 提交 & 标签" 后

### 检测逻辑

```bash
# 统计符合 v-* 格式的标签数量
git tag -l "v*" | wc -l
```

**如果标签数量 == 1**（意味着这是第一次发布）：

使用 Ask 工具询问用户：
> "检测到这是您第一次发布此项目。是否需要我协助进行 npm 发布准备工作？包括：
> - 从 GitHub 读取您的个人信息（author、repository 等）
> - 完善 package.json 字段（keywords、license、bugs、homepage 等）
> - 配置 publishConfig（registry、access）"

### npm 发布准备流程

如果用户确认需要准备：

1. **获取 GitHub 用户信息**：
   ```bash
   gh api user -q '.login, .name, .email, .html_url'
   ```

2. **完善 package.json 字段**：
   ```json
   {
     "author": "用户名 <邮箱> (个人主页)",
     "repository": {
       "type": "git",
       "url": "git+https://github.com/用户名/仓库名.git"
     },
     "bugs": {
       "url": "https://github.com/用户名/仓库名/issues"
     },
     "homepage": "https://github.com/用户名/仓库名#readme",
     "keywords": ["keyword1", "keyword2", "keyword3"],
     "license": "MIT",
     "publishConfig": {
       "registry": "https://registry.npmjs.org/",
       "access": "public"
     }
   }
   ```

3. **提交发布准备变更**：
   ```bash
   git add package.json
   git commit -m "chore: release prepare"
   ```

4. **验证 package.json 格式**：
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('./package.json'))" && echo "格式正确"
   ```

### 首次发布额外检查清单

- [ ] package.json 包含完整的 author 信息
- [ ] repository 字段指向正确的 GitHub 仓库
- [ ] bugs 和 homepage 字段已配置
- [ ] keywords 包含相关关键词（至少 5 个）
- [ ] license 已声明（MIT/ISC/Apache 等）
- [ ] publishConfig 配置了正确的 registry
- [ ] publishConfig.access 设置为 "public"（scoped 包必需）
- [ ] 发布准备已提交：`chore: release prepare`
- [ ] 运行 `npm publish --dry-run` 预览发布内容

## 可选：自动化脚本

根据项目需求，可创建发布脚本 `scripts/release.sh`：

**核心步骤（按需求选择）**：
1. 接收版本类型参数（patch/minor/major）
2. 检查工作区是否干净
3. 检查 Changelog 是否已更新
4. 运行测试/构建验证
5. 升级版本号
6. 同步其他文件中的版本号
7. 创建 Git commit 和 tag
8. 推送至远程

**Dry-run 模式**：
添加 `--dry-run` 参数预览变更，不实际执行。

## 常见工具选择

| 场景 | 推荐工具 |
|-----|---------|
| 简单项目 | `npm version` |
| 需要自动生成 Changelog | `standard-version` / `semantic-release` |
| Monorepo | `changesets` / `lerna` |
| 严格流程控制 | 自定义脚本 |

## 发布检查清单

### 分支与同步
- [ ] 分支模型已识别（trunk-based / release-branch）
- [ ] 发版分支已确认（trunk-based: main / release-branch: release 分支）
- [ ] 发版分支已与远程同步
- [ ] 工作区干净（无未提交变更）

### 版本与文档
- [ ] 版本类型已确定（patch/minor/major）
- [ ] Changelog 已更新（含 Unreleased 内容迁移）
- [ ] **用户已确认 Changelog 内容**
- [ ] 日期格式正确（ISO 8601）

### 验证与构建
- [ ] unit 测试通过（快速逻辑验证，发包前必跑，如 `prepublishOnly` 钩子或 `test:unit`）
- [ ] integration/e2e 测试通过（端到端验证，push 前或 CI 跑，如 `test:e2e`）
- [ ] 构建成功
- [ ] 版本号已正确升级

### Git 操作
- [ ] Git commit 已创建（`release: v<版本号>`）
- [ ] Git tag 已创建（`v<版本号>`）
- [ ] 已推送到远程仓库

### 首次发布额外检查（如适用）
- [ ] package.json 字段已完善（author、repository、bugs、homepage）
- [ ] keywords 包含相关关键词
- [ ] publishConfig 已配置（registry、access）
- [ ] 发布准备已提交（`chore: release prepare`）
- [ ] 已通过 `npm publish --dry-run` 验证

## References

- [Claude Code 插件版本号同步](./references/cc-plugin-version.md) — 处理 package.json、plugin.json、marketplace.json 与文档之间的版本号一致性问题
