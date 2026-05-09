---
name: lionad-deep-research
description: a deep-research skill wrapper
disable-model-invocation: true
---

## Workflow

create 6 step todos then execute:

1. get current time: `python -c "from datetime import datetime; print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))"`
2. collect user input and context
3. exec `/deep-research` skill，**使用中文撰写主报告**，**不写html文件**
4. do not open report.html when deep-research done
5. copy report.md to `~/G/Obsidian/Chaos/YYYY-MM-DD-<research-name>.md`
6. check if doc written by 中文，如果不是，就地翻译成中文文档