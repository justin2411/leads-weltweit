"""Mail-Links tragen die Herkunft für die Website-Auswertung (Inhaber 04.10.2026): ?r=<token>&src=mail&sv=A|B.
Nur die URL ändert sich, nie der Mailtext; keine Öffnungsmessung."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import outreach  # noqa: E402


class FakeDB:
    def __init__(self, slug="uk/web-agencies"):
        self.slug, self.calls = slug, 0

    def select(self, table, params):
        self.calls += 1
        return [{"slug": self.slug}] if self.slug else []


class LandingLinkTest(unittest.TestCase):
    def setUp(self):
        self._env = {k: os.environ.get(k) for k in ("APP_BASE_URL", "SITE_URL")}
        os.environ["APP_BASE_URL"] = "https://www.example.test"

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_mail_link_has_source_and_variant(self):
        link = outreach.landing_link(FakeDB(), {}, "S2", "UK", "tok12345", variant="B")
        self.assertEqual(link, "https://www.example.test/uk/web-agencies?r=tok12345&src=mail&sv=B")

    def test_unknown_variant_only_source(self):
        link = outreach.landing_link(FakeDB(), {}, "S2", "UK", "tok12345", variant="Z")
        self.assertEqual(link, "https://www.example.test/uk/web-agencies?r=tok12345&src=mail")

    def test_test_mail_without_source(self):
        link = outreach.landing_link(FakeDB(), {}, "S2", "UK", "test", src=None)
        self.assertEqual(link, "https://www.example.test/uk/web-agencies?r=test")

    def test_no_live_page_no_link_and_cached(self):
        db, cache = FakeDB(slug=None), {}
        self.assertIsNone(outreach.landing_link(db, cache, "S2", "UK", "tok12345", variant="A"))
        self.assertIsNone(outreach.landing_link(db, cache, "S2", "UK", "tok99999", variant="A"))
        self.assertEqual(db.calls, 1)

    def test_html_button_escapes_ampersand(self):
        link = outreach.landing_link(FakeDB(), {}, "S2", "UK", "tok12345", variant="A")
        body = "Hello.\n\n" + outreach.LANDING_LINE["en"].format(url=link)
        html = outreach.html_version(body, "Footer", "en", "Acme Ltd", "the UK", link, segment="S2")
        self.assertIn("r=tok12345&amp;src=mail&amp;sv=A", html)
        self.assertNotIn(outreach.LANDING_LINE["en"].split(":")[0], html)  # Textzeile mit nacktem Link entfällt im HTML


if __name__ == "__main__":
    unittest.main()
