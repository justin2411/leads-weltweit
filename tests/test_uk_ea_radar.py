"""Premium-Radar UK (lib/uk_ea_radar.py): neue Abfall-Beförderer laut Environment Agency + Website-Zustand.
Erfundene Firmen, example-Domains – keine echten Lead-Daten."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import release_gate as G, uk_ea_radar as E  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def reg(num="CBDL700100", name="Harbour Groundworks Ltd", day="2026-09-30", tier="Lower", typ="Company",
        postcode="YO21 1AB", renewal=""):
    return {"Registration Number": num, "Business Name": name, "Registration Tier": tier, "Applicant Type": typ,
            "Registration Date": day, "Renewal Date": renewal, "Postcode": postcode,
            "Registration Type": "Carrier, Broker, Dealer"}


class SelectTest(unittest.TestCase):
    def test_keeps_fresh_new_entries(self):
        got = E.select([reg(), reg("CBDU700200", tier="Upper")], TODAY)
        self.assertEqual([r["Registration Number"] for r in got], ["CBDL700100", "CBDU700200"])

    def test_drops_old_renewal_public_body_and_stale(self):
        rows = [reg(), reg("CBDU120000", tier="Upper"), reg("CBDL700300", typ="Public body"),
                reg("CBDL700400", day="2026-09-10"), reg("CBDL700500", day="2026-10-09"),
                reg("CBDL700600", postcode=""), reg("CBDU700700", tier="Upper", renewal="2026-09-30")]
        self.assertEqual([r["Registration Number"] for r in E.select(rows, TODAY)], ["CBDL700100"])


class MatchTest(unittest.TestCase):
    comps = [{"id": "c1", "name": "Harbour Groundworks", "address": "12 Quay Rd, Whitby, YO21 1AB"},
             {"id": "c2", "name": "Quay Cafe", "address": "14 Quay Rd, Whitby, YO21 1AB"},
             {"id": "c3", "name": "Harbour Groundworks", "address": "1 High St, York, YO1 7AA"}]

    def test_same_postcode_and_name(self):
        self.assertEqual(list(E.match([reg()], self.comps)), ["c1"])

    def test_other_postcode_or_name_no_match(self):
        self.assertEqual(E.match([reg(postcode="LS1 1AA")], self.comps), {})
        self.assertEqual(E.match([reg(name="Moor Skips Ltd")], self.comps), {})

    def test_ambiguous_company_no_match(self):
        comps = self.comps + [{"id": "c4", "name": "Harbour Groundworks Limited", "address": "YO21 1AB"}]
        self.assertEqual(E.match([reg()], comps), {})

    def test_owner_only_for_sole_trader_named_like_business(self):
        r = reg(name="peter SMITH", typ="Sole trader")
        self.assertEqual(E.owner_name(r, "Peter Smith"), "Peter Smith")
        self.assertEqual(E.owner_name(r, "Smith Skips"), "")
        self.assertEqual(E.owner_name(reg(), "Harbour Groundworks Ltd"), "")


class LeadTest(unittest.TestCase):
    def item(self, sig="website_outdated", website="https://harbour-groundworks.example.co.uk", findings=None,
             r=None):
        findings = [{"type": "website_outdated", "detail": "copyright", "value": "2015"}] if findings is None else findings
        row = {"company_id": "c1", "name": "Harbour Groundworks", "website": website, "phone_main": "+441947000000",
               "contact": {"phone": "+441947000000", "email": "hello@harbour-groundworks.example.co.uk"},
               "person": {}}
        obs, lead = E.lead_row(row, r or reg(), sig, findings, website + "/" if website else "", TODAY)
        return obs, {**lead, "id": "n1", "contact": row["contact"], "person": {},
                     "company": {"name": row["name"], "country": "UK", "city": "", "website": website,
                                 "address": "12 Quay Rd, Whitby, YO21 1AB"}}

    def test_web_finding_lead_passes_gate_and_is_premium(self):
        obs, it = self.item()
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])
        self.assertEqual(it["premium"]["tier"], "premium")
        self.assertIn("waste carrier", it["event_summary"])
        self.assertEqual(obs["details"]["dated_event"], {"kind": "waste_carrier_registration", "date": "2026-09-30"})
        self.assertTrue(it["source_url"].endswith("/registration/CBDL700100"))
        self.assertIn("Environment Agency", obs["details"]["attribution"])

    def test_no_website_lead(self):
        _, it = self.item("no_website", website="", findings=[])
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertIn("no website", it["event_summary"])
        self.assertEqual(it["premium"]["tier"], "premium")

    def test_texts_have_no_placeholders(self):
        for sig, f in (("website_outdated", None), ("no_https", [{"type": "no_https", "detail": "no_https"}])):
            _, it = self.item(sig, findings=f)
            for k in ("event_summary", "opener", "urgency_reason"):
                self.assertIsNone(G.PLACEHOLDER.search(it[k]), it[k])


if __name__ == "__main__":
    unittest.main()
