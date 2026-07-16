---
name: hear
description: 理解用户意图；listen 模式通过 grill-me 深挖任务并归档经验
disable-model-invocation: true
argument-hints: "[--mode hear|listen]"
---

## Workflow

### `--mode hear`（默认）

0. 根据用户输入选取并阅读参考文档
1. 重新理解用户输入（获取可能的潜在含义）

### `--mode listen`

0. 调用 grill-me 技能，围绕用户任务持续追问，直到达成共同理解
1. 执行确认后的任务，并等待用户反馈满意
2. 将本次任务的关键理解、决策与经验落档为 `references/` 下的参考文档；若相关主题文档已存在，则更新补充

## 参考文档

* [调整界面](references/refine-ui.md): 涉及到用户想做一些 UI UX 变动、样式调整等
