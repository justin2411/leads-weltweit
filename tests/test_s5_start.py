"""Branchen-Test S5 (Buchhaltung) US/UK: Kaltmail 1:1 nach docs/KALTMAIL-VORLAGE.md, Prüfung lint_draft grün."""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from drafts import S5_FIRST, build, word_count  # noqa: E402
from lib.rules import lint_draft  # noqa: E402


class S5MailTests(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("SENDER_NAME", "Justin Test")

    def mail(self, country, name):
        return build({"segment_id": "S5", "country": country, "company_name": name,
                      "specialization": "accountant", "region": ""})

    def test_lint_green_and_template(self):
        for country, name in (("UK", "Brightledger Accounting Ltd"), ("US", "Brightledger Accounting LLC")):
            subject, body, lang = self.mail(country, name)
            res = lint_draft(subject, body, lang)
            self.assertFalse(res.errors, (country, res.summary()))
            self.assertLessEqual(len(subject), 60)
            self.assertTrue(70 <= word_count(body) <= 120)
            self.assertIn(S5_FIRST[country], body)
            # Bausteine 3, 5, 6 wörtlich wie S2 (Vorlage §3: nur Satz 1 und Käufer ändern sich)
            self.assertTrue(body.startswith("Hi Brightledger Accounting team,"))
            self.assertIn("Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, "
                          "who to ask for and an opening line.", body)
            land = "the UK" if country == "UK" else "the US"
            self.assertIn(f"I've put together a free sample of 10 current leads from across {land}. "
                          "Shall I send it over?", body)
            # Vorlage §2: keine Exklusivitätszusage, kein „the contact person“
            self.assertNotIn("one practice only", body)
            self.assertNotIn("contact person", body)

    def test_other_countries_unchanged(self):
        # FR und übrige Länder behalten den bisherigen Text (kein S5-Satz)
        _, body, _ = build({"segment_id": "S5", "country": "IE", "company_name": "Ledger Ltd",
                            "specialization": "", "region": ""})
        self.assertNotIn("incorporated in recent weeks", body)


class QuerTests(unittest.TestCase):
    def test_uk_from_s4_and_s9(self):
        from premium_quer import uk_lead
        a = uk_lead({"event_summary": "Sterinova Medical LTD (company no. 17480406) was incorporated on "
                                      "25 September 2026 – repair of machinery."})
        self.assertEqual(a["event_summary"], "Sterinova Medical LTD (company no. 17480406) was incorporated on "
                                             "25 September 2026 – repair of machinery.")
        self.assertIn("bookkeeping, VAT and first year-end", a["opener"])
        b = uk_lead({"event_summary": "Ricky Owen – owner of All Roofing And Lead Work LTD, incorporated on "
                                      "30 September 2026 (company no. 17490832)."})
        self.assertEqual(b["event_summary"], "All Roofing And Lead Work LTD (company no. 17490832) was incorporated "
                                             "on 30 September 2026.")
        self.assertIsNone(uk_lead({"event_summary": "something else"}))

    def test_us_needs_drivers(self):
        from premium_quer import us_lead
        base = {"event_summary": "Gillens & Company LLC (USDOT 8517357), registered on October 3, 2026, has no "
                                 "company website: its contact email is a gmail.com address."}
        prof = ("Gillens & Company LLC is a for-hire interstate carrier based in Irmo, SC, registered with the US DOT "
                "on October 3, 2026 (USDOT 8517357). Fleet: 1 power unit and 4 drivers, hauling general freight.")
        r = us_lead(base, prof)
        self.assertEqual(r["signal_type"], "new_company")
        self.assertIn("as a for-hire interstate carrier with 1 power unit and 4 drivers", r["event_summary"])
        self.assertIn("with 4 drivers starting out", r["opener"])
        self.assertIsNone(us_lead(base, prof.replace("4 drivers", "0 drivers")))
        self.assertIsNone(us_lead(base, "no fleet info"))


if __name__ == "__main__":
    unittest.main()
