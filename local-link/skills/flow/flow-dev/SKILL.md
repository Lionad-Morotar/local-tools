---
name: flow-dev
description: lionad 的代码开发流程
disable-model-invocation: true
---

## 要求

* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “u decide”
* **务必按照要求读取执行对应技能**：即 `~/.cs/<skill-name>/SKILL.md`

## Workflow

0. 使用 Task 工具执行以下几个步骤：
1. 从用户输入或上下文，捕获我想构建的内容的原始想法 OriginalThoughts
2. 针对 OriginalThoughts 执行 `grill-with-docs` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
3. 针对 PRD 文档执行 `tdd` 技能，并确定开发完成目标为 FinalGoal
4. 针对 FinalGoal 执行 `goal` 技能，无需我确认，使用你推荐的 Slice，直接进入开发
5. 仅当 FinalGoal 达成时，执行 `code-review` 技能（视 PRD 的复杂程度选择 review effort：low medium max 三选一），确认待修复问题 Bugs，写入 `<working-dir>/docs/qa/xxx`
6. 针对 Bugs 执行 `tdd` 技能，无需我确认，自动推进全部问题的修复
6. 输出最终报告到 `<working-dir>/docs/reports/xxx`（我会在睡醒后查看最终报告）
