---
name: git-push
description: 代码质量门禁与智能推送助手。核心能力：在 git push 前自动运行项目配置的代码质量检查（test、lint、format、check-types），检测到问题时尝试自动修复，修复成功后继续推送。使用场景：(1) 用户说 "push"、"推送"、"提交到远程" (2) 用户想确保代码质量后再推送 (3) 用户遇到 lint/format 错误需要修复后推送 (4) 作为 pre-push 质量门禁。始终遵循"检测 → 修复 → 再检测 → 推送"的循环，直到代码通过检查或无法自动修复。
disable-model-invocation: true
---

## 使用方式：子代理模式

本技能采用**子代理执行模式**。主代理通过 Task 工具调用子代理，子代理独立完成整个"检测-修复-推送"工作流后，返回简洁的确认信息。

使用 Task 工具调用子代理，子代理类型为 `general-purpose`：

```yaml
subagent_type: general-purpose
prompt: |
  执行 git-push 工作流：

  1. 检测当前 git 仓库的变更文件
  2. 根据项目配置运行代码检查（lint、format、test、check-types）
  3. 发现可自动修复的问题时，执行修复并重新检查
  4. 所有检查通过后执行 git push
  5. 返回执行结果给主代理

  当前工作目录：{current_working_directory}

  返回格式要求：
  - 成功：简要说明推送成功
  - 需要手动修复：列出具体问题
  - 失败：说明失败原因
```

### 子代理工作流程

子代理执行以下完整工作流：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  检测变更    │ → │  运行检查    │ → │  自动修复    │ → │  执行推送    │
│  (git status)│    │  (lint/test)│    │  (fixable?) │    │  (git push) │
└─────────────┘    └──────┬──────┘    └──────┬──────┘    └─────────────┘
                          │                  │
                          ▼                  ▼
                    ┌─────────────┐    ┌─────────────┐
                    │   通过 ✅    │    │  无法自动修复 │
                    │   直接推送   │    │  报告给主代理 │
                    └─────────────┘    └─────────────┘
```

#### 1. 检测阶段

获取变更文件：
```bash
git status --porcelain
git diff --name-only --cached
git diff --name-only
```

如无变更 → 返回"无变更需要推送"

#### 2. 检查阶段

**检测项目配置（按优先级）：**

1. **package.json scripts**（最优先）：
   - `npm run lint`
   - `npm run format` 或 `npm run format -- --check`
   - `npm run test`
   - `npm run check-types`

2. **配置文件检测**（无 scripts 时）：
   - ESLint: `.eslintrc.*`, `eslint.config.*`
   - Prettier: `.prettierrc.*`, `prettier.config.*`
   - TypeScript: `tsconfig.json`
   - Biome: `biome.json`
   - Ruff: `pyproject.toml` (Python)

**执行策略：**
- 并行执行独立的检查（如 lint + check-types）
- 记录每个检查的结果

#### 3. 修复阶段

**可自动修复的问题：**

| 工具 | 修复命令 |
|-----|---------|
| ESLint | `npm run lint -- --fix` 或 `npx eslint --fix` |
| Prettier | `npm run format` 或 `npx prettier --write` |
| Biome | `npx biome check --write` |
| Ruff | `ruff check --fix` |

**修复后处理：**
1. 重新运行检查确认修复成功
2. 暂存修复后的文件：`git add -A`

**不可自动修复的问题：**
- 测试失败（需要理解业务逻辑）
- 类型错误（可能需要重构）
- 复杂 lint 错误（如未使用的变量涉及业务逻辑）

→ 停止自动修复，准备报告给主代理

#### 4. 推送阶段

**检查全部通过后：**
```bash
git push
```

**首次推送新分支：**
```bash
git push -u origin <branch-name>
```

### 异常处理

| 异常类型 | 处理方式 |
|---------|---------|
| 非快进推送 (non-fast-forward) | 告知主代理需要先 pull/rebase |
| 分支保护 (protected branch) | 告知主代理需要创建 Pull Request |
| 网络错误 | 重试 1 次，仍失败则报告 |
| 修复循环 | 自动修复最多尝试 2 次 |

### 返回格式

子代理向主代理返回简洁的执行结果：

**推送成功：**
```
✅ 推送成功

代码检查全部通过，变更已推送到远程仓库。
[可选：推送的分支和 commit 信息]
```

**需要手动修复：**
```
⚠️ 需要手动处理

以下问题无法自动修复：
1. [具体错误描述]
2. [具体错误描述]

建议操作：
- [修复建议]
```

**推送失败：**
```
❌ 推送失败

[失败原因]

建议操作：
- [解决建议]
```

**无变更：**
```
ℹ️ 没有变更

当前没有需要推送的变更文件。
```

## 主代理响应模板

主代理根据子代理返回的内容，向用户展示：

```
[子代理返回的结果]

[如有需要，主代理补充的上下文信息]
```

主代理不需要解释子代理的执行细节，只需传递子代理的结果。

## 重要原则

1. **子代理自治**：子代理独立完成整个工作流，主代理不干预中间过程
2. **结果简洁**：子代理只返回最终结果，不输出详细的执行日志
3. **失败透明**：无法自动修复时，清晰列出具体问题和修复建议
4. **安全边界**：自动修复最多尝试 2 次，避免无限循环
