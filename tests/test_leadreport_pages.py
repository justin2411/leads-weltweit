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
        # Deckblatt mit Übersicht, dann 4/3/3 Karten (Inhaber 02.10.2026: Freiräume nutzen)
        self.assertEqual(per_page(build_html(self.raw, "en", layout=(0, 4), segment="S5", country="US")), [4, 3, 3])

    def test_never_single_lead_on_last_page(self):
        for layout in ((0, 4), (0, 3), (0, 2)):
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


class IntroPromiseTests(unittest.TestCase):
    """Inhaber 02.10.2026: „who to ask for“ nur, wenn eine Ansprechperson im Report steht."""

    def _html(self, name):
        import csv, io
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "contact_name", "contact_role", "address"])
        w.writeheader()
        w.writerow({"company": "A Cafe", "phone": "1", "email": "a@a.com", "contact_name": name,
                    "contact_role": "Owner (ask for the owner)", "address": "1 Main St"})
        return build_html(buf.getvalue().encode(), "en", plans=[{"key": "starter", "amount_cents": 12900}], country="US")

    def test_no_contact_no_promise(self):
        self.assertNotIn("who to ask for", self._html(""))

    def test_named_contact_keeps_promise(self):
        self.assertIn("who to ask for", self._html("Jane Doe"))


class UsTemplateDataTests(unittest.TestCase):
    """US-Vorlage des Inhabers (02.10.2026): Daten ohne Platzhalter, mit allen Leads."""

    def test_report_data(self):
        import csv, io
        from lib.leadreport_tpl import report_data
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "location", "event", "event_date", "signal",
                                            "industry", "address", "contact_name", "contact_role"])
        w.writeheader()
        w.writerow({"company": "A Cafe", "phone": "+15550000000", "email": "a@a.com", "location": "Austin, TX",
                    "event": "A Cafe has no website: it is listed with a phone number and a Facebook page.",
                    "event_date": "2026-10-02", "signal": "no_website", "industry": "Cafe", "address": "1 Main St",
                    "contact_role": "Owner (ask for the owner)"})
        d = report_data(buf.getvalue().encode(), "US", plans=[{"key": "starter", "name": "Starter", "amount_cents": 12900,
                                                         "currency": "usd"}], segment="S2")
        self.assertEqual(len(d["leads"]), 1)
        lead = d["leads"][0]
        self.assertEqual(lead["contact"], "")
        self.assertEqual((lead["state"], lead["reasonType"]), ("TX", "nosite"))
        self.assertTrue(lead["online"]["facebook"])
        self.assertNotIn("Who to ask for", [x["text"] for x in d["cover"]["inEveryLead"]])
        self.assertEqual(d["closing"]["plans"][0]["price"], "$129")


class TemplateCountryTests(unittest.TestCase):
    """Vorlage für sechs Länder: Region aus der Postleitzahl, Sprache wie die Lead-Texte."""

    def test_regions(self):
        from lib.report_regions import region_of
        self.assertEqual(region_of("UK", "Hoyland Road, Barnsley, S74 0LT"), "Yorkshire and the Humber")
        self.assertEqual(region_of("UK", "116 Western Road, Kilmarnock, KA3 1LA"), "Scotland")
        self.assertEqual(region_of("FR", "6 bis Chem. des Cougoulins, Antibes, 06600"), "Provence-Alpes-Côte d'Azur")
        self.assertEqual(region_of("BE", "Rue du Pont 13, Thuin, 6530"), "Hainaut")
        self.assertEqual(region_of("NL", "Nieuwstraat 58, Oostburg, 4501 BE"), "Zeeland")
        self.assertEqual(region_of("IE", "Main Street, Mallow, Co. Cork"), "Cork")

    def test_language_and_map(self):
        import csv, io
        from lib.leadreport_tpl import report_data
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "location", "event", "event_date", "signal",
                                            "industry", "address"])
        w.writeheader()
        w.writerow({"company": "A", "phone": "1", "email": "a@a.fr", "location": "Strasbourg", "event": "x",
                    "event_date": "2026-10-02", "signal": "no_website", "industry": "Cafe",
                    "address": "4 Boulevard Leblois, Strasbourg, 67000"})
        fr = report_data(buf.getvalue().encode(), "FR", segment="S2")
        self.assertEqual((fr["report"]["map"], fr["report"]["lang"]), ("fr", "fr"))
        self.assertEqual(fr["leads"][0]["region"], "Grand Est")
        nl = report_data(buf.getvalue().encode(), "NL", segment="S2")
        self.assertEqual(nl["report"]["map"], "nl")
        self.assertTrue(nl["report"]["lang"].startswith("en"))
        self.assertNotIn("demo", fr["report"])
