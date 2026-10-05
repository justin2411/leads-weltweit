"""Premium-Radar UK (lib/uk_psc_radar.py): Eigentümerwechsel laut Companies House + Website-Zustand.
Erfundene Firmen, example-Domains – keine echten Lead-Daten."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import release_gate as G, uk_psc_radar as U  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def psc(notified=None, ceased=None, kind="individual-person-with-significant-control", first="jane", last="DOE"):
    return {"notified_on": notified, "ceased_on": ceased, "kind": kind,
            "name_elements": {"forename": first, "surname": last}}


class EventTest(unittest.TestCase):
    def test_new_owner_is_event_with_person(self):
        ev = U.event_of([psc("2026-09-28"), psc("2016-01-01", "2026-09-28", first="old", last="owner")],
                        dt.date(2010, 5, 1), TODAY)
        self.assertEqual(ev["date"], dt.date(2026, 9, 28))
        self.assertEqual((ev["added"], ev["ceased"]), (1, 1))
        self.assertEqual(ev["person"], "Jane Doe")

    def test_initial_notification_of_new_company_is_no_change(self):
        self.assertIsNone(U.event_of([psc("2026-09-20")], dt.date(2026, 9, 1), TODAY))

    def test_too_old_or_future_is_no_event(self):
        self.assertIsNone(U.event_of([psc("2026-08-01")], dt.date(2010, 1, 1), TODAY))
        self.assertIsNone(U.event_of([psc("2026-10-09")], dt.date(2010, 1, 1), TODAY))

    def test_corporate_owner_has_no_person(self):
        ev = U.event_of([psc("2026-09-30", kind="corporate-entity-person-with-significant-control")],
                        dt.date(2001, 1, 1), TODAY)
        self.assertEqual(ev["person"], "")
        self.assertEqual(ev["people"], [])

    def test_postcode(self):
        self.assertEqual(U.postcode("12 Quay Rd, Whitby, yo21 1ab"), "YO211AB")
        self.assertEqual(U.postcode("no postcode"), "")


class LeadTest(unittest.TestCase):
    def row(self, website="https://harbour-bakery.example.co.uk"):
        return {"company_id": "c1", "name": "Harbour Bakery", "website": website, "phone_main": "+441947000000",
                "contact": {"phone": "+441947000000", "email": "hello@harbour-bakery.example.co.uk"}, "person": {}}

    def item(self, sig="website_outdated", website="https://harbour-bakery.example.co.uk", findings=None):
        ev = U.event_of([psc("2026-09-28")], dt.date(2012, 3, 1), TODAY)
        findings = [{"type": "website_outdated", "detail": "copyright", "value": "2015"}] if findings is None else findings
        r = self.row(website)
        obs, lead = U.lead_row(r, ev, "01234567", sig, findings, website + "/" if website else "", TODAY)
        return obs, {**lead, "id": "n1", "contact": r["contact"], "person": {"name": "Jane Doe"},
                     "company": {"name": r["name"], "country": "UK", "city": "", "website": website,
                                 "address": "12 Quay Rd, Whitby, YO21 1AB"}}

    def test_web_finding_lead_passes_gate_and_is_premium(self):
        obs, it = self.item()
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])
        self.assertEqual(it["premium"]["tier"], "premium")
        self.assertIn("Companies House", it["event_summary"])
        self.assertIn("Jane Doe", it["event_summary"])
        self.assertEqual(obs["key"], "psc_change")
        self.assertEqual(obs["details"]["dated_event"], {"kind": "psc_change", "date": "2026-09-28"})
        self.assertTrue(it["source_url"].endswith("/company/01234567/persons-with-significant-control"))

    def test_no_https_and_not_mobile(self):
        for sig, f in (("no_https", {"type": "no_https", "detail": "no_https"}),
                       ("website_not_mobile", {"type": "website_not_mobile", "detail": "no_viewport"})):
            _, it = self.item(sig, findings=[f])
            self.assertEqual(G.stage1(it, TODAY), [], sig)

    def test_no_website_lead(self):
        _, it = self.item("no_website", website="", findings=[])
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertIn("no website", it["event_summary"])
        self.assertEqual(it["premium"]["tier"], "premium")

    def test_texts_have_no_placeholders(self):
        _, it = self.item()
        for k in ("event_summary", "opener", "urgency_reason"):
            self.assertIsNone(G.PLACEHOLDER.search(it[k]), it[k])


if __name__ == "__main__":
    unittest.main()
