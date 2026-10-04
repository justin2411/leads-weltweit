import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from brain import content_for, page_decisions, safety_checks  # noqa: E402


def v(key, views, req, vid=None):
    return {"page_id": "p1", "slug": "uk/web-agencies", "segment_id": "S2", "country": "UK", "variant_id": vid or key, "variant_key": key, "views": views,
            "sample_requests": req, "page_status": "live", "variant_status": "live"}


class BrainTest(unittest.TestCase):
    def test_safety(self):
        self.assertEqual(safety_checks(100, 2, 0, []), [])
        self.assertTrue(safety_checks(100, 6, 0, []))
        self.assertTrue(safety_checks(10, 0, 1, []))
        self.assertTrue(safety_checks(0, 0, 0, [{"status": "rejected"}] * 3))
        self.assertEqual(safety_checks(10, 5, 0, []), [])  # zu wenig Mails für die Quote

    def test_pages(self):
        self.assertEqual(page_decisions([v("A", 120, 1)])[0]["kind"], "info")
        self.assertEqual(page_decisions([v("A", 400, 4)])[0]["kind"], "variant")      # 1 % < 2 %
        self.assertEqual(page_decisions([v("A", 400, 12)]), [])                        # 3 %: nichts tun
        d = page_decisions([v("A", 400, 20), v("B", 400, 10)])[0]
        self.assertEqual((d["kind"], d["winner"]), ("winner", "A"))
        self.assertEqual(page_decisions([v("A", 400, 12), v("B", 400, 11)]), [])       # kein klarer Gewinner

    def test_tests_nur_webagenturen_us_uk_fr(self):
        """Inhaber 04.10.2026: A/B nur Webagenturen US/UK/FR – andere Seiten bekommen keine Varianten/Gewinner."""
        other = [dict(v("A", 400, 4), slug="us/accountants", segment_id="S5", country="US")]
        self.assertEqual(page_decisions(other), [])
        ie = [dict(v("A", 400, 4), slug="ie/web-agencies", country="IE")]
        self.assertEqual(page_decisions(ie), [])
        fr = [dict(v("A", 400, 4), slug="fr/agences-web", country=None)]  # Land aus dem Slug
        self.assertEqual(page_decisions(fr)[0]["kind"], "variant")
        self.assertEqual(page_decisions([v("A", 400, 4)], scope=([], [])), [])

    def test_freigabe_liste_gespiegelt(self):
        """config/fokus.yaml tests = app/lib/ops-config.json tests (App und Skripte lesen dieselbe Liste)."""
        import json
        from lib.fokus import test_scope
        root = Path(__file__).resolve().parents[1]
        segs, countries = test_scope()
        self.assertEqual((segs, countries), (["S2"], ["US", "UK", "FR"]))
        app = json.loads((root / "app" / "lib" / "ops-config.json").read_text(encoding="utf-8"))["tests"]
        self.assertEqual(app, {"segmente": segs, "laender": countries})

    def test_content(self):
        slug, data = content_for("S1")
        self.assertEqual(slug, "recruitment")
        self.assertIn("headline", data["en"])


if __name__ == "__main__":
    unittest.main()
