---
name: release-project
description: 项目版本发布流程指导，帮助用户完成版本规划、Changelog 管理、版本号升级、Git 标签创建和 npm 首次发布准备。Use when: (1) 用户需要发布新版本 (2) 需要创建版本发布流程 (3) 需要管理版本号和 Changelog (4) 需要自动化版本发布 (5) 需要识别分支模型并确保发版分支同步 (6) 首次 npm 发布准备
argument-hint: "[--changelog-only] [--sync-to <target-branch>]"
---

# Release Project

指导项目版本发布的完整流程，从版本规划到 Git 标签创建。

## 前置要求

- 当前仓库使用 Git 进行版本控制
- 项目配置了 `package.json`（Node.js 项目）或相应的版本管理文件
- 分支模型可识别（第 1 步调用 `recognize-codebase-branch-flow` 技能自动判定 trunk-based 或 release-branch）

## 运行模式

| 调用方式 | 行为 |
|---------|------|
| 默认（无参数） | 完整发版流程（下述 1-6 步） |
| `--changelog-only` | 仅维护 `## [Unreleased]` 区块（遵循 Keep a Changelog 分类、正交合并、`[internal]` 标记），自动确认、不升版本号、不打 tag、不推送。供自动化流程（如 `flow-north-star-loop`）增量沉淀 changelog；完整发版由不带参数的调用完成 |
| `--sync-to <target-branch>` | 仅执行分支同步（如 `dev` → `release` 触发 CI/CD），不执行任何发版操作。完整流程见 [branch-sync](./references/branch-sync.md)。与 `--changelog-only` 互斥 |

## 工作流程

0. Preflight   
1. 分支检查     
2. 版本规划     
3. Changelog   
4. 版本号升级   
5. Git 提交& 标签        
6. 首次发布检测&准备    
7. Postflight (--post 校验)  

## 0. Preflight 机械检查

进入流程前先跑检查脚本，把可机械判定的检查项一次跑完（脚本位于本技能目录）：

```bash
node scripts/preflight.mjs            # 发版前检查（cwd 默认为项目根目录，可用 --cwd 指定）
node scripts/preflight.mjs --post     # 发布后校验（第 7 步）
node scripts/preflight.mjs --json     # JSON 输出，供自动化流程消费
```

脚本覆盖：git 仓库、工作区干净、当前分支与远程同步、长期分支与最新 tag 探测、CHANGELOG 结构、release 脚本与钩子链、npm registry 首发状态、版本 tag 冲突。**fail 项必须先处理再继续**；info 项（分支/tag/registry 状态）直接作为第 1 步分支模型判定的输入。

## 1. 分支检查

**目标**：识别项目分支模型，据此选择发版路径，并确保发版分支干净且与远程同步。

### 1.1 识别分支模型

自动调用 `recognize-codebase-branch-flow` 技能分析当前项目分支模型，获取其 `branch_model` 判定：

**明确映射**（直接走对应路径，无需询问）：

| recognize 输出 | 发版路径 |
|---------------|---------|
| `github flow` | Trunk-based（main 直接打 tag） |
| `gitflow` | Release-branch（develop → release → main） |

**模糊映射**（`gitlab flow` / `无显著模型` / `自建模式`）或 recognize 调用失败：基于 preflight 输出的长期分支与最新 tag 位置探测——

1. 是否存在长期 `release`/`develop` 分支
2. 最近 tag 落在哪个分支（tag 位置优先于分支名——tag 反映真实发版行为，分支名可能误导）
3. tag 应位于长期分支，而不是 feat/hotfix 等短期分支

探测有定论则自动选路径；探测仍无定论才用 Ask 询问用户（"检测到分支模型为 X，应走 [Trunk-based/Release-branch] 路径，是否正确？"）。

### 1.2 Trunk-based 路径（github flow 等）

主分支（main/master）直接打 tag 发版：

1. **确认在主分支**：`git branch --show-current`，不在主分支则 `git checkout main`
2. **拉取最新（仅快进）**：`git pull --ff-only origin main`
3. **验证工作区干净**：`git status`，确保无未提交变更

### 1.3 Release-branch 路径（gitflow 等）

有长期 release 分支用于发版准备：

1. **检查当前分支**：`git branch --show-current`，不在 release 则 `git checkout release`
2. **确保 release 分支最新**：
   - 开发在 develop/feature 分支：`git fetch origin && git merge origin/develop --no-ff -m "chore: merge develop into release"`
   - 已在 release 分支开发：`git pull origin release`
3. **验证工作区干净**：`git status`，确保无未提交变更

### 1.4 Alpha / Prerelease 分支策略

当发布的版本是 prerelease（版本号含 `-`，如 `0.4.0-alpha.2`）时：

- 如果当前分支是 feature / alpha 专用分支（非 `main`/`master`/`release`），**直接在该分支上打 tag 发版，不合并回 main**。
- 版本号升级、Changelog、Git 提交与标签都在当前分支完成。
- 推送时使用当前分支：`git push origin <当前分支> --tags`。

只有在发 **stable** 版本时，才需要把变更合并到 `main`（trunk-based）或 `release`（gitflow）后再打 tag。

### 1.5 test 分支合并（flow-north-star-loop 产物）

当项目存在长期 `test` 分支作为自动化开发循环（`flow-north-star-loop`）的集成分支时，发版前需先把 `test` 上已通过 e2e 验证的变更合并到发版分支——这填补 nsl-loop 产出（`test`）与发版（`main` 打 tag）之间的缝隙：

1. **检测 test 分支**：`git branch --list test`
2. **检测待合并变更**：`git log --oneline <发版分支>..test`（若含 `feat/nsl-epic/*` 章鱼合并痕迹，确认是 nsl 产物）
3. **合并**：
   - trunk-based：`git checkout main && git merge --no-ff test -m "chore: merge test into main for release"`
   - gitflow：合并到 `release` 分支
4. **无 test 分支或无差异**：跳过本步，按常规流程发版

## 2. 版本规划

确定版本类型（遵循 Semantic Versioning）：

| 版本类型 | 适用场景 | 版本变化示例 |
|---------|---------|-------------|
| `patch` | Bug 修复、小幅改动 | `1.0.0` → `1.0.1` |
| `minor` | 新功能（向后兼容） | `1.0.0` → `1.1.0` |
| `major` | 破坏性变更 | `1.0.0` → `2.0.0` |

## 3. Changelog 整理

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。格式模板、变动类型表、Unreleased 与 YANKED 约定见 [changelog-format](./references/changelog-format.md)。

### 核心原则

- 更新日志是写给**人**而非机器的
- 每个版本都应该有独立的入口
- 同类改动应该分组放置
- 新版本在前，旧版本在后
- 使用 ISO 8601 日期格式：`YYYY-MM-DD`
- 文档最上方维护 `## [Unreleased]` 区块记录即将发布的变更；发布时移至新版本区块，空区块保留标题

### 检查清单与用户确认

更新 Changelog 后，**必须等待用户确认**再继续下一步（`--changelog-only` 模式下跳过此确认，自动结束流程，不执行后续版本号升级与 Git 提交）：

1. 向用户展示 Changelog 变更内容
2. 询问用户是否需要修改
3. 只有在用户确认后才继续版本号升级和 Git 提交

**检查清单**：
- [ ] 所有变更按正确类型分类（Added / Changed / Deprecated / Removed / Fixed / Security）
- [ ] 日期格式为 ISO 8601（`YYYY-MM-DD`）
- [ ] 包含 `[Unreleased]` 区块
- [ ] 空类别已移除（无内容时不保留标题）
- [ ] 版本号链接到对比页面（可选）
- [ ] 所有内容正交：同一功能的新增与后续修复应合并为一条面向价值的条目，避免同一改动拆成多条
  - 反例：`- 增加交互式 pager` 与 `- 修复 pager footer 渲染异常` 应合并为 `- 为 supports/list 增加交互式 pager`
- [ ] 非终端用户可见的变更已标记 `[internal]`：维护脚本、CI、内部工具、模式生成等不向最终用户暴露的条目，前缀 `[internal]`
  - 示例：`- [internal] watch-patterns 重启时通过持久化 hash 缓存避免全量重新上传`
- [ ] 从未发布过的历史版本段已收敛合并：`npm view <pkg> version` 404 说明包未上架，其 0.x 历史段对终端用户不可见，应合并为首发段（用户只看最终形态，"相对旧实现的优化""修复了未发布版本的 bug"一类描述无意义）
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

**触发时机**：完成 "Git 提交 & 标签" 后。

**以 registry 为准**——git tag 数只反映 git 历史，monorepo 改造 / 包改名场景会误判（项目可能留有旧包时代的 tag，但新包名在 npm 从未上架）。preflight 脚本已执行该检测（`npm view <pkg> version --registry https://registry.npmjs.org`，404 = 首发）；若未跑脚本则手工执行。

**如果 npm 查询 404**（意味着这是第一次发布），使用 Ask 工具询问用户：

> "检测到这是您第一次发布此项目。是否需要我协助进行 npm 发布准备工作？包括：
> - 从 GitHub 读取您的个人信息（author、repository 等）
> - 完善 package.json 字段（keywords、license、bugs、homepage 等）
> - 配置 publishConfig（registry、access）"

用户确认后，按 [first-publish](./references/first-publish.md) 执行准备流程（含 package.json 字段模板与首发检查清单）。

## 发布脚本约定（pnpm release，必备）

**如果项目没有 pnpm script `release`，应当补充**——发布入口必须收敛为一条命令，不允许依赖操作者记忆多步顺序。

### 生命周期门禁链（固定约定）

```
pnpm release
  └─ prerelease → pnpm build(+ 多包时 build:packages)
                   └─ prebuild → pnpm test
```

- **`prerelease` 自动 build**：发版产物必须是当前工作区的最新构建，禁止手工先 build 再发版
- **`prebuild` 自动 test**：任何构建都必须先过测试门禁（dev watch 类脚本独立命名，不走 `build`，不受影响）
- `prepublishOnly` 若已存在，改为**直调构建二进制**（如 `vite build`）而非 `pnpm build`：否则 publish 生命周期会经 `prebuild` 再跑一遍全量测试（`prerelease` 链已覆盖，重复跑是纯浪费）

### 单包项目

```json
{
  "scripts": {
    "prebuild": "pnpm test",
    "prerelease": "pnpm run build",
    "release": "pnpm publish --config.registry=https://registry.npmjs.org --no-git-checks"
  }
}
```

### 多包（workspace）项目

用 Node 脚本按**依赖序**发布：直接复制 [templates/release.mjs](./templates/release.mjs) 为项目 `scripts/release.mjs`，按依赖序填写 `PACKAGES` 即可。模板背后的完整要点见 [release-script](./references/release-script.md)：依赖序硬编码、dist-tag 自动推导、registry 显式锁官方源、必须用 `pnpm publish`（`workspace:*` 转换）、参数透传、2FA/OTP 交互边界、npm 首发 latest 平台行为等。

### Dry-run 验证

脚本落地后必须跑通一次 `pnpm release -- --dry-run`（完整链路：test → build → 各包 publish dry-run），方可视为可用。

## 常见工具选择

| 场景 | 推荐工具 |
|-----|---------|
| 简单项目 | `npm version` |
| 需要自动生成 Changelog | `standard-version` / `semantic-release` |
| Monorepo | `changesets` / `lerna` |
| 严格流程控制 | 自定义脚本 |

## 发布检查清单

机械检查项由脚本覆盖（发版前 `scripts/preflight.mjs`、发布后 `--post`），**fail 项必须清零**。以下为脚本无法替代的人工判定项：

### 人工确认

- [ ] 分支模型已识别，发版路径已确认（trunk-based / release-branch）
- [ ] 版本类型已确定（patch/minor/major）
- [ ] **用户已确认 Changelog 内容**
- [ ] prerelease 分支策略已遵守（1.4）：alpha 在当前分支发版，stable 才合并发版分支后打 tag
- [ ] Git commit / tag 信息符合约定（`release: v<版本号>`）

### 发布后人工判读（基于 `preflight.mjs --post` 输出）

- [ ] registry 可查新版本（`--post` 已显式锁官方源；若用镜像源手工查，同步延迟会导致"新版本查不到"等假阴性）
- [ ] dist-tag 符合预期：prerelease 不应顶 latest（npm 首发除外，见 release-script.md）
- [ ] 入口字段完整：`npm view <pkg> main module types exports` 与 package.json 一致
- [ ] 首次发布时已按 first-publish.md 完成 package.json 字段准备并通过 `npm publish --dry-run` 验证

## References

- [branch-sync.md](./references/branch-sync.md) — `--sync-to` 纯分支同步模式的完整流程与同步路径决策
- [changelog-format.md](./references/changelog-format.md) — Keep a Changelog 格式模板、变动类型表、Unreleased 与 YANKED 约定
- [first-publish.md](./references/first-publish.md) — npm 首发准备流程、package.json 字段模板与首发检查清单
- [release-script.md](./references/release-script.md) — 多包（workspace）发布要点说明，配套可复制模板 [templates/release.mjs](./templates/release.mjs)
- [cc-plugin-version.md](./references/cc-plugin-version.md) — 处理 package.json、plugin.json、marketplace.json 与文档之间的版本号一致性问题
