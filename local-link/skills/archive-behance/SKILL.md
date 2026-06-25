---
name: archive-behance
description: "Archive Behance projects to Eagle DAM (Digital Asset Management) library. Use when user wants to archive or save a Behance project URL to their Eagle collection with proper metadata. Triggers include requests like '归档 https://www.behance.net/gallery/...', '保存 Behance 项目', 'archive behance project', or any request to download or save Behance gallery content to local Eagle library."
argument-hint: <Behance project URL>
disable-model-invocation: true
---

# Archive Behance

Archive Behance projects to Eagle DAM library with proper folder structure and metadata.

## Workflow

When user requests to archive a Behance URL:

1. **Extract project info** from the Behance page:
   - Project title
   - Creative field/category (e.g., "Illustration", "Graphic Design")
   - All project images (from `mir-s3-cdn` domain)
   - Tags

2. **Determine target folder** in Eagle library:
   - Base path: `Collections > Behance`
   - Subfolder based on creative field:
     - "Illustration" → `插画`
     - "Graphic Design" → `平面设计`
     - "Photography" → `摄影`
     - "UI/UX" → `UI/UX`
     - "Motion Graphics" → `动效`
     - "Typography" → `字体设计`
     - Others → ask user or use `未分类`

3. **Create project folder** with sanitized name (slug from URL or project title)

4. **Download images** and create Eagle metadata:
   - Use original image URL from `mir-s3-cdn-cf.behance.net`
   - Name: use image alt text or generate sequential name
   - URL: image source URL (permanent link)
   - Tags: optional, can be empty

5. **Provide summary** to user with download statistics

## Browser Access

Use **Playwright MCP** (`mcp__plugin_playwright_playwright__browser_navigate`) to access Behance pages.

**Never** write Python/shell scripts that call Playwright directly.

## Extracting Project Data

Use JavaScript evaluation to extract:

```javascript
// Get project info and images
() => {
  const images = [];
  document.querySelectorAll('img').forEach((img, i) => {
    if (img.src && img.src.includes('mir-s3-cdn')) {
      images.push({
        src: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height
      });
    }
  });

  // Filter to main project images only (exclude thumbnails and avatars)
  const mainImages = images.filter(img =>
    img.src.includes('project_modules') &&
    !img.src.includes('/projects/404/')
  );

  return {
    title: document.querySelector('h1')?.textContent?.trim() || '',
    creativeField: document.querySelector('a[href*="field="]')?.textContent?.trim() || '',
    tags: Array.from(document.querySelectorAll('a[href*="tracking_source=project_tag"]'))
      .map(t => t.textContent.trim()),
    images: mainImages
  };
}
```

## Finding Target Folder in metadata.json

**Important**: `metadata.json` can be very large (100k+ tokens). **Never** read the entire file into memory.

### Method 1: Using grep (Recommended)

Use `grep` to extract just the folder ID without loading the entire file:

```python
import subprocess
import json
from pathlib import Path

def find_folder_id_by_name(library_root: Path, folder_name: str) -> str:
    """
    Find folder ID by name using grep (memory efficient).
    Returns folder ID or None if not found.
    """
    metadata_path = library_root / "metadata.json"

    # Use grep to find the line with the folder name
    result = subprocess.run(
        ['grep', '-B', '5', f'"name": "{folder_name}"', str(metadata_path)],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        return None

    # Parse the output to find ID
    for line in result.stdout.split('\n'):
        if '"id":' in line:
            # Extract ID from "id": "ABC123"
            import re
            match = re.search(r'"id":\s*"([^"]+)"', line)
            if match:
                return match.group(1)

    return None

# Usage: Find "图形设计" folder ID
folder_id = find_folder_id_by_name(Path("."), "图形设计")
```

### Method 2: Using ijson (Streaming Parser)

For complex searches through nested structures, use `ijson` to stream-parse:

```python
import ijson
from pathlib import Path

def find_behance_folder(library_root: Path, creative_field: str) -> str:
    """
    Find Behance subfolder ID using streaming JSON parser.
    Memory efficient for large metadata files.
    """
    metadata_path = library_root / "metadata.json"

    field_map = {
        "Illustration": "插图",
        "Graphic Design": "图形设计",
        "Photography": "摄影",
        "UI/UX": "UI/UX",
        "Motion Graphics": "动画",
        "Typography": "字体设计",
        "Branding": "图形设计",
        "3D Art": "3D Art",
        "Architecture": "建筑",
        "Fashion": "时尚",
        "Advertising": "广告",
        "Fine Arts": "美术",
        "Crafts": "手工艺",
        "Game Design": "游戏设计",
    }

    target_name = field_map.get(creative_field, "未分类")

    with open(metadata_path, 'rb') as f:
        # Stream through folders
        for folder in ijson.items(f, 'folders.item'):
            if folder.get('name') == 'Collections':
                for child in folder.get('children', []):
                    if child.get('name') == 'Behance':
                        for subfolder in child.get('children', []):
                            if subfolder.get('name') == target_name:
                                return subfolder['id']

    return None
```

### Method 3: Cached Folder IDs

For repeated operations, cache the folder IDs:

```python
# Cache of known Behance folder IDs (update as needed)
BEHANCE_FOLDER_IDS = {
    "插图": "7UAPMLRGTWT",
    "图形设计": "UWFE6X4QRC4",
    "摄影": "36QLX1XSJCC",
    "UI/UX": "LKC0V82UMSW",
    "动画": "25BUAQGOJFH",
    "3D Art": "6GIONKGOYTW",
    "建筑": "CQPDELSDAAY",
    "产品设计": "6FODRRZQTFO",
    "时尚": "SWHR57VFNM0",
    "广告": "JC3ZLIHEUSG",
    "美术": "KP2UWOJ4WDN",
    "手工艺": "PMQ8B3ODHKY",
    "游戏设计": "0JAUXK03C29",
    "声音": "ZS4GICO0BY8",
}

def get_behance_folder_id(creative_field: str) -> str:
    """Get folder ID from cache or use fallback."""
    field_map = {
        "Illustration": "插图",
        "Graphic Design": "图形设计",
        "Photography": "摄影",
        "UI/UX": "UI/UX",
        "Motion Graphics": "动画",
        "Typography": "字体设计",
        "Branding": "图形设计",
        "3D Art": "3D Art",
        "Architecture": "建筑",
        "Fashion": "时尚",
        "Advertising": "广告",
        "Fine Arts": "美术",
        "Crafts": "手工艺",
        "Game Design": "游戏设计",
        "Label Design": "图形设计",
    }

    target_name = field_map.get(creative_field)
    if target_name:
        return BEHANCE_FOLDER_IDS.get(target_name)

    return None
```

### Field to Folder Mapping

| Behance Creative Field | Eagle Folder Name | Cached ID |
|------------------------|-------------------|-----------|
| Illustration | 插图 | 7UAPMLRGTWT |
| Graphic Design | 图形设计 | UWFE6X4QRC4 |
| Branding | 图形设计 | UWFE6X4QRC4 |
| Label Design | 图形设计 | UWFE6X4QRC4 |
| Photography | 摄影 | 36QLX1XSJCC |
| UI/UX | UI/UX | LKC0V82UMSW |
| Motion Graphics | 动画 | 25BUAQGOJFH |
| Typography | 字体设计 | (varies) |
| 3D Art | 3D Art | 6GIONKGOYTW |
| Architecture | 建筑 | CQPDELSDAAY |
| Fashion | 时尚 | SWHR57VFNM0 |
| Advertising | 广告 | JC3ZLIHEUSG |
| Fine Arts | 美术 | KP2UWOJ4WDN |
| Crafts | 手工艺 | PMQ8B3ODHKY |
| Game Design | 游戏设计 | 0JAUXK03C29 |

## Downloading Images

Use Python `requests` to download images with proper headers:

```python
import requests
from pathlib import Path
import time

def download_image(url: str, dest_path: Path, max_retries: int = 3) -> int:
    """
    Download image from Behance CDN.
    Returns file size in bytes.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.behance.net/"
    }

    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=60)
            response.raise_for_status()
            dest_path.write_bytes(response.content)
            return len(response.content)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(1)  # Wait before retry
```

### Handling SSL Errors

If you encounter `SSLEOFError` during batch downloads:
- Implement retry logic with exponential backoff
- Reduce concurrent connections
- Use smaller batch sizes

## Image URL Patterns

Behance images follow these patterns:
- Source: `https://mir-s3-cdn-cf.behance.net/project_modules/{size}/{hash}.{ext}`
- Size variants: `max_632`, `1400`, `1400_webp`, `original`
- For archiving: use the largest available (`1400` or `original`)

To get original size, replace size in URL:
```
/max_632_webp/ → /original/
/1400_webp/ → /original/
```

## Folder Mapping

| Behance Creative Field | Eagle Folder Name | Folder ID Example |
|------------------------|-------------------|-------------------|
| Illustration | 插图 | 7UAPMLRGTWT |
| Graphic Design | 图形设计 | UWFE6X4QRC4 |
| Photography | 摄影 | 36QLX1XSJCC |
| UI/UX | UI/UX | LKC0V82UMSW |
| Motion Graphics | 动画 | 25BUAQGOJFH |
| Typography | 字体设计 | (varies) |
| 3D Art | 3D Art | 6GIONKGOYTW |
| Architecture | 建筑 | CQPDELSDAAY |
| Fashion | 时尚 | SWHR57VFNM0 |
| Advertising | 广告 | JC3ZLIHEUSG |
| Fine Arts | 美术 | KP2UWOJ4WDN |
| Crafts | 手工艺 | PMQ8B3ODHKY |
| Game Design | 游戏设计 | 0JAUXK03C29 |
| (unknown) | 未分类 | ask user |

## Creating Eagle Metadata

Eagle stores metadata in `images/{ID}.info/metadata.json`:

```python
import json
import random
import string
from pathlib import Path
from datetime import datetime
from PIL import Image

def generate_eagle_id() -> str:
    """
    Generate correct Eagle ID format.
    - Asset ID: K + 12 chars = 13 chars total
    - Folder ID: 11-13 chars, can start with any character
    """
    chars = string.ascii_uppercase + string.ascii_lowercase + string.digits
    return 'K' + ''.join(random.choices(chars, k=12))

def create_thumbnail(img_path: Path, thumb_path: Path, size=(240, 240)):
    """Create thumbnail for Eagle display."""
    with Image.open(img_path) as img:
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        img.thumbnail(size, Image.Resampling.LANCZOS)
        background = Image.new('RGB', size, (255, 255, 255))
        offset = ((size[0] - img.width) // 2, (size[1] - img.height) // 2)
        background.paste(img, offset)
        background.save(thumb_path, 'PNG')

def get_exif_orientation(img) -> int:
    """Get EXIF orientation, default to 1 (normal)."""
    try:
        exif = img._getexif()
        if exif and 274 in exif:
            return exif[274]
    except:
        pass
    return 1

def create_eagle_asset(
    library_root: Path,
    image_url: str,
    name: str,
    folder_id: str,
    tags: list = None
) -> dict:
    """
    Create a complete Eagle asset with proper metadata.
    CRITICAL: Must include all required fields for Eagle to recognize.
    """
    # 1. Generate correct 13-char ID
    asset_id = generate_eagle_id()
    asset_dir = library_root / "images" / f"{asset_id}.info"
    asset_dir.mkdir(parents=True, exist_ok=True)

    # 2. Download image
    ext = image_url.split('.')[-1].split('?')[0]
    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'gif']:
        ext = 'jpg'

    # CRITICAL: Filename must match metadata "name" field!
    img_path = asset_dir / f"{name}.{ext}"
    download_image(image_url, img_path)

    # 3. Generate thumbnail (REQUIRED!)
    # Thumbnail name must match: {name}_thumbnail.png
    thumb_path = asset_dir / f"{name}_thumbnail.png"
    create_thumbnail(img_path, thumb_path)

    # 4. Get image info
    with Image.open(img_path) as img:
        width, height = img.size
        orientation = get_exif_orientation(img)

    stat = img_path.stat()
    now_ms = int(datetime.now().timestamp() * 1000)

    # 5. Create complete metadata with ALL required fields
    metadata = {
        "id": asset_id,                           # 13 chars, K + 12 alphanumeric
        "name": name,
        "size": stat.st_size,
        "btime": int(stat.st_birthtime * 1000),   # birth time in ms
        "mtime": int(stat.st_mtime * 1000),       # modification time in ms
        "ext": ext,
        "width": width,
        "height": height,
        "orientation": orientation,               # 1=normal, 6=90deg, etc.
        "modificationTime": now_ms,               # Eagle internal timestamp
        "lastModified": now_ms,                   # Last modified timestamp
        "folders": [folder_id],
        "tags": tags or [],
        "isDeleted": False,
        "url": image_url,
        "annotation": "",
        "palettes": []
    }

    # 6. Save metadata
    meta_path = asset_dir / "metadata.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))

    return metadata
```

## Rebuilding mtime.json Index

Eagle relies on `mtime.json` for fast resource loading. After adding resources, rebuild it:

```python
def rebuild_mtime_index(library_root: Path):
    """Rebuild mtime.json index after adding new resources."""
    mtime_data = {}

    for asset_dir in library_root.glob('images/K*.info'):
        meta_path = asset_dir / 'metadata.json'
        if meta_path.exists():
            asset_id = asset_dir.name.replace('.info', '')
            stat = meta_path.stat()
            mtime_data[asset_id] = int(stat.st_mtime * 1000)

    # Atomic write
    mtime_path = library_root / 'mtime.json'
    temp = mtime_path.with_suffix('.tmp')
    temp.write_text(json.dumps(mtime_data, ensure_ascii=False))
    temp.replace(mtime_path)

    print(f"Rebuilt index: {len(mtime_data)} assets")
```

## Verifying Asset Integrity

After creating resources, verify they are complete:

```python
def verify_asset_integrity(asset_dir: Path) -> dict:
    """
    Verify a single Eagle asset is complete and valid.
    Returns validation result with errors and warnings.
    """
    result = {'valid': True, 'errors': [], 'warnings': []}

    # Check metadata exists
    meta_path = asset_dir / 'metadata.json'
    if not meta_path.exists():
        result['valid'] = False
        result['errors'].append('Missing metadata.json')
        return result

    # Parse metadata
    try:
        meta = json.loads(meta_path.read_text())
    except json.JSONDecodeError:
        result['valid'] = False
        result['errors'].append('Invalid metadata.json format')
        return result

    # Validate required fields
    required = ['id', 'name', 'size', 'btime', 'mtime', 'ext',
                'width', 'height', 'orientation', 'modificationTime',
                'lastModified', 'folders', 'isDeleted']

    for field in required:
        if field not in meta:
            result['errors'].append(f'Missing field: {field}')

    # Validate ID format (CRITICAL!)
    asset_id = meta.get('id', '')
    if len(asset_id) != 13:
        result['errors'].append(f'ID length {len(asset_id)} != 13')
    if not asset_id.startswith('K'):
        result['warnings'].append('ID should start with K')

    # Validate image file
    ext = meta.get('ext', 'jpg')
    img_path = asset_dir / f'{asset_id}.{ext}'
    if not img_path.exists():
        result['errors'].append(f'Missing image: {img_path.name}')

    # Validate thumbnail (REQUIRED for Eagle to display)
    thumbs = list(asset_dir.glob('*_thumbnail.png'))
    if not thumbs:
        result['errors'].append('Missing thumbnail')

    result['valid'] = len(result['errors']) == 0
    return result

def verify_folder_assets(library_root: Path, folder_id: str) -> dict:
    """Verify all assets in a specific folder."""
    results = {'valid': 0, 'invalid': 0, 'details': []}

    for asset_dir in library_root.glob('images/K*.info'):
        meta_path = asset_dir / 'metadata.json'
        if not meta_path.exists():
            continue

        meta = json.loads(meta_path.read_text())
        if folder_id not in meta.get('folders', []):
            continue

        result = verify_asset_integrity(asset_dir)
        if result['valid']:
            results['valid'] += 1
        else:
            results['invalid'] += 1
            results['details'].append({
                'name': meta.get('name', 'unknown'),
                'errors': result['errors']
            })

    return results
```

## Complete Workflow Example

```python
def archive_behance_project(
    library_root: Path,
    project_url: str,
    project_title: str,
    creative_field: str,
    images: list
):
    """Complete workflow to archive a Behance project."""

    # 1. Find target folder
    folder_id = find_behance_folder(library_root, creative_field)
    if not folder_id:
        raise ValueError(f"Folder not found for: {creative_field}")

    # 2. Create project folder in metadata.json
    # CRITICAL: Must verify folder is actually saved before downloading!
    project_folder_id = create_project_folder(
        library_root, folder_id, project_title
    )

    # 3. Verify folder exists before downloading (DEFENSIVE!)
    # This catches cases where metadata.json wasn't properly saved
    verify_metadata = json.loads((library_root / "metadata.json").read_text())
    folder_exists = False
    for folder in verify_metadata.get("folders", []):
        if folder["name"] == "Collections":
            for child in folder.get("children", []):
                if child["name"] == "Behance":
                    for sub in child.get("children", []):
                        for proj in sub.get("children", []):
                            if proj["id"] == project_folder_id:
                                folder_exists = True
                                break

    if not folder_exists:
        raise RuntimeError(
            f"CRITICAL: Folder {project_folder_id} was not saved to metadata.json! "
            "Do not proceed with downloads. Check file permissions and disk space."
        )

    # 4. Download all images
    downloaded = []
    failed = []

    for i, img_info in enumerate(images, 1):
        try:
            name = img_info.get('alt') or f"{project_title} - {i}"
            create_eagle_asset(
                library_root=library_root,
                image_url=img_info['src'],
                name=name,
                folder_id=project_folder_id,
                tags=[]
            )
            downloaded.append(img_info)
        except Exception as e:
            failed.append({'url': img_info['src'], 'error': str(e)})

    # 5. Rebuild index (CRITICAL!)
    rebuild_mtime_index(library_root)

    # 6. Verify all assets
    verification = verify_folder_assets(library_root, project_folder_id)
    if verification['invalid'] > 0:
        print(f"⚠️ {verification['invalid']} assets failed verification")
        for detail in verification['details']:
            print(f"  - {detail['name']}: {detail['errors']}")

    # 7. Return summary
    return {
        'project': project_title,
        'folder_id': project_folder_id,
        'downloaded': len(downloaded),
        'failed': len(failed),
        'verified': verification['valid']
    }
```

## Project Folder Naming

Use the URL slug or sanitized project title:
- URL: `https://www.behance.net/gallery/244361827/New-raft-new-river`
- Folder: `New-raft-new-river` (use slug from URL)

Sanitize rules:
- Remove leading/trailing whitespace
- Replace multiple spaces with single space
- Keep alphanumeric, hyphens, underscores
- Max length: 100 characters

## Common Mistakes and Fixes

### ID Length Error

**Problem:** Eagle doesn't recognize resources with 24-char IDs.

**Wrong:**
```python
# ❌ Generates 24-char ID
def generate_id_wrong():
    timestamp = int(time.time() * 1000)  # 13 chars
    random = ''.join(choices(chars, k=10))  # 10 chars
    return f"K{timestamp}{random}"  # 1+13+10 = 24 chars ❌
# Result: K1771836829121PXBP4Wt1hE (24 chars)
```

**Correct:**
```python
# ✅ Generates 13-char ID
def generate_eagle_id():
    chars = ascii_uppercase + ascii_lowercase + digits
    return 'K' + ''.join(choices(chars, k=12))  # 1+12 = 13 chars ✅
# Result: KldZIybF9RPGJ (13 chars)
```

### Missing Required Fields

**Problem:** Eagle shows folder but not resources.

**Missing fields that cause issues:**
- `orientation` - Required for image display
- `modificationTime` - Required for sorting
- `lastModified` - Required for sync

### Filename Mismatch

**Problem:** Thumbnail visible but original file won't open.

**Cause:** Filename doesn't match metadata `name` field.

**Wrong:**
```python
# metadata.json: "name": "New raft new river - 26"
# Actual file:   KldZIybF9RPGJ.jpg    ❌ Eagle can't find it
```

**Correct:**
```python
# metadata.json: "name": "New raft new river - 26"
# Actual file:   New raft new river - 26.jpg    ✅ Matches name field
```

### Missing Thumbnail

**Problem:** Resources invisible in grid view.

**Required file structure:**
```
KldZIybF9RPGJ.info/
├── New raft new river - 26.jpg    # Original image (matches "name" field)
├── metadata.json                  # Metadata
└── New raft new river - 26_thumbnail.png  # Thumbnail (matches filename)
```

### Outdated mtime.json

**Problem:** Eagle can't find new resources.

**Fix:** Always rebuild index after adding resources.

### Project Folder Not Saved

**Problem:** Resources downloaded but not visible in Eagle. Folder appears to be created but doesn't exist in metadata.json.

**Cause:** Folder created in memory but not properly persisted to metadata.json, or saved to wrong location in the JSON tree.

**Correct Implementation:**
```python
def create_project_folder(library_root: Path, parent_folder_id: str,
                          project_name: str) -> str:
    """
    Create project folder in metadata.json with verification.
    Returns the new folder ID.
    """
    import json
    import random
    import string
    from datetime import datetime
    from pathlib import Path

    def generate_folder_id():
        chars = string.ascii_uppercase + string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=13))

    metadata_path = library_root / "metadata.json"

    # Read current metadata
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # Generate folder
    folder_id = generate_folder_id()
    now_ms = int(datetime.now().timestamp() * 1000)

    new_folder = {
        "id": folder_id,
        "name": project_name,
        "description": "",
        "children": [],
        "modificationTime": now_ms,
        "tags": [],
        "password": "",
        "passwordTips": ""
    }

    # Find and update parent folder
    folder_added = False
    for folder in metadata.get("folders", []):
        if folder["name"] == "Collections":
            for child in folder.get("children", []):
                if child["name"] == "Behance":
                    for sub in child.get("children", []):
                        if sub["id"] == parent_folder_id:
                            sub.setdefault("children", []).append(new_folder)
                            folder_added = True
                            print(f"Added to: Collections > Behance > {sub['name']}")
                            break
                    if folder_added:
                        break
            if folder_added:
                break

    if not folder_added:
        raise ValueError(f"Parent folder {parent_folder_id} not found!")

    # CRITICAL: Verify before saving
    # Write to temp file first
    temp_path = metadata_path.with_suffix('.tmp')
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    # Atomic rename
    temp_path.replace(metadata_path)

    # CRITICAL: Verify the save worked
    with open(metadata_path, 'r', encoding='utf-8') as f:
        verify = json.load(f)

    folder_found = False
    for folder in verify.get("folders", []):
        if folder["name"] == "Collections":
            for child in folder.get("children", []):
                if child["name"] == "Behance":
                    for sub in child.get("children", []):
                        for proj in sub.get("children", []):
                            if proj["id"] == folder_id:
                                folder_found = True
                                break

    if not folder_found:
        raise RuntimeError(f"Folder {folder_id} not found after save!")

    print(f"✅ Folder created and verified: {project_name} (ID: {folder_id})")
    return folder_id
```

**Verification Checklist:**
1. ✅ Parent folder ID exists in metadata.json
2. ✅ New folder added to correct parent's `children` array
3. ✅ File saved atomically (temp file → rename)
4. ✅ Re-read and verify folder exists after save
5. ✅ Only proceed with downloads after folder verification

## Providing User Summary

After archiving, provide a comprehensive summary:

```python
def generate_summary(
    project_title: str,
    project_url: str,
    author: str,
    creative_field: str,
    folder_path: str,
    downloaded: list,
    failed: list
) -> str:
    """Generate a formatted summary for the user."""

    lines = [
        "## 归档完成 ✅",
        "",
        f"**项目**: [{project_title}]({project_url})",
        f"**作者**: {author}",
        f"**分类**: {creative_field} → **{folder_path}**",
        f"**图片数量**: {len(downloaded)} 张",
    ]

    if failed:
        lines.append(f"**失败**: {len(failed)} 张")

    lines.extend([
        "",
        "### 已下载图片",
        "",
        "| 序号 | 分辨率 | 大小 |",
        "|------|--------|------|",
    ])

    for i, img in enumerate(downloaded[:10], 1):
        lines.append(
            f"| {i} | {img['width']}×{img['height']} | {img['size']/1024:.1f} KB |"
        )

    if len(downloaded) > 10:
        lines.append(f"| ... | 还有 {len(downloaded) - 10} 张 | |")

    lines.extend([
        "",
        "### 元数据信息",
        "",
        "每张图片都包含完整的 Eagle 元数据：",
        f"- **名称**: `{project_title} - {{序号}}`",
        "- **来源 URL**: Behance 永久链接",
        "- **尺寸**: 宽度 × 高度",
        f"- **文件夹**: {folder_path}",
        "",
        f"现在打开 Eagle 应用，在 **{folder_path}** 中即可查看这些图片。"
    ])

    return "\n".join(lines)
```

## Complete Example

**User request:** "归档 https://www.behance.net/gallery/244361827/New-raft-new-river"

**Implementation steps:**

1. Navigate to the URL using Playwright MCP
2. Extract project info: title, creative field, images
3. Parse metadata.json to find target folder ID for "Illustration" → "插图"
4. Download each image using requests with retry logic
5. Create metadata.json for each asset with proper folder reference
6. Generate summary showing download statistics

**Expected output:**
```
## 归档完成 ✅

**项目**: [New raft, new river.](https://www.behance.net/gallery/244361827/New-raft-new-river)
**作者**: Jesús Sotés
**分类**: Illustration → **Collections > Behance > 插图**
**图片数量**: 26 张

### 已下载图片

| 序号 | 分辨率 | 大小 |
|------|--------|------|
| 1 | 1400×840 | 57.7 KB |
| 2 | 1400×2149 | 413.8 KB |
| ... | ... | ... |

现在打开 Eagle 应用，在 **Collections > Behance > 插图** 中即可查看这些图片。
```

## References

- [Eagle Metadata Format](references/eagle-metadata.md) - Complete specification for Eagle's JSON metadata structure
