import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import websites as W  # noqa: E402
from lib.registry import is_postcode_only  # noqa: E402


class CandidatesTest(unittest.TestCase):
    def test_uk_candidates_strip_legal_form_and_prefer_joined(self):
        c = W.domain_candidates("LD FLOORING GROUP LTD", "UK")
        self.assertEqual(c[:3], ["ldflooringgroup.co.uk", "ldflooringgroup.uk", "ldflooringgroup.com"])
        self.assertIn("ldflooring.co.uk", c)
        self.assertIn("ldflooringgroupltd.co.uk", c)
        self.assertLessEqual(len(c), W.MAX_CANDIDATES)
        self.assertFalse(any("ltd." in d and not d.endswith("ltd.co.uk") for d in c))

    def test_fr_and_us_tlds_and_accents(self):
        self.assertTrue(W.domain_candidates("Société des éoliennes de Hautes-Rives", "FR")[0].endswith(".fr"))
        self.assertIn("eolienneshautesrives.fr", W.domain_candidates("Société des éoliennes de Hautes-Rives", "FR"))
        self.assertEqual(W.domain_candidates("R&R AUTOWERKS LLC", "US")[0], "randrautowerks.com")

    def test_too_short_names_give_no_candidates(self):
        self.assertEqual(W.domain_candidates("Q INC.", "US"), [])

    def test_distinctive(self):
        self.assertFalse(W.name_is_distinctive("L'ATELIER"))
        self.assertFalse(W.name_is_distinctive("GAND"))
        self.assertTrue(W.name_is_distinctive("FEATHERSTONE SAFETY LTD"))


class PhoneTest(unittest.TestCase):
    def test_uk(self):
        self.assertEqual(W.normalize_phone("+44 (0)161 496 0000", "UK"), ("+441614960000", "ok"))
        self.assertEqual(W.normalize_phone("0161 496 0000", "UK"), ("+441614960000", "ok"))

    def test_foreign_numbers_never_accepted(self):
        # Fehler aus der Vergangenheit: Massachusetts- und Dubai-Nummern bei UK-Firmen
        self.assertEqual(W.normalize_phone("+1 617 253 1000", "UK"), (None, "foreign"))
        self.assertEqual(W.normalize_phone("+971 4 123 4567", "UK"), (None, "foreign"))
        self.assertEqual(W.normalize_phone("+44 20 7946 0000", "US"), (None, "foreign"))

    def test_fr_and_us(self):
        self.assertEqual(W.normalize_phone("01 23 45 67 89", "FR"), ("+33123456789", "ok"))
        self.assertEqual(W.normalize_phone("+33 (0)4 72 00 00 00", "FR"), ("+33472000000", "ok"))
        self.assertEqual(W.normalize_phone("(212) 555-0101", "US"), ("+12125550101", "ok"))
        self.assertEqual(W.normalize_phone("123-456-7890", "US"), (None, "invalid"))

    def test_phones_on_page_prefers_tel_links_and_skips_dates(self):
        page = '<a href="tel:+441614960000">Call</a><p>Registered 20240812 · 0161 496 0001</p>'
        phones, foreign = W.phones_on_page(page, "UK")
        self.assertEqual(phones[0], "+441614960000")
        self.assertEqual(foreign, 0)

    def test_hosting_section_ignored(self):
        page = "<p>Contact : 04 72 00 00 00</p><p>Hébergement : Strato AG, Tel. +49 30 88615 0</p>"
        phones, foreign = W.phones_on_page(page, "FR")
        self.assertEqual(phones, ["+33472000000"])
        self.assertEqual(foreign, 0)


class EmailTest(unittest.TestCase):
    def test_role_address_on_own_domain_only(self):
        page = ('<a href="mailto:john.smith@acme.co.uk">J</a> hello@gmail.com '
                '<a href="mailto:info@acme.co.uk">Info</a>')
        self.assertEqual(W.role_email(W.emails_on_page(page), "acme.co.uk"), "info@acme.co.uk")
        self.assertIsNone(W.role_email(W.emails_on_page("j.smith@acme.co.uk hello@gmail.com"), "acme.co.uk"))

    def test_obfuscated_and_cloudflare(self):
        self.assertIn("contact@acme.fr", W.emails_on_page("<p>contact [at] acme [dot] fr</p>"))
        enc = "".join(f"{ord(ch) ^ 0x42:02x}" for ch in "info@acme.com")
        page = f'<a class="__cf_email__" data-cfemail="42{enc}">[email&#160;protected]</a>'
        self.assertEqual(W.role_email(W.emails_on_page(page), "acme.com"), "info@acme.com")


class ExtractTest(unittest.TestCase):
    def test_registry_numbers(self):
        self.assertEqual(W.registry_numbers("Registered in England and Wales Number: 04884651.", "UK"), ["04884651"])
        self.assertEqual(W.registry_numbers("Company No. 4884651", "UK"), ["04884651"])
        self.assertEqual(W.registry_numbers("RCS Lyon 130 239 445", "FR"), ["130239445"])
        self.assertEqual(W.registry_numbers("SIRET : 130 239 445 00012", "FR"), ["130239445"])

    def test_person_from_legal_notice(self):
        t = "Éditeur : Acme SAS. Directeur de la publication : Jean Dupont. Hébergeur : OVH"
        self.assertEqual(W.person_from_legal_notice(t), {"name": "Jean Dupont", "role": "Directeur de la publication",
                                                          "source": "Company website (legal notice)"})
        self.assertIsNone(W.person_from_legal_notice("Director: Privacy Policy"))
        self.assertEqual(W.person_from_legal_notice("Managing Director: JANE DOE")["name"], "Jane Doe")

    def test_address(self):
        page = ('<script type="application/ld+json">{"@type":"Organization","address":{"@type":"PostalAddress",'
                '"streetAddress":"1 High St","addressLocality":"Leeds","postalCode":"LS1 1AA"}}</script>')
        self.assertEqual(W.postal_address_jsonld(page)["postalCode"], "LS1 1AA")
        self.assertEqual(W.address_line("Visit us\n12 Park Row, Leeds LS1 5HD\nMon-Fri", "LS1 5HD", "UK"),
                         "12 Park Row, Leeds LS1 5HD")
        self.assertEqual(W.first_address_line("Nous trouver\n12 rue de la Paix 75002 Paris\n", "FR"),
                         "12 rue de la Paix 75002 Paris")

    def test_postcode_only(self):
        self.assertTrue(is_postcode_only("M28 3NJ"))
        self.assertTrue(is_postcode_only("59100"))
        self.assertFalse(is_postcode_only("1 High St, Leeds, LS1 1AA"))


def _page(body: str, title: str = "") -> str:
    return f"<html><head><title>{title}</title></head><body>{body}</body></html>"


class MatchTest(unittest.TestCase):
    CO = {"name": "FEATHERSTONE SAFETY LTD", "country": "UK", "city": "OXFORD", "address": "OX4 2JZ",
          "registry_source": "companies_house", "registry_id": "12345678"}

    def test_registry_number_verifies(self):
        pages = {"https://featherstonesafety.co.uk/": _page("Featherstone Safety Ltd. Company No. 12345678", "Home")}
        r = W.score_match(self.CO, pages, "https://featherstonesafety.co.uk/")
        self.assertTrue(r["verified"])
        self.assertIn("registry_id", r["evidence"])

    def test_name_and_domain_alone_are_not_enough(self):
        pages = {"https://featherstonesafety.co.uk/": _page("Welcome to Featherstone Safety", "Featherstone Safety")}
        r = W.score_match(self.CO, pages, "https://featherstonesafety.co.uk/")
        self.assertFalse(r["verified"])

    def test_name_plus_postcode_verifies(self):
        pages = {"https://featherstonesafety.co.uk/": _page("Featherstone Safety Ltd, 4 Mill Lane, Oxford OX4 2JZ",
                                                            "Featherstone Safety")}
        self.assertTrue(W.score_match(self.CO, pages, "https://featherstonesafety.co.uk/")["verified"])

    def test_other_registry_number_is_a_conflict(self):
        pages = {"https://featherstonesafety.co.uk/": _page("Featherstone Safety Ltd, Oxford OX4 2JZ. Company number 07654321")}
        r = W.score_match(self.CO, pages, "https://featherstonesafety.co.uk/")
        self.assertFalse(r["verified"])
        self.assertTrue(r["conflicts"][0].startswith("other_registry_id"))

    def test_foreign_phone_only_is_a_conflict(self):
        pages = {"https://featherstonesafety.co.uk/": _page(
            'Featherstone Safety Ltd, Oxford OX4 2JZ <a href="tel:+16172531000">Call</a>')}
        r = W.score_match(self.CO, pages, "https://featherstonesafety.co.uk/")
        self.assertFalse(r["verified"])
        self.assertIn("phone_foreign_only", r["conflicts"])

    def test_hoster_siren_in_legal_notice_is_ignored(self):
        co = {"name": "REZOVERT", "country": "FR", "city": "Lille", "address": "59000", "registry_source": "bodacc_siren",
              "registry_id": "130239445"}
        pages = {"https://rezovert.fr/": _page("Rezovert, Lille"),
                 "https://rezovert.fr/mentions-legales/": _page(
                     "Rezovert SAS, 59000 Lille, SIREN 130 239 445. Hébergement : OVH SAS, RCS Lille 424 761 419, "
                     "+33 9 72 10 10 07")}
        r = W.score_match(co, pages, "https://rezovert.fr/")
        self.assertTrue(r["verified"], r)
        self.assertEqual(r["registry_numbers"], ["130239445"])

    def test_us_other_state_phone(self):
        co = {"name": "UNITED CLEANING GROUP LLC", "country": "US", "region": "NY", "registry_source": "ny_dos",
              "registry_id": "1"}
        pages = {"https://unitedcleaning.com/": _page('United Cleaning Group <a href="tel:+16175550123">x</a>')}
        r = W.score_match(co, pages, "https://unitedcleaning.com/")
        self.assertIn("phone_other_state", r["conflicts"])

    def test_director_name_counts(self):
        co = {"name": "JEREMY SILBERBERG LLC", "country": "US", "region": "NY", "_person_name": "Jeremy Silberberg"}
        pages = {"https://jeremysilberberg.com/": _page("Jeremy Silberberg LLC, 10 W 20th St, New York, NY 10011",
                                                         "Jeremy Silberberg")}
        r = W.score_match(co, pages, "https://jeremysilberberg.com/")
        self.assertIn("director_name", r["evidence"])
        self.assertTrue(r["verified"])

    def test_parked_and_directory(self):
        self.assertIn("parked_or_placeholder", W.score_match(self.CO, {"https://x.co.uk/": _page("This domain is for sale")},
                                                             "https://x.co.uk/")["conflicts"])
        self.assertIn("directory_or_platform", W.score_match(self.CO, {"https://find-and-update.company-information.service.gov.uk/": ""},
                                                             "https://find-and-update.company-information.service.gov.uk/")["conflicts"])

    def test_subpage_links_same_domain_in_priority(self):
        home = ('<a href="/about-us">About</a><a href="https://other.com/contact">x</a>'
                '<a href="/contact">Contact</a><a href="/legal-notice">Legal</a>')
        self.assertEqual(W.subpage_links(home, "https://acme.co.uk/"),
                         ["https://acme.co.uk/legal-notice", "https://acme.co.uk/contact", "https://acme.co.uk/about-us"])


class AssessTest(unittest.TestCase):
    def test_complete(self):
        co = {"country": "UK", "website": "https://acme.co.uk", "address": "1 High St, Leeds LS1 1AA"}
        q = W.assess(co, {"phone": "+441130000000", "email": "info@acme.co.uk", "checked_on": "2026-09-27"},
                     {"name": "Jane Doe"}, {"verified": True}, "2026-09-27")
        self.assertTrue(q["complete"])
        self.assertEqual(q["missing"], [])

    def test_missing_and_blocking(self):
        co = {"country": "UK", "website": "https://acme.co.uk", "address": "LS1 1AA"}
        q = W.assess(co, {"phone": "+16172531000", "email": "info@other.com", "checked_on": "2026-01-01"},
                     None, {"verified": False}, "2026-09-27")
        self.assertFalse(q["complete"])
        self.assertEqual(q["missing"], ["contact_name"])
        for issue in ("website_not_verified", "email_domain_differs_from_website", "phone_foreign", "contact_stale"):
            self.assertIn(issue, q["issues"])
        self.assertTrue(q["blocking"])


class FakeDB:
    """Minimaler Ersatz für lib.db.DB (nur eq.-Filter), um apply() ohne Supabase zu prüfen."""

    def __init__(self, companies):
        self.tables = {"watch_companies": [dict(c) for c in companies], "observations": []}

    @staticmethod
    def _match(row, params):
        for k, v in params.items():
            if k in ("select", "order", "limit") or not isinstance(v, str) or not v.startswith("eq."):
                continue
            if str(row.get(k)) != v[3:]:
                return False
        return True

    def select(self, table, params=None):
        return [r for r in self.tables.get(table, []) if self._match(r, params or {})]

    select_all = select

    def insert(self, table, rows, upsert_on=None, ignore_duplicates=False):
        rows = rows if isinstance(rows, list) else [rows]
        t = self.tables.setdefault(table, [])
        keys = upsert_on.split(",") if upsert_on else []
        for row in rows:
            old = next((r for r in t if keys and all(r.get(k) == row.get(k) for k in keys)), None)
            if old:
                old.update(row)
            else:
                t.append(dict(row))
        return rows

    def update(self, table, match, values):
        for r in self.tables[table]:
            if all(str(r.get(k)) == str(v) for k, v in match.items()):
                r.update(values)
        return []


class ApplyTest(unittest.TestCase):
    def test_apply_writes_observations_and_fills_company(self):
        import enrich
        co = {"id": "c1", "name": "ACME LTD", "country": "UK", "address": "LS1 1AA", "website": None,
              "registry_source": "companies_house", "registry_id": "12345678"}
        db = FakeDB([co])
        res = {"website_check": {"url": "https://acme.co.uk", "verified": True, "score": 95, "evidence": ["registry_id"],
                                 "conflicts": [], "method": "candidate"},
               "contacts": {"phone": "+441130000000", "email": "info@acme.co.uk", "email_mx": True,
                            "checked_on": "2026-09-27", "source_url": "https://acme.co.uk/contact"},
               "registry_address": "1 High St, Leeds, LS1 1AA",
               "person_registry": {"name": "Jane Doe", "role": "Director", "source": "Companies House"}}
        q = enrich.apply(db, dict(co), res, None, None)
        self.assertTrue(q["complete"], q)
        row = db.tables["watch_companies"][0]
        self.assertEqual(row["website"], "https://acme.co.uk")
        self.assertEqual(row["domain"], "acme.co.uk")
        self.assertEqual(row["phone_main"], "+441130000000")
        self.assertEqual(row["address"], "1 High St, Leeds, LS1 1AA")
        self.assertEqual({o["key"] for o in db.tables["observations"]}, {"website", "contact", "person", "quality"})

    def test_unverified_candidate_is_not_stored_as_website(self):
        import enrich
        co = {"id": "c2", "name": "KALE CAPITAL LTD", "country": "UK", "address": "N1 1AA", "website": None}
        db = FakeDB([co])
        res = {"website_check": {"url": "https://kalecapital.co.uk", "verified": False, "score": 30,
                                 "evidence": ["name_full"], "conflicts": [], "method": "candidate"}, "contacts": {}}
        q = enrich.apply(db, dict(co), res, None, None)
        self.assertIsNone(db.tables["watch_companies"][0]["website"])
        self.assertIn("website", q["missing"])


if __name__ == "__main__":
    unittest.main()


class TestCompleteOnlyS2(unittest.TestCase):
    def test_webagenturen_ohne_website(self):
        from lib.leadreport import complete_only
        head = "company,phone,email,website,address,contact_name\n"
        row = "Acme Ltd,+44 20 7946 0000,info@acme.co.uk,,1 High St,Jane Doe\n"
        data = (head + row).encode()
        self.assertNotIn(b"Acme", complete_only(data, "S5"))
        self.assertIn(b"Acme", complete_only(data, "S2"))
