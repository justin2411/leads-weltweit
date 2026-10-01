"""Extraktor (Inhaber 01.10.2026): Quellen, Qualitätskontrolle, Signalkontrolle, Sicherheitsfilter – ohne Netz."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import filters, qc, sc, segments  # noqa: E402
from extraktor.model import title_case  # noqa: E402
from extraktor.sources import fmcsa, formd  # noqa: E402

TODAY = dt.date.today()
REG = (TODAY - dt.timedelta(days=3)).strftime("%Y%m%d")

FMCSA_ROW = {
    "dot_number": "4567890", "add_date": REG, "status_code": "A", "legal_name": "J3K TRANSPORT LLC",
    "company_officer_1": "JODENE KARLOFF", "phone": "4023808581", "email_address": "INFO@J3KTRANSPORT.COM",
    "phy_street": "123 MAIN ST", "phy_city": "WEST POINT", "phy_state": "NE", "phy_zip": "68788",
    "phy_country": "US", "power_units": "2", "total_drivers": "4", "classdef": "AUTHORIZED FOR HIRE",
    "carrier_operation": "A", "crgo_genfreight": "X", "crgo_grainfeed": "X",
}

FORM_D_XML = """<edgarSubmission><primaryIssuer><entityName>Clearoffice Inc.</entityName>
<issuerAddress><street1>1 Main St</street1><city>Fairfax</city><stateOrCountry>VA</stateOrCountry><zipCode>22030</zipCode>
</issuerAddress><issuerPhoneNumber>7037319510</issuerPhoneNumber><entityType>Corporation</entityType>
<yearOfInc><withinFiveYears>true</withinFiveYears><value>2025</value></yearOfInc></primaryIssuer>
<relatedPersonsList><relatedPersonInfo><relatedPersonName><firstName>Matthew</firstName><lastName>Borden</lastName>
</relatedPersonName><relatedPersonRelationshipList><relationship>Executive Officer</relationship>
<relationship>Director</relationship></relatedPersonRelationshipList><relationshipClarification></relationshipClarification>
</relatedPersonInfo></relatedPersonsList><offeringData><industryGroup><industryGroupType>Other Technology</industryGroupType>
</industryGroup><issuerSize><revenueRange>No Revenues</revenueRange></issuerSize><typeOfFiling><newOrAmendment>
<isAmendment>false</isAmendment></newOrAmendment><dateOfFirstSale><value>2026-08-01</value></dateOfFirstSale></typeOfFiling>
<offeringSalesAmounts><totalOfferingAmount>500000</totalOfferingAmount><totalAmountSold>252500</totalAmountSold>
</offeringSalesAmounts><investors><totalNumberAlreadyInvested>7</totalNumberAlreadyInvested></investors>
<signatureBlock><signature><nameOfSigner>Matthew Borden</nameOfSigner><signatureTitle>President</signatureTitle>
</signature></signatureBlock></offeringData></edgarSubmission>"""


def fm_candidate(**over):
    return fmcsa.to_candidate({**FMCSA_ROW, **over})


def fd_candidate():
    entry = {"company": "Clearoffice Inc.", "cik": "2150000", "acc": "0002150000-26-000001",
             "filed": TODAY - dt.timedelta(days=2)}
    return formd.to_candidate(entry, formd.parse(FORM_D_XML))


class SourceTests(unittest.TestCase):
    def test_title_case(self):
        self.assertEqual(title_case("J3K TRANSPORT LLC"), "J3K Transport LLC")
        self.assertEqual(title_case("ACME HOLDINGS INC"), "Acme Holdings Inc.")
        self.assertEqual(title_case("Cmg Managementco, LLC"), "Cmg Managementco, LLC")  # gemischt bleibt

    def test_fmcsa_candidate(self):
        c = fm_candidate()
        self.assertEqual(c["name"], "J3K Transport LLC")
        self.assertEqual(c["email"], "info@j3ktransport.com")
        self.assertEqual(c["facts"]["power_units"], 2)
        self.assertTrue(c["facts"]["for_hire"] and c["facts"]["interstate"])
        self.assertIn("grain and feed", c["facts"]["cargo"])

    def test_fmcsa_dba_for_person_named_firm(self):
        c = fm_candidate(legal_name="JEAN PIERRE FLORES", company_officer_1="JEAN PIERRE FLORES",
                         dba_name="ASHKAYA GENERAL SERVICES")
        self.assertEqual(c["name"], "Ashkaya General Services")

    def test_formd_candidate(self):
        c = fd_candidate()
        self.assertEqual(c["person_name"], "Matthew Borden")
        self.assertEqual(c["person_role"], "President")
        self.assertEqual(c["facts"]["amount_sold"], 252500)
        self.assertEqual(c["facts"]["year_of_inc"], 2025)

    def test_formd_skips_funds_and_foreign(self):
        doc = formd.parse(FORM_D_XML.replace("Other Technology", "Pooled Investment Fund"))
        self.assertIsNone(formd.to_candidate({"company": "X", "cik": "1", "acc": "1-1-1", "filed": TODAY}, doc))
        doc = formd.parse(FORM_D_XML.replace("<stateOrCountry>VA", "<stateOrCountry>D8"))
        self.assertIsNone(formd.to_candidate({"company": "X", "cik": "1", "acc": "1-1-1", "filed": TODAY}, doc))
        self.assertFalse(formd.wanted({"company": "Acme Growth Fund II, L.P."}))


class SegmentTests(unittest.TestCase):
    def test_fits(self):
        c = fm_candidate()
        self.assertTrue(segments.fits("S4", c)[0])
        self.assertFalse(segments.fits("S2", c)[0])  # eigene Domain -> keine Webagentur-Zielgruppe
        g = fm_candidate(email_address="JODENESTALP@GMAIL.COM")
        self.assertTrue(segments.fits("S2", g)[0])
        d = fd_candidate()
        self.assertTrue(segments.fits("S5", d)[0])
        self.assertFalse(segments.fits("S1", d)[0])  # unter $1M
        self.assertTrue(segments.fits("S9", d)[0])


class QualityTests(unittest.TestCase):
    def green_fm(self):
        c = fm_candidate()
        c["website"] = "https://j3ktransport.com"
        c["evidence"] = {"mx": True, "website": {"evidence": ["phone_on_site"]}, "site_phones": ["+14023808581"]}
        return c

    def test_green(self):
        q = qc.run(self.green_fm(), "S4")
        self.assertEqual(q["status"], "green", q)
        self.assertIn("phone_confirmed_on_website", q["evidence"])

    def test_names(self):
        self.assertTrue(qc.name_check("JODENE KARLOFF", "X")[0])
        for bad in ("OWNER", "T AND T TRUCKING LLC", "Mary", "JOHN JOHN", "Xkcdfg Brtzzz", "N/A", "J0hn Smith"):
            self.assertFalse(qc.name_check(bad, "X")[0], bad)

    def test_contradictions_are_red(self):
        c = self.green_fm()
        c["zip"] = "10001"  # New York, nicht Nebraska
        self.assertIn("zip_10001_not_in_NE", qc.run(c, "S4")["blocking"])
        c = self.green_fm()
        c["website"] = "https://other-firm.com"
        self.assertIn("email_domain_differs_from_website", qc.run(c, "S4")["blocking"])
        c = self.green_fm()
        c["evidence"]["mx"] = False
        self.assertEqual(qc.run(c, "S4")["status"], "red")

    def test_filing_agent_contacts_are_red(self):
        c = self.green_fm()
        shared = {("email", "info@j3ktransport.com"): 7}
        self.assertEqual(qc.run(c, "S4", shared)["status"], "red")
        c = fm_candidate(email_address="NEWCARRIER@DOTCOMPLIANCEHELP.COM")
        c["evidence"] = {"mx": True}
        self.assertIn("email_belongs_to_filing_service", qc.run(c, "S4")["blocking"])

    def test_missing_website_is_yellow_except_s2(self):
        c = fm_candidate(email_address="JODENESTALP@GMAIL.COM")
        c["evidence"] = {"mx": True}
        self.assertEqual(qc.run(c, "S4")["status"], "yellow")
        self.assertEqual(qc.run(c, "S2")["status"], "green")

    def test_phone_checks(self):
        self.assertFalse(qc.check_phone("5555555555", "NE")["ok"])
        self.assertFalse(qc.check_phone("4021111111", "NE")["ok"])
        self.assertTrue(qc.check_phone("(402) 380-8581", "NE")["ok"])


class SignalTests(unittest.TestCase):
    def test_texts_pass(self):
        for seg, c in (("S4", fm_candidate()), ("S5", fd_candidate()), ("S9", fd_candidate())):
            t = segments.texts(seg, c)
            s = sc.run(c, seg, t)
            self.assertEqual(s["status"], "pass", (seg, s, t))
            self.assertIn(c["name"], t["company_info"])

    def test_invented_number_fails(self):
        c = fm_candidate()
        t = segments.texts("S4", c)
        t["signal"] = t["signal"].replace("2 power units", "12 power units")
        self.assertIn("signal_number_not_in_facts:12", sc.run(c, "S4", t)["problems"])

    def test_old_signal_and_wrong_place_fail(self):
        c = fm_candidate(add_date=(TODAY - dt.timedelta(days=90)).strftime("%Y%m%d"))
        t = segments.texts("S4", c)
        self.assertTrue(any(p.startswith("signal_too_old") for p in sc.run(c, "S4", t)["problems"]))
        c = fm_candidate()
        t = segments.texts("S4", c)
        c["state"] = "TX"
        self.assertIn("company_info_place_differs_from_address", sc.run(c, "S4", t)["problems"])

    def test_forbidden_words_and_uniqueness(self):
        c = fm_candidate()
        t = segments.texts("S4", c)
        t["opener"] += " Guaranteed savings!"
        self.assertEqual(sc.run(c, "S4", t)["status"], "fail")
        a = {**segments.texts("S4", c), "sc": {"status": "pass", "problems": []}}
        b = {**segments.texts("S4", c), "sc": {"status": "pass", "problems": []}}
        sc.batch_unique([a, b])
        self.assertEqual(a["sc"]["status"], "fail")


class FixTests(unittest.TestCase):
    def test_number_inside_company_name_is_not_invented(self):
        c = fd_candidate()
        c["name"] = c["legal_name"] = "F42 Corp"
        t = segments.texts("S1", c)
        self.assertFalse([p for p in sc.run(c, "S1", t)["problems"] if "number_not_in_facts" in p])

    def test_implausible_fleet_is_red(self):
        c = fm_candidate(total_drivers="800")
        c["evidence"] = {"mx": True}
        self.assertTrue(any(b.startswith("implausible_fleet") for b in qc.run(c, "S4")["blocking"]))

    def test_s5_from_fmcsa_and_name_in_signal(self):
        c = fm_candidate()
        self.assertTrue(segments.fits("S5", c)[0])
        t = segments.texts("S5", c)
        self.assertIn(c["name"], t["signal"])
        self.assertEqual(sc.run(c, "S5", t)["status"], "pass")


class FilterTests(unittest.TestCase):
    def test_public_and_shared(self):
        self.assertEqual(filters.pre_filter(fm_candidate(legal_name="COUNTY OF LANCASTER")), "public_or_nonprofit")
        cs = [fm_candidate(dot_number=str(i), email_address="FILINGS@AGENT.COM") for i in range(4)]
        self.assertEqual(filters.shared_contacts(cs)[("email", "filings@agent.com")], 4)
        self.assertEqual(len(filters.dedupe(cs)), 1)


if __name__ == "__main__":
    unittest.main()
