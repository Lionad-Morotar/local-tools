---
name: reduce-skills-tokens
description: 批量给技能目录添加 disable-model-invocation，节省 token 开销。只保留需要 LLM 生成/分析/决策的技能有模型调用能力。
disable-model-invocation: true
---

## 判断原则

**不加 DMI** — 技能内容是补全模型能力、是咨询和常用工具，如前缀：`gsd-`、`compound-`、`ce-`。

剩下都加。

## 操作

1. 扫描目录下所有 `SKILL.md`
2. 按用户指定的例外规则（前缀/精确匹配）分两组：加 DMI vs 不加
3. 批量插入或移除 frontmatter 中的 `disable-model-invocation: true`
4. 抽查几个边界技能验证状态

## 插入位置

frontmatter 第二行 `---` 之前：

```js
const endIdx = content.indexOf('\n---', 3);
fs.writeFileSync(path, content.slice(0, endIdx) + '\ndisable-model-invocation: true' + content.slice(endIdx));
```
