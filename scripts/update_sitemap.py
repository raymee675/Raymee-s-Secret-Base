#!/usr/bin/env python3
"""
既存のposts.jsonからサイトマップを再生成するスクリプト
"""
import json
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
META_FILE = ROOT / "data" / "BlogData" / "posts.json"
SITEMAP_FILE = ROOT / "sitemap.xml"


def load_meta():
    if not META_FILE.exists():
        return {"lastId": 0, "posts": []}
    with META_FILE.open("r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return {"lastId": 0, "posts": []}


def update_sitemap(meta):
    """
    Update sitemap.xml with all blog posts from meta
    """
    base_url = "https://raymee675.github.io/Raymee-s-Secret-Base/"
    
    # Create sitemap manually for better compatibility and formatting
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]
    
    # Add main pages
    main_urls = [
        {"loc": base_url, "priority": "1.0"},
        {"loc": f"{base_url}index.html", "priority": "1.0"}
    ]
    
    current_date = datetime.now().strftime('%Y-%m-%d')
    
    for url_info in main_urls:
        lines.append('  <url>')
        lines.append(f'    <loc>{url_info["loc"]}</loc>')
        lines.append(f'    <lastmod>{current_date}</lastmod>')
        lines.append('    <changefreq>weekly</changefreq>')
        lines.append(f'    <priority>{url_info["priority"]}</priority>')
        lines.append('  </url>')
    
    # Add blog posts
    posts = meta.get('posts', [])
    # Sort posts by date (newest first) for better SEO
    sorted_posts = sorted(posts, key=lambda x: x.get('date', ''), reverse=True)
    
    published_count = 0
    for post in sorted_posts:
        if not post.get('published', True):
            continue
        
        published_count += 1
        post_url = f"{base_url}{post['path']}"
        
        # Extract date from ISO format
        date_str = post.get('date', datetime.now().isoformat())
        try:
            date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            lastmod = date_obj.strftime('%Y-%m-%d')
        except Exception:
            lastmod = current_date
        
        lines.append('  <url>')
        lines.append(f'    <loc>{post_url}</loc>')
        lines.append(f'    <lastmod>{lastmod}</lastmod>')
        lines.append('    <changefreq>monthly</changefreq>')
        lines.append('    <priority>0.8</priority>')
        lines.append('  </url>')
    
    lines.append('</urlset>')
    
    # Write to file
    with SITEMAP_FILE.open('w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    
    print(f"Sitemap updated successfully!")
    print(f"- Main pages: 2")
    print(f"- Published blog posts: {published_count}")
    print(f"- Total URLs: {2 + published_count}")


def main():
    print("Loading blog metadata...")
    meta = load_meta()
    
    total_posts = len(meta.get('posts', []))
    print(f"Found {total_posts} total posts")
    
    print("Updating sitemap...")
    update_sitemap(meta)
    
    print(f"\nSitemap saved to: {SITEMAP_FILE}")


if __name__ == '__main__':
    main()
