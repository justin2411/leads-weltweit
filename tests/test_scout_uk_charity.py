"""Quellen-Scout R38 (05.10.2026): neu registrierte Charities (Charity Commission) als S2-UK-Premium-Anlass
(Registrierung mit Datum + keine Website + Vorsitz der Trustees). Ohne Netz."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import qc, sc, segments  # noqa: E402
from extraktor.sources import uk_charity  # noqa: E402

TODAY = dt.date.today()
QUIET = lambda *_: None  # noqa: E731


def row(num, days, *, web="", phone="07985 306332", email="paws.rescue@gmail.com", status="Registered",
        linked="0", name="PAWS RESCUE TRUST", a1="16 DOLBEN AVENUE", a2="WELLINGBOROUGH", a3="Northamptonshire",
        pc="NN9 6QW", chair="SZILVIA BIRO"):
    return {
        "organisation_number": str(num), "registered_charity_number": str(num), "linked_charity_number": linked,
        "charity_name": name, "charity_type": "CIO", "charity_registration_status": status,
        "date_of_registration": f"{(TODAY - dt.timedelta(days=days)).isoformat()} 00:00:00.0000000",
        "charity_contact_address1": a1, "charity_contact_address2": a2, "charity_contact_address3": a3,
        "charity_contact_address4": "", "charity_contact_address5": "", "charity_contact_postcode": pc,
        "charity_contact_phone": phone, "charity_contact_email": email, "charity_contact_web": web,
        "charity_company_registration_number": "", "charity_activities": "Rehoming dogs.",
        "trustees": [{"name": "John Other", "chair": False}] + ([{"name": chair, "chair": True}] if chair else []),
    }


def rows():
    return [
        row(1, 3),                                   # frisch, passt
        row(2, 10, name="ELM SCHOOL PTA", chair=""),  # frisch, ohne Vorsitz
        row(3, 45),                                  # zu alt
        row(4, 3, web="www.paws.org.uk"),            # hat Website
        row(5, 3, phone=""),                         # ohne Telefon
        row(6, 3, status="Removed"),                 # nicht mehr registriert
        row(7, 3, linked="1"),                       # verbundene Unter-Charity
        row(8, -2),                                  # Datum in der Zukunft
        row(9, 3, pc="N/A"),                         # ungültige Postleitzahl
        row(10, 3, email=""),                        # ohne E-Mail
    ]


class CharityCommission(unittest.TestCase):
    def test_fresh_age(self):
        self.assertEqual(uk_charity.fresh_age(row(1, 5), TODAY), 5)
        self.assertIsNone(uk_charity.fresh_age(row(3, 45), TODAY))
        self.assertIsNone(uk_charity.fresh_age(row(6, 3, status="Removed"), TODAY))
        self.assertIsNone(uk_charity.fresh_age(row(7, 3, linked="2"), TODAY))

    def test_select_joins_only_people(self):
        ch = [row(1, 3), row(3, 45)]
        tr = [{"organisation_number": "1", "individual_or_organisation": "P", "trustee_name": "A B", "trustee_is_chair": "True"},
              {"organisation_number": "1", "individual_or_organisation": "O", "trustee_name": "X PARISH COUNCIL",
               "trustee_is_chair": "False"},
              {"organisation_number": "3", "individual_or_organisation": "P", "trustee_name": "C D", "trustee_is_chair": "True"}]
        got = uk_charity.select(ch, tr, TODAY)
        self.assertEqual([g["organisation_number"] for g in got], ["1"])
        self.assertEqual(got[0]["trustees"], [{"name": "A B", "chair": True}])

    def test_companies_keep_only_fresh_without_site_with_contact(self):
        self.assertEqual(sorted(d["registered_charity_number"] for d in uk_charity.companies(rows(), TODAY)), ["1", "2"])

    def test_address_drops_counties(self):
        self.assertEqual(uk_charity.address(row(1, 3)), ("16 DOLBEN AVENUE", "WELLINGBOROUGH"))
        r = row(1, 3, a1="DARULILM MOSQUE", a2="12 DALE STREET", a3="DEWSBURY")
        self.assertEqual(uk_charity.address(r), ("12 DALE STREET", "DEWSBURY"))
        self.assertIsNone(uk_charity.address(row(1, 3, a2="", a3="England")))

    def test_person(self):
        self.assertEqual(uk_charity.person("KATHERINE PAINE"), "Katherine Paine")
        self.assertEqual(uk_charity.person("Mr John Smith"), "John Smith")
        self.assertEqual(uk_charity.person("Alison Beswick MSc, BSc (Hons)"), "Alison Beswick")
        self.assertEqual(uk_charity.person("Tanisha, Charlene Selyer"), "")
        self.assertEqual(uk_charity.person("SMITH"), "")

    def test_candidate_and_texts(self):
        c = uk_charity.to_candidate(uk_charity.companies(rows(), TODAY)[0], TODAY)
        self.assertEqual((c["source"], c["country"]), ("charity_commission", "UK"))
        self.assertEqual((c["person_name"], c["person_role"]), ("Szilvia Biro", "Chair of Trustees"))
        self.assertEqual((c["city"], c["zip"]), ("Wellingborough", "NN9 6QW"))
        self.assertTrue(c["source_url"].endswith("/1"))
        self.assertTrue(segments.fits("S2", c)[0])
        self.assertFalse(segments.fits("S4", c)[0])
        self.assertFalse(segments.fits("S2", dict(c, email="info@paws-rescue.org.uk"))[0])
        t = segments.texts("S2", c)
        self.assertEqual(t["signal_date"], c["event_date"])
        self.assertIn("Charity Commission", t["signal"])
        self.assertNotRegex(t["opener"], r"\d+ ?%|guarantee")
        c["evidence"] = {"mx": True}
        self.assertIn(qc.run(c, "S2")["status"], ("green", "yellow"))
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)

    def test_no_chair_no_person(self):
        d = [x for x in uk_charity.companies(rows(), TODAY) if x["registered_charity_number"] == "2"][0]
        c = uk_charity.to_candidate(d, TODAY)
        self.assertEqual((c["person_name"], c["person_role"]), ("", ""))
        self.assertEqual(c["name"], "Elm School PTA")

    def test_load_newest_first_skips_known_and_overture_phones(self):
        from extraktor.sources.overture import phone_key
        with mock.patch.object(uk_charity, "cached", return_value=rows()):
            self.assertEqual([c["source_id"] for c in uk_charity.load(None, log=QUIET)], ["1", "2"])
            self.assertEqual([c["source_id"] for c in uk_charity.load(None, log=QUIET, exclude={"1"})], ["2"])
            self.assertEqual(uk_charity.load(None, log=QUIET, skip_phones={phone_key("+44 7985 306332")}), [])

    def test_premium_on_store(self):
        from extraktor import run
        from extraktor.store import _premium
        with mock.patch.object(uk_charity, "cached", return_value=rows()):
            new = uk_charity.load(None, log=QUIET)[0]
        ev = json.loads(run.dated_event({"facts": new["facts"]}))
        self.assertEqual(ev["dated_event"]["kind"], "charity_registration")
        r = {"segment": "S2", "source": "charity_commission", "signal_type": "", "signal_date": new["event_date"].isoformat(),
             "source_url": new["source_url"], "signal_evidence": json.dumps(ev), "contact_name": new["person_name"],
             "phone": new["phone"], "email": new["email"]}
        p = _premium(r)["premium"]
        self.assertEqual(p["tier"], "premium", p)
        self.assertIn("person", p["reasons"])
        self.assertEqual(_premium(dict(r, signal_evidence=""))["premium"]["tier"], "standard")


if __name__ == "__main__":
    unittest.main()
