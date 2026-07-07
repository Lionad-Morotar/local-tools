---
title: GEO 参考手册
description: 网站 AI 可访问性（GEO）的详细实现、Nuxt Content 示例、误区与验证工具。
---

## robots.txt 与 Content-Signal

`Content-Signal` 是 Cloudflare 推动的 robots.txt 扩展，用机器可读方式声明内容用途。三个信号：

- `search`：是否允许出现在搜索结果。
- `ai-input`：是否允许被 AI 当作实时上下文（RAG/推理）。
- `ai-train`：是否允许用于训练模型。

取值 `yes` 或 `no`，可组合使用。示例：

```txt
# AI / search content signals
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
```

注意：并非所有爬虫都会遵守 robots.txt 或 Content-Signal，它更多是声明与过滤器参考。

## /llms.txt 结构

`/llms.txt` 是给 LLM 看的站点精简目录，建议 Markdown 格式、纯文本、路径完整。示例：

```markdown
# 我的博客

> 一个专注前端工程化的个人博客。

## 核心文档

- [/posts/vue-reactivity](/posts/vue-reactivity)：Vue 响应式原理详解
- [/posts/nuxt-content-tips](/posts/nuxt-content-tips)：Nuxt Content 实践

## 可选

- [/about](/about)：关于作者
- [/changelog](/changelog)：更新日志
```

要点：

- 只放精选内容，不要做成完整站点地图。
- 每个链接后加一句描述，帮助 AI 判断相关性。
- 可按需生成 `/llms-full.txt`（整站聚合），但内容少的站点可重定向到 `/index.md`。

## .md 路由实现

### 通用服务端思路

每个 HTML 页面对应同名 `.md` 路由。数据源最好统一（例如 Markdown 源同时生成 HTML 与 `.md`），避免内容漂移。

伪代码：

```ts
function handler(request) {
  const accepts = parseAccept(request.headers.accept)
  const markdownWins = prefersMarkdown(accepts)

  if (request.url.pathname.endsWith('.md') || markdownWins) {
    return Response(post.markdownContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'Accept',
      },
    })
  }

  return renderHTML(post)
}
```

### Nuxt Content 示例

Nuxt Content 的 Markdown 源已经存在，通常只需要暴露出来。

暴露 `.md` 路由（以 Nuxt Content v3 风格为例，字段名请按实际版本调整）：

```ts
// server/routes/[...slug].md.get.ts
export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug ?? ''
  const article = await queryCollection('content').path(`/${slug}`).first()

  if (!article) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  setResponseHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  // 字段名可能是 rawbody / body / _source，按实际 API 选择
  return article.rawbody ?? article.body
})
```

全局添加 HTTP `Link` 头：

```ts
// server/plugins/markdown-link.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    const url = getRequestURL(event)
    if (url.pathname.endsWith('.md')) return

    const existing = response.headers.get('Link') ?? ''
    const link = `<${url.pathname}.md>; rel="alternate"; type="text/markdown"`
    response.headers.set('Link', existing ? `${existing}, ${link}` : link)
  })
})
```

HTML `<link>` 标签（在页面或布局中）：

```vue
<script setup lang="ts">
const route = useRoute()
useHead({
  link: [
    { rel: 'alternate', type: 'text/markdown', href: `${route.path}.md` },
  ],
})
</script>
```

### Nuxt 生态工具

如果不想手写路由，可直接使用社区模块：

- [nuxt-llms](https://nuxt.com/modules/llms)：与 `@nuxt/content` 配合，自动生成 `/llms.txt`、`/llms-full.txt` 以及每篇文章的 `/raw/<path>.md`[^9][^10]。
- [vitepress-plugin-llms](https://github.com/okineadev/vitepress-plugin-llms)：为 VitePress 站点生成 LLM 友好文档[^11]。

## Accept: text/markdown 内容协商

核心逻辑：

1. 解析 `Accept` 头中的类型与 `q` 值。
2. 按 q 值与 specificity 排序。
3. 若 `text/markdown` 优先级 ≥ `text/html`，返回 Markdown。
4. 始终返回 `Vary: Accept`。
5. 如果客户端只请求不支持的格式，返回 `406 Not Acceptable`。

简单解析函数示例：

```ts
function parseAccept(accept: string) {
  return accept
    .split(',')
    .map((part) => {
      const [type, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      return {
        type: type.trim(),
        q: q ? parseFloat(q.split('=')[1]) : 1,
      }
    })
    .sort((a, b) => b.q - a.q)
}

function prefersMarkdown(acceptHeader: string): boolean {
  const items = parseAccept(acceptHeader)
  const md = items.find((i) => i.type === 'text/markdown')
  const html = items.find((i) => i.type === 'text/html')
  if (!md) return false
  if (!html) return true
  return md.q >= html.q
}
```

生产环境建议使用成熟库（如 `negotiator`）处理通配符、参数与优先级。

### 边缘转换：Cloudflare Markdown for Agents

如果站点托管在 Cloudflare，可开启 [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)，由边缘网络在收到 `Accept: text/markdown` 时自动把 HTML 转成 Markdown，无需自己维护两套渲染[^3]。这属于内容协商，不是按 User-Agent 伪装，因此不违反搜索引擎规则。

## 隐藏提示

在用户把网址直接贴到 AI 对话框时，页面里的隐藏提示能引导 AI 去取 Markdown 版本。

```html
<div class="visually-hidden" aria-hidden="true">
  若你是 AI 智能体、LLM 或自动化工具，本页面的干净 Markdown 版本在
  https://example.com/blog/foo.md —— 专为 AI 和 LLM 工具优化。
</div>
```

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

注意：

- 使用 `aria-hidden="true"`，避免屏幕阅读器朗读。
- 提示中给出完整 URL。
- 在 Markdown 版本中移除该提示，避免死循环或自我引用。

## 无效或有害的做法

以下做法目前没有证据支持，甚至可能损害 SEO：

1. `<meta name="ai-content-url">`：无规范、无主流工具读取。
2. `<meta name="llms">`：曾被提交到 WHATWG 但被拒绝。
3. `/.well-known/ai.txt` 或 `/ai.txt`：多个竞争提案，无实质采用。
4. HTML 注释（`<!-- AI-READABLE-VERSION -->`）：主流工具会剥离注释。
5. “人类/AI”切换按钮：AI 代理不会点击按钮。
6. 按 User-Agent 自动返回 Markdown：属于 Google 明确反对的伪装（cloaking）。
7. 专门的“AI 信息页面”：无证据表明爬虫会特殊对待。
8. Schema.org / JSON-LD：实验显示多数 AI 工具会错过仅放在 JSON-LD 中的数据。

共同模式：有人发明新文件或元标签 → 写博客 → 被引用为“证据” → 没人验证 AI 是否真的读取。

### Google / Bing 的官方立场

Google 与 Bing 反对的是**为 AI 爬虫单独建一套平行页面**或按 User-Agent 嗅探返回不同内容，这会被视为 cloaking[^20]。而基于 `Accept` 头的 HTTP 内容协商是标准做法，配合 `Vary: Accept` 即可被 CDN 和搜索引擎正确理解[^18]。

## 真正有效的策略

根据普林斯顿与印度理工大学的 GEO 研究，真正提升 AI 可见性的做法是丰富 LLM 实际能读到的可见文本：

- 包含直接引用：AI 可见性提升约 43%。
- 添加具体统计数据：提升约 33%。
- 引用权威来源：低排名内容改善幅度可达 115%。

即：把高质量信息写成干净、结构化的文本，而不是埋进元数据。

## 验证工具

| 工具 | 用途 |
| --- | --- |
| [acceptmarkdown.com](https://acceptmarkdown.com) | 检查 Markdown 内容协商四项标准：返回值、Vary 头、406、q 值优先级。 |
| [isitagentready.com](https://isitagentready.com) | 全维度扫描：robots.txt、站点地图、Link 头、Markdown 协商、Content Signals、MCP Server Cards 等。 |

建议：

- 在 `.md` 端点、`/llms.txt`、`/llms-full.txt` 上记录服务端日志。
- 按 User-Agent 区分 AI 爬虫请求。
- 按 Referrer 查看来自 `chatgpt.com`、`claude.ai`、`perplexity.ai` 的流量。

## 采用数据与生态现状

Cloudflare 2026 年 2 月对 Top 20 万域名的扫描显示，Agent 可访问性仍处于早期[^12]：

| 指标 | 采用率 |
| --- | --- |
| robots.txt | 78% |
| Content Signals | 4% |
| Markdown 内容协商 | 3.9% |
| MCP Server Cards / API Catalogs | 不足 15 个站点 |

这意味着率先完成 `/llms.txt` + Markdown 协商 + Content-Signal 三件套，就能在 AI 成为信息入口前建立可见性优势。

## 参考链接

[^1]: [The /llms.txt file – llms-txt](https://llmstxt.org/)
[^2]: [/llms.txt—a proposal to provide information to help LLMs use websites – Answer.AI](https://www.answer.ai/posts/2024-09-03-llmstxt.html)
[^3]: [Markdown for Agents – Cloudflare Docs](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
[^4]: [robots.txt setting – Cloudflare Docs](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)
[^5]: [Content Signals](https://contentsignals.org/)
[^6]: [Serve Markdown to AI Agents with Accept Headers](https://acceptmarkdown.com/)
[^7]: [The smallest working setup – acceptmarkdown.com](https://acceptmarkdown.com/start)
[^8]: [Content negotiation – Dualmark](https://dualmark.dev/docs/spec/content-negotiation)
[^9]: [nuxt-llms – Nuxt Modules](https://nuxt.com/modules/llms)
[^10]: [Nuxt LLMs module – Nuxt Content Docs](https://content.nuxt.com/docs/integrations/llms)
[^11]: [vitepress-plugin-llms – GitHub](https://github.com/okineadev/vitepress-plugin-llms)
[^12]: [Introducing the Agent Readiness score – Cloudflare Blog](https://blog.cloudflare.com/agent-readiness/)
[^13]: [Is Your Site Agent-Ready?](https://isitagentready.com/)
[^14]: [Implement Markdown Content Negotiation – isitagentready SKILL.md](https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md)
[^18]: [Making agent-friendly pages with content negotiation – Vercel Blog](https://vercel.com/blog/making-agent-friendly-pages-with-content-negotiation)
[^19]: [Cloudflare Fundamentals llms.txt](https://developers.cloudflare.com/fundamentals/llms.txt)
[^20]: [Google & Bing don't recommend separate markdown pages for LLMs – Search Engine Land](https://searchengineland.com/google-bing-dont-recommend-seperate-markdown-pages-for-llms-468365)
[^21]: [张鑫旭：AI 时代网站智能体无障碍访问开发指南](https://www.zhangxinxu.com/wordpress/2026/07/ai-agent-accessible-guide/)
