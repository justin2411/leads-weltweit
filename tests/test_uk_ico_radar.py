"""Premium-Radar UK (lib/uk_ico_radar.py): neu beim ICO eingetragene Firmen aus dem Bestand + Website-Zustand.
Erfundene Firmen, example-Domains – keine echten Lead-Daten."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from extraktor.sources import uk_ico as U  # noqa: E402
from lib import release_gate as G, uk_ico_radar as R  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def reg(num="ZC123456", name="HARBOUR GROUNDWORKS LTD", trading="", day="2026-09-30", postcode="YO21 1AB",
        authority="N"):
    return {"Registration_number": num, "Organisation_name": name, "Trading_names": trading,
            "Organisation_postcode": postcode, "Start_date_of_registration": day, "Payment_tier": "Tier 1",
            "Public_authority": authority,
            "Public_register_entry_URL": f"https://ico.org.uk/ESDWebPages/Entry/{num}",
            "DPO_or_Person_responsible_for_DP_Email": "someone@example.com",
            "DPO_or_Person_responsible_for_DP_Phone": "01947 000000"}


class RadarRowsTest(unittest.TestCase):
    def test_only_fresh_company_fields(self):
        rows = [reg(), reg("ZC2", day="2026-09-10"), reg("ZC3", postcode=""), reg("ZC4", authority="Y")]
        got = U.radar_rows(rows, TODAY)
        self.assertEqual([r["Registration_number"] for r in got], ["ZC123456"])
        self.assertNotIn("DPO_or_Person_responsible_for_DP_Email", got[0])
        self.assertNotIn("DPO_or_Person_responsible_for_DP_Phone", got[0])


class SelectTest(unittest.TestCase):
    def test_keeps_fresh_drops_stale_future_authority_duplicates(self):
        rows = [reg(), reg(), reg("ZC2", day="2026-09-10"), reg("ZC3", day="2026-10-09"),
                reg("ZC4", authority="Y"), reg("ZC5", postcode="")]
        self.assertEqual([r["Registration_number"] for r in R.select(rows, TODAY)], ["ZC123456"])


class MatchTest(unittest.TestCase):
    comps = [{"id": "c1", "name": "Harbour Groundworks", "address": "12 Quay Rd, Whitby, YO21 1AB"},
             {"id": "c2", "name": "Quay Cafe", "address": "14 Quay Rd, Whitby, YO21 1AB"},
             {"id": "c3", "name": "Harbour Groundworks", "address": "1 High St, York, YO1 7AA"}]

    def test_same_postcode_and_name(self):
        self.assertEqual(list(R.match([reg()], self.comps)), ["c1"])

    def test_trading_name_matches(self):
        r = reg(name="Mr John Example", trading="Quay Cafe|Example Catering")
        self.assertEqual(list(R.match([r], self.comps)), ["c2"])

    def test_other_postcode_or_name_no_match(self):
        self.assertEqual(R.match([reg(postcode="LS1 1AA")], self.comps), {})
        self.assertEqual(R.match([reg(name="Moor Skips Ltd")], self.comps), {})

    def test_ambiguous_no_match(self):
        comps = self.comps + [{"id": "c4", "name": "Harbour Groundworks Limited", "address": "YO21 1AB"}]
        self.assertEqual(R.match([reg()], comps), {})
        self.assertEqual(R.match([reg(), reg("ZC9")], self.comps), {})


class LeadTest(unittest.TestCase):
    def item(self, sig="website_outdated", website="https://harbour-groundworks.example.co.uk", findings=None):
        findings = [{"type": "website_outdated", "detail": "copyright", "value": "2015"}] if findings is None else findings
        row = {"company_id": "c1", "name": "Harbour Groundworks", "website": website, "phone_main": "+441947000000",
               "contact": {"phone": "+441947000000", "email": "hello@harbour-groundworks.example.co.uk"},
               "person": {}}
        obs, lead = R.lead_row(row, reg(), sig, findings, website + "/" if website else "", TODAY)
        return obs, {**lead, "id": "n1", "contact": row["contact"], "person": {},
                     "company": {"name": row["name"], "country": "UK", "city": "", "website": website,
                                 "address": "12 Quay Rd, Whitby, YO21 1AB"}}

    def test_web_finding_lead_passes_gate_and_is_premium(self):
        obs, it = self.item()
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])
        self.assertEqual(it["premium"]["tier"], "premium")
        self.assertIn("ICO", it["event_summary"])
        self.assertEqual(obs["details"]["dated_event"], {"kind": "ico_registration", "date": "2026-09-30"})
        self.assertTrue(it["source_url"].endswith("/Entry/ZC123456"))
        self.assertNotIn("someone@example.com", str(obs))

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
