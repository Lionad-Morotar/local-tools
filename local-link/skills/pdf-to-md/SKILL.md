---
name: pdf-to-md
description: 将版式紧凑的中文技术手册（SDK / 密码设备 / API 文档）从 PDF 转为结构清晰的 Markdown。当用户要求转换 PDF、提取 PDF 内容、或遇到表格列粘连时触发。
---

# pdf-to-md

把 PDF 技术手册转成干净 Markdown，核心是解决紧凑表格列粘连和函数字段被拆散的问题。

## 触发条件

- 用户要求 PDF 转 Markdown / md、提取 PDF 内容、整理 PDF
- PDF 是中英文技术手册，含有大量固定列表格（算法、错误码、证书项、设备信息等）
- `pdftotext -layout` 输出后列粘连、表格无法直接按空格拆分

## 核心原则

1. **整个转换流程由 Python + pdfplumber 驱动，不要先调 pdftotext 再拆分空格。**
2. **表格必须按视觉列重建。** 不能依赖字符串里的空白，因为紧凑列 PDF 的空格会被吃掉。
3. **函数详情必须按字段聚合。** 功能 / 原型 / 参数 / 返回值 / 备注 各放一行，不能拆成独立 Markdown 标题。
4. **输出后必须自检表格列数和字段格式。**
5. 输出用中文，保留原意，不添加解释。

## 完整流程

用一段 Python 脚本完成全部转换。

### 1. 准备

```python
import pdfplumber, re, json
from collections import defaultdict
from pathlib import Path

PDF_PATH = Path("input.pdf")
OUT_PATH = PDF_PATH.with_suffix(".md")

SECTION_HEADINGS = {...}   # 从 PDF 目录提取的章节标题集合
FIELD_LABELS = {"功能", "函数", "原型", "参数", "返回", "返回值", "值", "备注"}

def rows_of(page):
    """返回页面中按 top 排序、每行内部按 x0 排序的 word 列表。"""
    words = page.extract_words()
    y_groups = defaultdict(list)
    for w in words:
        y_groups[round(float(w["top"]))].append(w)
    out = []
    for y in sorted(y_groups):
        if y < 55 or y > 780:
            continue
        ws = sorted(y_groups[y], key=lambda w: float(w["x0"]))
        out.append({"y": y, "words": ws, "text": "".join(w["text"] for w in ws)})
    return out

def row_columns(ws, boundaries):
    """根据列边界 boundaries（升序 x 坐标列表）把 word 列表分成若干列。"""
    cols = [[] for _ in range(len(boundaries) + 1)]
    for w in ws:
        x = float(w["x0"])
        idx = sum(1 for b in boundaries if x > b)
        cols[idx].append(w["text"])
    return ["".join(c).strip() for c in cols]
```

### 2. 章节识别

章节标题特征：

- 左对齐，x0 约在 60-120 之间
- 完全匹配已知章节标题集合

函数名标题也以 SOF_ 开头且左对齐，用正则区分。

维护 `SECTION_HEADINGS` 集合，扫描时如果一行 `text.strip() in SECTION_HEADINGS` 且第一个 word 的 `x0 < 120`，判定为新章节开始。

### 3. 函数列表表格

函数列表是跨页的多行两列表格，结构为：函数名（左列 x0 ~ 80-130）、功能描述（右列 x0 ~ 280）。

处理步骤：

1. 扫描所有页，收集所有满足 `x0 < 200` 且文本匹配 `^SOF_[A-Za-z0-9_]+$` 的词。
2. 同一行中，把 `x0 >= 200` 的词拼接成“功能描述”。
3. 如果一行的功能描述为空，不要把它合并到上一行或下一行；保持为空单元格。
4. 输出 Markdown 表格：

```markdown
| 函数接口 | 功能描述 | 备注 |
|---|---|---|
| SOF_GetLastError | 获取错误值 | |
```

### 4. 函数详情字段

每个函数固定字段：**功能、原型、参数、返回值、备注**。

识别字段标签：

- 标签在行的左侧，第一个 word 的 `x0 < 110`
- 标签文本属于 `FIELD_LABELS`
- 标签后的内容（同一行中 x0 >= 110 的部分）作为字段起始
- 后续没有新标签的行追加到当前字段

标签合并规则：

- `函数`、`原型` 合并为 **原型**
- `返回`、`值`、`返回值` 合并为 **返回值**

强制输出格式：

```markdown
#### SOF_Xxx

- **功能**：...
- **原型**：...
- **参数**：...
- **返回值**：...
- **备注**：...
```

**关键约束**：

- 不能把标签文本本身输出成 Markdown 标题
- 如果一个函数的内容全部涌到“功能”字段里，说明列边界或字段检测失败，必须人工校正并拆成五个字段
- 字段为空时直接省略该行

### 5. 表格（算法、证书项、设备信息、错误码）

这些表格有共同特征：表头行 + 固定列数。

优先用 `pdfplumber.page.extract_tables()`。如果列数不对或出现错位空行，改用坐标法：

1. 取出该页所有 word，按 `top` 分组得到行。
2. 通过观察该表格各列文字块的 x0 分布，确定列边界。
3. 对每一行，根据边界把 word 分到对应列。
4. 删除“描述列内容为空、其它列也为空”的无效行。
5. 输出标准 Markdown 表格，并补齐表头分隔线。

如果坐标法仍无法对齐，**打开 PDF 对照手工写 Markdown 表格**。不要输出列粘连或列数不一致的表格。

### 6. 普通段落

非表格、非函数说明的段落按行合并，删除段首缩进，保留空行分隔段落。

### 7. 输出清理与自检

清理：

- 删除页眉/页脚
- 合并连续空行为单个空行
- 保持层级：`#` 手册标题、`##` 一级章节、`###` 二级章节、`####` 函数名

自检（必须执行）：

- 每个 Markdown 表格中，每行 `|` 数量必须相同。如果不同，重建该表格。
- 函数详情中，如果一个函数只出现 `- **功能**：...` 且里面塞了原型/参数/返回值，说明字段拆分失败，必须手工拆成五个字段。
- 检查关键章节是否遗漏：产品概述、龙脉国密KEY、操作系统支持、浏览器支持、注意、证书综合应用插件支持的函数、证书综合应用插件接口说明、龙脉国密KEY支持的算法描述、证书解析项标识、设备信息标示符、错误码及宏定义、常见问题、联系我们。

## 失败回退

如果脚本无法还原表格或函数详情，直接在 Markdown 中按 PDF 视觉结构手写正确表格，而不是输出格式混乱的内容。
