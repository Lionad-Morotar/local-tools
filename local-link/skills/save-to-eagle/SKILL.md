---
name: save-to-eagle
description: "归档网络内容到 Eagle 素材库。支持：(1) Behance/Pixiv 图片归档，(2) 网页视频录制（页面动画、滚动录制）。使用方式：'归档 [URL]' 归档图片；'录制网页视频 [URL]' 录制页面动画；'滚动录制 [URL]' 自动滚动截图。支持评分如 '归档 [URL], 3/5'。"
argument-hint: <URL> [, <rating>]
disable-model-invocation: true
---

# Save to Eagle

将网络内容归档到本地 Eagle 素材库。支持图片归档和网页屏幕录制。

## 功能概览

| 功能 | 触发方式 | 输出 |
|------|---------|------|
| **图片归档** | "归档 [URL]" | 下载原图到 Eagle |
| **视频录制** | "录制网页视频 [URL]" | WebM 视频文件 |
| **滚动截图** | "滚动录制 [URL]" | 多页 PNG 截图 |

## 使用方式

### 图片归档
- "归档 https://www.pixiv.net/artworks/141273594"
- "归档 https://www.pixiv.net/artworks/141273594, 3/5" (带评分)
- "保存这个 Behance 项目"

### 屏幕录制
- "录制网页视频 https://boardmix.cn" - 录制页面动画
- "滚动录制 https://example.com" - 自动滚动截图

**录制参数：**
- 默认视口: 1440x900
- 默认时长: 10 秒
- 输出格式: WebM (可用 ffmpeg 转 MP4/GIF)

详细录制指南见 [references/screen-recording.md](references/screen-recording.md)

## 参数解析（Claude 层处理）

当用户提供类似 `"归档 URL, 3/5"` 的输入时，Claude 应解析出 URL 和评分：

```python
import re

def parse_archive_args(user_input: str) -> tuple[str, int]:
    """
    解析归档参数

    Returns:
        (url, star)
    """
    # 匹配评分模式: ", 3/5" 或 ", 5"
    star_match = re.search(r',\s*(\d)(?:/\d)?\s*$', user_input)

    if star_match:
        star = int(star_match.group(1))
        star = max(0, min(5, star))  # 限制在 0-5
        url = user_input[:star_match.start()].strip()
    else:
        url = user_input.strip()
        star = 0

    return url, star

# 使用示例
url, star = parse_archive_args("https://www.pixiv.net/artworks/141349217, 3/5")
# url = "https://www.pixiv.net/artworks/141349217"
# star = 3
```

## 执行脚本

### 单条归档

解析参数后，通过命令行调用脚本：

```bash
python scripts/main.py "<URL>" --star <N>
```

示例：
```bash
python scripts/main.py "https://www.pixiv.net/artworks/141349217" --star 3
```

### 批量归档（URL 数量 > 6）

**当需要归档的图片超过 6 张时，自动启用批量脚本**以避免触发反爬虫机制。

**批量模式特点：**
- 自动速率限制：每作品间隔 4-8 秒随机延迟
- 自动错误隔离：单个失败不影响整体
- 支持 Pixiv 和 Behance 混合 URL

**使用方式：**

1. **创建 URL 列表文件**（JSON 格式）：
```bash
cd ~/.claude/skills/save-to-eagle
python scripts/batch_archive.py --template
# 编辑生成的 batch_template.json
```

JSON 格式示例：
```json
[
  {"url": "https://www.pixiv.net/artworks/142542530", "star": 4},
  {"url": "https://www.pixiv.net/artworks/142565679", "star": 5},
  {"url": "https://www.behance.net/gallery/123456", "star": 3}
]
```

2. **执行批量归档**：
```bash
# 通过 main.py 调用（推荐）
python scripts/main.py --batch urls.json

# 或直接调用 batch_archive.py
python scripts/batch_archive.py --input urls.json

# 调整延迟参数（如需更快/更慢）
python scripts/main.py --batch urls.json --delay-min 3 --delay-max 6
```

3. **命令行直接传入**（少量 URL）：
```bash
python scripts/batch_archive.py \
  --urls "url1" "url2" "url3" \
  --stars 4 5 3
```

## Pixiv 归档流程

### 1. 单图作品
- 直接放入 `Pixiv` 文件夹
- 文件名：作品标题
- 注释：作者信息

### 2. 多图作品
- 创建子文件夹：`Pixiv > {作者} - {标题}`
- 图片命名：`p1.jpg`, `p2.jpg`...
- 自动设置封面：`p1` 自动设为文件夹封面（通过 `coverId` 字段）
- 注释：作者信息

**文件夹封面数据结构：**
```json
{
  "id": "A7wr2MJeCl0tA",
  "name": "たぬま - 絵",
  "description": "作者: たぬま",
  "coverId": "KwSneSgHhvnQI",
  "children": [],
  "modificationTime": 1772033456059,
  "tags": [],
  "password": "",
  "passwordTips": ""
}
```

- `coverId`: 指向文件夹内某个资源的 ID，Eagle 用此资源作为文件夹缩略图显示

### 3. 认证方式
Pixiv 需要 cookies 文件：
- 路径：`{Eagle库}/.secrets/pixiv_cookies.json`
- 格式：Chrome/Firefox 导出的 cookies JSON 数组

## Behance 归档流程

### 1. 提取项目信息
使用 Playwright 访问页面，提取：
- 项目标题
- Creative Field（分类）
- 作者名
- 所有项目图片

```javascript
// 提取脚本
() => {
  const images = [];
  document.querySelectorAll('img').forEach((img) => {
    if (img.src && img.src.includes('mir-s3-cdn')) {
      images.push({
        src: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height
      });
    }
  });

  const mainImages = images.filter(img =>
    img.src.includes('project_modules') &&
    !img.src.includes('/projects/404/')
  );

  return {
    title: document.querySelector('h1')?.textContent?.trim() || '',
    creativeField: document.querySelector('a[href*="field="]')?.textContent?.trim() || '',
    author: document.querySelector('[data-testid="profile-name"]')?.textContent?.trim() || '',
    images: mainImages
  };
}
```

### 2. 分类映射

| Creative Field | Eagle 文件夹 |
|---------------|-------------|
| Illustration | 插图 |
| Graphic Design | 图形设计 |
| Photography | 摄影 |
| UI/UX | UI/UX |
| Motion Graphics | 动画 |
| Typography | 字体设计 |
| 3D Art | 3D Art |
| Architecture | 建筑 |
| Fashion | 时尚 |
| Advertising | 广告 |
| Fine Arts | 美术 |
| Crafts | 手工艺 |
| Game Design | 游戏设计 |

### 3. 创建子文件夹
每个项目都会在其分类下创建独立的子文件夹。

## 元数据结构

所有归档的图片都包含完整的 Eagle 元数据：

```json
{
  "id": "Kxxxxxxxxxxxx",
  "name": "图片名称",
  "size": 2260783,
  "width": 1333,
  "height": 2000,
  "orientation": 1,
  "folders": ["文件夹ID"],
  "url": "原始链接",
  "annotation": "作者: xxx",
  "tags": [],
  "isDeleted": false,
  "star": 3
}
```

- `star`: 评分（1-5星，0表示无评分）
- `coverId`: 文件夹封面资源 ID（多图作品自动设置 p1 为封面）

## 脚本位置

```
~/.claude/skills/save-to-eagle/scripts/
├── main.py              # 入口，URL 路由（支持单条/批量模式）
├── batch_archive.py     # 批量归档（带反爬虫速率限制）
├── pixiv.py             # Pixiv 归档逻辑（支持多图封面设置）
├── behance.py           # Behance 归档逻辑
├── eagle_utils.py       # 共用工具函数
│   ├── create_eagle_asset()    # 创建资源
│   ├── create_subfolder()      # 创建子文件夹
│   ├── set_folder_cover()      # 设置文件夹封面
│   ├── rebuild_mtime_index()   # 重建索引
│   ├── clean_mtime_json()      # 清理异常键
│   ├── verify_asset_integrity() # 验证资源完整性
│   └── repair_library()        # 修复素材库
└── record_webpage.py    # 网页屏幕录制
```

**日志归档位置：**
```
~/.claude/skills/save-to-eagle/logs/
├── batch_pixiv_YYYYMMDD_HHMMSS.log
└── ...
```

**录制脚本用法：**
```bash
# 录制页面动画（10秒）
python scripts/record_webpage.py "https://boardmix.cn" --duration 10

# 滚动截图
python scripts/record_webpage.py "https://example.com" --scroll
```

## 维护工具

当 Eagle 出现启动缓慢、重建索引、资源不显示等问题时，使用维护工具：

```python
from eagle_utils import repair_library, clean_mtime_json, verify_asset_integrity

# 一键修复素材库常见问题
repair_library()

# 单独清理 mtime.json 异常键
clean_mtime_json()

# 验证单个资源
result = verify_asset_integrity('Kxxxxxxxxxxxx')
print(result['valid'])  # True/False
print(result['errors'])  # 错误列表
```

### 常见问题修复

**Eagle 启动时重建索引（耗时很长）：**
```python
from eagle_utils import clean_mtime_json, rebuild_mtime_index

# 清理异常键（通常有数千个）
clean_mtime_json()

# 重建索引
rebuild_mtime_index()
```

**文件夹只显示部分资源：**
- 通常是 mtime.json 被污染导致
- 使用 `repair_library()` 一键修复

## 错误处理

- 所有错误直接抛出给用户
- 不自动重试失败的下载
- 不自动处理认证问题
- 新增资源时自动验证 ID 格式（13字符 K 开头）
