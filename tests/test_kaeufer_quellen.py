"""Kunden-Werk: offene Register als Käuferquellen für Webagenturen (MX DENUE, FI YTJ; 04.10.2026)."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import kundenwerk as K  # noqa: E402
from extraktor.sources import fi_ytj, mx_denue  # noqa: E402
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


class CheckOneTests(unittest.TestCase):
    def setUp(self):
        self.cfg = load_countries()
        self.generic = {g.lower() for g in self.cfg.get("generic_local_parts") or []}

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
        with self.scan({}):
            row = K.check_one(d, None, self.cfg, self.generic, set())
        self.assertEqual((row["email"], row["check_status"]), ("contacto@pixel.mx", "ok"))
        self.assertIn("DENUE", row["source_url"])


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
            with mock.patch.object(K, "POOL", pool):
                cands = {d["domain"]: d for d in K.candidates(SEGS)}
            self.assertEqual(set(cands), {"pixel.example.com", "pixel.mx", "pikseli.fi"})
            self.assertEqual(cands["pikseli.fi"]["reg_form"], "Oy")
            self.assertIsNone(cands["pixel.example.com"]["reg_form"])
            self.assertEqual(cands["pixel.mx"]["segment"], "S2")

    def test_failing_source_does_not_stop_pool(self):
        with mock.patch.object(mx_denue, "pool_rows", side_effect=RuntimeError("weg")), \
                mock.patch.object(fi_ytj, "pool_rows", return_value=[{"id": "x"}]):
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
        self.assertNotIn("kunden-pool-v7-", wf)
        self.assertEqual(wf.count("kunden-pool-v8-"), 2)


if __name__ == "__main__":
    unittest.main()
