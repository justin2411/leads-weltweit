"""Quellen-Scout R42 (05.10.2026): neu beim ICO eingetragene Verantwortliche (Register of fee payers) als
S2-UK-Premium-Anlass (Eintragung mit Datum + keine Website + Kontakt aus dem Register). Ohne Netz, erfundene Daten."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import segments  # noqa: E402
from extraktor.sources import uk_ico  # noqa: E402

TODAY = dt.date.today()
QUIET = lambda *_: None  # noqa: E731


def row(num, days, *, org="EXAMPLE BAKERY LTD", email="example.bakery@gmail.com", phone="07700 900123",
        public="N", first="", last="", trade="", a1="1 High Street", a2="", a4="Exampletown", pc="ZZ1 1AA"):
    return {"Registration_number": f"ZC{num:06d}", "Organisation_name": org, "Organisation_address_line_1": a1,
            "Organisation_address_line_2": a2, "Organisation_address_line_3": "", "Organisation_address_line_4": a4,
            "Organisation_address_line_5": "", "Organisation_postcode": pc, "Public_authority": public,
            "Start_date_of_registration": (TODAY - dt.timedelta(days=days)).isoformat(),
            "End_date_of_registration": "", "Trading_names": trade, "Payment_tier": "Tier 1",
            "DPO_or_Person_responsible_for_DP_First_name": first, "DPO_or_Person_responsible_for_DP_Last_name": last,
            "DPO_or_Person_responsible_for_DP_Email": email, "DPO_or_Person_responsible_for_DP_Phone": phone,
            "Public_register_entry_URL": f"https://ico.org.uk/ESDWebPages/Entry/ZC{num:06d}"}


def rows():
    return uk_ico.select([
        row(1, 3),
        row(2, 20, org="Mrs Jane Example", first="Jane", last="Example", trade="Jane's Cakes|"),
        row(3, 5, email="info@example-bakery.co.uk"),          # eigene Domain -> vermutlich Website
        row(4, 45),                                             # zu alt
        row(5, 2, public="Y", org="Example Parish Council"),    # Behörde
        row(6, 2, phone=""),                                    # ohne Telefon -> gar nicht im Zwischenspeicher
        row(7, 2, org="Mr John Example", last="Example"),       # Einzelunternehmer ohne Handelsnamen
        row(8, 2, pc="XX"),                                     # ungültige PLZ
    ], TODAY)


class IcoTest(unittest.TestCase):
    def test_fresh_age(self):
        self.assertEqual(uk_ico.fresh_age(row(1, 5), TODAY), 5)
        self.assertIsNone(uk_ico.fresh_age(row(1, 31), TODAY))
        self.assertIsNone(uk_ico.fresh_age(row(1, 2, public="Y"), TODAY))

    def test_select_keeps_only_fresh_with_contact(self):
        self.assertEqual(sorted(r["Registration_number"][-1] for r in rows()), ["1", "2", "3", "7", "8"])

    def test_companies_filter(self):
        got = uk_ico.companies(rows(), TODAY)
        self.assertEqual(sorted(d["Registration_number"][-1] for d in got), ["1", "2"])

    def test_sole_trader_named_after_trading_name_with_owner(self):
        d = [x for x in uk_ico.companies(rows(), TODAY) if x["Registration_number"].endswith("2")][0]
        c = uk_ico.to_candidate(d, TODAY)
        self.assertEqual(c["name"], "Jane's Cakes")
        self.assertEqual((c["person_name"], c["person_role"]), ("Jane Example", "Owner"))

    def test_company_has_no_person(self):
        d = [x for x in uk_ico.companies(rows(), TODAY) if x["Registration_number"].endswith("1")][0]
        c = uk_ico.to_candidate(d, TODAY)
        self.assertEqual((c["source"], c["country"], c["person_name"]), ("ico_register", "UK", ""))
        self.assertEqual(c["facts"]["ico_new"]["date"], (TODAY - dt.timedelta(days=3)).isoformat())
        self.assertTrue(c["source_url"].startswith("https://ico.org.uk/ESDWebPages/Entry/"))
        ok, _ = segments.fits("S2", c)
        self.assertTrue(ok)
        self.assertFalse(segments.fits("S1", c)[0])
        self.assertFalse(segments.fits("S2", dict(c, website="https://example.com"))[0])
        t = segments.texts("S2", c)
        self.assertIn("Information Commissioner", t["signal"])

    def test_load_exclude(self):
        with mock.patch.object(uk_ico, "cached", return_value=rows()):
            got = [c["source_id"][-1] for c in uk_ico.load(None, log=QUIET)]
            self.assertEqual(got, ["1", "2"])
            self.assertEqual([c["source_id"][-1] for c in uk_ico.load(None, log=QUIET, exclude={"ZC000001"})], ["2"])

    def test_premium_on_store(self):
        from extraktor import run
        from extraktor.store import _premium
        with mock.patch.object(uk_ico, "cached", return_value=rows()):
            new = uk_ico.load(None, log=QUIET)[0]
        ev = json.loads(run.dated_event({"facts": new["facts"]}))
        self.assertEqual(ev["dated_event"]["kind"], "ico_registration")
        r = {"segment": "S2", "source": "ico_register", "signal_type": "", "signal_date": new["event_date"].isoformat(),
             "source_url": new["source_url"], "signal_evidence": json.dumps(ev), "contact_name": new["person_name"],
             "phone": new["phone"], "email": new["email"]}
        self.assertEqual(_premium(r)["premium"]["tier"], "premium")
        self.assertEqual(_premium(dict(r, signal_evidence=""))["premium"]["tier"], "standard")


if __name__ == "__main__":
    unittest.main()
