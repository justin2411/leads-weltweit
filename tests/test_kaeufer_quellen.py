"""Kunden-Werk: offene Register als Käuferquellen für Webagenturen (MX DENUE, FI YTJ, FR France Num; 04.10.2026)."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import kundenwerk as K  # noqa: E402
from extraktor.sources import fi_ytj, fr_francenum, mx_denue  # noqa: E402
from lib.rules import is_company_form, is_freemail, load_countries, normalize_domain  # noqa: E402

SEGS = {"S2": {"US", "UK", "FR", "SE", "FI", "SG", "HK", "MX", "BR"}, "S12": {"UK", "US"}}


def denue(**kw):
    base = {"id": "123", "nom_estab": "AGENCIA PIXEL", "raz_social": "PIXEL SA DE CV", "codigo_act": "541810",
            "tipo_vial": "CALLE", "nom_vial": "REFORMA", "numero_ext": "10", "cod_postal": "06600",
            "municipio": "Cuauhtémoc", "entidad": "Ciudad de México", "telefono": "5555123456",
            "correoelec": "", "www": ""}
    return {**base, **kw}


def mx(**kw):
    return mx_denue.row_of(denue(**kw), K.NOT_OWN_SITE, normalize_domain, is_freemail)


class DenueTests(unittest.TestCase):
    def test_website_or_company_email_domain(self):
        r = mx(www="WWW.PIXEL.MX")
        self.assertEqual((r["websites"], r["category"], r["country"]), (["www.pixel.mx"], "advertising_agency", "MX"))
        self.assertIn("DENUE", r["quelle"])
        r = mx(correoelec="contacto@pixel.com.mx")  # ohne Website: Domain der Firmen-E-Mail
        self.assertEqual((r["websites"], r["emails"]), (["pixel.com.mx"], ["contacto@pixel.com.mx"]))

    def test_rejects_freemail_platform_and_other_branches(self):
        self.assertIsNone(mx(correoelec="pixel@gmail.com"))           # Freemail ist keine Website
        self.assertIsNone(mx(www="https://www.facebook.com/pixel"))    # Plattform statt eigener Website
        self.assertIsNone(mx(www="pixel.mx", codigo_act="541850"))     # Außenwerbung: keine Webagentur
        self.assertIsNone(mx(www=""))

    def test_all_codes_land_on_s2_in_mx(self):
        for cat in mx_denue.CODES.values():
            self.assertEqual(K.segment_for(cat, "MX", SEGS), ("S2", "MX"), cat)


class YtjTests(unittest.TestCase):
    ADDR = [{"type": 2, "street": "Postitie", "buildingNumber": "1", "postCode": "00100",
             "postOffices": [{"city": "HELSINKI"}]},
            {"type": 1, "street": "Mannerheimintie", "buildingNumber": "5", "postCode": "00101",
             "postOffices": [{"city": "HELSINKI"}]}]

    def row(self, line="73110", web="www.Pikseli.fi"):
        return fi_ytj.row_of("1234567-8", "Pikseli Oy", line, web, self.ADDR, K.NOT_OWN_SITE, normalize_domain, is_freemail)

    def test_row_with_register_form_and_visiting_address(self):
        r = self.row()
        self.assertEqual((r["websites"], r["category"], r["reg_form"]), (["www.pikseli.fi"], "advertising_agency", "Oy"))
        self.assertEqual((r["street"], r["city"], r["postcode"]), ("Mannerheimintie 5", "Helsinki", "00101"))
        self.assertIn("1234567-8", r["reg_note"])
        self.assertTrue(is_company_form("FI", r["reg_form"]))  # unveränderte Prüfregel: Oy ist Kapitalgesellschaft

    def test_other_branches_and_platforms_skipped(self):
        self.assertIsNone(self.row(line="68202"))
        self.assertIsNone(self.row(web="https://www.facebook.com/pikseli"))
        for line, cat in (("62100", "software_development"), ("74120", "graphic_designer"), ("63100", "web_hosting_service")):
            self.assertEqual(self.row(line=line)["category"], cat)
            self.assertEqual(K.segment_for(cat, "FI", SEGS), ("S2", "FI"))


def activateur(**kw):
    base = {"identifiant_de_la_structure": "abc-1", "nom_de_la_structure": "PIXEL COM", "type": "Agence de communication, marketing",
            "categorie": "Privée", "adresse": "1 RUE DE LA PAIX", "code_postal": "75002", "ville": "Paris",
            "region": "Île-de-France", "lien_url_site_france_num": "https://www.francenum.gouv.fr/activateurs/pixel-com"}
    return {**base, **kw}


PAGE_HTML = ('<p><a class="fr-link" title="PIXEL COM, https://www.pixel-com.fr/ - Nouvelle fenêtre" target="_blank" '
             'href="https://www.pixel-com.fr/">Site internet</a></p><a target="_blank" '
             'href="https://www.linkedin.com/company/pixel">Page linkedin</a>')


class FranceNumTests(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(K, "mx_check", return_value=True)  # kein echtes DNS im Test
        p.start()
        self.addCleanup(p.stop)

    def fr(self, x=None, web="https://www.pixel-com.fr/"):
        return fr_francenum.row_of(x or activateur(), web, K.NOT_OWN_SITE, normalize_domain, is_freemail)

    def test_website_from_activateur_page(self):
        self.assertEqual(fr_francenum.website_of(PAGE_HTML), "https://www.pixel-com.fr/")
        self.assertIsNone(fr_francenum.website_of('<a href="https://www.linkedin.com/x">Page linkedin</a>'))

    def test_row_lands_on_s2_fr_with_source(self):
        r = self.fr()
        self.assertEqual((r["country"], r["category"], r["postcode"]), ("FR", "marketing_agency", "75002"))
        self.assertIn("francenum.gouv.fr/activateurs/pixel-com", r["quelle"])
        for cat in fr_francenum.TYPES.values():
            self.assertEqual(K.segment_for(cat, "FR", SEGS), ("S2", "FR"), cat)
        # in UK/US bleiben Marketingagenturen eigener Test S12 – France Num liefert ohnehin nur FR
        self.assertNotEqual(K.segment_for("marketing_agency", "UK", SEGS)[0], "S2")

    def test_public_bodies_other_types_platforms_skipped(self):
        self.assertIsNone(self.fr(activateur(categorie="Publique")))
        self.assertIsNone(self.fr(activateur(type="Organisme de formation")))
        self.assertIsNone(self.fr(activateur(type="Cabinet d’avocat, expertise-comptable")))
        self.assertIsNone(self.fr(web="https://www.facebook.com/pixel"))
        self.assertIsNone(self.fr(web=None))
        self.assertIsNone(self.fr(activateur(lien_url_site_france_num="https://example.com/x")))

    def test_pool_rows_fetches_pages_politely_and_dedups(self):
        items = [activateur(), activateur(identifiant_de_la_structure="abc-2"),
                 activateur(identifiant_de_la_structure="abc-3", type="Organisme public", categorie="Publique")]

        class F:
            urls = []

            def get(self, url):
                self.urls.append(url)
                return (url, PAGE_HTML)
        f = F()
        with mock.patch.object(fr_francenum, "_download", return_value=items):
            rows = fr_francenum.pool_rows(log=lambda *_: None, fetcher=f)
        self.assertEqual(len(rows), 1)          # gleiche Website nur einmal
        self.assertEqual(len(f.urls), 2)        # Behörde wird gar nicht abgerufen
        with mock.patch.object(fr_francenum, "_download", return_value=items):
            self.assertEqual(fr_francenum.pool_rows(log=lambda *_: None, fetcher=f, budget_s=0), [])

    def test_download_via_data_gouv_tabular_api_not_blocked_export(self):
        # robots.txt von data.economie.gouv.fr sperrt /api/ -> Abruf nur über tabular-api.data.gouv.fr
        self.assertTrue(fr_francenum.URL.startswith("https://tabular-api.data.gouv.fr/"))
        self.assertNotIn("data.economie.gouv.fr", fr_francenum.URL)
        rec = {"__id": 1, "Identifiant de la structure": "abc-1", "Nom de la structure": "PIXEL COM",
               "Type": "Agence de communication, marketing", "Catégorie": "Privée", "Adresse": "1 RUE DE LA PAIX",
               "Code postal": 6000, "Ville": "Nice", "Région": "PACA",
               "Lien url (site France Num)": "https://www.francenum.gouv.fr/activateurs/pixel-com"}
        x = fr_francenum.as_export(rec)
        self.assertEqual(x["code_postal"], "06000")
        self.assertTrue(fr_francenum.wanted(x))
        pages = [{"data": [rec], "links": {"next": "https://tabular-api.data.gouv.fr/x?page=2"}},
                 {"data": [{**rec, "Identifiant de la structure": "abc-2"}], "links": {"next": None}}]
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(fr_francenum, "CACHE", Path(tmp) / "fn.json"), \
                mock.patch.object(fr_francenum, "_get", side_effect=pages) as get, \
                mock.patch.object(fr_francenum.time, "sleep"):
            data = fr_francenum._download(log=lambda *_: None)
        self.assertEqual([d["identifiant_de_la_structure"] for d in data], ["abc-1", "abc-2"])
        self.assertEqual(get.call_count, 2)

    def test_france_num_is_active_register_source(self):
        self.assertIn("fr_francenum", K.REGISTER_SOURCES)

    def test_check_one_fr_activateur_with_generic_address(self):
        d = {**self.fr(), "segment": "S2", "website": "https://www.pixel-com.fr/", "domain": "pixel-com.fr"}
        cfg = load_countries()
        generic = {g.lower() for g in cfg.get("generic_local_parts") or []}
        with mock.patch.object(K, "site_scan", return_value={"emails": {"contact@pixel-com.fr": "https://www.pixel-com.fr/contact"},
                                                              "text": "PIXEL COM SAS au capital de 1000 €", "pages": [],
                                                              "final_domain": "", "html": ""}):
            row = K.check_one(d, None, cfg, generic, set())
        self.assertEqual(row["email"], "contact@pixel-com.fr")
        with mock.patch.object(K, "site_scan", return_value={"emails": {"contact@pixel-com.fr": "https://x"}, "text": "",
                                                              "pages": [], "final_domain": "", "html": ""}):
            row = K.check_one(d, None, cfg, generic, {"pixel-com.fr"})
        self.assertNotEqual(row["check_status"], "ok")  # Sperrliste gilt unverändert


class CheckOneTests(unittest.TestCase):
    def setUp(self):
        self.cfg = load_countries()
        self.generic = {g.lower() for g in self.cfg.get("generic_local_parts") or []}
        p = mock.patch.object(K, "mx_check", return_value=True)  # kein echtes DNS im Test; einzelne Tests überschreiben
        p.start()
        self.addCleanup(p.stop)

    def scan(self, emails, text=""):
        return mock.patch.object(K, "site_scan", return_value={"emails": emails, "text": text, "pages": [],
                                                                "final_domain": "", "html": ""})

    def test_fi_register_form_makes_company_mailable_with_generic_address(self):
        d = {**fi_ytj.row_of("1234567-8", "Pikseli", "73110", "pikseli.fi", [], K.NOT_OWN_SITE, normalize_domain,
                             is_freemail), "segment": "S2", "website": "pikseli.fi", "domain": "pikseli.fi"}
        with self.scan({"info@pikseli.fi": "https://pikseli.fi/yhteystiedot"}):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertEqual((row["check_status"], row["legal_form"]), ("ok", "Oy"))
        self.assertIn("YTJ", row["size_note"])
        # ohne Register-Rechtsform bleibt es wie bisher „nur Anruf/Brief“ (Prüfregel unverändert)
        with self.scan({"info@pikseli.fi": "https://pikseli.fi/yhteystiedot"}):
            row = K.check_one({**d, "reg_form": None, "reg_note": None, "street": "x"}, None, self.cfg, self.generic, set())
        self.assertNotEqual(row["check_status"], "ok")

    def test_fi_personal_address_and_blocklist_still_fail(self):
        d = {**fi_ytj.row_of("1234567-8", "Pikseli Oy", "73110", "pikseli.fi", [], K.NOT_OWN_SITE, normalize_domain, is_freemail),
             "segment": "S2", "website": "pikseli.fi", "domain": "pikseli.fi"}
        with self.scan({"matti.meikalainen@pikseli.fi": "https://pikseli.fi"}):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertNotEqual(row["check_status"], "ok")  # generic_only
        with self.scan({"info@pikseli.fi": "https://pikseli.fi"}):
            row = K.check_one(d, None, self.cfg, self.generic, {"pikseli.fi"})
        self.assertNotEqual(row["check_status"], "ok")  # Sperrliste

    def test_mx_listed_email_names_denue_as_source(self):
        d = {**mx(www="pixel.mx", correoelec="contacto@pixel.mx"), "segment": "S2", "website": "pixel.mx",
             "domain": "pixel.mx"}
        with self.scan({}), mock.patch.object(K, "mx_check", return_value=True):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertEqual((row["email"], row["check_status"]), ("contacto@pixel.mx", "ok"))
        self.assertIn("DENUE", row["source_url"])

    def fr_overture(self):
        return {"id": "ov-fr", "name": "Pixel Com SAS", "country": "FR", "segment": "S2", "category": "web_designer",
                "website": "http://www.pixel-com.fr/", "domain": "pixel-com.fr", "emails": ["contact@pixel-com.fr"],
                "street": "1 rue X", "city": "Lyon", "postcode": "69001"}

    def dead_scan(self):
        return mock.patch.object(K, "site_scan", return_value={"emails": {}, "text": "", "pages": [],
                                                                "final_domain": "", "html": "", "loaded": False})

    def test_listed_email_dropped_when_site_dead_or_no_mx(self):
        import dauerpruefung
        d = self.fr_overture()
        with self.dead_scan(), mock.patch.object(K, "mx_check", return_value=True), \
                mock.patch.object(dauerpruefung, "site_state", return_value="tot"):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertIsNone(row["email"])
        self.assertNotEqual(row["check_status"], "ok")
        with self.scan({}), mock.patch.object(K, "mx_check", return_value=False):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertIsNone(row["email"])
        self.assertNotEqual(row["check_status"], "ok")

    def test_website_email_without_mx_dropped_in_all_mail_countries(self):
        for co, site in (("US", "pixelco.com"), ("UK", "pixelco.co.uk"), ("SE", "pixelco.se"), ("FR", "pixel-com.fr")):
            d = {"id": "x", "name": "Pixel Co", "country": co, "segment": "S2", "category": "web_designer",
                 "website": site, "domain": site, "emails": [], "street": "1 X"}
            with self.scan({f"info@{site}": f"https://{site}/contact"}), mock.patch.object(K, "mx_check", return_value=False):
                row = K.check_one(d, None, self.cfg, self.generic, set())
            self.assertIsNone(row["email"], co)
            self.assertNotEqual(row["check_status"], "ok", co)

    def test_encoded_or_spaced_addresses_invalid(self):
        for bad in ("%20info@pixelco.com", "info%20@pixelco.com", "info @pixelco.com", " info@pixel co.com"):
            self.assertFalse(K.address_ok(bad), bad)
        self.assertTrue(K.address_ok("info@pixelco.com"))
        d = {"id": "x", "name": "Pixel Co", "country": "US", "segment": "S2", "category": "web_designer",
             "website": "pixelco.com", "domain": "pixelco.com", "emails": ["%20info@pixelco.com"]}
        with self.scan({"%20hello@pixelco.com": "https://pixelco.com"}):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertIsNone(row["email"])

    def test_listed_email_kept_when_site_only_refused(self):
        import dauerpruefung
        d = self.fr_overture()
        with self.dead_scan(), mock.patch.object(K, "mx_check", return_value=None), \
                mock.patch.object(dauerpruefung, "site_state", return_value=None):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertEqual(row["email"], "contact@pixel-com.fr")


class PoolTests(unittest.TestCase):
    def test_register_rows_join_overture_pool_and_candidates(self):
        import duckdb
        with tempfile.TemporaryDirectory() as tmp:
            pool = Path(tmp) / "pool.parquet"
            con = duckdb.connect()
            con.execute(f"""COPY (SELECT 'ov1' id, 'Pixel Studio' AS name, ['https://pixel.example.com'] websites,
                []::VARCHAR[] emails, ['+1 555 0100'] phones, '1 Main St' street, 'Austin' city, '78701' postcode,
                'TX' region, 'US' country, 'web_designer' category, 0.9::DOUBLE confidence, 'open' operating_status)
                TO '{pool}' (FORMAT parquet)""")
            reg = [mx(www="pixel.mx"),
                   fi_ytj.row_of("1234567-8", "Pikseli Oy", "62100", "pikseli.fi", [], K.NOT_OWN_SITE,
                                 normalize_domain, is_freemail)]
            self.assertEqual(K.add_register_rows(con, pool, reg), 2)
            with mock.patch.object(K, "POOL", pool), mock.patch("lib.laender.focus_pairs", return_value=[]):
                cands = {d["domain"]: d for d in K.candidates(SEGS)}
            self.assertEqual(set(cands), {"pixel.example.com", "pixel.mx", "pikseli.fi"})
            # mit Fokus S2/US,UK,FR (Inhaber 05.10.2026): ruhende Märkte MX/FI werden nicht befüllt
            with mock.patch.object(K, "POOL", pool), \
                    mock.patch("lib.laender.focus_pairs", return_value=[("S2", "US"), ("S2", "UK"), ("S2", "FR")]):
                self.assertEqual({d["domain"] for d in K.candidates(SEGS)}, {"pixel.example.com"})
            self.assertEqual(cands["pikseli.fi"]["reg_form"], "Oy")
            self.assertIsNone(cands["pixel.example.com"]["reg_form"])
            self.assertEqual(cands["pixel.mx"]["segment"], "S2")

    def test_failing_source_does_not_stop_pool(self):
        with mock.patch.object(mx_denue, "pool_rows", side_effect=RuntimeError("weg")), \
                mock.patch.object(fi_ytj, "pool_rows", return_value=[{"id": "x"}]), \
                mock.patch.object(fr_francenum, "pool_rows", side_effect=RuntimeError("weg")):
            self.assertEqual(K.register_rows(log=lambda *_: None), [{"id": "x"}])

    def test_old_pool_without_register_columns_still_works(self):
        import duckdb
        with tempfile.TemporaryDirectory() as tmp:
            pool = Path(tmp) / "pool.parquet"
            duckdb.connect().execute(f"""COPY (SELECT 'ov1' id, 'Pixel Studio' AS name, ['https://pixel.example.com'] websites,
                []::VARCHAR[] emails, []::VARCHAR[] phones, NULL street, NULL city, NULL postcode, NULL region, 'US' country,
                'web_designer' category, 0.9::DOUBLE confidence, 'open' operating_status) TO '{pool}' (FORMAT parquet)""")
            with mock.patch.object(K, "POOL", pool):
                self.assertEqual([d["domain"] for d in K.candidates(SEGS)], ["pixel.example.com"])

    def test_workflow_pool_key_bumped(self):
        wf = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "kunden-werk.yml").read_text()
        self.assertNotIn("kunden-pool-v9-", wf)
        self.assertEqual(wf.count("kunden-pool-v10-"), 4)  # Schlüssel, Rückfall, Sichern, Neubau-Vergleich (05.10.2026)
        bau = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "kunden-pool.yml").read_text()
        import re
        self.assertEqual(set(re.findall(r"kunden-pool-v\d+-", wf + bau)), {"kunden-pool-v10-"})  # Neubau gleiche Version


if __name__ == "__main__":
    unittest.main()


class PlaceholderTest(unittest.TestCase):
    def test_suspended_page_has_no_emails(self):
        import kundenwerk as K

        class F:
            def get(self, url):
                return ("http://www.oodda.com/cgi-sys/suspendedpage.cgi", "<html>webmaster@oodda.com</html>")
        res = K.site_scan("http://www.oodda.com", F())
        self.assertEqual(res["emails"], {})
        self.assertTrue(res["placeholder"])
        self.assertTrue(K.hosting_placeholder("https://x.com/", "<title>Account Suspended</title>"))
        self.assertFalse(K.hosting_placeholder("https://x.com/", "<title>Acme Web Design</title>"))

    def test_send_address_problems(self):
        from outreach import address_problems
        self.assertEqual(address_problems("info@acme.com", {"source_url": "https://acme.com/contact"}), [])
        self.assertEqual(len(address_problems("%20service@acme.com", {})), 1)
        self.assertEqual(len(address_problems("webmaster@x.com", {"source_url": "http://x.com/cgi-sys/suspendedpage.cgi"})), 1)

