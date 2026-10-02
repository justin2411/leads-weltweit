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


class NoShadowTest(unittest.TestCase):
    """Inhaber 01.10.2026: graue Schatten ab Lead 2 auf dem iPhone (Chrome rastert box-shadow im PDF) -> nie Schatten."""

    def test_pdf_template_has_no_blurred_shadows(self):
        import re
        from lib import leadreport
        src = open(leadreport.__file__, encoding="utf-8").read()
        self.assertFalse(re.search(r"box-shadow:[^;}]*rgba", src))


if __name__ == "__main__":
    unittest.main()


class CleanCsvContactTests(unittest.TestCase):
    """Inhaber 02.10.2026: Ansprechperson-Spalten nur, wenn eine Firma sie hat."""

    def _csv(self, name="", role=""):
        import csv, io
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "contact_name", "contact_role", "address"])
        w.writeheader()
        w.writerow({"company": "A Cafe", "phone": "1", "email": "a@a.com", "contact_name": name, "contact_role": role,
                    "address": "1 Main St"})
        return buf.getvalue().encode()

    def _head(self, data):
        from lib.leadreport import clean_csv
        return clean_csv(data).decode("utf-8-sig").splitlines()[0].split(",")

    def test_empty_contact_columns_dropped(self):
        head = self._head(self._csv())
        self.assertNotIn("Contact person", head)
        self.assertNotIn("Contact role", head)
        self.assertIn("Address", head)

    def test_contact_kept_when_present(self):
        head = self._head(self._csv("Jane Doe", "Owner"))
        self.assertIn("Contact person", head)
        self.assertIn("Contact role", head)


class PlaceholderRoleTests(unittest.TestCase):
    """Inhaber 02.10.2026: „ask for the owner“ nie zeigen."""

    def test_placeholder_hidden(self):
        from lib.leadreport import real_role
        self.assertEqual(real_role("Owner (ask for the owner)"), "")
        self.assertEqual(real_role("Gérant / propriétaire (demander le responsable)"), "")
        self.assertEqual(real_role("Hiring manager (ask for the person responsible for recruiting)"), "")
        self.assertEqual(real_role("Director"), "Director")

    def test_csv_drops_placeholder_column(self):
        import csv, io
        from lib.leadreport import clean_csv
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "contact_name", "contact_role"])
        w.writeheader()
        w.writerow({"company": "A Cafe", "phone": "1", "email": "a@a.com", "contact_name": "",
                    "contact_role": "Owner (ask for the owner)"})
        out = clean_csv(buf.getvalue().encode()).decode("utf-8-sig")
        self.assertNotIn("ask for", out.lower())
        self.assertNotIn("Contact role", out)
