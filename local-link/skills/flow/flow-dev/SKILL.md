---
name: flow-dev
description: lionad 的代码开发流程
disable-model-invocation: true
---

## 要求

* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “按照文档高标准质量决定”
  * **不要暂停**：完成所有阶段，而不是分阶段汇报向我确认，get all shits done
* **根据阶段要求读取执行对应技能，而不是在初始化任务时一口气读取（这样会严重降低完成质量）**

## Workflow

0. 初始化上下文
  - [ ] 确认 NodeJS、Python、Claude Code 子代理等 Agent 环境正常
  - [ ] 确认项目环境，宗地、绿地项目等
  - [ ] 确认任务类型，从新增功能、修复、UI/UX、优化、重构、性能改进等选取一个或数个侧重点
  - [ ] 确认任务深度，从 MVP、Production Ready、High Fidelity 三选一，默认为 Production Ready
  - [ ] 输出任务上下文到终端
  - [ ] **使用 Task 工具创建以下 1～7 主要步骤**

1. 从用户输入或上下文，捕获我想构建的内容的原始想法，对原始想法进行**极其细致**的分析，扩充成 UltraThoughts
  - [ ] 已明确原始想法的来源（用户输入 / 会话上下文 / 文件路径）
  - [ ] 已根据任务上下文从各角度（示例如小型需求可以从需求范围、架构、数据、模块、测试、工程这些角度入手）极其细致的分析
  - [ ] 已输出 UltraThoughts 供后续步骤使用

2. 针对 UltraThoughts 执行 `grill-with-docs` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
  - [ ] 已读取 `~/.claude/skills/grill-with-docs/SKILL.md`
  - [ ] 已完成 `grill-with-docs` 问询流程
  - [ ] 已输出决策表格（含方案对比与最终选择）
  - [ ] 已读取 `~/.claude/skills/to-prd/SKILL.md`
  - [ ] 已使用 `to-prd` 技能将 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`

3. 针对 PRD 文档执行 `tdd` 技能，并确定开发计划为 DevGoal，写入 `<working-dir>/docs/tdd/xxx`
  - [ ] 已读取 `~/.claude/skills/tdd/SKILL.md`
  - [ ] 已针对 PRD 文档确定开发计划 DevGoal
  - [ ] 已将 DevGoal 文档写入 `<working-dir>/docs/tdd/xxx`

4. 自动确认 DevGoal，使用你推荐的 Slice，直接进入开发
  - [ ] 已自动确认 DevGoal
  - [ ] 已选择并声明推荐 Slice
  - [ ] 已进入开发阶段

5. 仅当 DevGoal 达成时，执行 `code-review` 技能（视 PRD 的复杂程度选择 review effort：low、medium(1k ~ 1w loc)、max 三选一），确认待修复问题 Bugs，写入 `<working-dir>/docs/qa/xxx`
  - [ ] 已确认 DevGoal 达成
  - [ ] 已读取 `~/.claude/skills/code-review/SKILL.md`
  - [ ] 已根据 PRD 复杂程度选择 review effort（low / medium / max，不超过 3k 行改动不选 max）
  - [ ] 已确认待修复问题 Bugs
  - [ ] 已将 Bugs 写入 `<working-dir>/docs/qa/xxx`

6. 针对 Bugs 执行 `tdd` 技能，无需我确认，自动推进全部问题的修复
  - [ ] 已读取 `~/.claude/skills/tdd/SKILL.md`
  - [ ] 已自动推进全部 Bugs 修复

7. 输出最终报告到 `<working-dir>/docs/reports/xxx`（我会在睡醒后查看最终报告）
  - [ ] 已输出最终报告到 `<working-dir>/docs/reports/xxx`
