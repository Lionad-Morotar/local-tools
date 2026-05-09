---
name: find-source
disable-model-invocation: true
description: 为代码改动、配置变更或技术决策查找文档源头和依据。使用场景：1. 为技术决策提供可追溯的文档依据，如用户做了某个改动（如添加 eslint --cache），想知道这个改动的官方文档出处；2. 从上下文自动捕获重要角色
---

# find-source

为代码改动、配置项或技术决策查找文档源头和权威依据。

## 工作流程

### 1. 分析改动/主题

确定需要查找来源的内容类型：

| 类型 | 示例 | 查找方向 |
|------|------|----------|
| **配置项** | `eslint --cache`, `tsconfig.json` 选项 | 官方文档 CLI/API 参考 |
| **依赖库用法** | `lint-staged` 配置, `husky` hook | 官方 README/文档 |
| **项目约定** | 分支策略, 代码风格 | 项目内文档 (docs/, CONTRIBUTING.md, CLAUDE.md) |
| **语言特性** | TypeScript 新特性, Vue 语法 | 官方文档/Release Notes |

### 2. 分层查找策略

按优先级顺序查找：

#### 第一层：项目内约定
1. 检查 `CLAUDE.md` - 项目级 AI 协作约定
2. 检查 `docs/` 目录下的相关文档
3. 检查 `CONTRIBUTING.md` 或开发规范
4. 检查代码注释中的引用

#### 第二层：依赖库官方文档
1. 使用 `mcp__plugin_context7_context7__resolve-library-id` + `query-docs` 查找
2. 使用 `WebSearch` 搜索官方文档
3. 使用 `mcp__zread__search_doc` 搜索 GitHub 仓库文档

#### 第三层：社区/生态最佳实践
1. 搜索 Stack Overflow / GitHub Discussions
2. 查找知名项目的配置示例

### 3. 输出格式

找到来源后，按以下格式输出：

```markdown
## 改动/主题: [简要描述]

### 1. [来源类型] [来源名称]

**来源**: [文档链接或文件路径] (置信度: [高/中/低])
**配置小节**: [具体的章节/选项]
**核心说明**:
> [引用原文]

**相关配置**:
| 选项 | 说明 |
|------|------|
| ... | ... |

### 2. [项目约定]

**来源**: [文件路径] (置信度: 高)
**说明**: [项目特定的约定说明]

### 总结

| 配置项 | 文档源头 | 链接/路径 | 置信度 |
|--------|----------|-----------|--------|
| ... | ... | ... | ... |
```

#### 置信度标注规则

对每一个来源，评估其权威性和可靠性，并在括号内标注置信度：

| 置信度 | 适用场景 |
|--------|----------|
| **高** | 官方文档、项目内约定文件、Release Notes、源码中的明确注释 |
| **中** | 知名社区文章、Stack Overflow 高赞回答、GitHub Issues/Discussions 中的官方人员回复 |
| **低** | 个人博客、未经广泛验证的第三方内容、机器翻译或信息间接转述 |

**特别说明**：当来源为网页链接或媒体资源时，**必须**在链接后追加 `(置信度: X)`。例如：
- `**来源**: https://eslint.org/docs/latest/user-guide/command-line-interface (置信度: 高)`
- `**来源**: https://example-blog.com/article (置信度: 低)`

## 工具使用指南

### Context7 (优先)

用于查找主流开源库的官方文档：

```
1. mcp__plugin_context7_context7__resolve-library-id
   - libraryName: 库名 (如 "eslint", "typescript")
   - query: 具体查询内容

2. mcp__plugin_context7_context7__query-docs
   - libraryId: 上一步返回的 ID
   - query: 具体选项或配置
```

### WebSearch

用于查找官方文档链接或最新信息：

```
- 搜索: "[库名] [选项] official documentation"
- 搜索: "[库名] [配置] site:官方域名"
```

### GitHub zread

用于搜索 GitHub 仓库的文档：

```
- mcp__zread__search_doc: 搜索仓库文档
- mcp__zread__read_file: 读取具体文件
```

### 项目内查找

```
- Glob: 查找 docs/, *.md 文件
- Read: 读取 CLAUDE.md, CONTRIBUTING.md
- Grep: 在项目内搜索相关配置
```

## 示例

### 示例 1: 查找 eslint --cache 的文档

用户: "为刚才的改动找到文档源头"

执行:
1. 分析改动: 在 package.json 中添加了 `"eslint --fix --cache"`
2. 查找 Context7: resolve-library-id("eslint") → query-docs("--cache option")
3. 查找项目约定: Read package.json, .gitignore
4. 输出: 官方文档链接 + 项目配置位置

### 示例 2: 查找项目分支策略的依据

用户: "这个分支策略有文档吗"

执行:
1. 分析: 项目使用特定的分支模型
2. 查找项目内: Glob docs/ → Read docs/branching.md
3. 查找外部: WebSearch "git branching strategy main test release"
4. 输出: 项目约定文档 + 行业最佳实践参考

### 示例3：从上下文获取查询内容

**上一轮**
用户: 更新 ~/.claude/settings.json，禁止 git push
You: 
```
已完成。在 `settings.json` 中添加了一个 `PreToolUse` hook：
- 匹配 `Bash` 工具调用
- 如果命令包含 `git push`（不区分大小写），输出 `permissionDecision: "deny"` 拦截执行
- 其他命令正常放行
**验证结果**：
- JSON 语法通过 `jq -e` 校验
- hook 命令已正确写入
**生效方式**：
由于 Claude Code 的 settings watcher 对 `.claude/` 目录的配置热重载有限制，你可能需要：
1. 在会话中输入 `/hooks` 打开 hooks 管理界面，这会触发配置重载
2. 或者重启 Claude Code
完成后，任何我尝试执行的 `git push` 都会被拒绝。
```

**此轮**
用户：`/find-source`
You：将给关键决策补充文档来源：
   1. 查找 PreToolUse 文档关于 permissionDecision 的信息
   2. 查找 Claude Code 配置热重载模式

## 注意事项

1. **区分层级**: 明确区分官方文档、项目约定、社区实践
2. **提供上下文**: 不仅给出链接，还要说明为什么这个来源权威
3. **完整性**: 如果涉及多个配置项，为每个都找到来源
4. **可追溯性**: 优先使用 Context7 等结构化文档，其次是官方文档链接，最后使用 Github、Stack Overflow、以及高质量第三方论坛
