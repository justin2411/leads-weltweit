"""Wertrechnung (Inhaber 04.10.2026): Lead-Karte mit Beleg und Alter, Seite „Was ein Kunde wert ist“ im Probe-PDF,
Landing-Variante value_block. Nur Zahlen aus docs/PREMIUM-WERT.md, nur S2 US/UK/FR."""
import csv
import datetime as dt
import io
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from deliveries import CSV_HEADER  # noqa: E402
from lib import ab, premium_wert as W  # noqa: E402
from lib.leadreport_tpl import report_data  # noqa: E402

CASES = json.loads((ROOT / "tests" / "fixtures" / "premium_wert_cases.json").read_text(encoding="utf-8"))
PLANS = [{"key": "starter", "name": "Starter", "amount_cents": 12900, "currency": "usd"},
         {"key": "pro", "name": "Pro", "amount_cents": 24900, "currency": "usd"}]


def _csv(n=1, **over):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_HEADER)
    w.writeheader()
    for i in range(n):
        row = {"company": f"Example {i} Ltd", "phone": "+15125550100", "email": f"info@ex{i}.test", "website": f"ex{i}.test",
               "location": "Austin, TX", "event": "Website check found an issue.", "event_date": "2026-09-29",
               "signal": "website_broken", "opening_line": "Your site does not load on phones.", "source": "Website check",
               "checked_on": "2026-10-04", "industry": "Plumbing", "address": "1 Example Rd", "contact_name": "Alex Example",
               "contact_role": "Director", "source_url": "https://explore.overturemaps.org/#x", "contact_source": "Companies House"}
        row.update(over)
        w.writerow(row)
    return buf.getvalue().encode()


class Rechnung(unittest.TestCase):
    def test_gemeinsame_faelle(self):
        for c in CASES["geld"]:
            self.assertEqual(W.geld(c["x"], c["sym"], c["lang"]), c["out"], c)
        for c in CASES["rechnung"]:
            self.assertEqual(W.rechnung(W.land("S2", c["country"]), c["plans"]), c["out"], c["country"])

    def test_nur_s2_us_uk_fr(self):
        self.assertIsNotNone(W.land("S2", "uk"))
        for seg, cc in (("S1", "US"), ("S2", "DE"), ("S2", "IE"), (None, "US")):
            self.assertIsNone(W.land(seg, cc))
            self.assertIsNone(W.seite(seg, cc, PLANS))

    def test_monate_wie_premium_wert(self):
        doc = (ROOT / "docs" / "PREMIUM-WERT.md").read_text(encoding="utf-8")
        self.assertIn("US 41 / 21 Monate (Starter / Pro), UK 33 / 17, FR 31 / 16", doc)
        got = {cc: W.rechnung(W.land("S2", cc), PLANS)["monate"] for cc in ("US", "UK", "FR")}
        self.assertEqual(got, {"US": {"starter": 41, "pro": 21}, "UK": {"starter": 33, "pro": 17},
                               "FR": {"starter": 31, "pro": 16}})

    def test_seite_kennzeichnet_beispiel(self):
        en, fr = W.seite("S2", "US", PLANS), W.seite("S2", "FR", PLANS)
        self.assertIn("not a promise", en["exampleTitle"])
        self.assertIn("pas une promesse", fr["exampleTitle"])
        self.assertTrue(fr["example"].startswith("Imaginons"))
        self.assertEqual(W.seite("S2", "UK", PLANS)["proof"], [])  # UK-Spanne ist nicht geprüft → nicht zeigen
        self.assertTrue(W.seite("S2", "UK", PLANS)["noProof"])
        for d in (en, fr):
            txt = json.dumps(d, ensure_ascii=False).lower()
            for w in ("guarant", "garanti", "exclusi"):
                self.assertNotIn(w, txt)

    def test_ohne_preise_keine_seite(self):
        self.assertIsNone(W.seite("S2", "US", None))
        self.assertIsNone(W.seite("S2", "US", PLANS[:1]))


class LeadKarte(unittest.TestCase):
    def test_alter(self):
        h = dt.date(2026, 10, 5)
        self.assertEqual(W.alter("2026-10-05", h, "en"), "today")
        self.assertEqual(W.alter("2026-10-04", h, "en"), "1 day ago")
        self.assertEqual(W.alter("2026-09-29", h, "fr"), "il y a 6 jours")
        self.assertEqual(W.alter("2026-10-06", h, "en"), "")
        self.assertEqual(W.alter("", h, "en"), "")

    def test_beleg(self):
        b = W.beleg("website_broken", "ex.test", "https://explore.overturemaps.org/#x", "2026-10-04", "en")
        self.assertEqual((b["url"], b["label"], b["checked"]), ("https://ex.test", "ex.test", "checked 4 Oct 2026"))
        b = W.beleg("no_website", "", "https://explore.overturemaps.org/#x", "2026-10-04", "fr")
        self.assertEqual((b["label"], b["checked"]), ("explore.overturemaps.org", "vérifié le 4 oct. 2026"))
        self.assertIsNone(W.beleg("new_incorporation", "", "", "2026-10-04", "en"))
        self.assertIsNone(W.beleg("new_incorporation", "", "javascript:alert(1)", "", "en"))

    def test_report_data_probe(self):
        d = report_data(_csv(), "US", PLANS, None, "S2", dt.date(2026, 10, 5))
        L = d["leads"][0]
        self.assertEqual(L["detectedAge"], "6 days ago")
        self.assertEqual(L["evidence"]["url"], "https://ex0.test")
        self.assertEqual(L["contactSource"], "Companies House")
        self.assertEqual(L["opener"], "Your site does not load on phones.")
        self.assertEqual(d["value"]["title"], "What one client is worth")

    def test_report_data_lieferung_ohne_wertseite(self):
        d = report_data(_csv(), "US", None, None, "S2", dt.date(2026, 10, 5))
        self.assertNotIn("value", d)
        d = report_data(_csv(), "US", PLANS, None, "S1", dt.date(2026, 10, 5))
        self.assertNotIn("value", d)

    def test_alte_csv_ohne_neue_spalten(self):
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["company", "phone", "email", "event", "event_date", "signal", "address"])
        w.writeheader()
        w.writerow({"company": "A Cafe", "phone": "1", "email": "a@a.test", "event": "x", "event_date": "2026-10-01",
                    "signal": "no_website", "address": "1 Main St"})
        L = report_data(buf.getvalue().encode(), "US", PLANS, None, "S2", dt.date(2026, 10, 5))["leads"][0]
        self.assertNotIn("evidence", L)
        self.assertNotIn("contactSource", L)

    def test_csv_spalten(self):
        self.assertEqual(CSV_HEADER[-2:], ["source_url", "contact_source"])


class Variante(unittest.TestCase):
    def test_ab_element_value_block(self):
        self.assertEqual(ab.check_value("landing", "value_block", "an"), [])
        self.assertTrue(ab.check_value("landing", "value_block", "ja"))
        self.assertEqual(ab.check_test("landing", "S2", "US", "value_block", "an", None,
                                       "Wertrechnung auf der Seite bringt mehr Probe-Anfragen", (["S2"], ["US", "UK", "FR"])), [])
        self.assertTrue(ab.check_test("landing", "S2", "IE", "value_block", "an", None,
                                      "Wertrechnung auf der Seite bringt mehr Probe-Anfragen", (["S2"], ["US", "UK", "FR"])))

    def test_migration_erlaubt_element(self):
        sql = (ROOT / "supabase" / "migrations" / "20261005100000_signalwerk_wertblock.sql").read_text(encoding="utf-8")
        self.assertIn("'value_block'", sql)
        self.assertNotRegex(sql.lower(), r"drop\s+(table|column)|delete\s+from|truncate")


if __name__ == "__main__":
    unittest.main()
