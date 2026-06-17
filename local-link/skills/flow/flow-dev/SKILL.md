---
name: flow-dev
description: lionad 的代码开发流程
disable-model-invocation: true
---

## 要求

* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “u decide”
* **务必按照要求读取执行对应技能**：即 `~/.claude/skills/<skill-name>/SKILL.md`

## Workflow

0. 使用 Task 工具执行以下几个步骤：

1. 从用户输入或上下文，捕获我想构建的内容的原始想法 OriginalThoughts
   - [ ] 已明确原始想法的来源（用户输入 / 会话上下文 / 文件路径）
   - [ ] 已输出原始想法（OriginalThoughts）供后续步骤使用

2. 针对 OriginalThoughts 执行 `grill-with-docs` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
   - [ ] 已读取 `~/.claude/skills/grill-with-docs/SKILL.md`
   - [ ] 已完成 `grill-with-docs` 问询流程
   - [ ] 已输出决策表格（含方案对比与最终选择）
   - [ ] 已读取 `~/.claude/skills/to-prd/SKILL.md`
   - [ ] 已使用 `to-prd` 技能将 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`

3. 针对 PRD 文档执行 `tdd` 技能，并确定开发计划为 DevGoal
   - [ ] 已读取 `~/.claude/skills/tdd/SKILL.md`
   - [ ] 已针对 PRD 文档确定开发计划 DevGoal
   - [ ] 已输出 DevGoal 文档

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
