"""Kunden-Werk: S2-Käufer UK aus Companies House Massendaten (JARVIS-Agent 2, 06.10.2026)."""
import datetime as dt
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import kundenwerk as K  # noqa: E402
from extraktor.sources import uk_ch_buyers as B  # noqa: E402
from lib.rules import check_prospect, load_countries  # noqa: E402

HEAD = ("CompanyName,CompanyNumber,RegAddress.AddressLine1,RegAddress.AddressLine2,RegAddress.PostTown,"
        "RegAddress.PostCode,CompanyCategory,CompanyStatus,SICCode.SicText_1,SICCode.SicText_2")


def zip_with(lines: list[str]) -> Path:
    tmp = Path(tempfile.mkdtemp()) / "BasicCompanyDataAsOneFile-2026-10-01.zip"
    with zipfile.ZipFile(tmp, "w") as z:
        z.writestr("data.csv", "\n".join([HEAD, *lines]) + "\n")
    return tmp


class FilterTests(unittest.TestCase):
    def test_extract_keeps_only_active_companies_with_web_sic(self):
        path = zip_with([
            'ORBIS DIGITAL LTD,12345678,1 High St,,LEEDS,ls1 1aa,Private Limited Company,Active,'
            '"62012 - Business and domestic software development",',
            'OLD WEB LTD,22345678,,,LEEDS,LS1 1AA,Private Limited Company,Dissolved,"62012 - x",',
            'SOLE WEB LLP,32345678,,,YORK,YO1 1AA,Limited Liability Partnership,Active,"74100 - specialised design",',
            'KITCHEN CO LTD,42345678,,,YORK,YO1 1AA,Private Limited Company,Active,"47190 - retail",',
            'WEB HOLDINGS LTD,52345678,,,YORK,YO1 1AA,Private Limited Company,Active,"73110 - advertising",',
            'CHARITY WEB,62345678,,,YORK,YO1 1AA,"PRI/LTD BY GUAR/NSC (Private, limited by guarantee, no share capital)",'
            'Active,"62012 - x",',
        ])
        rows = B.extract(path)
        self.assertEqual([r["n"] for r in rows], ["12345678", "32345678"])
        self.assertEqual(rows[0]["form"], "Ltd")
        self.assertEqual(rows[0]["pc"], "LS1 1AA")
        self.assertEqual(rows[1]["form"], "LLP")
        self.assertEqual(B.category_for(rows[1]["sic"]), "graphic_designer")

    def test_categories_are_s2_buyers(self):
        for cat in B.SIC_CATEGORY.values():
            self.assertEqual(K.CATEGORIES.get(cat), "S2", cat)

    def test_web_evidence(self):
        self.assertTrue(B.web_evidence("We offer bespoke Web Design for small businesses"))
        self.assertTrue(B.web_evidence("WordPress website development and SEO"))
        self.assertTrue(B.web_evidence("We build beautiful websites"))
        self.assertIsNone(B.web_evidence("Bespoke kitchen design and fitted furniture"))
        self.assertIsNone(B.web_evidence("IT contractor, Java and cloud consulting"))
        self.assertIsNone(B.web_evidence("Visit our website for opening hours"))


class OrderTests(unittest.TestCase):
    def test_seen_firms_wait_30_days_and_tail_reverses(self):
        rows = [{"n": f"{i:08d}"} for i in range(20)]
        today = dt.date(2026, 10, 6)
        seen = {"00000001": "2026-10-01", "00000002": "2026-08-01"}
        out = K.ch_order(rows, seen, today)
        self.assertNotIn("00000001", [r["n"] for r in out])
        self.assertIn("00000002", [r["n"] for r in out])
        self.assertEqual(K.ch_order(rows, seen, today, tail=True), out[::-1])
        parts = [K.ch_order(rows, {}, today, shard=f"{i}/3") for i in range(3)]
        self.assertEqual(sorted(r["n"] for p in parts for r in p), [r["n"] for r in rows])


class BuyerTests(unittest.TestCase):
    R = {"n": "12345678", "name": "ORBIS DIGITAL LTD", "form": "Ltd", "sic": ["62012"], "street": "1 HIGH ST",
         "city": "LEEDS", "pc": "LS1 1AA"}

    def test_buyer_carries_register_form_and_note(self):
        d = K.ch_buyer(self.R, {"url": "https://orbisdigital.co.uk", "evidence": ["registry_id", "name_full_legal"]})
        self.assertEqual((d["segment"], d["country"], d["domain"]), ("S2", "UK", "orbisdigital.co.uk"))
        self.assertEqual(d["reg_form"], "Ltd")
        self.assertIn("Company No. 12345678 (Companies House", d["reg_note"])
        self.assertEqual(d["category"], "software_development")

    def test_known_domain_skips_without_fetch(self):
        fetcher = mock.Mock()
        with mock.patch("enrich.resolves") as res:
            state, site = K.ch_find_site(self.R, fetcher, {"orbisdigital.co.uk"})
        self.assertEqual((state, site), ("bekannt", None))
        res.assert_not_called()
        fetcher.get.assert_not_called()

    def test_only_verified_site_counts(self):
        weak = {"url": "https://orbisdigital.co.uk", "verified": False, "conflicts": [], "evidence": ["name_core"]}
        strong = {"url": "https://orbisdigitalltd.co.uk", "verified": True, "conflicts": [], "evidence": ["registry_id"]}
        with mock.patch("enrich.resolves", return_value=True), \
                mock.patch("enrich.examine", side_effect=[weak, strong]):
            state, site = K.ch_find_site(self.R, mock.Mock(), set())
        self.assertEqual(state, "gefunden")
        self.assertIs(site, strong)
        with mock.patch("enrich.resolves", return_value=True), mock.patch("enrich.examine", return_value=weak):
            self.assertEqual(K.ch_find_site(self.R, mock.Mock(), set())[0], "keine_website")

    def test_rule_unchanged_personal_address_not_ok(self):
        """Prüfregel bleibt: UK nur allgemeine Firmen-Adressen (generic_only), Rechtsform aus dem Register."""
        cfg = load_countries()
        ok = check_prospect(email="hello@orbisdigital.co.uk", country="UK", website="https://orbisdigital.co.uk",
                            legal_form="Ltd", source_url="https://orbisdigital.co.uk/contact",
                            size_note="Company No. 12345678", suppressed=False, cfg=cfg)
        self.assertTrue(ok.ok)
        personal = check_prospect(email="john.smith@orbisdigital.co.uk", country="UK",
                                  website="https://orbisdigital.co.uk", legal_form="Ltd",
                                  source_url="https://orbisdigital.co.uk/contact", size_note=None,
                                  suppressed=False, cfg=cfg)
        self.assertFalse(personal.ok)


if __name__ == "__main__":
    unittest.main()
