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
            for f in Path(tmp).iterdir():
                committed = SITE / "public" / f.name
                self.assertTrue(committed.exists(), f"{f.name} fehlt in public/ – build.py ausführen")
                self.assertEqual(f.read_text(encoding="utf-8"), committed.read_text(encoding="utf-8"),
                                 f"{f.name} veraltet – build.py ausführen und public/ committen")

    def test_internal_links_resolve(self):
        pub = SITE / "public"
        for page in pub.glob("*.html"):
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
