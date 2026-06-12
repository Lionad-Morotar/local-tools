---
name: prompt-to-image
description: 从上下文提取提示词，为用户生成并打开图片。
argument-hint: "[--model <gpt-image-2-all|gpt-image-2|gemini-3-pro-image-preview>]"
---

**Flags:**
- `--model` — 指定生成图片的模型。可选值：`gpt-image-2-all`（默认优先路径）、`gpt-image-2`、`gemini-3-pro-image-preview`。省略时默认使用 `gpt-image-2-all`。

## 优先路径

经过实际验证的调用路径如下：

| 场景 | 推荐模型 | API 端点 | 原因 |
|---|---|---|---|
| 默认/用户未指定 | `gpt-image-2-all` | `/v1/images/generations` (dall-e-3 格式) | 已通过验证，约 50 秒返回，稳定性优于直接走 `image-generation` 端点的 `gpt-image-2` |
| 用户明确要求 `gpt-image-2` | `gpt-image-2-all` | `/v1/images/generations` (dall-e-3 格式) | 同模型家族兼容替代，`gpt-image-2` 直接调用反复出现 60 秒连接被关闭 |
| 用户明确要求 Gemini | `gemini-3-pro-image-preview` | `/v1beta/models/{model}:generateContent` | 按 Gemini 原生格式调用 |

**重要约束**：除非得到用户明确确认，不得擅自切换到其他异构模型（如 `qwen-image-max`、`doubao-seedream`、`flux` 等）。优先在同一模型家族内寻找兼容替代（如 `gpt-image-2` → `gpt-image-2-all`）。可用模型清单见 [References](./references/2026-06-11-grsapi-models.json)。

## 工作流程

### 1. 提取变量

按照以下优先级自动提取提示词：

**提示词来源（二选一，优先级从高到低）：**
1. 从用户当前输入截取（而不是重写）
2. 对话上下文 - 查找之前生成对话已有提示词（按以下格式优先级）

**提示词格式（三选一，优先级从高到低）：**
1. 中文优化版 - 夹杂英文术语的版本（如：抽象表现主义(Abstract Expressionism)）
2. 英文版 - 纯英文结构化提示词
3. 纯中文版 - 纯中文描述

**提取策略：**
- 检查用户输入是否包含视觉描述关键词（主体、风格、色彩、构图等）
- 若当前输入无有效提示词，回溯对话历史查找最近生成的完整提示词

### 2. 预处理提示词

**🚨 绝对禁止**: **提示词禁止转写和简化！**
- 用户提供的提示词必须**原样使用**，不得添加任何前置描述（如"这是一张...的图片"）
- 不得将结构化 JSON 简化或提取关键元素，必须完整保留原始内容
- 不得使用 "Generate an image of..." 等模板包裹用户提示词
- 唯一允许的操作是**转义特殊字符**以适应 JSON 格式要求

必须处理：提取的提示词可能包含换行符、引号等特殊字符，直接嵌入 JSON 会导致解析错误（如 `invalid character '\n' in string literal`）。

转义方式：
```bash
# 将提示词中的换行符替换为空格，双引号转义
# 注意：这只是格式转义，提示词内容必须保持原样！
processed_prompt=$(echo "$raw_prompt" | tr '\n' ' ' | sed 's/"/\\"/g')
```

转义规则示例：
| 字符 | 处理方式 | 原因 |
|------|----------|------|
| 换行符 `\n` | 替换为空格 | JSON string 中不允许未转义的换行 |
| 双引号 `"` | 转义为 `\"` | 避免提前结束 JSON string |
| 反斜杠 `\` | 转义为 `\\` | 避免转义序列被错误解析 |

### 3. 解析模型参数

**模型检测**：根据用户输入中的关键词确定模型和 API 调用方式。默认优先走 `gpt-image-2-all` 的 dall-e-3 端点。

| 关键词 | 模型名称 | API 类型 | 端点 |
|--------|----------|----------|------|
| (默认，无关键词) | `gpt-image-2-all` | GPT Image (dall-e-3 格式) | `/v1/images/generations` |
| `gpt-image-2` | `gpt-image-2-all` | GPT Image (dall-e-3 格式) | `/v1/images/generations` |
| `gemini`, `gemini-3-pro`, `gemini-3` | `gemini-3-pro-image-preview` | Gemini | `/v1beta/models/{model}:generateContent` |

**使用示例**：
- `/prompt-to-image` → 默认使用 `gpt-image-2-all`
- `/prompt-to-image 用 gpt-image-2 生成` → 实际使用 `gpt-image-2-all`（同家族兼容）
- `/prompt-to-image 用 gemini-3-pro 生成` → 使用 `gemini-3-pro-image-preview`

- 用户也可指定其他 Gemini 系列模型："用 gemini-2.0-flash-exp 生成图片"，但 **必须先经用户确认**，不得擅自切换。

### 4. 读取 API 密钥并调用 API（必须在同一脚本中）

**关键**: 读取密钥和调用 API 必须在**同一个 shell 脚本/代码块**中执行，否则 API 调用会找不到 `$API_KEY` 环境变量。

完整流程代码：

```bash
#!/bin/bash
# ============================================
# 步骤 1: 预处理提示词（已在上一步完成）
# ============================================
# 假设 $processed_prompt 已包含转义后的提示词

# ============================================
# 步骤 2: 在同一脚本中加载密钥并调用 API
# ============================================

# 安全地展开 ~ 路径（兼容所有 shell）
CONFIG_FILE="${HOME}/.config/prompt-to-image/.env"

# 检查文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    echo "请创建配置文件并设置 API_KEY"
    exit 1
fi

# 使用 source 加载环境变量（比 export + xargs 更可靠）
set -a
source "$CONFIG_FILE"
set +a

# 验证 API_KEY 是否加载成功
if [ -z "$API_KEY" ]; then
    echo "❌ API_KEY 未设置或为空"
    exit 1
fi

echo "✅ API 密钥已加载"

# ============================================
# 步骤 3: 根据模型选择 API 端点并调用（确保在同一脚本上下文中）
# ============================================

# MODEL_NAME 由步骤 3 确定，默认 "gpt-image-2"
DATE_DIR=$(date +%Y-%m-%d)
TIME_STAMP=$(date +%H-%M-%S.%3N)
OUTPUT_DIR="${HOME}/.prompt-to-image/${DATE_DIR}/grsapi.xyz/${MODEL_NAME}"
mkdir -p "$OUTPUT_DIR"

RESPONSE_FILE="${OUTPUT_DIR}/${TIME_STAMP}.json"

echo "🎨 正在调用 API 生成图片 (模型: ${MODEL_NAME})..."

if [[ "$MODEL_NAME" == "gemini-3-pro-image-preview" ]]; then
  # Gemini API
  curl -s --location --request POST \
    "https://grsapi.xyz/v1beta/models/${MODEL_NAME}:generateContent" \
    --header 'Content-Type: application/json' \
    --header "Authorization: Bearer $API_KEY" \
    --data-raw "{
      \"contents\": [{
        \"role\": \"user\",
        \"parts\": [{\"text\": \"$processed_prompt\"}]
      }],
      \"generationConfig\": {
        \"responseModalities\": [\"TEXT\", \"IMAGE\"]
      }
    }" > "$RESPONSE_FILE"
else
  # GPT Image API (默认，使用 gpt-image-2-all 走 dall-e-3 端点)
  curl -s --location --request POST \
    "https://grsapi.xyz/v1/images/generations" \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer $API_KEY" \
    --header 'Content-Type: application/json' \
    --data-raw "{
      \"size\": \"1792x1024\",
      \"prompt\": \"$processed_prompt\",
      \"model\": \"gpt-image-2-all\",
      \"n\": 1
    }" > "$RESPONSE_FILE"
fi

echo "✅ API 调用完成，响应保存至: $RESPONSE_FILE"
```

配置文件格式 (`~/.config/prompt-to-image/.env`):
```
API_KEY=sk-your-api-key-here
```

⚠️ 路径安全提示:
- 推荐: 使用 `"${HOME}/path"` 替代 `"~/path"`，确保在所有上下文（脚本、函数、引号内）都能正确展开
- 避免: 直接使用 `~`，因为在双引号内或某些 shell 函数中可能无法正确展开
- 备用: 如果必须使用 `~`，确保进行显式展开：`"${path/#\~/$HOME}"`

⚠️ 密钥加载提示:
- 使用 `set -a; source "$CONFIG_FILE"; set +a` 方式加载，比 `export $(grep ... | xargs)` 更可靠
- `set -a` 会自动导出所有变量，避免 `xargs` 处理特殊字符的问题
- 关键: 必须在加载密钥后立即调用 API，确保 `$API_KEY` 在同一 shell 上下文中可用

重要:
- 使用 `-s` (silent) 参数确保输出纯净 JSON，不包含 curl 进度信息
- 仅调用一次 API，无论返回何种错误（配额耗尽、渠道不可用、模型不存在等），都不尝试其他模型或重试
- 禁止转写提示词: 使用用户提供的原始提示词，不得简化或改写

### 5. 保存响应并验证

创建目录结构并保存完整响应:

```
${HOME}/.prompt-to-image/
  └── <YYYY-MM-DD>/
      └── grsapi.xyz/
          └── <model-name>/
              ├── <hh:mm:ss.sss>.json  (完整 API 响应)
              └── image_xxx.jpg        (提取的图片)
```

时间戳格式:
- 日期: `2026-02-24`
- 时间: `15-30-45.123` (小时-分钟-秒.毫秒)

路径安全: 在脚本中使用 `${HOME}` 而非 `~`，确保路径在所有上下文中正确解析

保存后必须验证 JSON 有效性:
```bash
python3 -c "import json; json.load(open('<response>.json'))" && echo "JSON valid"
```

如果验证失败，说明响应可能损坏，应检查文件内容而非直接重新调用 API。

### 6. 提取图片

使用 `scripts/extract_images.py` 从响应中提取图片。脚本自动检测响应格式（Gemini inlineData 或 GPT Image URL/base64）：

```bash
python3 scripts/extract_images.py <response.json> <output_dir>
```

### 7. 等待文件同步完成（关键步骤）

问题背景: 文件写入和打开之间存在时间差，可能导致图片查看器加载失败。这在以下场景尤为明显：
- 云同步目录（OneDrive、iCloud、Google Drive）
- 网络文件系统
- 高 I/O 负载环境

泛化解决方案 - 使用 `wait_for_file.sh` 脚本：

```bash
# 定义安全的输出目录路径（使用 ${HOME} 而非 ~）
OUTPUT_DIR="${HOME}/.prompt-to-image/$(date +%Y-%m-%d)/grsapi.xyz/${MODEL_NAME}"
mkdir -p "$OUTPUT_DIR"

# 提取图片后，等待文件完全就绪
python3 scripts/extract_images.py "$JSON_FILE" "$OUTPUT_DIR"

# 获取最新生成的图片路径
IMAGE_FILE=$(ls -t "$OUTPUT_DIR"/image_*.jpg "$OUTPUT_DIR"/image_*.png 2>/dev/null | head -1)

# 等待文件写入完成（检测文件大小稳定 + 系统同步）
# wait_for_file.sh 会自动处理路径中的 ~ 字符
scripts/wait_for_file.sh "$IMAGE_FILE" 10  # 10秒超时
```

检测机制（跨平台泛化）：
1. 文件存在检测 - 等待文件出现在文件系统
2. 大小稳定性检测 - 连续两次检查文件大小不变（确保写入完成）
3. 系统同步 - 执行 `sync` 命令刷新文件系统缓存
4. 超时保护 - 默认10秒超时，防止无限等待

备选方案（如果 wait_for_file.sh 不可用）：
```bash
# 简单延迟方案（不够精确但通用）
sleep 0.5
sync  # 强制刷新文件系统缓存
```

### 8. 自动打开图片

文件同步完成后，使用以下命令打开：

```bash
# 优先检查并使用 code
if command -v code &> /dev/null; then
    code <图片路径>
else
    open <图片所在目录>
fi
```

### 9. 返回结果

向用户返回 Markdown 格式的图片链接，并确认已自动打开:

```markdown
![image name](${HOME}/.prompt-to-image/2026-02-24/grsapi.xyz/gemini-3-pro-image-preview/image_15-30-45.jpg)

✅ 图片已自动打开
```

注意: Markdown 中 `${HOME}` 不会自动展开，实际使用时应替换为完整路径或使用 shell 展开后的值

## 错误处理

- 配置文件不存在: 提示用户创建 `${HOME}/.config/prompt-to-image/.env` 文件并设置 API_KEY
- 路径展开失败: 确保使用 `${HOME}` 而非 `~`，特别是在双引号内的字符串中
- 未找到提示词: 提示用户请提供图片描述或先使用 image-to-prompt 生成提示词
- API 调用失败: 立即停止，报告错误信息给用户，不尝试其他模型或重试
- 提示词预处理错误: 如果提示词包含无法处理的特殊字符，报告错误
- JSON 验证失败: 报告错误，不尝试修复或重新调用 API
- 响应无图片: 提示用户响应中未包含图片
- 文件写入失败: 检查目录权限，报告错误
- GPT URL 下载失败: 检查网络连接或 URL 有效性，报告下载失败详情
- 无法打开图片: 报告图片路径，用户可手动打开

## 优化原则

1. 提示词禁止转写: 用户提供的提示词必须原样使用，禁止简化、禁止改写、禁止用模板包裹（如"Generate an image of..."），仅允许进行 JSON 字符转义
2. 密钥与 API 调用同上下文: 加载 API 密钥和调用 API 必须在同一个 shell 脚本/代码块中执行，确保 `$API_KEY` 环境变量在 API 调用时可用
3. 尽早失败: API 请求失败时（包括配额耗尽、渠道不可用等），立即停止并报告错误，不尝试备用模型或重试
4. **模型选择需经用户确认**: 默认使用 `gpt-image-2-all`。若用户指定 `gpt-image-2`，可在同家族内 fallback 到 `gpt-image-2-all`。严禁因"某个模型可能更好"而擅自切换到 `qwen-image-max`、`doubao-seedream`、`flux`、`grok` 等异构模型；任何跨家族切换必须先得到用户明确确认
5. 预处理优先: 在调用 API 前必须对提示词进行预处理，避免 JSON 解析错误
6. 使用 `-s` 静默模式: curl 必须加 `-s` 参数，确保输出纯净 JSON
7. 验证后再处理: 保存响应后立即验证 JSON 有效性
8. 文件同步等待: 打开图片前必须确保文件完全写入磁盘，避免加载失败
9. 路径安全: 在脚本中始终使用 `${HOME}` 替代 `~`，确保路径在所有 shell 上下文中正确展开

## 资源

### scripts/extract_images.py

从 API 响应中提取图片并保存为文件。支持 Gemini 和 GPT Image 两种响应格式，自动检测并处理。

用法:
```bash
python3 scripts/extract_images.py <response.json> <output_dir>
```

功能:
- Gemini 格式: 解析 `candidates[].content.parts[].inlineData` 中的 base64 数据
- GPT Image 格式: 解析 `data[].url`（下载图片）或 `data[].b64_json`（解码 base64）
- 根据 MIME 类型或 URL 扩展名保存为 `.jpg`、`.png` 等文件
- 自动处理重名文件
- 自动调用 `os.fsync()` 确保数据刷写到磁盘

### scripts/wait_for_file.sh

泛化的文件写入完成检测脚本，解决文件写入与读取之间的时间差问题。

用法:
```bash
scripts/wait_for_file.sh <文件路径> [超时秒数]
```

检测机制（跨平台泛化）：
1. 文件存在检测 - 等待文件出现在文件系统
2. 大小稳定性检测 - 连续两次检查文件大小不变
3. 系统同步 - 执行 `sync` 命令刷新文件系统缓存
4. 超时保护 - 默认10秒超时

适用场景:
- 云同步目录（OneDrive、iCloud、Google Drive）
- 网络文件系统（NFS、SMB）
- 高 I/O 负载环境
- 任何需要确保文件完全写入的场景

路径展开:
该脚本会自动处理路径中的 `~` 字符，将其展开为 `${HOME}`:
```bash
# 脚本内部实现
FILE_PATH="${FILE_PATH/#\~/$HOME}"
```
因此你可以安全地传入包含 `~` 的路径，或直接使用 `${HOME}`。

返回值:
- `0` - 文件就绪
- `1` - 超时或错误

## References

### 图像模型索引

- **`references/2026-06-11-grsapi-image-models.md`** — grsapi.xyz 图像生成模型速查表，包含 46 个图像模型的 ID、支持端点、标签和描述。
- **`references/2026-06-11-grsapi-models.json`** — `/v1/models` 完整原始响应（493 个模型）。

> **使用约束**：References 仅用于查询和用户确认后的模型选择。未经用户明确同意，不得擅自切换模型。默认优先路径始终是 `gpt-image-2-all`。
