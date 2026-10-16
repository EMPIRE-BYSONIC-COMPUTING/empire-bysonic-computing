import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import publish_weekly_blog as publisher


def sample_article():
    paragraph = (
        "Check the exact computer model and describe the issue before choosing "
        "a repair or upgrade. Compare compatible options carefully, back up "
        "important files where possible, and follow the manufacturer's guidance "
        "for the device. A qualified technician can help investigate symptoms "
        "that continue or are difficult to diagnose. Keep notes about what changed "
        "and seek model-specific advice before purchasing parts."
    )
    return publisher.validate_article(
        {
            "title": "A Practical Guide to Choosing Computer Care",
            "description": "Learn a careful process for checking a computer issue and choosing practical next steps.",
            "excerpt": "A careful checklist for describing a computer issue and choosing your next steps.",
            "category": "Repair advice",
            "sections": [
                {"heading": f"Step {index}: Check the details", "paragraphs": [paragraph, paragraph]}
                for index in range(1, 5)
            ],
        }
    )


class WeeklyBlogPublisherTests(unittest.TestCase):
    def test_generated_page_escapes_text_and_has_canonical_and_article_schema(self):
        article = sample_article()
        article["title"] = "Check <script>alert(1)</script> safely"
        page = publisher.render_article(article, "check-safely", "2026-01-02")

        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)
        self.assertIn(r"\u003cscript\u003e", page)
        self.assertIn(
            'href="https://empire-bysonic-computing.github.io/empire-bysonic-computing/blog/check-safely.html"',
            page,
        )
        self.assertIn('"@type": "BlogPosting"', page)
        self.assertIn("AI-assisted guide", page)

    def test_homepage_card_is_inserted_at_marker_once(self):
        article = sample_article()
        source = f"<div class=\"journal-grid\">\n{publisher.JOURNAL_MARKER}\n</div>"

        updated = publisher.update_homepage(source, article, "computer-care-guide")

        self.assertIn('href="blog/computer-care-guide.html"', updated)
        self.assertEqual(updated.count(publisher.JOURNAL_MARKER), 1)
        with self.assertRaises(ValueError):
            publisher.update_homepage(source.replace(publisher.JOURNAL_MARKER, ""), article, "guide")

    def test_sitemap_entry_is_valid_and_has_publish_date(self):
        source = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'

        updated = publisher.update_sitemap(source, "computer-care-guide", "2026-01-02")
        parsed = ET.fromstring(updated)
        urls = parsed.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")

        self.assertEqual(len(urls), 1)
        self.assertEqual(
            urls[0].findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod"),
            "2026-01-02",
        )
        with self.assertRaises(ValueError):
            publisher.update_sitemap(updated, "computer-care-guide", "2026-01-02")

    def test_article_length_and_slug_are_constrained(self):
        article = sample_article()
        self.assertEqual(
            publisher.article_slug(article["title"]),
            "a-practical-guide-to-choosing-computer-care",
        )
        with self.assertRaises(ValueError):
            publisher.validate_article({"title": "Too short"})


if __name__ == "__main__":
    unittest.main()
