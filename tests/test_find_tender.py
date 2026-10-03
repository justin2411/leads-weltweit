"""S1/UK Find a Tender (Quellen-Scout 02.10.2026) – ohne Netz, synthetische Beispielantwort."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import qc, sc, segments  # noqa: E402
from extraktor.sources import uk_find_tender as ft  # noqa: E402

SAMPLE = json.loads((ROOT / "tests" / "fixtures" / "find_tender_award.json").read_text(encoding="utf-8"))
SINCE = dt.date(2026, 9, 1)
TODAY = dt.date(2026, 10, 2)


class Resp:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


class Session:
    def __init__(self, pages):
        self.pages, self.urls = list(pages), []

    def get(self, url, headers=None, timeout=None):
        self.urls.append(url)
        return Resp(self.pages.pop(0))


class FindTenderTests(unittest.TestCase):
    def sel(self):
        return ft.select(SAMPLE["releases"], SINCE, log=lambda *_: None)

    def test_only_uk_sme_suppliers_no_recruiters_in_window(self):
        names = [e["name"] for e in self.sel()]
        self.assertEqual(names, ["Greenleaf Landscapes Ltd"])  # nicht: large, Vermittler, Ausland, zu alt

    def test_newest_award_per_company_and_supplier_contacts_only(self):
        e = self.sel()[0]
        self.assertEqual(e["date"], "2026-09-30")
        self.assertEqual(e["awards"], 2)  # zweiter Zuschlag derselben Firma (gleiche CH-Nummer, ohne führende 0)
        self.assertEqual(e["company_number"], "01234567")
        self.assertEqual(e["email"], "info@greenleaf-landscapes.example")  # nie die Adresse des Auftraggebers
        self.assertEqual(e["buyer"], "Example Borough Council")
        self.assertNotIn("–", e["title"])

    def test_candidate_and_honest_texts_pass_signal_control(self):
        c = ft.to_candidate(self.sel()[0])
        self.assertEqual((c["source"], c["country"], c["website"]), ("find_tender", "UK", ""))
        self.assertEqual(c["facts"]["listed_website"], "https://www.greenleaf-landscapes.example")
        self.assertEqual(c["person_name"], "")  # Quelle nennt keinen Namen: nichts erfinden
        self.assertTrue(segments.fits("S1", c)[0])
        self.assertFalse(segments.fits("S2", c)[0])
        t = segments.texts("S1", c)
        self.assertIn("won a public contract", t["signal"])
        self.assertIn("Example Borough Council", t["signal"])
        self.assertNotRegex(" ".join(t[k] for k in ("signal", "company_info", "opener")).lower(),
                            r"open role|vacanc|job ad|is hiring")
        res = sc.run(c, "S1", t, today=TODAY)
        self.assertEqual(res["status"], "pass", res["problems"])
        self.assertIn("signal_too_old", " ".join(sc.run(c, "S1", t, today=TODAY + dt.timedelta(days=60))["problems"]))

    def test_qc_needs_website_for_s1_role_fallback_for_contact(self):
        c = ft.to_candidate(self.sel()[0])
        q = qc.run(c, "S1")
        self.assertIn("website", q["missing"])
        self.assertIn("contact_role_only", q["warnings"])
        # Ofcom-Dramanummer (01632 960xxx) ist absichtlich keine echte Nummer -> nie lieferbar
        self.assertIn("phone_invalid", q["blocking"])

    def test_fetch_paginates_and_respects_max_pages(self):
        page = {"releases": [{"id": "x"}], "links": {"next": "https://example.invalid/next"}}
        s = Session([page, page, page])
        rel = ft.fetch(SINCE, max_pages=2, log=lambda *_: None, session=s, pause=0)
        self.assertEqual(len(rel), 2)
        self.assertEqual(len(s.urls), 2)
        self.assertIn("stages=award", s.urls[0])

    def test_daily_cache_fetches_each_page_once_per_day(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ft.json"
            orig = ft.fetch
            calls = []
            ft.fetch = lambda since, pages, log=print: calls.append(1) or SAMPLE["releases"]
            try:
                ft.cached_fetch(SINCE, 2, log=lambda *_: None, path=path)
                ft.cached_fetch(SINCE, 2, log=lambda *_: None, path=path)
            finally:
                ft.fetch = orig
            self.assertEqual(len(calls), 1)

    def test_registry_lookup_once_per_day(self):
        import tempfile
        sys.path.insert(0, str(ROOT / "scripts" / "extraktor"))
        from extraktor import run
        calls = []
        orig = (run.uk_ch.details, run.uk_ch.owners)
        run.uk_ch.details = lambda nums, log=print: calls.append("d") or {n: {"legal_name": "X Ltd"} for n in nums}
        run.uk_ch.owners = lambda nums, log=print: calls.append("o") or {}
        try:
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / "ch.json"
                run.tender_registry({"01234567"}, path)
                info, _ = run.tender_registry({"01234567"}, path)
                run.tender_registry({"01234567", "07654321"}, path)  # neue Nummer -> neu laden
        finally:
            run.uk_ch.details, run.uk_ch.owners = orig
        self.assertEqual(info["01234567"]["legal_name"], "X Ltd")
        self.assertEqual(calls, ["d", "o", "d", "o"])

    def test_nice_name(self):
        self.assertEqual(ft.nice_name("HERTS SAMPLE CABS LIMITED LIMITED"), "Herts Sample Cabs Limited")
        self.assertEqual(ft.nice_name("Vision Example Ltd"), "Vision Example Ltd")

    def test_short_title_cuts_at_word(self):
        t = ft.short_title("Provision of " + "very long words " * 20 + "2026")
        self.assertLessEqual(len(t), ft.TITLE_MAX + 1)
        self.assertTrue(t.endswith("…"))

    def test_contracts_finder_release_normalized(self):
        # Contracts Finder (03.10.2026): Adresse als eine Zeile ohne Land, Lieferant ohne Kontaktdaten
        rel = {"ocid": "ocds-b5fd17-1", "id": "abc-1", "date": "2026-10-02T21:29:58+01:00",
               "tender": {"title": "Theatre renovation works – out of hours"},
               "buyer": {"id": "GB-CFS-1", "name": "Example Hospital Trust"},
               "parties": [{"id": "GB-CFS-1", "name": "Example Hospital Trust", "roles": ["buyer"]},
                           {"id": "GB-CFS-2", "name": "ACME BUILD LTD", "roles": ["supplier"], "details": {"scale": "sme"},
                            "identifier": {"legalName": "ACME BUILD LTD", "scheme": "GB-COH", "id": "1234567"},
                            "address": {"streetAddress": "3rd Floor Nexus House, CRAWLEY, West Sussex, RH10 9BG, UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND"}},
                           {"id": "GB-CFS-3", "name": "Abroad SARL", "roles": ["supplier"], "details": {"scale": "sme"},
                            "address": {"streetAddress": "1 rue de Paris, 75001 Paris"}}],
               "awards": [{"status": "active", "suppliers": [{"id": "GB-CFS-2"}, {"id": "GB-CFS-3"}],
                           "documents": [{"url": "https://www.contractsfinder.service.gov.uk/Notice/abc"}]}]}
        e = ft.select([ft.normalize_cf(rel)], SINCE, log=lambda *_: None)
        self.assertEqual(len(e), 1)  # ausländischer Lieferant ohne britische Postleitzahl fällt heraus
        self.assertEqual((e[0]["zip"], e[0]["company_number"], e[0]["portal"]), ("RH10 9BG", "01234567", "Contracts Finder"))
        self.assertEqual(e[0]["street"], "3rd Floor Nexus House, CRAWLEY, West Sussex")
        c = ft.to_candidate(e[0])
        self.assertEqual(c["source_url"], "https://www.contractsfinder.service.gov.uk/Notice/abc")
        self.assertIn("published on Contracts Finder", segments.texts("S1", c)["signal"])

    def test_fetch_cf_waits_once_on_rate_limit(self):
        class R429(Resp):
            status_code = 429
        class R200(Resp):
            status_code = 200
        class S:
            def __init__(self):
                self.pages = [R429({}), R200({"releases": [{"id": "x", "parties": []}], "links": {}})]
            def get(self, url, headers=None, timeout=None):
                return self.pages.pop(0)
        orig = ft.time.sleep
        ft.time.sleep = lambda *_: None
        try:
            rel = ft.fetch_cf(SINCE, 3, log=lambda *_: None, session=S())
        finally:
            ft.time.sleep = orig
        self.assertEqual(len(rel), 1)
        self.assertEqual(rel[0]["_portal"], "Contracts Finder")


if __name__ == "__main__":
    unittest.main()
