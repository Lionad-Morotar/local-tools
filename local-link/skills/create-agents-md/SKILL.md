---
name: create-agents-md
description: 初始化项目 Agents.md
disable-model-invocation: true
---

## 上下文

* 项目根目录: `$project_root`
* gsd-docs: `$project_root/.planning/codebase/*.md`
* A: `$project_root/Agents.md`
* C: `$project_root/Claude.md`
* 设计上下文: `$project_root/.impeccable.md`

## 工作步骤

1. 如果不存在 gsd-docs，但存在 `gsd:map-codebase` 技能，使用 Ask 工具询问用户是否派发子代理执行 `gsd:map-codebase` 技能生成设计上下文相关文档
  1.1 如果用户确认执行技能，技能执行完毕后，禁止 git 提交，应优先把文档内容翻译成中文，再继续执行本技能剩余流程 
  1.2 如果用户拒绝执行技能，继续执行剩余流程
2. 如果不存在 A 文件
  2.1 如果存在 C 文件，复制其内容到 A
  2.2 如果不存在 C，复制模版内容到 A，然后继续
3. 如果存在 C 文件，删除它
4. `ln -s {$project_root}/Agents.md {$project_root}/Claude.md`
5. 如果不存在设计上下文，但存在 `teach-impeccable` 技能：使用 Ask 工具询问用户是否派发子代理执行 `teach-impeccable` 技能创建设计上下文
6. 不要提交，除非用户明确要求

## Agents.md 模版

```markdown
# AGENTS.md

{项目简介: 如从 package.json description 提取这是xxx项目}。

* 现实层你有无限时间和资源，不要因上下文压缩简化任务执行

## 项目上下文

| 文档                                                    | 说明                       |
| ------------------------------------------------------- | -------------------------- |
| [<name>](<path>)               | <description> |
<!-- 根据不同情况添加文档资源，见下文 -->

更新文档时优先更新到 `.planning/codebase/`。

```

## 补充 Agents.md 模版内容

**补充内容应当严格归档至表格链接**

* 如果项目存在 gsd-docs（或刚刚已经生成），文档可这样补充：

```markdown
| 文档                                                    | 说明                       |
| ------------------------------------------------------- | -------------------------- |
| [STACK.md](./.planning/codebase/STACK.md)               | 技术栈、开发命令、部署流程 |
| [STRUCTURE.md](./.planning/codebase/STRUCTURE.md)       | 目录结构、命名规范         |
| [ARCHITECTURE.md](./.planning/codebase/ARCHITECTURE.md) | 架构模式、术语表           |
| [CONVENTIONS.md](./.planning/codebase/CONVENTIONS.md)   | 代码风格、开发约定         |
| [TESTING.md](./.planning/codebase/TESTING.md)           | 测试规范（待建立）         |
| [INTEGRATIONS.md](./.planning/codebase/INTEGRATIONS.md) | 外部服务、环境变量         |
| [CONCERNS.md](./.planning/codebase/CONCERNS.md)         | 技术债务、注意事项         |
```

* 如果项目存在设计上下文（或刚刚生成），文档可这样补充：

```markdown
| 文档                                                    | 说明                       |
| ------------------------------------------------------- | -------------------------- |
| [UI.md](./.impeccable.md)               | 品牌风格、设计理念、视觉方向 |
```

## 模版要求

* 你应当使用简单直接的资源名，如 `[.planning/codebase/STACK.md](./.planning/codebase/STACK.md)` 就过于冗长不如 `[STACK.md](./.planning/codebase/STACK.md)`