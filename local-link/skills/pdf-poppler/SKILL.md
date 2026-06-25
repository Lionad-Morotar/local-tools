---
name: pdf-poppler
description: "使用 Poppler 命令行工具处理 PDF：pdftotext 转文本、pdftoppm 转图片、pdfimages 提取图片、pdfinfo 查看元数据、pdftohtml 转 HTML、pdfseparate/pdfunite 拆分合并。用于 PDF 内容提取、格式转换、批量处理等任务。触发词：'提取 PDF 文本'、'PDF 转图片'、'提取 PDF 中的图片'、'查看 PDF 信息'、'拆分 PDF'。"
argument-hint: <command> <file> [args]
disable-model-invocation: true
---

# PDF-Poppler: Poppler PDF 工具集

Poppler 是开源 PDF 渲染库，提供强大的命令行工具集。

**完整参考**: [references/complete-reference.md](references/complete-reference.md) - 所有工具的详细选项

---

## 安装

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install poppler-utils

# Fedora
sudo dnf install poppler-utils
```

---

## 工具速查

| 工具 | 用途 | 最常用示例 |
|------|------|-----------|
| `pdftotext` | PDF → 文本 | `pdftotext -layout input.pdf output.txt` |
| `pdftoppm` | PDF → 图片 | `pdftoppm -png -r 300 input.pdf page` |
| `pdfimages` | 提取图片 | `pdfimages -png input.pdf image` |
| `pdfinfo` | 文档信息 | `pdfinfo input.pdf` |
| `pdftohtml` | PDF → HTML | `pdftohtml -s input.pdf output.html` |
| `pdfseparate` | 拆分页面 | `pdfseparate input.pdf page-%d.pdf` |
| `pdfunite` | 合并文件 | `pdfunite *.pdf output.pdf` |

---

## pdftotext - PDF 转文本

### 常用用法

```bash
# 基础转换
pdftotext input.pdf output.txt

# 保留布局（适合表格、多栏）
pdftotext -layout input.pdf output.txt

# 指定页码
pdftotext -f 3 -l 5 input.pdf output.txt    # 第 3-5 页

# 指定编码（解决中文乱码）
pdftotext -enc UTF-8 input.pdf output.txt

# 输出到 stdout
pdftotext input.pdf -

# 生成带位置信息的 TSV
pdftotext -tsv input.pdf output.tsv
```

### 常用选项

| 选项 | 说明 |
|------|------|
| `-f N` | 起始页 |
| `-l N` | 结束页 |
| `-layout` | 保留物理布局 |
| `-enc UTF-8` | 设置编码 |
| `-tsv` | 输出 TSV（含边界框） |
| `-htmlmeta` | 生成 HTML |

---

## pdftoppm - PDF 转图片

### 常用用法

```bash
# PDF 转 PNG（默认 150 DPI）
pdftoppm -png input.pdf page

# 高质量 300 DPI
pdftoppm -png -r 300 input.pdf page

# 仅转换第 2-5 页
pdftoppm -png -f 2 -l 5 input.pdf page

# 仅奇数页
pdftoppm -png -o input.pdf page

# 高质量 JPEG，质量 95%
pdftoppm -jpeg -jpegopt "quality=95" input.pdf page

# 生成缩略图（宽度 200px）
pdftoppm -png -scale-to 200 input.pdf thumb
```

### 常用选项

| 选项 | 说明 |
|------|------|
| `-png` | PNG 格式 |
| `-jpeg` | JPEG 格式 |
| `-r N` | DPI 分辨率 |
| `-f/-l N` | 起止页 |
| `-o/-e` | 仅奇/偶页 |
| `-scale-to N` | 缩放长边到 N 像素 |
| `-jpegopt "quality=N"` | JPEG 质量 0-100 |

---

## pdfimages - 提取图片

### 常用用法

```bash
# 提取为 PNG
pdfimages -png input.pdf image_prefix

# 保持 JPEG 原格式，其他转 PNG
pdfimages -j -png input.pdf image_prefix

# 仅提取第 3-5 页
pdfimages -f 3 -l 5 -png input.pdf image_prefix

# 仅列出图片信息
pdfimages -list input.pdf
```

### 常用选项

| 选项 | 说明 |
|------|------|
| `-png` | PNG 格式 |
| `-j` | JPEG 保持原格式 |
| `-all` | 所有图片按原生格式 |
| `-list` | 仅列出信息 |
| `-p` | 文件名包含页码 |

---

## pdfinfo - 文档信息

```bash
# 查看完整信息
pdfinfo document.pdf

# 仅查看页数
pdfinfo document.pdf | grep Pages

# ISO 8601 日期格式
pdfinfo -isodates document.pdf
```

---

## pdftohtml - PDF 转 HTML

```bash
# 基础转换
pdftohtml input.pdf output.html

# 单页 HTML（无框架）
pdftohtml -s -noframes input.pdf output.html

# XML 格式
pdftohtml -xml input.pdf output.xml

# 忽略图片
pdftohtml -i input.pdf output.html
```

---

## pdfseparate & pdfunite - 拆分/合并

```bash
# 拆分每页为单独文件
pdfseparate input.pdf page-%d.pdf
# 生成: page-1.pdf, page-2.pdf...

# 拆分特定位数编号
pdfseparate input.pdf page-%03d.pdf
# 生成: page-001.pdf, page-002.pdf...

# 合并多个 PDF
pdfunite file1.pdf file2.pdf file3.pdf output.pdf

# 合并所有 PDF
pdfunite *.pdf combined.pdf
```

---

## 批量处理

```bash
# 批量提取文本
for pdf in *.pdf; do
    pdftotext -layout "$pdf" "${pdf%.pdf}.txt"
done

# 批量获取标题
for pdf in *.pdf; do
    echo -n "$pdf: "
    pdfinfo "$pdf" | grep "Title:" | cut -d: -f2-
done

# 批量转图片（每个 PDF 一个目录）
for pdf in *.pdf; do
    mkdir -p "${pdf%.pdf}_images"
    pdftoppm -png "$pdf" "${pdf%.pdf}_images/page"
done
```

---

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| 中文乱码 | `pdftotext -enc UTF-8 ...` |
| 扫描版 PDF 无文本 | 先用 `pdftoppm` 转图片，再 OCR |
| 加密 PDF | 使用 `-upw password` 或 `-opw password` |
| 命令未找到 (macOS) | `export PATH="/opt/homebrew/opt/poppler/bin:$PATH"` |

---

## 参考

- **完整选项参考**: [references/complete-reference.md](references/complete-reference.md)
- **官网**: https://poppler.freedesktop.org/
- **Man Pages**: https://manpages.debian.org/testing/poppler-utils/
