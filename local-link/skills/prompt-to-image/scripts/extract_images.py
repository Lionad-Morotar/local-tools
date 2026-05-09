#!/usr/bin/env python3
"""
Process API response and extract images.
Supports both Gemini (generateContent) and GPT Image (generations) response formats.
Auto-detects response format from JSON structure.
"""

import json
import base64
import os
import sys
import urllib.request
from pathlib import Path
from datetime import datetime


def detect_format(data: dict) -> str:
    """Auto-detect API response format."""
    if 'candidates' in data:
        return 'gemini'
    elif 'data' in data and isinstance(data.get('data'), list):
        return 'gpt'
    return 'unknown'


def generate_image_path(output_path: Path, ext: str) -> Path:
    """Generate a unique image filename in the output directory."""
    timestamp = datetime.now().strftime('%H-%M-%S')
    base_name = f"image_{timestamp}"
    image_path = output_path / f"{base_name}{ext}"

    counter = 1
    while image_path.exists():
        image_path = output_path / f"{base_name}_{counter}{ext}"
        counter += 1

    return image_path


def save_image(image_data: bytes, image_path: Path) -> None:
    """Save image bytes to file with fsync for durability."""
    with open(image_path, 'wb') as img_file:
        img_file.write(image_data)
        img_file.flush()
        os.fsync(img_file.fileno())


def ext_from_mime(mime_type: str) -> str:
    """Map MIME type to file extension."""
    ext_map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/jpg': '.jpg',
    }
    return ext_map.get(mime_type, '.jpg')


def ext_from_url(url: str) -> str:
    """Infer file extension from URL path."""
    path = urllib.request.urlparse(url).path
    lower = path.lower()
    for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
        if lower.endswith(ext):
            return '.jpg' if ext == '.jpeg' else ext
    return '.png'  # default for unknown URLs


def extract_gemini_images(data: dict, output_path: Path) -> list[str]:
    """Extract images from Gemini generateContent response."""
    extracted_paths = []

    for candidate in data.get('candidates', []):
        if 'content' not in candidate or 'parts' not in candidate['content']:
            continue
        for part in candidate['content']['parts']:
            if 'inlineData' not in part:
                continue
            inline_data = part['inlineData']
            mime_type = inline_data.get('mimeType', 'image/jpeg')
            base64_data = inline_data.get('data', '')

            ext = ext_from_mime(mime_type)
            image_path = generate_image_path(output_path, ext)

            image_data = base64.b64decode(base64_data)
            save_image(image_data, image_path)

            extracted_paths.append(str(image_path))
            print(f"Extracted (Gemini): {image_path}")

    return extracted_paths


def extract_gpt_images(data: dict, output_path: Path) -> list[str]:
    """Extract images from GPT Image generations response."""
    extracted_paths = []

    for idx, item in enumerate(data.get('data', [])):
        if 'b64_json' in item:
            # base64 encoded image
            image_data = base64.b64decode(item['b64_json'])
            ext = '.png'  # GPT Image API defaults to PNG
            image_path = generate_image_path(output_path, ext)
            save_image(image_data, image_path)

            extracted_paths.append(str(image_path))
            print(f"Extracted (GPT b64_json): {image_path}")

        elif 'url' in item:
            # Download image from URL
            url = item['url']
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=30) as response:
                    image_data = response.read()
                    content_type = response.headers.get('Content-Type', '')
            except Exception as e:
                print(f"⚠️  Failed to download image from URL: {url} - {e}")
                continue

            ext = ext_from_mime(content_type) if content_type else ext_from_url(url)
            image_path = generate_image_path(output_path, ext)
            save_image(image_data, image_path)

            extracted_paths.append(str(image_path))
            print(f"Extracted (GPT URL): {image_path}")

    return extracted_paths


def extract_images_from_response(response_json_path: str, output_dir: str) -> list[str]:
    """
    Extract images from API response and save to files.
    Auto-detects response format (Gemini or GPT Image).

    Args:
        response_json_path: Path to the response JSON file
        output_dir: Directory to save extracted images

    Returns:
        List of paths to extracted image files
    """
    with open(response_json_path, 'r') as f:
        data = json.load(f)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    fmt = detect_format(data)
    if fmt == 'gemini':
        extracted_paths = extract_gemini_images(data, output_path)
    elif fmt == 'gpt':
        extracted_paths = extract_gpt_images(data, output_path)
    else:
        print(f"⚠️  Unknown response format. Keys found: {list(data.keys())[:10]}")
        extracted_paths = []

    return extracted_paths


def main():
    if len(sys.argv) < 3:
        print("Usage: python extract_images.py <response.json> <output_dir>")
        sys.exit(1)

    response_path = sys.argv[1]
    output_dir = sys.argv[2]

    paths = extract_images_from_response(response_path, output_dir)

    if paths:
        print(f"\n✅ Extracted {len(paths)} image(s)")
        for path in paths:
            print(f"  - {path}")
    else:
        print("\n⚠️  No images found in response")


if __name__ == '__main__':
    main()
