---
name: release-project
description: 项目版本发布流程指导，帮助用户完成版本规划、Changelog 管理、版本号升级、Git 标签创建和 npm 首次发布准备。Use when: (1) 用户需要发布新版本 (2) 需要创建版本发布流程 (3) 需要管理版本号和 Changelog (4) 需要自动化版本发布 (5) 需要识别分支模型并确保发版分支同步 (6) 首次 npm 发布准备
---

# Release Project

指导项目版本发布的完整流程，从版本规划到 Git 标签创建。

## 前置要求

- 当前仓库使用 Git 进行版本控制
- 项目配置了 `package.json`（Node.js 项目）或相应的版本管理文件
- 分支模型可识别（第 1 步调用 `recognize-codebase-branch-flow` 技能自动判定 trunk-based 或 release-branch）

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

更新 Changelog 后，**必须等待用户确认**再继续下一步：

1. 向用户展示 Changelog 变更内容
2. 询问用户是否需要修改
3. 只有在用户确认后才继续版本号升级和 Git 提交

**检查清单**：
- [ ] 所有变更按正确类型分类
- [ ] 日期格式为 ISO 8601（`YYYY-MM-DD`）
- [ ] 包含 `[Unreleased]` 区块
- [ ] 空类别已移除（无内容时不保留标题）
- [ ] 版本号链接到对比页面（可选）
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

## 5. Git 提交与标签

标准发布提交：

```bash
# 提交所有变更
git add .
git commit -m "release: v<版本号>"

# 创建标签
git tag -a "v<版本号>" -m "Release v<版本号>"

# 推送到远程
git push origin main --tags
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
