import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from brain import content_for, page_decisions, safety_checks  # noqa: E402


def v(key, views, req, vid=None):
    return {"page_id": "p1", "slug": "uk/recruitment", "variant_id": vid or key, "variant_key": key, "views": views,
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

    def test_content(self):
        slug, data = content_for("S1")
        self.assertEqual(slug, "recruitment")
        self.assertIn("headline", data["en"])


if __name__ == "__main__":
    unittest.main()
