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


class SampleSizeTest(unittest.TestCase):
    def test_sample_needs_exactly_ten_companies(self):
        import csv
        import io
        from lib import leadreport
        raw = (ROOT / "samples/S5/US/leads.csv").read_bytes()
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        rows[1]["company"] = rows[0]["company"]  # 10 Zeilen, aber nur 9 Firmen
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
        nine = buf.getvalue().encode()
        orig = leadreport.complete_only
        leadreport.complete_only = lambda data, segment=None: data
        try:
            self.assertEqual(len(leadreport.group_rows(nine)), 9)
            self.assertEqual(leadreport.attachments(nine, "en", sample=True, segment="S5", country="US"), [])
        finally:
            leadreport.complete_only = orig
        self.assertEqual(leadreport.SAMPLE_SIZE, 10)



class LocalCurrencyTest(unittest.TestCase):
    """Echter Probe-Test 01.10.2026: US-Probe zeigte £129 statt $129."""

    def test_plans_use_currency_of_lead_country(self):
        from lib.leadreport import _money, local_plans
        plans = [{"key": "starter", "amount_cents": 12900, "currency": "gbp"}]
        self.assertEqual(_money(local_plans(plans, "US")[0]), "$129")
        self.assertEqual(_money(local_plans(plans, "FR")[0]), "129 €")
        self.assertEqual(_money(local_plans(plans, "UK")[0]), "£129")
        self.assertEqual(plans[0]["currency"], "gbp")  # Original unverändert


if __name__ == "__main__":
    unittest.main()
