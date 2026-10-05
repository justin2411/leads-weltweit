"""Premium-Radar FR (lib/fr_decp_radar.py): öffentlicher Auftrag laut DECP + Website-Zustand.
Erfundene Firmen, example-Domains – keine echten Lead-Daten."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import release_gate as G, fr_decp_radar as R  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def aw(siret="90000000100011", nom="MENUISERIE DUPRAT SARL", day="2026-09-30", cat="PME", commune="Saint-Lô",
       dep="50", uid="A1", objet="Lot 3 <br />Menuiseries extérieures"):
    return {"uid": uid, "titulaire_id": siret, "titulaire_typeIdentifiant": "SIRET", "titulaire_nom": nom,
            "titulaire_categorie": cat, "titulaire_commune_nom": commune, "titulaire_departement_code": dep,
            "objet": objet, "dateNotification": day, "acheteur_nom": "COMMUNE D'EXEMPLE"}


class SelectTest(unittest.TestCase):
    def test_keeps_fresh_pme_latest_per_siren(self):
        got = R.select([aw(uid="A1", day="2026-09-25"), aw(siret="90000000100029", uid="A2", day="2026-10-01")], TODAY)
        self.assertEqual([r["uid"] for r in got], ["A2"])

    def test_drops_big_old_future_and_foreign(self):
        rows = [aw(cat="ETI"), aw(siret="91", uid="B"), aw(siret="92000000100011", day="2026-09-10"),
                aw(siret="93000000100011", day="2026-10-09"), {**aw(siret="94000000100011"),
                                                             "titulaire_typeIdentifiant": "HORS-UE"}]
        self.assertEqual(R.select(rows, TODAY), [])


class MatchTest(unittest.TestCase):
    comps = [{"id": "c1", "name": "Menuiserie Duprat", "city": "Saint-Lô", "address": "2 rue X, Saint-Lô, 50000"},
             {"id": "c2", "name": "Boulangerie Lenoir", "city": "Saint-Lô", "address": "4 rue X, Saint-Lô, 50000"},
             {"id": "c3", "name": "Menuiserie Duprat", "city": "Caen", "address": "1 rue Y, Caen, 14000"},
             {"id": "c4", "name": "Atelier Alucia", "city": "Saint-Lô", "address": "6 rue X, Saint-Lô, 50000"},
             {"id": "c5", "name": "Chapron Travaux Publics", "city": "St Lô", "address": "8 rue X, Saint-Lô, 50000"}]

    def test_same_place_and_name(self):
        self.assertEqual(list(R.match([aw()], self.comps)), ["c1"])

    def test_brand_in_brackets_and_word_prefix(self):
        a = aw(nom="SOCIETE XYZ (CHAPRON)", siret="95000000100011")
        self.assertEqual(list(R.match([a], self.comps)), ["c5"])

    def test_no_partial_word_or_other_place(self):
        self.assertEqual(R.match([aw(nom="ATELIER A")], self.comps), {})
        self.assertEqual(R.match([aw(commune="Rouen", dep="76")], self.comps), {})

    def test_ambiguous_company_no_match(self):
        comps = self.comps + [{"id": "c6", "name": "Menuiserie Duprat SARL", "city": "Saint-Lô",
                               "address": "9 rue X, Saint-Lô, 50000"}]
        self.assertEqual(R.match([aw()], comps), {})


class LeadTest(unittest.TestCase):
    def item(self, sig="website_outdated", website="https://menuiserie-duprat.example.fr", findings=None):
        findings = [{"type": "website_outdated", "detail": "copyright", "value": "2014"}] if findings is None else findings
        row = {"company_id": "c1", "name": "Menuiserie Duprat", "website": website, "phone_main": "+33233000000",
               "contact": {"phone": "+33233000000", "email": "contact@menuiserie-duprat.example.fr"}, "person": {}}
        obs, lead = R.lead_row(row, aw(), sig, findings, website + "/" if website else "", TODAY)
        return obs, {**lead, "id": "n1", "contact": row["contact"], "person": {},
                     "company": {"name": row["name"], "country": "FR", "city": "Saint-Lô", "website": website,
                                 "address": "2 rue X, Saint-Lô, 50000"}}

    def test_web_finding_lead_passes_gate_and_is_premium(self):
        obs, it = self.item()
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])
        self.assertEqual(it["premium"]["tier"], "premium")
        self.assertIn("marché public", it["event_summary"])
        self.assertNotIn("<br", it["event_summary"])
        self.assertEqual(obs["details"]["dated_event"], {"kind": "public_contract_award", "date": "2026-09-30"})
        self.assertTrue(it["source_url"].endswith("uid__exact=A1"))

    def test_no_website_lead(self):
        _, it = self.item("no_website", website="", findings=[])
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertIn("pas de site", it["event_summary"])
        self.assertEqual(it["premium"]["tier"], "premium")

    def test_texts_french_without_placeholders(self):
        for sig, f in (("website_outdated", None), ("no_https", [{"type": "no_https", "detail": "no_https"}]),
                       ("no_website", [])):
            _, it = self.item(sig, findings=f, website="" if sig == "no_website" else "https://menuiserie-duprat.example.fr")
            for k in ("event_summary", "opener", "urgency_reason"):
                self.assertIsNone(G.PLACEHOLDER.search(it[k]), it[k])
                self.assertIsNone(G.EN_IN_FR.search(it[k]), it[k])


if __name__ == "__main__":
    unittest.main()
