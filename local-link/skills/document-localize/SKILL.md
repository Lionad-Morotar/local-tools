---
name: document-localize
description: 为 LLM 指令文件中的操作添加本地化标注，让 LLM 使用指定语言输出。适用于任何 prompt/instruction 文件，支持文档写入、Git commit、代码注释等多种操作类型。触发场景：(1) 需要让 LLM 用中文/日语/韩语等输出内容 (2) 批量为指令文件添加语言标注 (3) 本地化现有 prompt 文件。
argument-hint: <file path> [target language]
disable-model-invocation: true
---

# Document Localize

为 LLM 指令文件中的操作添加本地化语言标注。

## 快速开始

**输入**：包含操作指令的文本
**输出**：添加语言标注后的文本

示例：

```markdown
# Before
- Write a summary of the changes
- Commit the changes with a message

# After (默认中文标注)
- Write a summary of the changes（要求：使用中文）
- Commit the changes with a message（要求：使用中文）
```

## 支持的操作类型

### 文档写入操作

识别模式：
- `Write to`、`Write`、`Create`、`Generate`、`Update`、`Output`
- `撰写`、`编写`、`生成`、`创建`、`输出`
- `编写文档`、`生成报告`、`创建文件`

### Git 操作

识别模式：
- `commit`、`Commit`、`git commit`
- `提交`、`提交代码`
- PR 标题/描述相关指令

### 代码注释

识别模式：
- `Add comments`、`Comment the code`
- `添加注释`、`代码注释`
- 文档字符串生成

### 其他输出操作

识别模式：
- `Print`、`Display`、`Output`、`Show`
- `打印`、`显示`、`输出`、`展示`
- 回复/响应类指令

## 使用方式

### 1. 直接标注

为给定的指令文本添加语言标注：

```
参数：
- text: 需要标注的文本
- language: 目标语言（默认：中文）
- format: 标注格式（默认：（要求：使用{language}））
```

### 2. 批量处理文件

处理整个 prompt 文件：

```
参数：
- file_path: 文件路径
- language: 目标语言
- operations: 需要标注的操作类型列表（可选，默认全部）
```

### 3. 自定义格式

支持自定义标注格式：

```markdown
# 默认格式
（要求：使用中文）

# 其他格式示例
[请用中文]
-- 请使用中文输出
> Language: Chinese
```

## 标注格式说明

### 默认格式

```
（要求：使用{language}）
```

### 位置

标注默认紧随操作指令，保持原有句子格式不变。

### 语言映射

| 语言代码 | 标注文本 |
|---------|---------|
| zh / chinese | 中文 |
| ja / japanese | 日语 |
| ko / korean | 韩语 |
| en / english | English |
| de / german | Deutsch |
| fr / french | Français |

## 配置选项

可在执行时指定：

| 选项 | 说明 | 默认值 |
|-----|------|-------|
| `language` | 目标语言 | 中文 |
| `format` | 标注格式 | （要求：使用{language}） |
| `operations` | 操作类型过滤 | 全部 |
| `skip_existing` | 跳过已有标注的行 | true |

## 注意事项

1. **避免重复标注**：检测行尾是否已有语言标注
2. **保持格式**：不改变原有文本的缩进和结构
3. **智能识别**：仅对输出类操作添加标注，不对读取/查询类操作添加

## 实践洞察

### 核心判断原则

**是否需要标注 = 该指令是否要求 LLM 生成内容**

不要死记硬背关键词，而是理解指令的**意图**：

| 需要标注（LLM生成内容） | 不需要标注（参考/描述/占位） |
|------------------------|---------------------------|
| `Create DISCOVERY.md` | `See /templates/xxx.md` |
| `Write to: file.md` | `Use template: /templates/xxx.md` |
| `Output: Report content` | `Output: [What artifacts will be created]` ← 占位符 |
| `Produces DISCOVERY.md`（在 `<output>` 标签中） | `Produces 2-4 commits` ← 描述性 |

### 上下文决定语义

同一个词在不同上下文中含义不同：

```markdown
<!-- 在 <output> 标签中 = LLM指令，需要标注 -->
<output>
After completion, create SUMMARY.md
</output>

<!-- 在正文中 = 描述性说明，不需要标注 -->
This workflow produces DISCOVERY.md for Level 2-3.

<!-- 方括号 = 人类占位符，不需要标注 -->
Output: [What artifacts will be created]
```

### 常见陷阱

**陷阱1：过度标注**
```markdown
❌ See /templates/summary.md（要求：使用中文）  ← 错误！只是引用路径
✅ See /templates/summary.md
```

**陷阱2：遗漏标注**
```markdown
❌ After completion, create SUMMARY.md  ← 错误！LLM需要执行
✅ After completion, create SUMMARY.md（要求：使用中文）
```

**陷阱3：混淆 `Output:` 的语义**
```markdown
❌ Output: [What artifacts will be created]（要求：使用中文）  ← 错误！这是占位符
✅ Output: [What artifacts will be created]

❌ Output: DISCOVERY.md with recommendation  ← 错误！需要标注
✅ Output: DISCOVERY.md with recommendation（要求：使用中文）
```

### 快速检查清单

标注前问自己：

1. **谁在执行？** LLM 执行 → 标注；人类执行/参考 → 不标注
2. **什么内容？** 生成新内容 → 标注；引用已有内容 → 不标注
3. **方括号？** `[占位符]` → 不标注（留给人类填写）
4. **XML标签？** `<output>`、`<step>` 中的指令 → 通常需要标注
