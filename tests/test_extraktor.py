"""Extraktor (Inhaber 01.10.2026): Quellen, Qualitätskontrolle, Signalkontrolle, Sicherheitsfilter – ohne Netz."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import filters, qc, sc, segments  # noqa: E402
from extraktor.model import title_case  # noqa: E402
from extraktor.sources import careers, ct_sos, fmcsa, formd, jobs, overture  # noqa: E402

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
        a = {**segments.texts("S4", c), "source": "fmcsa", "source_id": "1", "sc": {"status": "pass", "problems": []}}
        b = {**segments.texts("S4", c), "source": "fmcsa", "source_id": "2", "sc": {"status": "pass", "problems": []}}
        sc.batch_unique([a, b])
        self.assertEqual(a["sc"]["status"], "fail")  # gleicher Text bei zwei Firmen
        x = {**segments.texts("S4", c), "source": "fmcsa", "source_id": "1", "sc": {"status": "pass", "problems": []}}
        y = {**segments.texts("S4", c), "source": "fmcsa", "source_id": "1", "sc": {"status": "pass", "problems": []}}
        sc.batch_unique([x, y])
        self.assertEqual(x["sc"]["status"], "pass")  # dieselbe Firma in zwei Branchen


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


CT_ROW = {
    "id": "001eq00001cSmZaAAK", "name": "BLUE HERON PLUMBING, LLC", "business_type": "LLC", "status": "Active",
    "accountnumber": "3526546", "billingstreet": "85 Viscount Dr", "billing_unit": "A22", "billingcity": "MILFORD",
    "billingpostalcode": "06460-1234", "billingstate": "CT", "business_email_address": "Info@BlueHeronPlumbing.com",
    "date_registration": f"{TODAY - dt.timedelta(days=2)}T00:00:00.000",
    "naics_code": "Plumbing, Heating, and Air-Conditioning Contractors (238220)",
}


class ConnecticutTests(unittest.TestCase):
    def test_candidate(self):
        c = ct_sos.to_candidate(CT_ROW)
        self.assertEqual((c["source"], c["state"], c["zip"], c["email"]), ("ct_sos", "CT", "06460", "info@blueheronplumbing.com"))
        self.assertEqual(c["facts"]["naics_code"], "238220")
        self.assertEqual(c["street"], "85 Viscount Dr A22")

    def test_segment_rules(self):
        c = ct_sos.to_candidate(CT_ROW)
        self.assertTrue(segments.fits("S4", c)[0])
        self.assertTrue(segments.fits("S5", c)[0])
        self.assertFalse(segments.fits("S2", c)[0])  # eigene E-Mail-Domain
        free = ct_sos.to_candidate({**CT_ROW, "business_email_address": "bob@gmail.com"})
        self.assertTrue(segments.fits("S2", free)[0])
        shop = ct_sos.to_candidate({**CT_ROW, "naics_code": "Software Publishers (513210)"})
        self.assertFalse(segments.fits("S4", shop)[0])
        landlord = ct_sos.to_candidate({**CT_ROW, "naics_code": "Lessors of Residential Buildings (531110)"})
        self.assertFalse(segments.fits("S5", landlord)[0])
        holding = ct_sos.to_candidate({**CT_ROW, "name": "ACME PROPERTIES LLC"})
        self.assertFalse(segments.fits("S5", holding)[0])

    def test_texts_pass_signal_check(self):
        for seg, email in (("S4", None), ("S5", None), ("S2", "bob@gmail.com")):
            c = ct_sos.to_candidate({**CT_ROW, **({"business_email_address": email} if email else {})})
            t = segments.texts(seg, c)
            self.assertEqual(sc.run(c, seg, t), {"status": "pass", "problems": []}, (seg, t))
            self.assertIn("Connecticut", t["signal"])


class SafetyTests(unittest.TestCase):
    def test_out_of_service_and_undeliverable_are_red(self):
        c = fm_candidate()
        c["facts"]["out_of_service"] = "New Entrant Revoked"
        c["evidence"] = {"mx": True}
        self.assertTrue(any(b.startswith("out_of_service_order") for b in qc.run(c, "S4")["blocking"]))
        c = fm_candidate(undeliv_phy="Y")
        c["evidence"] = {"mx": True}
        self.assertIn("fmcsa_mail_undeliverable", qc.run(c, "S4")["blocking"])

    def test_shared_over_long_period(self):
        extra = [{"dot_number": str(i), "phone": "2029182132", "email_address": "x@filer.com"} for i in range(5)]
        counts = filters.shared_contacts([fm_candidate()], extra)
        self.assertEqual(counts[("phone", "+12029182132")], 5)

    def test_mobile_note(self):
        c = fm_candidate(cell_phone="4023808581")
        c["evidence"] = {"mx": True}
        qc.run(c, "S4")
        self.assertEqual(c["phone_type"], "mobile")
        self.assertIn("dial manually", c["phone_note"])


class S1S2Tests(unittest.TestCase):
    def ov(self, country="UK", **kw):
        d = {"id": "ov1", "name": "Little Arthur Café", "phones": ["+441720422779"],
             "emails": ["littlearthurcafe@gmail.com"], "socials": ["https://www.facebook.com/1520"], "street": "Higher Town",
             "city": "St Martin's", "postcode": "TR25 0QL", "category": "cafe", "datasets": ["meta"], "updated": []}
        d.update(kw)
        return overture.to_candidate(d, country)

    def test_s2_overture_without_name_uses_role(self):
        c = self.ov()
        self.assertTrue(segments.fits("S2", c)[0])
        c["evidence"] = {"mx": True}
        q = qc.run(c, "S2")
        self.assertEqual(q["status"], "green", q)
        self.assertIn("contact_role_only", q["warnings"])
        self.assertIn("ask for the owner", c["person_role"])
        t = segments.texts("S2", c)
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)
        self.assertIn("Facebook", t["signal"])

    def test_s2_overture_fr_texts_french(self):
        c = self.ov("FR", postcode="75011", city="Paris", category="restaurant", phones=["+33142000000"])
        t = segments.texts("S2", c)
        self.assertIn("n'a pas de site web", t["signal"])
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)

    def test_s2_rejects_found_website(self):
        c = self.ov()
        c["website"] = "https://littlearthurcafe.co.uk"
        self.assertFalse(segments.fits("S2", c)[0])

    def test_s1_jobs(self):
        old = (TODAY - dt.timedelta(days=40)).isoformat()
        hit = {"kind": "ashby", "slug": "carwow", "url": "u", "all_jobs": 3,
               "jobs": [{"title": "Senior Engineer", "url": "https://x", "date_posted": old, "locality": "London"},
                        {"title": "Sales Lead", "url": "https://y", "date_posted": None, "locality": "UK"}]}
        c = jobs.to_candidate({"name": "carwow Ltd.", "city": "London"}, hit, "UK")
        ok, why = segments.fits("S1", c)
        self.assertTrue(ok, why)  # nur 2 Stellen, aber eine seit 40 Tagen offen
        t = segments.texts("S1", c)
        self.assertEqual(sc.run(c, "S1", t)["status"], "pass", t)
        self.assertEqual(t["urgency"], "high")


class FilterTests(unittest.TestCase):
    def test_public_and_shared(self):
        self.assertEqual(filters.pre_filter(fm_candidate(legal_name="COUNTY OF LANCASTER")), "public_or_nonprofit")
        cs = [fm_candidate(dot_number=str(i), email_address="FILINGS@AGENT.COM") for i in range(4)]
        self.assertEqual(filters.shared_contacts(cs)[("email", "filings@agent.com")], 4)
        self.assertEqual(len(filters.dedupe(cs)), 1)


class CareersTests(unittest.TestCase):
    """S1 aus der eigenen Karriereseite (Inhaber 01.10.2026)."""
    PAGE = ('<script type="application/ld+json">{"@type":"JobPosting","title":"Warehouse Supervisor",'
            '"datePosted":"%s","hiringOrganization":{"@type":"Organization","name":"Acme Widgets Ltd"},'
            '"jobLocation":{"@type":"Place","address":{"addressLocality":"Leeds","postalCode":"LS1 4AP",'
            '"streetAddress":"1 Park Row","addressCountry":"GB"}}}</script>')

    def test_postings_country_and_org(self):
        js = careers.postings(self.PAGE % TODAY.isoformat(), "https://acme.co.uk/careers/warehouse-supervisor")
        self.assertEqual(js[0]["org"], "Acme Widgets Ltd")
        self.assertTrue(careers.in_country(js[0], "UK"))
        self.assertFalse(careers.in_country(js[0], "US"))

    def test_us_state_suffix_counts_as_us(self):
        self.assertTrue(careers.in_country({"countries": [], "locality": "Austin, TX"}, "US"))

    def test_agencies_and_boards_excluded(self):
        self.assertTrue(careers.looks_like_agency("x.co.uk", "<title>Finance Recruitment - Core3</title>"))
        self.assertTrue(careers.looks_like_agency("x.co.uk", "<title>Home</title><p>We recruit on behalf of our client.</p>"))
        self.assertFalse(careers.looks_like_agency("x.co.uk", "<title>Heathcoat Fabrics</title>"))
        self.assertIn("job", careers.BOARD_DOMAIN.pattern)
        self.assertTrue(careers.PUBLIC_DOMAIN.search("leeds.gov.uk"))

    def test_job_titles_from_links(self):
        self.assertEqual(careers._job_title("Internal sales advisor", "https://a.co.uk/careers/x"), "Internal sales advisor")
        self.assertEqual(careers._job_title("Learn more", "https://a.co.uk/careers/accounts-administrator-ayr"),
                         "Accounts administrator ayr")
        for bad in ("Graduates", "Our Partners", "Fast Track", "Conveyancing Assistant (CLOSED)"):
            self.assertIsNone(careers._job_title(bad, "https://a.co.uk/careers/" + bad.lower().replace(" ", "-")))

    def test_stale_postings_dropped(self):
        old = (TODAY - dt.timedelta(days=500)).isoformat()
        self.assertTrue(careers._stale({"date_posted": old}, TODAY.isoformat()))
        self.assertTrue(careers._stale({"valid_through": (TODAY - dt.timedelta(days=1)).isoformat()}, TODAY.isoformat()))
        self.assertFalse(careers._stale({"date_posted": TODAY.isoformat()}, TODAY.isoformat()))

    def test_candidate_fits_s1_and_texts_use_facts(self):
        posted = (TODAY - dt.timedelta(days=40)).isoformat()
        jobs_ = careers.postings(self.PAGE % posted, "https://acme.co.uk/careers/warehouse-supervisor")
        res = careers._finish(jobs_, "website", "https://acme.co.uk/careers", "UK",
                              {"home": "https://acme.co.uk", "home_html": "<title>Acme</title>"})
        c = careers.to_candidate("acme.co.uk", res, "UK", {}, TODAY)
        self.assertEqual((c["name"], c["zip"], c["website"]), ("Acme Widgets Ltd", "LS1 4AP", "https://acme.co.uk"))
        self.assertEqual(c["facts"]["oldest_posted"], posted)
        self.assertTrue(segments.fits("S1", c)[0])  # eine Stelle, aber seit über 30 Tagen
        self.assertFalse(segments.fits("S2", c)[0])
        t = segments.texts("S1", c)
        self.assertIn("Warehouse Supervisor", t["signal"])
        self.assertEqual(t["urgency"], "high")

    def test_first_seen_is_kept_between_runs(self):
        seen = {}
        j = [{"url": "https://a.co.uk/jobs/1", "title": "Driver"}]
        careers.remember(seen, "a.co.uk", j, TODAY - dt.timedelta(days=35))
        careers.remember(seen, "a.co.uk", j, TODAY)
        self.assertEqual(seen["a.co.uk"]["https://a.co.uk/jobs/1"], (TODAY - dt.timedelta(days=35)).isoformat())

    def test_several_employers_means_board(self):
        js = [{"title": "Driver", "url": f"https://b.co.uk/jobs/{i}", "org": f"Firm {i}", "countries": ["gb"]}
              for i in range(4)]
        self.assertFalse(careers._finish(js, "website", "u", "UK", {})["ok"])


class WerkeTests(unittest.TestCase):
    """Lead-Werk (Speicherung) und Kunden-Werk (Käuferauswahl) ohne Netz."""

    def test_signal_types_per_source(self):
        from extraktor.store import signal_type
        self.assertEqual(signal_type("S2", "overture"), "no_website")
        self.assertEqual(signal_type("S1", "careers"), "jobs_open")
        self.assertEqual(signal_type("S4", "companies_house"), "incorporation")
        self.assertEqual(signal_type("S4", "fmcsa"), "new_fleet")

    def test_store_skips_known_brands_and_duplicates(self):
        from extraktor.store import store_new

        class FakeGuard:
            known = {("overture", "known")}

        class FakeDB:
            written = []

        import extraktor.store as S
        calls, raw = [], []
        orig, orig_raw = S.store_many, S.store_raw
        S.store_many = lambda db, rows: calls.append(rows) or len(rows)
        S.store_raw = lambda db, rows: raw.append(rows) or len(rows)
        try:
            base = {"ampel": "green", "source": "overture", "company": "Joe's Cafe", "signal_date": TODAY}
            rows = [dict(base, source_id="a"), dict(base, source_id="a"), dict(base, source_id="known"),
                    dict(base, source_id="b", company="EUROSPAR Ballywalter"), dict(base, source_id="c", ampel="yellow")]
            res = store_new(FakeDB(), FakeGuard(), rows)
        finally:
            S.store_many, S.store_raw = orig, orig_raw
        self.assertEqual(res["neu"], 1)
        self.assertEqual(res["rohbestand"], 1)  # gelb: ohne Lead, aber gespeichert
        self.assertEqual([r["source_id"] for r in raw[0]], ["c"])
        self.assertEqual([r["source_id"] for r in calls[0]], ["a"])
        self.assertEqual(calls[0][0]["signal_date"], TODAY.isoformat())

    def test_kundenwerk_categories_map_to_real_segments(self):
        import kundenwerk as K
        self.assertTrue(set(K.CATEGORIES.values()) <= {"S1", "S2", "S3", "S4", "S5", "S6", "S7", "S9", "S10", "S12"})
        self.assertEqual(K.CATEGORIES["employment_agency"], "S1")
        self.assertTrue(K.NOT_OWN_SITE.search("https://www.facebook.com/joescafe"))
        self.assertFalse(K.NOT_OWN_SITE.search("https://flexrecruitment.co.uk"))

    def test_kundenwerk_phone_from_listing(self):
        import kundenwerk as K
        d = {"country": "UK", "phones": ["01902 123456"]}
        self.assertEqual(K.company_phone(d, {"html": ""}), "+441902123456")
        self.assertIsNone(K.company_phone({"country": "UK", "phones": ["+33 1 23 45 67 89"]}, {"html": ""}))


if __name__ == "__main__":
    unittest.main()
