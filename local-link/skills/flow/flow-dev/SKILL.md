---
name: flow-dev
description: lionad 的代码开发流程
argument-hint: <task description> [--full]
---

## 要求

* 本技能输出的文档默认不进入 git
* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “按照文档高标准质量决定”
  * **不要暂停**：完成所有阶段，而不是分阶段汇报向我确认，get all shits done
* **根据阶段要求读取执行对应技能，而不是在初始化任务时一口气读取（这样会严重降低完成质量）**

## 外部依赖入口

> 以下为环境固定事实，每次执行直接使用，无需重新搜索（搜了反而浪费轮次）。

| 依赖 | 形态 | 调用方式 |
|---|---|---|
| grill-me / to-prd / tdd | skill（SKILL.md） | 读 `~/.claude/skills/<name>/SKILL.md` 后按流程执行 |
| code-review | **plugin command**（非 SKILL.md，别去找） | 按其维度（correctness/reuse/efficiency + effort low/medium/max）手动审，或 `Skill code-review` |
| ck（kimi，正交审查） | **zsh function** | `timeout 600 zsh -ic 'ck -p "..."'`。`bash` / 裸 `which ck` 会报 `_claude_run_with_version: command not found`——必须 `zsh -ic` 加载 profile |
| cg（glm，正交审查） | zsh function | 同 ck 模式 `zsh -ic 'cg -p "..."'`；内部超时 ~700s |

## 输出模式

默认仅保留必须落档的文档，其余中间产物改为终端输出。传入 `--full` 时，所有中间产物按完整流程落档：

| 步骤 | 默认落档路径 | 默认行为（`--light`，即非全量模式） | `--full` 行为 |
|------|-------------|----------|---------------|
| 1. UltraThoughts | `docs/thoughts/xxx` | 终端输出，不落档 | 落档 |
| 2. PRD | `docs/plans/xxx` | **继续落档** | **继续落档** |
| 3. DevGoal | `docs/tdd/xxx` | 终端输出，不落档 | 落档 |
| 5. Bugs | `docs/qa/xxx` | 终端输出，不落档 | 落档 |
| 6. 外部审查 | `docs/qa/xxx-external-review.md` | 不落档 | 不落档 |
| 8. 最终报告 | `docs/reports/xxx` | **继续落档** | **继续落档** |

无需生成也无需落档的文档：`docs/adr/xxx`

默认模式下终端输出需包含足够上下文，使我能直接继续下一阶段而不必回读文件。

## Workflow

0. 初始化上下文
  - [ ] 确认 NodeJS、Python、Claude Code 子代理等 Agent 环境正常
  - [ ] 确认项目环境，宗地、绿地项目等
  - [ ] 确认任务类型，从新增功能、修复、UI/UX、优化、重构、性能改进等选取一个或数个侧重点
  - [ ] 确认任务深度，从 MVP、Production Ready、High Fidelity 三选一，默认为 Production Ready
  - [ ] 输出任务上下文到终端
  - [ ] **使用 Task 工具创建以下 1～8 主要步骤**

1. 从用户输入或上下文，捕获我想构建的内容的原始想法，对原始想法进行**极其细致**的分析，扩充成 UltraThoughts
  - [ ] 已明确原始想法的来源（用户输入 / 会话上下文 / 文件路径）
  - [ ] 已根据任务上下文从各角度（示例如小型需求可以从需求范围、架构、数据、模块、测试、工程这些角度入手）极其细致的分析
  - [ ] 默认终端输出 UltraThoughts；`--full` 时输出到 `<working-dir>/docs/thoughts/xxx` 供后续步骤使用

2. 针对 UltraThoughts 执行 `grill-me` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
  - [ ] 已读取 `~/.claude/skills/grill-me/SKILL.md`
  - [ ] 已完成 `grill-me` 问询流程
  - [ ] 已输出决策表格（含方案对比与最终选择）
  - [ ] 已读取 `~/.claude/skills/to-prd/SKILL.md`
  - [ ] 已使用 `to-prd` 技能将 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`（默认模式下同样需要落档）

3. 针对 PRD 文档执行 `tdd` 技能，并确定开发计划为 DevGoal，写入 `<working-dir>/docs/tdd/xxx`
  - [ ] 已读取 `~/.claude/skills/tdd/SKILL.md`
  - [ ] 已针对 PRD 文档确定开发计划 DevGoal
  - [ ] 默认终端输出 DevGoal；`--full` 时写入 `<working-dir>/docs/tdd/xxx`

4. 自动确认 DevGoal，使用你推荐的 Slice，直接进入开发
  - [ ] 已自动确认 DevGoal
  - [ ] 已选择并声明推荐 Slice
  - [ ] 已进入开发阶段

5. 仅当 DevGoal 达成时，执行 `code-review` 技能（视 PRD 的复杂程度选择 review effort：low、medium(1k ~ 1w loc)、max 三选一），确认待修复问题 Bugs，写入 `<working-dir>/docs/qa/xxx`
  - [ ] 已确认 DevGoal 达成
  - [ ] 已按「外部依赖入口」加载 code-review（plugin command，非 SKILL.md），按其维度审 diff
  - [ ] 已根据 PRD 复杂程度选择 review effort（low / medium / max，不超过 3k 行改动不选 max）
  - [ ] 已确认待修复问题 Bugs
  - [ ] 默认终端输出 Bugs；`--full` 时写入 `<working-dir>/docs/qa/xxx`

6. **外部正交审查**（code-review 之后、修复之前；架构/流程类技能或 PRD 复杂度 ≥ low 时执行，简单的数行改动可跳过此步骤）
   - [ ] 确定审查者模型（正交）：当前 glm → `ck`（kimi）；当前 kimi → `cg`（glm）。避开同模型盲区。ck/cg 均为 zsh function，见「外部依赖入口」
   - [ ] 准备正交 prompt：让审查者从架构/理念/失败模式/长期演进角度审，明确避开 step 5 已覆盖的工程缝隙；附 step 5 Bugs 报告路径供其去重
   - [ ] 外部审查的提示词到 `<working-dir>/docs/qa/<taskname>-external-prompt.md`，启动审查者：`timeout <外部超时> zsh -ic '<ck|cg> -p "$(cat <prompt-file>)"' > <result-file> 2><err-log>`（外部超时要 > 审查者内部超时：ck ~270s 给 600，cg ~700s 给 900）
   - [ ] **超时兜底**：`CronCreate` 一次性任务（外部超时 + 缓冲后触发，prompt = `pkill -f <审查者进程特征>`，ck → `pkill -f kimi`、cg → `pkill -f glm`，防计费失控）；审查正常拿到结果后立即 `CronDelete`
   - [ ] 归档外部审查结果到 `<working-dir>/docs/qa/<taskname>-external-review.md`
   - [ ] 合并外部审查发现到 step 5 的 Bugs（去重），纳入下一步修复

7. 针对 Bugs（含外部审查发现）执行 `tdd` 技能，无需我确认，自动推进全部问题的修复
   - [ ] 已读取 `~/.claude/skills/tdd/SKILL.md`
   - [ ] 已自动推进全部 Bugs 修复（含外部审查正交发现）

8. 输出最终报告（我会在睡醒后查看最终报告），以及拟定分批提交计划
   - [ ] 已输出最终报告到 `<working-dir>/docs/reports/xxx`（默认模式下同样需要落档）
   - [ ] 已经输出分批提交计划到终端

9. 任务结束
  - [ ] 清空 Tasks
