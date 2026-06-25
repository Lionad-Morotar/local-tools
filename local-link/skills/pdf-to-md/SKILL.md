---
name: pdf-to-md
description: 用 MinerU(opendatalab/MinerU,Apache 2.0)把 PDF / 图片 / DOCX / PPTX / XLSX 转成结构清晰的 Markdown。当用户要"PDF 转 Markdown / md"、"提取 PDF 内容"、"整理这份文档/手册"、"把扫描件转成可读文本",或抱怨 PDF 表格列粘连、函数字段被拆散、扫描件难读时触发。自动处理表格→HTML、公式→LaTeX、跨页合并、页眉页脚去除、多语言 OCR,默认用最高精度的 hybrid 后端。遇到任何"把这份 PDF/文档弄成 Markdown"的请求都用它,即使用户没点名 MinerU。
argument-hint: <file path or URL>
---

# pdf-to-md

用 [MinerU](https://github.com/opendatalab/MinerU) 把版式文档转成结构化 Markdown。MinerU 用版面理解模型自动处理表格、公式、跨页、阅读顺序,**不要手写坐标解析**——那是对付表格列粘连的旧办法,MinerU 已从模型层面解决。

## 参数(按场景选,默认最高精度)

| 参数 | 默认 | 何时换 |
|---|---|---|
| 后端 `-b` | `hybrid-auto-engine`(精度 95+,最高) | 追求速度或低配机器用 `pipeline`(纯 CPU 可跑,精度 85+) |
| 语言 `-l` | `auto` | 中文文档 `ch`、英文 `en` 可提 OCR 准确率 |
| 后处理 | 开(标题修复) | 输出已满意可跳过 |

默认 hybrid 的理由:精度最高且**字符最准**(实测 API 文档 0 字符错误,而 pipeline 有 I/l 类混淆),代价是慢一些、模型 2-3GB。一次性转换优先精度,慢一点无所谓。

## 流程

### 1. 确保 MinerU 可用

```bash
command -v mineru || uv pip install -U "mineru[all]" --system -i https://mirrors.aliyun.com/pypi/simple
```

- 中国大陆**必设模型源**,否则首次下模型卡 huggingface:
  ```bash
  export MINERU_MODEL_SOURCE=modelscope
  ```
- macOS 不支持 Docker 部署,只能 pip/uv。Apple Silicon 跑 hybrid 时自动用 mlx-engine(原生加速)。

### 2. 转换

```bash
export MINERU_MODEL_SOURCE=modelscope
mineru -p <输入文件或目录> -o <输出目录> -b hybrid-auto-engine -l auto
```

- 输入支持单文件或整个目录(批量)
- 首次运行下载模型(hybrid 2-3GB / pipeline 1-2GB),之后走缓存,再次转换很快
- 中文技术手册加 `-l ch`,英文报告加 `-l en`

### 3. 后处理(修复标题误判)

MinerU 把 PDF 里所有"大字号"元素映射为标题,可能把数据点(纯数字)、人名、强调句误判为标题。转完跑本技能目录下的修复脚本:

```bash
node <skill-dir>/scripts/postprocess-headings.mjs <输出.md>
```

脚本把假标题降级为加粗段落,打印保留/降级统计供你确认。

### 4. 质检

输出目录里的 `_layout.pdf` 是版面可视化(原图叠加检测框),肉眼对照能快速发现表格/区块识别错误。**版面复杂的文档务必抽查**。

## 输出结构

```
<output>/<backend>/<docname>/
├── <docname>.md                 # 主产物
├── <docname>_content_list.json  # 阅读顺序 JSON,程序消费友好
├── <docname>_middle.json        # 每个区块带 bbox 的中间格式
├── <docname>_layout.pdf         # 版面可视化(质检用)
└── images/                      # 抽取的图片
```

## 能力边界

记住这条以设定正确预期——MinerU 是优秀的**元素提取器**,但对**版面语义**理解有限:

- ✅ **结构化技术文档**(API 手册、规范、标准、论文):表格、字段、公式、阅读顺序几乎完美
- ⚠️ **设计驱动的营销文档**(年报、ESG、宣传册、杂志):元素都能提取,但多栏对比的阅读顺序、大字号非标题元素需后处理(跑标题修复脚本 + 人工校阅读顺序)

转完用 `_layout.pdf` 抽查,尤其版面复杂的文档。

## 常用参数速查

```bash
mineru -p <in> -o <out> -b hybrid-auto-engine \
  -l ch \          # 语言 ch/en/auto
  -s 0 -e 5 \      # 只转第 0-5 页(从 0 开始)
  -f true -t true  # 公式/表格解析开关(默认开)
```

## 失败回退

- **hybrid 跑不动**(无 Apple Silicon / 超时 / 内存不足):降级 `-b pipeline`
- **模型下载失败**:确认 `MINERU_MODEL_SOURCE=modelscope` 已设
- **标题/表格仍有问题**:跑后处理脚本 + 对照 `_layout.pdf` 人工修
- **生产环境锁定版本**:`uv pip install "mineru[all]==3.3.1"`(MinerU 迭代快,CLI 可能变)
