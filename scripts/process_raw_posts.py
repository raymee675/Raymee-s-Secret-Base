#!/usr/bin/env python3
import os
import re
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError:
    print("Pillow is required. Install via: pip install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "BlogData" / "RawData"
BLOG_DIR = ROOT / "data" / "BlogData"
META_FILE = BLOG_DIR / "posts.json"
ARCHIVE_DIR = RAW_DIR / "processed"
SITEMAP_FILE = ROOT / "sitemap.xml"

MEDIA_RE = re.compile(r'<(?:img|source|video|audio)[^>]+src\s*=\s*["\']([^"\']+)["\']', flags=re.I)
TITLE_RE = re.compile(r'<title>(.*?)<\/title>', flags=re.I | re.S)
META_DESC_RE = re.compile(r'<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', flags=re.I)
META_TAGS_RE = re.compile(r'<meta[^>]+name=["\'](?:tags|tag)["\'][^>]*content=["\']([^"\']*)["\']', flags=re.I)
META_OG_URL_RE = re.compile(r'<meta\s+property=["\']og:url["\']\s+content=["\']([^"\']*)["\'][^>]*>', flags=re.I)
P_TAG_RE = re.compile(r'<p>(.*?)<\/p>', flags=re.I | re.S)


def load_meta():
    if not META_FILE.exists():
        return {"lastId": 0, "posts": []}
    with META_FILE.open("r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return {"lastId": 0, "posts": []}


def save_meta(meta):
    BLOG_DIR.mkdir(parents=True, exist_ok=True)
    with META_FILE.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def find_html(src_path: Path):
    if src_path.is_file() and src_path.suffix.lower() == ".html":
        return src_path
    if src_path.is_dir():
        # prefer index.html or first html file
        for name in ["index.html", "home.html", "Home.html"]:
            p = src_path / name
            if p.exists():
                return p
        for p in src_path.glob("*.html"):
            return p
    return None


def extract_text(html, regex):
    m = regex.search(html)
    return m.group(1).strip() if m else None


def make_slug(title):
    s = re.sub(r"[^0-9a-zA-Z\-]+", "-", title.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or None


def update_sitemap(meta):
    """
    Update sitemap.xml with all blog posts from meta
    """
    base_url = "https://raymee675.github.io/Raymee-s-Secret-Base/"
    
    # Create XML structure
    ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    urlset = ET.Element('urlset', xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
    
    # Add main pages
    main_urls = [
        {"loc": base_url, "priority": "1.0"},
        {"loc": f"{base_url}index.html", "priority": "1.0"}
    ]
    
    for url_info in main_urls:
        url_elem = ET.SubElement(urlset, 'url')
        ET.SubElement(url_elem, 'loc').text = url_info['loc']
        ET.SubElement(url_elem, 'lastmod').text = datetime.now().strftime('%Y-%m-%d')
        ET.SubElement(url_elem, 'changefreq').text = 'weekly'
        ET.SubElement(url_elem, 'priority').text = url_info['priority']
    
    # Add blog posts
    posts = meta.get('posts', [])
    # Sort posts by date (newest first) for better SEO
    sorted_posts = sorted(posts, key=lambda x: x.get('date', ''), reverse=True)
    
    for post in sorted_posts:
        if not post.get('published', True):
            continue
        
        url_elem = ET.SubElement(urlset, 'url')
        post_url = f"{base_url}{post['path']}"
        ET.SubElement(url_elem, 'loc').text = post_url
        
        # Extract date from ISO format
        date_str = post.get('date', datetime.now().isoformat())
        try:
            date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            lastmod = date_obj.strftime('%Y-%m-%d')
        except Exception:
            lastmod = datetime.now().strftime('%Y-%m-%d')
        
        ET.SubElement(url_elem, 'lastmod').text = lastmod
        ET.SubElement(url_elem, 'changefreq').text = 'monthly'
        ET.SubElement(url_elem, 'priority').text = '0.8'
    
    # Write to file with proper formatting
    tree = ET.ElementTree(urlset)
    ET.indent(tree, space='  ')
    
    with SITEMAP_FILE.open('wb') as f:
        f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
        tree.write(f, encoding='utf-8', xml_declaration=False)
        f.write(b'\n')
    
    print(f"Sitemap updated with {len(sorted_posts)} blog posts")


def convert_to_webp(src_image: Path, dest_image: Path):
    dest_image.parent.mkdir(parents=True, exist_ok=True)
    try:
        with Image.open(src_image) as im:
            # convert to RGBA if image has alpha, otherwise RGB
            if im.mode in ("RGBA", "LA"):
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")
            im.save(dest_image, format="WEBP", quality=85, method=6)
    except Exception as e:
        print(f"Failed to convert {src_image}: {e}")


def process_item(src_item: Path, meta: dict):
    html_path = find_html(src_item)
    if not html_path:
        print(f"No HTML found in {src_item}, skipping")
        return False

    with html_path.open("r", encoding="utf-8") as f:
        html = f.read()

    title = extract_text(html, TITLE_RE) or html_path.stem
    description = extract_text(html, META_DESC_RE) or ''
    first_p = extract_text(html, P_TAG_RE) or ''
    # strip simple HTML tags from first paragraph for fallback summary
    def _strip_tags(s: str) -> str:
        return re.sub(r'<[^>]+>', '', s or '').strip()
    summary = (description.strip() or _strip_tags(first_p))

    # extract tags from meta tags like <meta name="tags" content="0/1/3"> or "1,2" or whitespace-separated
    tags = []
    for tag_content in META_TAGS_RE.findall(html):
        if not tag_content:
            continue
        # split on slash, comma, or whitespace
        parts = [t.strip() for t in re.split(r"[/,\\s]+", tag_content) if t.strip()]
        for p in parts:
            try:
                iv = int(p)
            except Exception:
                # ignore non-integer tags
                continue
            if iv not in tags:
                tags.append(iv)

    next_id = (meta.get("lastId") or 0) + 1
    post_dir = BLOG_DIR / str(next_id)
    post_dir.mkdir(parents=True, exist_ok=True)

    # Define destination HTML name early for use in blog_url
    dest_html_name = html_path.name

    images_dir = post_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # prepare media extension groups
    image_exts = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp')
    video_exts = ('.mp4', '.mov', '.m4v', '.webm', '.ogv')
    audio_exts = ('.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a')

    # replace src attributes precisely using a callback so only the attribute value is changed
    def _replace_src(match):
        original = match.group(0)
        src = match.group(1)
        # ignore absolute urls
        if src.startswith("http://") or src.startswith("https://") or src.startswith("//"):
            return original
        
        # Extract filename stem (without extension) from HTML src path
        src_filename_stem = Path(src).stem
        
        # Search for actual file in data/data directories using filename stem
        src_path = None
        actual_ext = None
        
        # Look in nested data directories
        if src_item.is_dir():
            for data_dir in src_item.rglob("data"):
                # Try all possible media extensions
                for ext in image_exts + video_exts + audio_exts:
                    candidate = data_dir / f"{src_filename_stem}{ext}"
                    if candidate.exists():
                        src_path = candidate
                        actual_ext = ext
                        break
                if src_path:
                    break
        
        # Fallback: try original path resolution
        if not src_path:
            src_path = (html_path.parent / src).resolve()
            if not src_path.exists():
                alt = (src_item / src).resolve()
                if alt.exists():
                    src_path = alt
                else:
                    src_path = None
        
        if not src_path or not src_path.exists():
            print(f"Media not found: {src} (stem: {src_filename_stem}) from {html_path}, leaving original reference")
            return original
        
        # Use actual file extension if found from data/data search
        ext = actual_ext if actual_ext else src_path.suffix.lower()
        
        # images: convert to webp
        if ext in image_exts:
            dest_name = Path(src).stem + ".webp"
            dest_img_path = images_dir / dest_name
            convert_to_webp(src_path, dest_img_path)
            new_src = f"images/{dest_name}"
            return original.replace(src, new_src, 1)

        # videos: copy into videos/
        if ext in video_exts:
            videos_dir = post_dir / "videos"
            videos_dir.mkdir(parents=True, exist_ok=True)
            dest_name = Path(src).name
            dest_video = videos_dir / dest_name
            try:
                shutil.copy2(src_path, dest_video)
            except Exception as e:
                print(f"Failed to copy video {src_path}: {e}")
                return original
            new_src = f"videos/{dest_name}"
            return original.replace(src, new_src, 1)

        # audio: copy into audio/
        if ext in audio_exts:
            audio_dir = post_dir / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)
            dest_name = Path(src).name
            dest_audio = audio_dir / dest_name
            try:
                shutil.copy2(src_path, dest_audio)
            except Exception as e:
                print(f"Failed to copy audio {src_path}: {e}")
                return original
            new_src = f"audio/{dest_name}"
            return original.replace(src, new_src, 1)

        # unknown ext: leave as-is
        return original

    replaced = MEDIA_RE.sub(_replace_src, html)

    # Update og:url meta tag with the blog's URL
    blog_url = f"https://raymee675.github.io/Raymee-s-Secret-Base/data/BlogData/{next_id}/{dest_html_name}"
    
    def _replace_og_url(match):
        return f'<meta property="og:url" content="{blog_url}">'
    
    # Check if og:url meta tag exists
    if META_OG_URL_RE.search(replaced):
        # Replace existing og:url
        replaced = META_OG_URL_RE.sub(_replace_og_url, replaced)
    else:
        # Add og:url meta tag if not present (insert after <head> tag)
        head_tag = re.search(r'<head[^>]*>', replaced, flags=re.I)
        if head_tag:
            insert_pos = head_tag.end()
            og_meta = f'\n    <meta property="og:url" content="{blog_url}">'
            replaced = replaced[:insert_pos] + og_meta + replaced[insert_pos:]

    # write HTML using original source filename
    with (post_dir / dest_html_name).open("w", encoding="utf-8") as f:
        f.write(replaced)

    # Process files in data directories
    if src_item.is_dir():
        for data_dir in src_item.rglob("data"):
            if data_dir.is_dir():
                for item in data_dir.iterdir():
                    if not item.is_file():
                        continue
                    
                    ext = item.suffix.lower()
                    
                    # Process images: convert to webp
                    if ext in image_exts:
                        dest_name = item.stem + ".webp"
                        dest_img_path = images_dir / dest_name
                        convert_to_webp(item, dest_img_path)
                        print(f"Converted data image: {item.name} -> {dest_name}")
                    
                    # Process videos: copy to videos/
                    elif ext in video_exts:
                        videos_dir = post_dir / "videos"
                        videos_dir.mkdir(parents=True, exist_ok=True)
                        dest_video = videos_dir / item.name
                        try:
                            shutil.copy2(item, dest_video)
                            print(f"Copied data video: {item.name}")
                        except Exception as e:
                            print(f"Failed to copy data video {item}: {e}")
                    
                    # Process audio: copy to audio/
                    elif ext in audio_exts:
                        audio_dir = post_dir / "audio"
                        audio_dir.mkdir(parents=True, exist_ok=True)
                        dest_audio = audio_dir / item.name
                        try:
                            shutil.copy2(item, dest_audio)
                            print(f"Copied data audio: {item.name}")
                        except Exception as e:
                            print(f"Failed to copy data audio {item}: {e}")

    # copy other files (non-html assets) that are in the src_item folder (like css) if present
    for item in src_item.iterdir() if src_item.is_dir() else []:
        if item.is_file() and item.suffix.lower() != ".html":
            # skip images, videos, and audio handled above
            if item.name.lower().endswith(image_exts + video_exts + audio_exts):
                continue
            try:
                shutil.copy2(item, post_dir / item.name)
            except Exception as e:
                print(f"Failed to copy asset {item}: {e}")

    post_meta = {
        "id": next_id,
        "title": title,
        "summary": summary,
        "slug": make_slug(title) or str(next_id),
        "date": datetime.utcnow().isoformat() + "Z",
        "path": f"data/BlogData/{next_id}/{dest_html_name}",
        "tags": tags,
        "published": True
    }

    meta.setdefault("posts", []).append(post_meta)
    meta["lastId"] = next_id

    # move processed raw to archive
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    dest_archive = ARCHIVE_DIR / (src_item.name + f".processed.{next_id}")
    try:
        if src_item.is_dir():
            shutil.move(str(src_item), str(dest_archive))
        else:
            # src_item is a file
            moved_dir = ARCHIVE_DIR / src_item.stem
            moved_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_item), str(moved_dir / src_item.name))
    except Exception as e:
        print(f"Warning: failed to move processed item {src_item}: {e}")

    print(f"Processed {src_item} -> id={next_id}")
    return True


def main():
    if not RAW_DIR.exists():
        print("Raw data dir does not exist, nothing to do.")
        return

    meta = load_meta()

    # find candidates: files and directories directly under RAW_DIR, excluding archive
    candidates = [p for p in RAW_DIR.iterdir() if p.name != 'processed']
    if not candidates:
        print("No raw items to process.")
        return

    changed = False
    for item in sorted(candidates):
        ok = process_item(item, meta)
        if ok:
            changed = True

    if changed:
        save_meta(meta)
        print("Meta updated.")
        update_sitemap(meta)
    else:
        print("No changes made.")


if __name__ == '__main__':
    main()
