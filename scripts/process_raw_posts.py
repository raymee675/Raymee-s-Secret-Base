#!/usr/bin/env python3
import os
import re
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime

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

IMG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', flags=re.I)
TITLE_RE = re.compile(r'<title>(.*?)<\/title>', flags=re.I | re.S)
META_DESC_RE = re.compile(r'<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', flags=re.I)
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

    next_id = (meta.get("lastId") or 0) + 1
    post_dir = BLOG_DIR / str(next_id)
    post_dir.mkdir(parents=True, exist_ok=True)

    images_dir = post_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # find images and convert
    img_matches = IMG_RE.findall(html)
    replaced = html
    for img_src in img_matches:
        # ignore absolute urls
        if img_src.startswith("http://") or img_src.startswith("https://") or img_src.startswith("//"):
            continue
        # resolve source image path relative to html file
        src_img_path = (html_path.parent / img_src).resolve()
        if not src_img_path.exists():
            # try relative to src_item
            alt = (src_item / img_src).resolve()
            if alt.exists():
                src_img_path = alt
        if not src_img_path.exists():
            print(f"Image not found: {img_src} (from {html_path}), skipping this image")
            continue
        dest_name = Path(img_src).stem + ".webp"
        dest_img_path = images_dir / dest_name
        convert_to_webp(src_img_path, dest_img_path)
        # replace occurrences in html to use images/{dest_name}
        # use simple replace for the specific src string
        replaced = replaced.replace(img_src, f"images/{dest_name}")

    # write index.html
    with (post_dir / "index.html").open("w", encoding="utf-8") as f:
        f.write(replaced)

    # copy other files (non-html assets) that are in the src_item folder (like css) if present
    for item in src_item.iterdir() if src_item.is_dir() else []:
        if item.is_file() and item.suffix.lower() != ".html":
            if item.name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp')):
                # already handled images via HTML parsing; skip copying original images
                continue
            shutil.copy2(item, post_dir / item.name)

    post_meta = {
        "id": next_id,
        "title": title,
        "slug": make_slug(title) or str(next_id),
        "date": datetime.utcnow().isoformat() + "Z",
        "path": f"data/BlogData/{next_id}/index.html",
        "summary": description or (first_p[:200] if first_p else ''),
        "tags": [],
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
    else:
        print("No changes made.")


if __name__ == '__main__':
    main()
