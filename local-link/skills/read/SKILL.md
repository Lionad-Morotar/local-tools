---
name: read
description: 通过阅读补全上下文，用户主动调用
disable-model-invocation: true
---

用户会主动调用此技能，给会话补充一些上下文，作为接下来的会话的基础知识或引用内容来使用。

## workflow

1. 从用户输入（而不是上下文）获取用户让你阅读的内容
2. 使用 Read 或对应工具读取
3. 简单内容回复 OK 即可，复杂内容最多 50 字的总结
