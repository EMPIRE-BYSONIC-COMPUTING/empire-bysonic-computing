import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BLOG_DIR = ROOT / "blog"
SITE_URL = "https://empire-bysonic-computing.github.io/empire-bysonic-computing"
MODEL = "gpt-4.1-mini"
JOURNAL_MARKER = "            <!-- WEEKLY JOURNAL CARDS -->"
ALLOWED_CATEGORIES = {
    "Repair advice",
    "Upgrade guide",
    "Device care",
    "Buying and selling",
}


def plain_text(value, field, minimum, maximum):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ValueError(f"{field} must be between {minimum} and {maximum} characters")
    return value


def validate_article(article):
    if not isinstance(article, dict):
        raise ValueError("The generated article must be a JSON object")
    title = plain_text(article.get("title"), "title", 20, 100)
    description = plain_text(article.get("description"), "description", 50, 180)
    excerpt = plain_text(article.get("excerpt"), "excerpt", 40, 240)
    category = article.get("category")
    if not isinstance(category, str) or category not in ALLOWED_CATEGORIES:
        raise ValueError("category must be one of the supported journal categories")
    sections = article.get("sections")
    if not isinstance(sections, list) or not 4 <= len(sections) <= 7:
        raise ValueError("the article must contain between 4 and 7 sections")

    word_count = 0
    clean_sections = []
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("each section must be a JSON object")
        heading = plain_text(section.get("heading"), "section heading", 5, 90)
        paragraphs = section.get("paragraphs")
        if not isinstance(paragraphs, list) or not 1 <= len(paragraphs) <= 4:
            raise ValueError("each section must contain between 1 and 4 paragraphs")
        clean_paragraphs = [
            plain_text(paragraph, "paragraph", 40, 1200)
            for paragraph in paragraphs
        ]
        word_count += sum(len(paragraph.split()) for paragraph in clean_paragraphs)
        clean_sections.append({"heading": heading, "paragraphs": clean_paragraphs})
    if not 450 <= word_count <= 1100:
        raise ValueError("article body must contain between 450 and 1,100 words")
    return {
        "title": title,
        "description": description,
        "excerpt": excerpt,
        "category": category,
        "sections": clean_sections,
    }


def article_slug(title):
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    if not slug:
        raise ValueError("could not create a valid article URL from the title")
    return slug


def published_date():
    return (datetime.now(timezone.utc) + timedelta(hours=2)).date().isoformat()


def json_for_script(value):
    return (
        json.dumps(value, ensure_ascii=True)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def existing_titles():
    titles = []
    for path in BLOG_DIR.glob("*.html"):
        source = path.read_text(encoding="utf-8")
        match = re.search(r"<h1\b[^>]*>(.*?)</h1>", source, re.IGNORECASE | re.DOTALL)
        if match:
            titles.append(html.unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip())
    return titles


def generate_article(api_key, titles):
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY is not set. Add it as a repository Actions secret."
        )
    schema = {
        "title": "string",
        "description": "string (50-180 characters)",
        "excerpt": "string (40-240 characters)",
        "category": "Repair advice | Upgrade guide | Device care | Buying and selling",
        "sections": [
            {
                "heading": "string",
                "paragraphs": ["string"],
            }
        ],
    }
    prompt = (
        "Write one original, useful 500-800 word educational article for the "
        "Bysonic Journal, a Cape Town computer repair and sales business. Choose "
        "a fresh, practical topic within computer repair, diagnostics, upgrades, "
        "device care, or safe computer buying and selling. Do not repeat or closely "
        "rephrase these existing article titles: "
        + json.dumps(titles, ensure_ascii=True)
        + ". Use plain, cautious general guidance. Do not invent prices, warranties, "
        "business claims, exact specifications, statistics, citations, or sources. "
        "Do not recommend opening a device, handling a swollen battery, or other "
        "potentially unsafe repair work. Avoid claims that an upgrade always fixes "
        "a symptom. Return only a JSON object matching this shape: "
        + json.dumps(schema)
        + ". Include 4-7 sections, each with 1-4 substantial paragraphs. The "
        "description and excerpt must accurately summarize the article."
    )
    payload = {
        "model": MODEL,
        "temperature": 0.6,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You write accurate, careful computer-care education. Output valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"OpenAI API request failed with HTTP {error.code}; check the API key, model access, and account quota."
        ) from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach the OpenAI API: {error.reason}") from None
    choices = response_data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenAI returned no article choices")
    content = choices[0].get("message", {}).get("content")
    if not isinstance(content, str):
        raise ValueError("OpenAI returned no article text")
    return validate_article(json.loads(content))


def render_article(article, slug, date):
    canonical = f"{SITE_URL}/blog/{slug}.html"
    escaped_title = html.escape(article["title"], quote=True)
    escaped_description = html.escape(article["description"], quote=True)
    sections = "\n".join(
        "                <section>\n"
        f"                    <h2>{html.escape(section['heading'])}</h2>\n"
        + "\n".join(
            f"                    <p>{html.escape(paragraph)}</p>"
            for paragraph in section["paragraphs"]
        )
        + "\n                </section>"
        for section in article["sections"]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escaped_title} | Empire Bysonic</title>
    <meta name="description" content="{escaped_description}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:title" content="{escaped_title} | Empire Bysonic">
    <meta property="og:description" content="{escaped_description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="{canonical}">
    <link rel="stylesheet" href="blog.css">
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": {json_for_script(article["title"])},
        "description": {json_for_script(article["description"])},
        "datePublished": "{date}",
        "dateModified": "{date}",
        "mainEntityOfPage": "{canonical}",
        "author": {{
            "@type": "Organization",
            "name": "Empire Bysonic Computing"
        }},
        "publisher": {{
            "@type": "Organization",
            "name": "Empire Bysonic Computing",
            "url": "{SITE_URL}/"
        }}
    }}
    </script>
</head>
<body>
    <header class="blog-topbar">
        <div class="blog-topbar-inner">
            <a class="blog-brand" href="../index.html">EMPIRE BYSONIC COMPUTING</a>
            <a class="blog-back" href="../index.html#bysonic-journal">Back to the Bysonic Journal</a>
        </div>
    </header>
    <main class="blog-main">
        <nav class="blog-breadcrumb" aria-label="Breadcrumb"><a href="../index.html">Home</a> / <a href="../index.html#bysonic-journal">The Bysonic Journal</a> / {escaped_title}</nav>
        <article>
            <header>
                <p class="blog-kicker">{html.escape(article["category"])}</p>
                <h1 class="blog-title">{escaped_title}</h1>
                <p class="blog-deck">{escaped_description}</p>
                <p class="blog-byline">By Empire Bysonic Computing · Published {date}</p>
            </header>
            <div class="blog-article">
{sections}
                <p><strong>Note:</strong> This AI-assisted guide provides general information and is not independently fact-checked. Follow the manufacturer's instructions for your exact model or consult a qualified technician before acting.</p>
            </div>
        </article>
        <aside class="blog-cta" aria-label="Computer care and sales">
            <h2>Need help with a computer?</h2>
            <p>Empire Bysonic Computing offers computer services in Cape Town's Southern Suburbs. You can also browse approved listings or submit a device for review.</p>
            <a href="../diagnostics.html">Explore diagnostics</a>
            <a href="../index.html#sales-section">Browse or submit a device for sale</a>
            <a href="https://wa.me/27818272643">WhatsApp +27 81 827 2643</a>
        </aside>
    </main>
    <footer class="blog-footer"><a href="../index.html">Empire Bysonic Computing</a> · Southern Suburbs, Cape Town</footer>
</body>
</html>
"""


def render_journal_card(article, slug):
    return (
        "                <article class=\"journal-card\">\n"
        f"                    <p class=\"journal-category\">{html.escape(article['category'])}</p>\n"
        f"                    <h3>{html.escape(article['title'])}</h3>\n"
        f"                    <p>{html.escape(article['excerpt'])}</p>\n"
        f"                    <a class=\"journal-link\" href=\"blog/{slug}.html\">Read the full guide</a>\n"
        "                </article>\n"
    )


def update_homepage(source, article, slug):
    if source.count(JOURNAL_MARKER) != 1:
        raise ValueError("index.html must contain exactly one weekly journal marker")
    return source.replace(
        JOURNAL_MARKER,
        JOURNAL_MARKER + "\n" + render_journal_card(article, slug),
    )


def update_sitemap(source, slug, date):
    page_url = f"{SITE_URL}/blog/{slug}.html"
    if page_url in source:
        raise ValueError(f"sitemap already contains {page_url}")
    closing_tag = "</urlset>"
    if source.count(closing_tag) != 1:
        raise ValueError("sitemap.xml does not have exactly one urlset closing tag")
    entry = (
        "    <url>\n"
        f"        <loc>{page_url}</loc>\n"
        f"        <lastmod>{date}</lastmod>\n"
        "        <changefreq>weekly</changefreq>\n"
        "        <priority>0.7</priority>\n"
        "    </url>\n"
    )
    return source.replace(closing_tag, entry + closing_tag)


def publish(api_key=None, date=None):
    article = generate_article(api_key or os.environ.get("OPENAI_API_KEY"), existing_titles())
    slug = article_slug(article["title"])
    article_path = BLOG_DIR / f"{slug}.html"
    if article_path.exists():
        raise ValueError(f"article URL already exists: blog/{slug}.html")
    date = date or published_date()

    homepage_path = ROOT / "index.html"
    sitemap_path = ROOT / "sitemap.xml"
    homepage = update_homepage(homepage_path.read_text(encoding="utf-8"), article, slug)
    sitemap = update_sitemap(sitemap_path.read_text(encoding="utf-8"), slug, date)
    article_html = render_article(article, slug, date)

    article_path.write_text(article_html, encoding="utf-8", newline="\n")
    homepage_path.write_text(homepage, encoding="utf-8", newline="\n")
    sitemap_path.write_text(sitemap, encoding="utf-8", newline="\n")
    print(f"Published article: {article['title']} ({article_path.relative_to(ROOT)})")


if __name__ == "__main__":
    try:
        publish()
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"Weekly blog publishing failed: {error}", file=sys.stderr)
        sys.exit(1)
