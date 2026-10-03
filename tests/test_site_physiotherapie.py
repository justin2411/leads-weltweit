"""Website sites/physiotherapie-oehlke: public/ ist aktuell gebaut, Links zeigen auf vorhandene Seiten."""
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "sites" / "physiotherapie-oehlke"


class SitePhysioTests(unittest.TestCase):
    def test_public_is_up_to_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run([sys.executable, str(SITE / "build.py")], check=True, capture_output=True,
                           env={**os.environ, "SITE_OUT": tmp})
            for f in Path(tmp).rglob("*"):
                if f.is_dir():
                    continue
                rel = f.relative_to(tmp)
                committed = SITE / "public" / rel
                self.assertTrue(committed.exists(), f"{rel} fehlt in public/ – build.py ausführen")
                self.assertEqual(f.read_text(encoding="utf-8"), committed.read_text(encoding="utf-8"),
                                 f"{rel} veraltet – build.py ausführen und public/ committen")

    def test_internal_links_resolve(self):
        pub = SITE / "public"
        for page in pub.rglob("*.html"):
            for href in re.findall(r'(?:href|src)="(/[^"#?]*)', page.read_text(encoding="utf-8")):
                if href == "/":
                    continue
                target = pub / href.lstrip("/")
                ok = target.exists() or target.with_suffix(".html").exists()
                self.assertTrue(ok, f"{page.name}: Link {href} ins Leere")

    def test_demo_is_noindex(self):
        self.assertIn("Disallow: /", (SITE / "public" / "robots.txt").read_text())
        self.assertIn('content="noindex, nofollow"', (SITE / "public" / "index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
