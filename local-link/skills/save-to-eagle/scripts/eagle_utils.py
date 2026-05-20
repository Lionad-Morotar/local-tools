#!/usr/bin/env python3
"""
Eagle 素材库共用工具函数
"""
import json
import random
import string
import shutil
import time
import requests
from pathlib import Path
from datetime import datetime
from PIL import Image

# 默认 Eagle 库路径
LIBRARY_ROOT = Path("/Users/lionad/Library/CloudStorage/OneDrive-Personal/素材/@/素材.library")

# 文件夹 ID 缓存
FOLDER_IDS = {
    "Pixiv": "KMTBCL1D9MF66",
    "Behance": {
        "未分类": "ytTDRfP4ebT0E",
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
}


def generate_eagle_id() -> str:
    """生成正确的 Eagle ID 格式 (13字符: K + 12位字母数字)"""
    chars = string.ascii_uppercase + string.ascii_lowercase + string.digits
    return 'K' + ''.join(random.choices(chars, k=12))


def generate_folder_id() -> str:
    """生成文件夹 ID (11-13 字符)"""
    chars = string.ascii_uppercase + string.ascii_lowercase + string.digits
    return ''.join(random.choices(chars, k=13))


def create_thumbnail(img_path: Path, thumb_path: Path, max_size=240):
    """创建保持原图比例的 Eagle 缩略图"""
    with Image.open(img_path) as img:
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        # 保持比例缩放到最大边为 max_size
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        # 直接保存，不添加白色背景，保持原图比例
        img.save(thumb_path, 'PNG')


def get_exif_orientation(img) -> int:
    """获取 EXIF 方向信息，默认为 1 (正常)"""
    try:
        exif = img._getexif()
        if exif and 274 in exif:
            return exif[274]
    except:
        pass
    return 1


def sanitize_filename(name: str, max_len: int = 80) -> str:
    """
    清理文件名，替换空格和特殊字符为下划线

    Eagle 对文件名中的空格和特殊字符敏感，可能导致显示问题。
    所有非字母数字字符统一替换为下划线，确保兼容性。
    """
    result = ""
    for c in name:
        if c.isalnum():
            result += c
        else:
            result += '_'
    # 合并连续的下划线
    while '__' in result:
        result = result.replace('__', '_')
    return result[:max_len].strip('_')


def create_eagle_asset(
    image_path: Path,
    name: str,
    folder_id: str,
    source_url: str,
    annotation: str = "",
    tags: list = None,
    star: int = 0
) -> dict:
    """
    创建完整的 Eagle 资源

    Args:
        image_path: 图片文件路径
        name: 资源名称（不含扩展名）
        folder_id: 目标文件夹 ID
        source_url: 来源 URL
        annotation: 注释
        tags: 标签列表

    Returns:
        创建的元数据字典
    """
    # 生成资源 ID 和目录
    asset_id = generate_eagle_id()
    asset_dir = LIBRARY_ROOT / "images" / f"{asset_id}.info"
    asset_dir.mkdir(parents=True, exist_ok=True)

    # 获取扩展名
    ext = image_path.suffix.lstrip('.')
    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'gif']:
        ext = 'jpg'

    # 清理文件名
    safe_name = sanitize_filename(name)

    # 复制图片到目标位置
    dest_path = asset_dir / f"{safe_name}.{ext}"
    shutil.copy2(image_path, dest_path)

    # 创建缩略图（必需）
    thumb_path = asset_dir / f"{safe_name}_thumbnail.png"
    create_thumbnail(dest_path, thumb_path)

    # 获取图片信息
    with Image.open(dest_path) as img:
        width, height = img.size
        orientation = get_exif_orientation(img)

    stat = dest_path.stat()
    now_ms = int(datetime.now().timestamp() * 1000)

    # 创建完整元数据
    metadata = {
        "id": asset_id,
        "name": safe_name,
        "size": stat.st_size,
        "btime": int(stat.st_birthtime * 1000),
        "mtime": int(stat.st_mtime * 1000),
        "ext": ext,
        "width": width,
        "height": height,
        "orientation": orientation,
        "modificationTime": now_ms,
        "lastModified": now_ms,
        "folders": [folder_id],
        "tags": tags or [],
        "isDeleted": False,
        "url": source_url,
        "annotation": annotation,
        "palettes": [],
        "star": star
    }

    # 保存元数据
    meta_path = asset_dir / "metadata.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))

    return metadata


def create_subfolder(parent_id: str, name: str, description: str = "") -> str:
    """
    在指定父文件夹下创建子文件夹

    如果同名文件夹已存在，则返回现有文件夹的 ID

    Returns:
        文件夹的 ID
    """
    metadata_path = LIBRARY_ROOT / "metadata.json"

    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # 递归查找父文件夹，并检查是否已存在同名子文件夹
    def find_parent_and_check_duplicate(folder_list):
        for folder in folder_list:
            if folder["id"] == parent_id:
                # 检查是否已存在同名子文件夹
                for child in folder.get("children", []):
                    if child.get("name") == name:
                        return folder, child["id"]  # 返回父文件夹和现有子文件夹 ID
                return folder, None  # 返回父文件夹，无重复
            if folder.get("children"):
                result = find_parent_and_check_duplicate(folder["children"])
                if result[0] is not None:
                    return result
        return None, None

    parent_folder, existing_id = find_parent_and_check_duplicate(metadata.get("folders", []))

    if parent_folder is None:
        raise ValueError(f"父文件夹 {parent_id} 未找到")

    # 如果已存在同名文件夹，返回现有 ID
    if existing_id:
        print(f"   使用现有文件夹: {name}")
        return existing_id

    # 创建新文件夹
    folder_id = generate_folder_id()
    now_ms = int(datetime.now().timestamp() * 1000)

    new_folder = {
        "id": folder_id,
        "name": name,
        "description": description,
        "children": [],
        "modificationTime": now_ms,
        "tags": [],
        "password": "",
        "passwordTips": ""
    }

    parent_folder.setdefault("children", []).append(new_folder)

    # 原子写入
    temp_path = metadata_path.with_suffix('.tmp')
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    temp_path.replace(metadata_path)

    return folder_id


def set_folder_cover(folder_id: str, asset_id: str):
    """
    设置文件夹封面

    Args:
        folder_id: 目标文件夹 ID
        asset_id: 作为封面的资源 ID
    """
    metadata_path = LIBRARY_ROOT / "metadata.json"

    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # 递归查找文件夹
    def find_and_update(folder_list):
        for folder in folder_list:
            if folder["id"] == folder_id:
                folder["coverId"] = asset_id
                return True
            if folder.get("children"):
                if find_and_update(folder["children"]):
                    return True
        return False

    if not find_and_update(metadata.get("folders", [])):
        raise ValueError(f"文件夹 {folder_id} 未找到")

    # 原子写入
    temp_path = metadata_path.with_suffix('.tmp')
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    temp_path.replace(metadata_path)

    print(f"   设置封面: {asset_id}")


def rebuild_mtime_index():
    """
    重建 mtime.json 索引

    只包含有效的资源 ID（K 开头，13 字符），清理异常的文件夹 ID。
    """
    mtime_data = {}

    for asset_dir in LIBRARY_ROOT.glob('images/*.info'):
        meta_path = asset_dir / 'metadata.json'
        if meta_path.exists():
            asset_id = asset_dir.name.replace('.info', '')
            # 验证 ID 格式：K 开头，13 字符
            if len(asset_id) == 13 and asset_id.startswith('K'):
                stat = meta_path.stat()
                mtime_data[asset_id] = int(stat.st_mtime * 1000)

    mtime_path = LIBRARY_ROOT / 'mtime.json'
    # 使用唯一临时文件名避免批量归档时的竞态冲突
    import os
    temp = mtime_path.with_suffix(f'.tmp.{os.getpid()}.{int(time.time() * 1000)}')
    temp.write_text(json.dumps(mtime_data, ensure_ascii=False))
    temp.replace(mtime_path)

    print(f"  重建索引: {len(mtime_data)} 个资源")
    return len(mtime_data)


def clean_mtime_json():
    """
    清理 mtime.json 中的异常键

    删除所有非标准资源 ID（非 K 开头或非 13 字符）。
    返回清理的异常键数量。
    """
    mtime_path = LIBRARY_ROOT / 'mtime.json'

    if not mtime_path.exists():
        print("  mtime.json 不存在，跳过清理")
        return 0

    with open(mtime_path, 'r', encoding='utf-8') as f:
        mtime_data = json.load(f)

    original_count = len(mtime_data)

    # 删除异常键
    bad_keys = [k for k in mtime_data.keys()
                if not (len(k) == 13 and k.startswith('K'))]

    for key in bad_keys:
        del mtime_data[key]

    # 保存清理后的数据
    temp = mtime_path.with_suffix('.tmp')
    temp.write_text(json.dumps(mtime_data, ensure_ascii=False))
    temp.replace(mtime_path)

    removed_count = original_count - len(mtime_data)
    if removed_count > 0:
        print(f"  清理完成: 删除 {removed_count} 个异常键，剩余 {len(mtime_data)} 个资源")
    else:
        print(f"  无需清理，共 {len(mtime_data)} 个资源")

    return removed_count


def verify_asset_integrity(asset_id: str) -> dict:
    """
    验证单个资源的完整性

    Args:
        asset_id: 资源 ID

    Returns:
        验证结果字典，包含 'valid' 和 'errors' 字段
    """
    result = {'valid': True, 'errors': [], 'warnings': []}

    asset_dir = LIBRARY_ROOT / 'images' / f'{asset_id}.info'
    meta_path = asset_dir / 'metadata.json'

    # 检查元数据文件
    if not meta_path.exists():
        result['valid'] = False
        result['errors'].append('缺少 metadata.json')
        return result

    # 解析元数据
    try:
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        result['valid'] = False
        result['errors'].append(f'metadata.json 格式错误: {e}')
        return result

    # 验证必需字段（会影响 Eagle 显示的关键字段）
    required_fields = ['id', 'name', 'size', 'btime', 'mtime', 'ext',
                       'width', 'height', 'modificationTime',
                       'lastModified', 'folders', 'isDeleted']

    for field in required_fields:
        if field not in meta:
            result['errors'].append(f'缺少字段: {field}')

    # 可选字段（旧资源可能缺少，但不影响基本功能）
    optional_fields = ['orientation', 'palettes', 'tags', 'annotation', 'url', 'star']
    for field in optional_fields:
        if field not in meta:
            result['warnings'].append(f'缺少可选字段: {field}')

    # 验证 ID 格式和一致性
    if 'id' in meta:
        if len(meta['id']) != 13:
            result['errors'].append(f"ID 长度错误: {len(meta['id'])} (应为 13)")
        if meta['id'] != asset_id:
            result['errors'].append(f"ID 不一致: metadata 中是 {meta['id']}，目录名是 {asset_id}")

    # 验证图片文件
    if 'name' in meta and 'ext' in meta:
        ext = meta['ext']
        name = meta['name']
        img_path = asset_dir / f'{name}.{ext}'
        thumb_path = asset_dir / f'{name}_thumbnail.png'

        if not img_path.exists():
            result['errors'].append(f'缺少图片文件: {img_path.name}')
        elif img_path.stat().st_size == 0:
            result['errors'].append(f'图片文件为空: {img_path.name}')

        if not thumb_path.exists():
            result['warnings'].append(f'缺少缩略图: {thumb_path.name}')
        elif thumb_path.stat().st_size == 0:
            result['errors'].append(f'缩略图为空: {thumb_path.name}')

    result['valid'] = len(result['errors']) == 0
    return result


def repair_library():
    """
    修复素材库的常见问题

    执行以下修复：
    1. 清理 mtime.json 中的异常键
    2. 重建 mtime 索引
    3. 验证所有资源的完整性
    """
    print("🔧 开始修复素材库...")
    print()

    # 1. 清理 mtime.json
    print("1. 清理 mtime.json...")
    cleaned = clean_mtime_json()
    print()

    # 2. 重建索引
    print("2. 重建索引...")
    count = rebuild_mtime_index()
    print()

    # 3. 验证资源完整性（抽样检查）
    print("3. 验证资源完整性（抽样检查前 10 个）...")
    import random
    asset_dirs = list((LIBRARY_ROOT / 'images').glob('K*.info'))
    sample = random.sample(asset_dirs, min(10, len(asset_dirs)))

    invalid_count = 0
    for asset_dir in sample:
        asset_id = asset_dir.name.replace('.info', '')
        result = verify_asset_integrity(asset_id)
        if not result['valid']:
            invalid_count += 1
            print(f"  ❌ {asset_id}: {result['errors']}")

    if invalid_count == 0:
        print("  ✅ 抽样的资源全部正常")
    else:
        print(f"  ⚠️ 发现 {invalid_count} 个异常资源")

    print()
    print("✅ 修复完成！")
    print(f"   - 清理异常键: {cleaned} 个")
    print(f"   - 索引资源: {count} 个")


def download_image(url: str, dest_path: Path, headers: dict = None, max_retries: int = 3) -> int:
    """
    下载图片，带重试机制

    Returns:
        下载的文件大小（字节）
    """
    default_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    }
    if headers:
        default_headers.update(headers)

    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=default_headers, timeout=60)
            response.raise_for_status()
            dest_path.write_bytes(response.content)
            return len(response.content)
        except Exception:
            if attempt == max_retries - 1:
                raise
            import time
            time.sleep(1)


async def load_page_with_fallback(
    page,
    url: str,
    timeout: int = 60000,
    wait_strategies: list = None,
    extra_wait: float = 2.0
) -> str:
    """
    泛化的页面加载函数，支持自动降级策略

    当高优先级的加载策略（如 networkidle）超时时，自动降级到更低级的策略
    （如 domcontentloaded），确保页面能够成功加载。

    Args:
        page: Playwright 页面对象
        url: 要加载的 URL
        timeout: 每个策略的超时时间（毫秒）
        wait_strategies: 加载策略列表，按优先级排序。
                        默认为 ["networkidle", "load", "domcontentloaded"]
        extra_wait: 加载成功后额外等待的时间（秒），用于动态内容渲染

    Returns:
        实际使用的加载策略名称

    Raises:
        TimeoutError: 所有策略都失败时抛出

    Example:
        >>> strategy = await load_page_with_fallback(page, url, extra_wait=3.0)
        >>> print(f"使用策略: {strategy}")
    """
    if wait_strategies is None:
        # 默认策略：从高到低优先级
        wait_strategies = ["networkidle", "load", "domcontentloaded"]

    last_error = None

    for strategy in wait_strategies:
        try:
            await page.goto(url, wait_until=strategy, timeout=timeout)
            # 额外等待，确保动态内容加载
            if extra_wait > 0:
                import asyncio
                await asyncio.sleep(extra_wait)
            return strategy
        except Exception as e:
            last_error = e
            print(f"   策略 '{strategy}' 失败，尝试降级...")
            continue

    # 所有策略都失败
    raise TimeoutError(
        f"所有加载策略都失败 ({', '.join(wait_strategies)})。"
        f"最后错误: {last_error}"
    )


async def extract_with_playwright(
    url: str,
    extract_fn: callable,
    wait_strategies: list = None,
    timeout: int = 60000,
    extra_wait: float = 2.0,
    headless: bool = True
) -> dict:
    """
    泛化的 Playwright 数据提取函数

    封装了页面加载、数据提取和浏览器清理的完整流程，
    处理常见的超时和加载问题。

    Args:
        url: 要访问的 URL
        extract_fn: 在页面上执行的提取函数，接收 page 对象返回数据
        wait_strategies: 页面加载策略列表
        timeout: 加载超时时间（毫秒）
        extra_wait: 加载后额外等待时间（秒）
        headless: 是否使用无头模式

    Returns:
        extract_fn 返回的数据

    Example:
        >>> def extract_images(page):
        ...     return page.evaluate("() => document.images.length")
        >>> result = await extract_with_playwright(url, extract_images)
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        page = await browser.new_page()

        try:
            # 使用降级策略加载页面
            strategy = await load_page_with_fallback(
                page, url,
                timeout=timeout,
                wait_strategies=wait_strategies,
                extra_wait=extra_wait
            )
            print(f"   页面加载成功 (策略: {strategy})")

            # 执行提取函数
            result = await extract_fn(page)
            return result

        finally:
            await browser.close()
