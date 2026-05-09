---
name: proof-reading-execute
description: 修复语音输入，然后执行
disable-model-invocation: true
---

## workflow

1. 根据用户任务，执行 `/proof-reading` 技能，获得输出：清晰的任务描述
2. 审视任务描述，如果不够清晰，使用 Ask 工具向用户二次确认
3. 当任务描述清晰时，开始执行任务