---
name: pdf-to-md
description: 将版式紧凑的中文技术手册（SDK / 密码设备 / API 文档）从 PDF 转为结构清晰的 Markdown。当用户要求转换 PDF、提取 PDF 内容、或遇到表格列粘连时触发。
disable-model-invocation: true
---

# pdf-to-md

把 PDF 技术手册转成干净 Markdown。

可以：解决紧凑表格列粘连问题。

## 触发条件

- 用户说“PDF 转 Markdown / md”、“提取 PDF 内容”、“整理 PDF”
- PDF 是中英文技术手册，含有大量固定列表格（算法、错误码、证书项、设备信息等）
- `pdftotext -layout` 输出后列粘连、表格无法直接按空格拆分

## 核心原则

1. **不要依赖 `pdftotext -layout` 后按空格拆表格**。紧凑列 PDF 的空格会被吃掉，导致整行变成单个单元格。
2. **优先用 `pdfplumber` 提取单元格坐标**，按视觉列重建 Markdown 表格。
3. **坐标法失败时，根据原 PDF 视觉结构手工重建表格**。行数固定、列含义明确的表格，重写比自动修复更可靠。
4. 输出用中文，保留原意，不添加解释。

## 步骤

### 1. 判断 PDF 结构

```python
import pdfplumber
with pdfplumber.open("input.pdf") as pdf:
    print(len(pdf.pages))
    print(pdf.pages[0].extract_text()[:500])
```

### 2. 普通段落

```bash
pdftotext -layout input.pdf output.txt
```

清理多余空行、段首缩进。

### 3. 表格

```python
import pdfplumber
with pdfplumber.open("input.pdf") as pdf:
    tables = pdf.pages[N].extract_tables()
```

如果 `extract_tables()` 失败，用 `page.extract_words()` 按 `x0` / `top` 坐标分组：

- 同一 `top` 的 word 是同一行
- 按 `x0` 把行分成若干列
- 列边界根据表格框线或文字块视觉间隙确定

### 4. 函数说明

函数说明通常含固定字段：功能、函数/原型、参数、返回值、备注。

用 `pdfplumber` 的 word 坐标检测字段标签（标签通常在左侧 x0 ~ 80-110），后续行归为同一字段，直到下一个标签出现。

输出格式：

```markdown
#### 函数名

- **功能**：...
- **原型**：...
- **参数**：...
- **返回值**：...
- **备注**：...
```

### 5. 清理

- 删除段前多余空格
- 合并连续空行为单个空行
- 删除页眉/页脚
- 保持章节层级：`#` 标题、`##` 一级节、`###` 二级节、`####` 函数

## 失败回退

如果坐标提取也无法还原表格，直接打开 PDF 对照手工写 Markdown 表格。不要输出格式混乱的表格。
