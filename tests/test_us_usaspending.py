"""S1/US aus USAspending.gov (Quellen-Scout 04.10.2026): neue Bundesaufträge an kleine US-Firmen."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import segments, store  # noqa: E402
from extraktor.sources import us_usaspending as us  # noqa: E402

TODAY = dt.date.today()


def row(name="ACME WIDGETS LLC", desc="LABORATORY COURIER SERVICES", naics="492110",
        label="COURIERS AND EXPRESS DELIVERY SERVICES", days=3, uei="ABC123DEF456", state="TX"):
    return {"Recipient Name": name, "Recipient UEI": uei, "Base Obligation Date": (TODAY - dt.timedelta(days=days)).isoformat(),
            "Award Amount": 250000.0, "Awarding Agency": "Department of Veterans Affairs",
            "Awarding Sub Agency": "Office of Procurement Operations", "Description": desc,
            "generated_internal_id": "CONT_AWD_36C1_3600_-NONE-_-NONE-",
            "Recipient Location": {"location_country_code": "USA", "state_code": state, "city_name": "FORT WORTH",
                                   "address_line1": "100 MAIN ST STE 5", "zip5": "76102"},
            "NAICS": {"code": naics, "description": label}}


class UsaSpendingTests(unittest.TestCase):
    def test_select_keeps_new_small_business_award(self):
        got = us.select([row()], TODAY - dt.timedelta(days=30), log=lambda *_: None)
        self.assertEqual(len(got), 1)
        e = got[0]
        self.assertEqual((e["state"], e["zip"], e["city"]), ("TX", "76102", "Fort Worth"))
        self.assertEqual(e["agency"], "Department of Veterans Affairs")  # oberste Behörde, nicht die Unterstelle
        self.assertEqual(e["naics_label"], "couriers and express delivery services")

    def test_renewals_recruiters_jv_and_old_are_dropped(self):
        rows = [row(desc="FUND OY4 FY27 NATIONAL CEMETERY INSCRIPTION SERVICES", uei="A1"),
                row(desc="OPTION THREE: OFF-SITE CANCER REGISTRY SERVICES", uei="A2"),
                row(name="BEST STAFFING INC", uei="A3"),
                row(naics="561320", label="TEMPORARY HELP SERVICES", uei="A4"),
                row(name="SAWTOOTH CONSTRUCTION JV II LLC", uei="A5"),
                row(days=60, uei="A6")]
        self.assertEqual(us.select(rows, TODAY - dt.timedelta(days=30), log=lambda *_: None), [])

    def test_newest_award_per_company(self):
        got = us.select([row(days=5), row(days=2, desc="CONFERENCE ROOM UPGRADE")], TODAY - dt.timedelta(days=30),
                        log=lambda *_: None)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["awards"], 2)
        self.assertEqual(got[0]["date"], (TODAY - dt.timedelta(days=2)).isoformat())

    def test_candidate_and_honest_texts(self):
        c = us.to_candidate(us.select([row()], None, log=lambda *_: None)[0])
        self.assertEqual((c["source"], c["country"], c["website"], c["email"]), ("us_award", "US", "", ""))
        self.assertTrue(c["source_url"].startswith("https://www.usaspending.gov/award/"))
        ok, _ = segments.fits("S1", c)
        self.assertTrue(ok)
        self.assertFalse(segments.fits("S2", c)[0])
        t = segments.texts("S1", c)
        self.assertIn(c["name"], t["signal"])
        self.assertIn("new federal contract", t["signal"])
        self.assertNotIn("open role", t["signal"])  # keine Stelle behauptet
        self.assertNotIn("$", t["signal"] + t["opener"] + t["company_info"])  # keine Beträge
        self.assertEqual(store.signal_type("S1", "us_award"), "contract_award")
        self.assertIn("USAspending", store.SOURCE_NAME["us_award"])

    def test_short_title_cleans_or_rejects(self):
        self.assertEqual(us.short_title("BOILER MAINTENANCE SERVICES EO 14398"), "Boiler Maintenance Services")
        self.assertEqual(us.short_title("PRICING PERIOD 3"), "")
        self.assertEqual(us.short_title("KESTREL TO 3"), "")
        t = us.short_title("&quot;SAP HANA&quot; HARDWARE REFRESH�")
        self.assertNotIn("&quot;", t)
        self.assertNotIn("�", t)

    def test_request_body_filters(self):
        b = us._body(TODAY - dt.timedelta(days=30), TODAY, 2)
        f = b["filters"]
        self.assertEqual(f["time_period"][0]["date_type"], "new_awards_only")
        self.assertEqual(f["recipient_type_names"], ["small_business"])
        self.assertEqual(f["award_amounts"][0]["lower_bound"], us.MIN_AMOUNT)
        self.assertEqual(b["page"], 2)


if __name__ == "__main__":
    unittest.main()
