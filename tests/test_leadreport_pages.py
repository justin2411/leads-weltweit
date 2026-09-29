import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.leadreport import build_html  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def per_page(html: str) -> list[int]:
    pages = html.split('<section class="pg">')[1:]
    return [p.count('<article class="lead">') for p in pages if '<article class="lead">' in p]


class PagesTest(unittest.TestCase):
    def setUp(self):
        self.raw = (ROOT / "samples/S5/US/leads.csv").read_bytes()

    def test_ten_leads_on_three_pages(self):
        self.assertEqual(per_page(build_html(self.raw, "en", layout=(3, 4), segment="S5", country="US")), [3, 4, 3])

    def test_never_single_lead_on_last_page(self):
        for layout in ((3, 3), (2, 3), (2, 2), (3, 4)):
            counts = per_page(build_html(self.raw, "en", layout=layout, segment="S5", country="US"))
            self.assertEqual(sum(counts), 10)
            self.assertGreater(counts[-1], 1, (layout, counts))


if __name__ == "__main__":
    unittest.main()
