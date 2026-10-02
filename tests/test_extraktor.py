"""Extraktor (Inhaber 01.10.2026): Quellen, Qualitätskontrolle, Signalkontrolle, Sicherheitsfilter – ohne Netz."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import filters, qc, sc, segments  # noqa: E402
from extraktor.model import title_case  # noqa: E402
from extraktor.sources import careers, ct_registry, fmcsa, formd, jobs, overture  # noqa: E402

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
        self.assertIn("Aucun site web trouvé", t["signal"])
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

    def test_store_raw_skips_domains_already_in_database(self):
        """Lauf 01.10.2026: 409 auf watch_companies_domain_uq brach den ganzen Teillauf ab."""
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB
        from extraktor.store import store_raw
        db = FakeDB({"watch_companies": [{"id": "old", "domain": "jsbarbershop.com"}]})
        base = {"ampel": "yellow", "segment": "S2", "source": "overture", "company": "JS Barbers", "street": "", "city": "Leeds",
                "state": "", "zip": "", "country": "UK", "phone": "", "email": "", "phone_type": "",
                "email_type": "", "contact_name": "", "contact_role": "", "qc": "", "sc": "", "qc_notes": "",
                "company_info": "", "signal": "no website", "source_url": "", "signal_date": "", "opener": "",
                "urgency": "", "urgency_reason": ""}
        rows = [dict(base, source_id="1", website="https://jsbarbershop.com"),
                dict(base, source_id="2", website="https://new-shop.co.uk"),
                dict(base, source_id="3", website="https://www.new-shop.co.uk/")]
        self.assertEqual(store_raw(db, rows), 1)
        self.assertEqual(sorted(c["domain"] for c in db.tables["watch_companies"]), ["jsbarbershop.com", "new-shop.co.uk"])

    def test_store_many_splits_block_on_statement_timeout(self):
        """Lauf 01.10.2026: 500/57014 auf observations bei großen Blöcken – ~8.100 grüne S2-Leads gingen verloren."""
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB
        from extraktor import store as S

        class SlowDB(FakeDB):
            base = "x"

            def __init__(self):
                super().__init__()
                outer = self

                class Sess:
                    def delete(self, url, params, timeout):
                        table = url.rsplit("/", 1)[1]
                        (col, cond), = params.items()
                        ids = set(cond[4:-1].split(","))
                        outer.tables[table] = [r for r in outer.tables.get(table, []) if r.get(col) not in ids]
                self.s, self.timeout = Sess(), 1

            def insert(self, table, rows, **kw):
                if table == "observations" and len(rows) > 5 * 6:  # mehr als 6 Firmen je Block: Zeitüberschreitung
                    raise RuntimeError('Supabase POST observations: 500 {"code":"57014"}')
                return super().insert(table, rows, **kw)

        base = {"segment": "S2", "source": "overture", "street": "1 High St", "city": "Leeds", "state": "",
                "zip": "LS1 1AA", "country": "UK", "phone": "+441132000000", "email": "info@x.co.uk",
                "phone_type": "landline", "email_type": "generic", "contact_name": "", "contact_role": "Owner",
                "qc": "green", "sc": "ok", "qc_notes": "", "company_info": "", "signal": "no website",
                "source_url": "", "signal_date": "2026-10-01", "opener": "Hi", "urgency": "medium",
                "urgency_reason": "", "phone_note": ""}
        rows = [dict(base, source_id=str(i), company=f"Shop {i}", website=f"https://shop{i}.co.uk") for i in range(40)]
        db = SlowDB()
        self.assertEqual(S.store_many(db, rows, today="2026-10-01", chunk=20), 40)

        class TimeoutDB(SlowDB):
            def insert(self, table, rows, **kw):
                if table == "observations" and len(rows) > 5 * 6:  # Antwort bleibt aus (ReadTimeout)
                    import requests
                    raise requests.ReadTimeout("read timeout=60")
                return FakeDB.insert(self, table, rows, **kw)
        db2 = TimeoutDB()
        self.assertEqual(S.store_many(db2, rows, today="2026-10-01", chunk=20), 40)
        self.assertEqual(len(db2.tables["watch_companies"]), 40)
        self.assertEqual(len(db.tables["leads"]), 40)
        self.assertEqual(len(db.tables["watch_companies"]), 40)  # keine Firma doppelt oder ohne Lead
        self.assertEqual(len(db.tables["observations"]), 200)

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


class ConnecticutTests(unittest.TestCase):
    """Quellen-Scout 01.10.2026: Connecticut-Firmenregister (Neugründungen mit E-Mail und Inhaber)."""
    ROW = {"id": "001x", "accountnumber": "3526546", "name": "Bird Ride, LLC", "business_type": "LLC",
           "status": "Active", "billingstreet": "85 Viscount Dr", "billing_unit": "A22", "billingcity": "Milford",
           "billingstate": "CT", "billingpostalcode": "06460", "billingcountry": "United States",
           "business_email_address": "jmarro487@icloud.com", "date_registration": TODAY.isoformat() + "T00:00:00.000",
           "naics_code": "Passenger Car Rental (532111)"}

    def test_candidate_and_segments(self):
        c = ct_registry.to_candidate(self.ROW, "John Marro")
        self.assertEqual((c["state"], c["zip"], c["facts"]["naics"]), ("CT", "06460", "532111"))
        self.assertTrue(segments.fits("S2", c)[0])          # Freemail, keine eigene Domain
        self.assertTrue(segments.fits("S4", c)[0])          # Autovermietung: Versicherungsbedarf
        self.assertTrue(segments.fits("S9", c)[0])          # Inhaber bekannt
        c2 = ct_registry.to_candidate(dict(self.ROW, business_email_address="info@birdride.com"))
        self.assertFalse(segments.fits("S2", c2)[0])
        self.assertFalse(segments.fits("S9", c2)[0])

    def test_texts_pass_signal_control(self):
        c = ct_registry.to_candidate(self.ROW, "John Marro")
        for seg in ("S2", "S4", "S5", "S9"):
            t = segments.texts(seg, c)
            self.assertIn(", CT", t["company_info"])
            self.assertEqual(sc.run(c, seg, t)["status"], "pass", (seg, sc.run(c, seg, t)))


class FokusTests(unittest.TestCase):
    """Fokus (Inhaber 01.10.2026): S4, S5, S2 in US, UK und FR – gleichrangig."""

    def test_focus_file_and_rank(self):
        from lib import fokus
        pairs = fokus.focus_pairs()
        for co in ("US", "UK", "FR"):
            for seg in ("S4", "S5", "S2"):
                self.assertIn((seg, co), pairs)
                self.assertEqual(fokus.rank(seg, co, pairs), 0)
        self.assertEqual(fokus.rank("S9", "UK", pairs), 1)



class FranceBuyersTests(unittest.TestCase):
    """Fokus-Matrix US/UK/FR (Inhaber 01.10.2026): französische Käufer brauchen eine erkannte Kapitalgesellschaft."""

    def test_register_codes_map_to_company_forms(self):
        from extraktor.sources.fr_sirene import _key, form_of
        self.assertEqual([form_of(c) for c in ("5710", "5720", "5499", "5498", "5599", "1000", None)],
                         ["SAS", "SASU", "SARL", "EURL", "SA", None, None])
        self.assertEqual(_key("Agence Lumière SAS"), _key("AGENCE LUMIERE"))

    def test_lookup_needs_unique_exact_name(self):
        from unittest import mock
        from extraktor.sources import fr_sirene
        res = lambda results: mock.Mock(status_code=200, json=lambda: {"results": results})  # noqa: E731
        one = [{"nom_complet": "AIC CONSEIL", "siren": "949540207", "nature_juridique": "5710"},
               {"nom_complet": "AIC CONSEIL ET FORMATION", "siren": "1", "nature_juridique": "5499"}]
        s = mock.Mock(get=mock.Mock(return_value=res(one)))
        self.assertEqual(fr_sirene.lookup("AIC Conseil", "75011", s)["form"], "SAS")
        two = [{"nom_complet": "BIRD", "siren": "1", "nature_juridique": "5710"},
               {"nom_complet": "BIRD", "siren": "2", "nature_juridique": "5499"}]
        s = mock.Mock(get=mock.Mock(return_value=res(two)))
        self.assertIsNone(fr_sirene.lookup("Bird", None, s))

    def test_mentions_legales_give_company_form(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        from prospects import detect_legal_form
        self.assertEqual(detect_legal_form("FR", "Lumière Web", "Lumière Web, SAS au capital de 1 000 €")[0], "SAS")
        self.assertEqual(detect_legal_form("FR", "Lumière Web", "Forme juridique : SARL")[0], "SARL")
        self.assertIsNone(detect_legal_form("FR", "Lumière Web", "Contactez-nous")[0])



class CappedFetchTests(unittest.TestCase):
    """Kunden-Werk 01.10.2026: Teil 2 stürzte zweimal ab (Riesen-Antwort einer Website) -> Abruf begrenzt."""

    def test_body_is_capped(self):
        from unittest import mock
        from lib import fetch
        big = mock.Mock(headers={"content-type": "text/html"}, iter_content=lambda n: iter([b"x" * 65536] * 100),
                        encoding="utf-8", status_code=200)
        s = mock.Mock(get=mock.Mock(return_value=big))
        with mock.patch.object(fetch, "MAX_BYTES", 200_000):
            r = fetch.capped_get(s, "https://example.com")
        self.assertLessEqual(len(r._content), 200_000)
        self.assertTrue(s.get.call_args.kwargs["stream"])



class MoreCountriesTests(unittest.TestCase):
    """Scout-Sprint 01.10.2026: S2-Leads und Käufer auch in IE, NL, BE, SE (countries.yaml allowed)."""

    def test_overture_extract_per_country(self):
        from extraktor.sources import overture
        self.assertEqual(overture.code("UK"), "GB")
        self.assertEqual(overture.cache_for("UK"), overture.CACHE)
        for co in ("IE", "NL", "BE", "SE"):
            self.assertEqual(overture.cache_for(co), overture.CACHE_NORTH)
        self.assertTrue(overture.BRANDS.search("Albert Heijn Utrecht"))
        self.assertFalse(overture.BRANDS.search("Action Plumbing Dublin"))

    def test_postcodes_and_company_forms(self):
        from extraktor.qc import postcode_ok
        self.assertTrue(postcode_ok({"country": "NL", "zip": "1012 AB"}))
        self.assertFalse(postcode_ok({"country": "NL", "zip": "Amsterdam"}))
        self.assertTrue(postcode_ok({"country": "SE", "zip": "114 55"}))
        self.assertIsNone(postcode_ok({"country": "IE", "zip": "Co. Cork"}))
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        from prospects import detect_legal_form
        from lib.rules import is_company_form
        for co, name in (("NL", "Webbureau Zon B.V."), ("SE", "Webbyrå Norr AB"), ("BE", "Studio X BV")):
            form = detect_legal_form(co, name, "")[0]
            self.assertTrue(form and is_company_form(co, form), (co, name, form))
        self.assertIsNone(detect_legal_form("NL", "Bakkerij Jansen", "")[0])
        self.assertEqual(detect_legal_form("NL", "Niessink", "KvK 12345678 | Niessink Media B.V.")[0], "BV")
        self.assertEqual(detect_legal_form("BE", "Maslo", "Maslo BV – BTW BE0123.456.789")[0], "BV")
        self.assertEqual(detect_legal_form("SE", "Kopa", "Org.nr: 556677-8899")[0], "AB")
        self.assertIsNone(detect_legal_form("SE", "Kopa", "Org.nr: 860101-1234")[0])  # Einzelfirma (Personennummer)

    def test_new_countries_in_werke(self):
        import kundenwerk as K
        from extraktor import filters
        for co in ("IE", "NL", "BE", "SE"):
            self.assertIn(co, K.COUNTRIES.values())
            self.assertIsNone(filters.pre_filter({"name": "Joe's Bakery", "country": co}))


if __name__ == "__main__":
    unittest.main()


class GithubProTests(unittest.TestCase):
    """Inhaber 01.10.2026: „maximale Effizienz für GitHub Pro“ – Zeitfenster, Wiederholung, Selbst-Neustart."""

    def test_run_segment_stops_at_deadline(self):
        import time
        from extraktor import run
        calls = []

        def fake(c, seg, fetcher, shared, guard):
            calls.append(c)
            return {**c, "ampel": "red"}
        orig_process, orig_ampel = run.process, run.ampel
        run.process, run.ampel = fake, lambda l: l["ampel"]
        try:
            done = run.run_segment("S2", [{"i": i} for i in range(50)], 10, None, None, None, 4, 50,
                                   deadline=time.monotonic() - 1)
        finally:
            run.process, run.ampel = orig_process, orig_ampel
        self.assertEqual(done, [])
        self.assertEqual(calls, [])

    def test_db_retries_reads_but_not_timed_out_writes(self):
        import requests
        from lib import db as dbmod
        d = dbmod.DB(url="https://x.supabase.co", key="k")
        tries = []

        class Resp:
            status_code, text = 200, "[]"

            def json(self):
                return []

        def flaky(method, url, **kw):
            tries.append(method)
            if len(tries) == 1:
                raise requests.ConnectionError("Remote end closed connection")
            return Resp()
        d.s.request = flaky
        orig = dbmod.RETRY_WAIT
        dbmod.RETRY_WAIT = (0, 0, 0)
        try:
            self.assertEqual(d.select("leads"), [])
            self.assertEqual(tries, ["GET", "GET"])
            tries.clear()
            with self.assertRaises(requests.ConnectionError):
                d.insert("leads", [{"a": 1}])  # könnte schon gespeichert sein: nie doppelt schreiben
            self.assertEqual(tries, ["POST"])
            tries.clear()
            self.assertFalse(d.is_suppressed("a@b.c"))  # nur lesend: wird wiederholt
            self.assertEqual(tries, ["POST", "POST"])
        finally:
            dbmod.RETRY_WAIT = orig

    def test_werke_fill_github_pro_slots(self):
        import yaml
        wf = ROOT / ".github" / "workflows"
        lead = yaml.safe_load((wf / "lead-werk.yml").read_text())["jobs"]
        kunden = yaml.safe_load((wf / "kunden-werk.yml").read_text())["jobs"]
        n_lead = len(lead["holen"]["strategy"]["matrix"]["include"])
        n_kunden = len(kunden["pruefen"]["strategy"]["matrix"]["shard"])
        # alle Teile gleichzeitig, höchstens 30 (Inhaber 02.10.2026: „Mach 30“; vorher 25 wegen Disk-IO)
        self.assertLessEqual(lead["holen"]["strategy"]["max-parallel"], min(n_lead, 30))
        self.assertEqual(kunden["pruefen"]["strategy"]["max-parallel"], n_kunden)
        self.assertLessEqual(n_lead + n_kunden, 38)  # GitHub Pro: 40 gleichzeitig, 2 frei für die übrigen Abläufe
        for e in lead["holen"]["strategy"]["matrix"]["include"]:
            if "--shard" in e["args"]:
                i, n = e["args"].split("--shard ")[1].split()[0].split("/")
                same = [x for x in lead["holen"]["strategy"]["matrix"]["include"]
                        if x["name"].rsplit("-", 1)[0] == e["name"].rsplit("-", 1)[0]]
                self.assertEqual(int(n), len(same), e["name"])  # jeder Teil einer Quelle genau einmal
        for jobs, name in ((lead, "lead-werk.yml"), (kunden, "kunden-werk.yml")):
            self.assertIn(f"gh workflow run {name}", jobs["weiter"]["steps"][-1]["run"])
            self.assertEqual(jobs["weiter"]["permissions"]["actions"], "write")


class IrelandRegisterTests(unittest.TestCase):
    """Scout-Sprint 01.10.2026: Rechtsform irischer Käufer aus dem CRO-Register."""

    def test_unique_active_company_gives_form(self):
        from extraktor.sources import ie_cro
        rows = [{"company_num": "1", "company_name": "MURPHY PLUMBING SERVICES LIMITED", "company_status": "Normal ",
                 "company_type": "LTD - Private Company Limited by Shares"},
                {"company_num": "2", "company_name": "BEARA DISTILLERY LTD", "company_status": "Dissolved",
                 "company_type": "LTD - Private Company Limited by Shares"},
                {"company_num": "3", "company_name": "GREEN GARDENS LIMITED", "company_status": "Normal",
                 "company_type": "LTD - Private Company Limited by Shares"},
                {"company_num": "4", "company_name": "GREEN GARDENS DAC", "company_status": "Normal",
                 "company_type": "DAC - Designated Activity Company"},
                {"company_num": "5", "company_name": "ACME WIDGETS INTERNATIONAL", "company_status": "Normal",
                 "company_type": "External company"}]
        idx = ie_cro.index(rows)
        got = ie_cro.match({"a.ie": "Murphy Plumbing Services", "b.ie": "Beara Distillery Ltd",
                            "c.ie": "Green Gardens", "d.ie": "Acme Widgets International", "e.ie": "Bob"}, idx)
        self.assertEqual(got, {"a.ie": {"number": "1", "form": "Ltd"}})  # aufgelöst, doppelt, ausländisch, zu kurz: nein

    def test_forms_are_company_forms(self):
        from extraktor.sources import ie_cro
        from lib.rules import is_company_form
        for t in ("LTD - Private Company Limited by Shares", "DAC - Designated Activity Company",
                  "CLG - Company Limited by Guarantee", "PLC - Public Limited Company"):
            self.assertTrue(is_company_form("IE", ie_cro.form_of(t)), t)
        self.assertIsNone(ie_cro.form_of("External company"))


class WebAgencyFocusTests(unittest.TestCase):
    """Inhaber 02.10.2026: Fokus Webagenturen – US-Firmen ohne Website aus Overture."""

    def test_us_company_info_names_state_like_the_address(self):
        import datetime as _dt
        from extraktor import sc, segments as S
        from extraktor.sources import overture
        d = {"id": "x1", "name": "Culpepper Insurance Agency Inc", "phones": ["+18506233601"],
             "emails": ["culpepperins@gmail.com"], "socials": ["https://facebook.com/x"], "street": "6630 Caroline Street",
             "city": "Milton", "postcode": "32570", "region": "FL", "category": "insurance_agency",
             "datasets": ["meta"], "updated": ["2026-09-01"], "confidence": 0.9}
        c = overture.to_candidate(d, "US")
        self.assertEqual(c["state"], "FL")
        t = S.texts("S2", c)
        self.assertIn("Milton, FL 32570", t["company_info"])
        self.assertNotIn("company_info_place_differs_from_address", sc.run(c, "S2", t)["problems"])
        self.assertEqual(overture.to_candidate(d, "UK")["state"], "")  # UK unverändert

    def test_kundenwerk_web_agency_categories(self):
        import kundenwerk as K
        for cat in ("web_designer", "graphic_designer", "social_media_agency", "web_hosting_service",
                    "internet_marketing_service"):
            self.assertEqual(K.CATEGORIES[cat], "S2", cat)

    def test_lead_werk_is_all_web_agencies(self):
        import yaml
        jobs = yaml.safe_load((ROOT / ".github" / "workflows" / "lead-werk.yml").read_text())["jobs"]
        for e in jobs["holen"]["strategy"]["matrix"]["include"]:
            if e["name"] == "s1-us-lca":  # einziger S1-Teil (Quellen-Scout 02.10.2026)
                continue
            self.assertIn("--segments S2 ", e["args"] + " ", e["name"])
        us = [e for e in jobs["holen"]["strategy"]["matrix"]["include"] if e["name"].startswith("s2-us-")]
        self.assertEqual(len(us), 18)  # US-S2 wird für S1 nicht gekürzt


class DolLcaTests(unittest.TestCase):
    """Quellen-Scout 02.10.2026: S1 US aus den LCA-Offenlegungsdaten des US-Arbeitsministeriums."""

    def rows(self, **kw):
        base = {"CASE_NUMBER": "I-200-1", "CASE_STATUS": "Certified", "RECEIVED_DATE": "2026-06-20",
                "EMPLOYER_NAME": "LARSON ENGINEERING, INC.", "EMPLOYER_FEIN": "41-1", "EMPLOYER_ADDRESS1": "3524 Labore Rd",
                "EMPLOYER_ADDRESS2": "", "EMPLOYER_CITY": "White Bear Lake", "EMPLOYER_STATE": "MN",
                "EMPLOYER_POSTAL_CODE": "55110", "EMPLOYER_PHONE": "+16514819120", "NAICS_CODE": "541330",
                "EMPLOYER_POC_FIRST_NAME": "Kate", "EMPLOYER_POC_LAST_NAME": "Doe",
                "EMPLOYER_POC_JOB_TITLE": "HR Manager", "EMPLOYER_POC_PHONE": "+16514819121",
                "EMPLOYER_POC_EMAIL": "kdoe@larsonengr.com", "AGENT_ATTORNEY_EMAIL_ADDRESS": "x@fragomen.com",
                "JOB_TITLE": "MECHANICAL ENGINEER II", "SOC_TITLE": "Mechanical Engineers",
                "TOTAL_WORKER_POSITIONS": "1", "NEW_EMPLOYMENT": "1", "CHANGE_EMPLOYER": "0"}
        base.update(kw)
        return base

    def test_company_mail_only_on_own_domain(self):
        from extraktor.sources import us_dol_lca as L
        self.assertTrue(L.company_mail("kdoe@larsonengr.com", "LARSON ENGINEERING, INC."))
        self.assertFalse(L.company_mail("kdoe@gmail.com", "LARSON ENGINEERING, INC."))
        self.assertFalse(L.company_mail("pat@fragomen.com", "LARSON ENGINEERING, INC."))
        self.assertFalse(L.company_mail("a@shared.com", "LARSON ENGINEERING", "b@shared.com"))  # Domain des Anwalts

    def test_select_needs_three_new_hires_and_skips_staffing(self):
        from extraktor.sources import us_dol_lca as L
        three = [self.rows(CASE_NUMBER=f"I-{i}", RECEIVED_DATE=f"2026-06-2{i}") for i in range(3)]
        two = [self.rows(CASE_NUMBER=f"J-{i}", EMPLOYER_FEIN="2", EMPLOYER_NAME="SMALL CO") for i in range(2)]
        staff = [self.rows(CASE_NUMBER=f"K-{i}", EMPLOYER_FEIN="3", EMPLOYER_NAME="ACME STAFFING LLC",
                           EMPLOYER_POC_EMAIL="a@acmestaffing.com") for i in range(3)]
        out = L.select(three + two + staff, log=lambda *_: None)
        self.assertEqual([e["key"] for e in out], ["41-1"])
        e = out[0]
        self.assertEqual((e["new_hires"], e["positions"], e["first"], e["last"]), (3, 3, "2026-06-20", "2026-06-22"))
        self.assertEqual(e["titles"], ["Mechanical Engineer II"])

    def test_lead_texts_pass_checks_with_longer_age_only_for_this_source(self):
        from extraktor.sources import us_dol_lca as L
        e = L.select([self.rows(CASE_NUMBER=f"I-{i}", RECEIVED_DATE=f"2026-06-2{i}") for i in range(3)],
                     log=lambda *_: None)[0]
        c = L.to_candidate(e)
        self.assertTrue(segments.fits("S1", c)[0])
        t = segments.texts("S1", c)
        for k in ("signal", "company_info", "opener", "urgency_reason"):
            self.assertNotRegex(t[k], "[–—]", k)  # keine Gedankenstriche (Inhaber 02.10.2026)
        self.assertIn("White Bear Lake, MN", t["company_info"])
        self.assertEqual(sc.run(c, "S1", t, today=dt.date(2026, 10, 2))["status"], "pass")
        self.assertIn("signal_too_old", " ".join(sc.run(c, "S1", t, today=dt.date(2027, 3, 1))["problems"]))
        other = {**c, "source": "careers"}
        self.assertEqual(sc.MAX_AGE_BY_SOURCE.get(other["source"], sc.MAX_AGE_DAYS), 45)


class KundenWerkNieStillTests(unittest.TestCase):
    """Inhaber 02.10.2026: „es soll nie still stehen“ – Fokus durchgeprüft -> übrige Zielgruppen."""

    def test_fill_up_adds_other_segments_only_when_focus_is_exhausted(self):
        import kundenwerk as K
        few = [{"segment": "S2", "domain": "a.com"}]
        rest = [{"segment": "S2", "domain": "a.com"}, {"segment": "S5", "domain": "b.com"}]
        out = K.fill_up(few, {"S2"}, lambda: rest)
        self.assertEqual([d["domain"] for d in out], ["a.com", "b.com"])  # Fokus vorn, keine Doppelten
        many = [{"segment": "S2", "domain": f"{i}.com"} for i in range(K.FALLBACK_MIN)]
        self.assertIs(K.fill_up(many, {"S2"}, lambda: rest), many)
        self.assertIs(K.fill_up(few, set(), lambda: rest), few)


class CategoryTldTests(unittest.TestCase):
    """Inhaber 02.10.2026: „202 Main Coffee“ hatte 202main.coffee, wir lieferten sie als „ohne Website“."""

    def test_category_tld_candidates(self):
        from lib import websites as W
        doms = W.domain_candidates("202 Main Coffee", "US", "coffee shop")
        self.assertIn("202main.coffee", doms)
        self.assertLess(doms.index("202main.coffee"), 12)  # innerhalb der Kandidaten, die das Lead-Werk prüft
        self.assertIn("bellasalon.hair", W.domain_candidates("Bella Hair Salon", "UK", "beauty salon"))


class SiteRecheckTests(unittest.TestCase):
    """Vor Probe/Lieferung: „ohne Website“-Leads, deren Firma doch eine Website hat, gehen nicht raus."""

    def test_drop_with_site(self):
        from unittest import mock
        from lib import site_recheck

        class DB:
            def __init__(self):
                self.updates = []

            def select(self, table, q):
                return [{"id": "c1", "name": "202 Main Coffee", "country": "US", "website": None},
                        {"id": "c2", "name": "Nowhere Cafe", "country": "US", "website": None}]

            def update(self, table, match, values):
                self.updates.append((table, match, values))

        db = DB()
        leads = [{"id": "l1", "company_id": "c1", "signal_type": "no_website"},
                 {"id": "l2", "company_id": "c2", "signal_type": "no_website"},
                 {"id": "l3", "company_id": "c3", "signal_type": "new_incorporation"}]
        found = lambda co, f: "https://202main.coffee" if co["id"] == "c1" else None
        with mock.patch.object(site_recheck, "found_site", side_effect=found):
            bad = site_recheck.drop_with_site(db, leads, fetcher=object(), log=lambda *a: None)
        self.assertEqual(bad, {"l1"})
        self.assertIn(("leads", {"id": "l1"}, {"status": "expired"}), db.updates)


class LcaCellTests(unittest.TestCase):
    """calamine liefert Zahlenzellen als float; select() braucht Text (Scout 02.10.2026)."""

    def test_numeric_cells_become_text(self):
        from extraktor.sources.us_dol_lca import _cell
        self.assertEqual(_cell(2134.0, "EMPLOYER_POSTAL_CODE"), "02134")
        self.assertEqual(_cell(5551234567.0, "EMPLOYER_PHONE"), "5551234567")
        self.assertEqual(_cell("Acme", "EMPLOYER_NAME"), "Acme")
        self.assertEqual(_cell(3, "NEW_EMPLOYMENT"), "3")
