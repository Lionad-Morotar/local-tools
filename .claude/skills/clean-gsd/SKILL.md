---
name: clean-gsd
description: 卸载 GSD（get-shit-done）但保留指定技能。官方卸载会删除全部 gsd-* 且无"保留单技能"机制，需手动按依赖闭环清理
disable-model-invocation: true
---

# Clean GSD

GSD 官方卸载（open-gsd/gsd-core 的 `uninstallRuntimeArtifacts()`）按 runtime layout 删除全部 `gsd-*` skills / agents，仅硬编码保护 `gsd-dev-preferences`；没有保留指定技能的机制，GitHub 也无相关 issue（2026-07 调研结论，旧仓库 gsd-build/get-shit-done 已归档）。本技能手动实现"卸载 GSD、保留单技能"。

## 依赖结构

GSD 技能只是入口，执行逻辑在 `~/.claude/get-shit-done/` 运行时（workflows/、templates/、bin/gsd-tools.cjs、gsd-sdk）和 `~/.claude/agents/gsd-*.md` 中。保留任一 GSD 技能 ⇒ 必须保留 get-shit-done 运行时及该技能依赖的 agent。

彻底独立化（重写 SKILL.md 与 workflow 去掉 gsd-sdk 依赖，进而删除整个运行时）工作量大，不在本技能范围。

## 上下文

* **保留技能（keep-skill）**：从用户输入抽取，典型如 `gsd-map-codebase`
* **保留 agent（keep-agent）**：不能从技能名机械推导（如 gsd-map-codebase 对应 gsd-codebase-mapper），需从保留技能的 SKILL.md 及其 `execution_context` 指向的 workflow 中提取引用

## 工作流程

### 1. 依赖闭环验证

对保留技能做引用扫描，确认所有 `gsd-*` 引用都落在保留集 ∪ get-shit-done 运行时内，否则扩大保留集：

```bash
rg -o 'gsd-[a-z-]+' ~/.claude/skills/<keep-skill>/SKILL.md \
  ~/.claude/get-shit-done/workflows/<对应 workflow>.md \
  ~/.claude/agents/<keep-agent>.md | sort -u
```

同时检查全局配置是否有 gsd 引用（有则先与用户确认处理策略）：

```bash
rg -li 'gsd|get-shit-done' ~/.claude/settings.json ~/.claude/settings.local.json ~/.claude/CLAUDE.md
```

### 2. 生成删除清单

```bash
{ fd . ~/.claude/skills -t d -d 1 | rg '/gsd-' | rg -v '<keep-skill>';
  fd . ~/.claude/agents -t f -d 1 | rg '/gsd-.*\.md$' | rg -v '<keep-agent>';
  printf '%s\n' ~/.claude/.gsd-profile ~/.claude/gsd-file-manifest.json \
    ~/.claude/gsd-install-state.json ~/.claude/gsd-migration-journal
} > /tmp/gsd-delete-list.txt
```

注意：`fd` 输出的目录路径带尾斜杠，排除保留项时不要加 `$` 锚点（`rg -v '/gsd-map-codebase$'` 会匹配失败，导致保留项混入删除清单被误删）。

### 3. 反向检查（keep-check）

删除前必须确认保留项不在清单中，无输出才继续：

```bash
rg '<keep-skill>|<keep-agent>' /tmp/gsd-delete-list.txt
```

### 4. 备份并删除

```bash
tar czf /tmp/gsd-clean-backup-$(date +%F).tgz -T /tmp/gsd-delete-list.txt
xargs rm -rf < /tmp/gsd-delete-list.txt
```

### 5. 验证

* `~/.claude/skills/gsd-*` 仅剩保留技能
* `~/.claude/agents/gsd-*` 仅剩保留 agent
* `.gsd-profile`、`gsd-file-manifest.json`、`gsd-install-state.json`、`gsd-migration-journal/` 已删除
* `~/.claude/get-shit-done/` 运行时完整（保留技能 `execution_context` 指向的 workflow 及 bin/gsd-tools.cjs 存在）

验证通过后告知用户备份位置，确认无问题即可删备份。当前会话的技能/agent 列表是启动快照，清理结果在新会话生效。
