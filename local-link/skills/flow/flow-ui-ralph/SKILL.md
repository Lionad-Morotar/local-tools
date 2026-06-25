---
name: flow-ui-ralph
description: lionad 的 UI 还原迭代流程，通过视觉分析与浏览器验证将项目产物还原到 99% 以上
disable-model-invocation: true
---

## 要求

* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “按照文档高标准质量决定”
  * **不要暂停**：完成所有阶段，而不是分阶段汇报向我确认，get all shits done
* **务必按照要求读取执行对应技能**：即 `~/.claude/skills/<skill-name>/SKILL.md`
* 本流程不使用逐像素对比器，所有差异分析必须通过视觉分析工具完成
* 每次迭代必须基于真实浏览器截图等产物进行端到端验证

## 推荐工具

* 禁止逐像素分析工具，而应使用视觉分析类工具如：`mcp__glm-image-mcp-server__*`、`mcp__kimi-tools-mcp__kimi-image`
  * 输入：当前实现截图 + 目标设计稿 / 参考图
  * 输出：差异列表 + 还原度得分（0-100）
* 浏览器自动化：`kimi-webbridge` 技能，用于对本地或线上项目进行真实浏览器截图、滚动、交互

## 目录结构

所有产物统一存放在 `<working-dir>/docs/ui/<taskname>/` 下：

```
<working-dir>/docs/ui/<taskname>/
├── target/                    # 最终目标素材
│   └── xxx
├── iterations/
│   ├── 000-baseline/          # 首次基线截图
│   ├── 001/                   # 第 1 轮迭代产物
│   ├── 002/
│   └── .../
├── qa/                        # 每轮迭代发现的 Bugs
│   ├── iteration-001.md
│   ├── iteration-002.md
│   └── ...
└── reports/
    └── ui-ralph-report.md     # 最终报告
```

## Workflow

0. 使用 Task 工具执行以下几个步骤：
1. **准备目标素材**：从用户输入或上下文中提取并整理最终目标 FinalTarget，保存到 `<working-dir>/docs/ui/<taskname>/target/xxx`。目标不仅包括可见的 UI 设计稿、图片、参考链接，还必须覆盖可能的隐形的 UX 检查点：
   * 加载状态（Loading / Skeleton）
   * 空状态（Empty）
   * 报错状态（Error / 表单校验 / 业务错误）
   * 网络错误状态（Offline / Timeout / Retry）
   * 鼠标交互状态（Hover / Active / Focus / Disabled）
   * 键盘交互状态（Focus order / 快捷键 / 回车提交 / ESC 关闭）
   * 响应式断点与动画/过渡表现
   * 若目标素材未明确给出某状态，则基于项目已有代码、设计系统、可访问性最佳实践推断该状态的验收标准
2. **文档澄清**：针对 FinalTarget 执行 `grill-with-docs` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
3. **建立基线（Baseline）**：使用 `kimi-webbridge` 技能对当前项目进行首次截图，保存到 `<working-dir>/docs/ui/<taskname>/iterations/000-baseline/xxx`
4. **迭代还原循环**（最多 50 次）：
   4.1 对当前实现进行端到端验证与截图，覆盖：
      * 关键视口
      * 需要的 UI、UX 检查点
      * 动画与过渡效果（视频）
   4.2 对比当前截图与目标素材，将 UI/UX 行为与设计意图一并纳入分析
   4.3 获取并记录：差异列表、还原度得分、优先级建议，保存到 `<working-dir>/docs/ui/<taskname>/iterations/<iteration-no>/`
   4.4 若还原度得分 >= 99%，跳至步骤 5
   4.5 根据差异列表生成修复任务 Bugs，写入 `<working-dir>/docs/ui/<taskname>/qa/iteration-<iteration-no>.md`
   4.6 针对 Bugs 自动修改项目代码，无需我确认，直接进入下一轮
5. **最终验证**：对最终产物进行一次完整截图与视觉分析，确认还原度
6. **输出报告**：将迭代过程、最终得分、残留差异、下一步建议写入 `<working-dir>/docs/ui/<taskname>/reports/ui-ralph-report.md`
