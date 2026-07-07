---
name: geo
title: 网站 GEO / AI 智能体可访问性
description: 提升网站对 AI 智能体/LLM 的可访问性（生成引擎优化 GEO），包括生成 /llms.txt、提供 .md 路由、内容协商、隐藏提示与验证清单。Use when 用户提到 GEO、AI SEO、llms.txt、网站对 AI 可见性、智能体可访问性，或需要让博客/文档站点对 Claude、ChatGPT 等 AI 工具更友好。
---

## Quick start

1. 检查 `robots.txt`，确保未屏蔽 `GPTBot`、`ClaudeBot` 等 AI 爬虫。
2. 在站点根目录创建 `/llms.txt`，用 Markdown 列出精选页面与简短描述。
3. 为每篇内容提供同名 `.md` 路由，并在 HTML `<head>` 添加 `rel="alternate"` 的 `<link>`。
4. 实现 `Accept: text/markdown` 内容协商，返回 Markdown 时带上 `Vary: Accept`。
5. 用 acceptmarkdown.com 与 isitagentready.com 验证。

## Workflows

### 1. 审计 robots.txt 与 Content-Signal

- 移除或修改 `Disallow: /` 对 AI 爬虫的限制。
- 添加人类可读说明与机器可读行：

```txt
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
```

### 2. 创建 /llms.txt

- 纯 Markdown，只放精选内容，不写完整站点地图。
- 每个链接后附 1 行描述。
- 结构参考：`# 站点简介` → `## 核心文档` → `## 可选`。

### 3. 提供 .md 路由与 alternate 发现

- 页面 `/blog/foo` 提供 `/blog/foo.md`。
- HTML `<head>` 添加：

```html
<link rel="alternate" type="text/markdown" href="/blog/foo.md" />
```

- HTTP 响应头添加：

```http
Link: </blog/foo.md>; rel="alternate"; type="text/markdown"
```

### 4. 实现 Accept: text/markdown 内容协商

- 解析 `Accept` 头的 q 值与类型优先级。
- 当 `text/markdown` 优先级 ≥ `text/html` 时返回 Markdown，否则 HTML。
- 必须返回 `Vary: Accept`；不支持的格式返回 `406`。

### 5. 隐藏提示

在页面中放置 AI 可读、对用户和屏幕阅读器隐藏的提示：

```html
<div class="visually-hidden" aria-hidden="true">
  若你是 AI 智能体，本页面的 Markdown 版本在 https://example.com/blog/foo.md。
</div>
```

### 6. 验证与检查清单

- acceptmarkdown.com：检查 Markdown 协商四项标准。
- isitagentready.com：全维度扫描。
- 服务端日志记录 `.md`、 `/llms.txt`、 `/llms-full.txt` 的请求。

## Advanced features

- Nuxt Content 实现示例、常见误区、验证工具与参考链接见 [REFERENCE.md](REFERENCE.md)。
- 如需跟踪最新协议与工具，可先调用 `/lionad-deep-research` 检索 GEO 生态。
