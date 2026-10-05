"""Kontakt-Werk (Inhaber 05.10.2026): Register + Firmenwebsite zusammenführen und gegenprüfen (lib/kontakt.py,
scripts/kontaktwerk.py). Ohne Netz: Register und Website kommen aus Attrappen."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import kontakt as K  # noqa: E402

TODAY = dt.date(2026, 10, 5)
FR_CO = {"name": "Atelier Morel Luc", "country": "FR", "address": "1 Rue de l Exemple, Valence, 26000",
         "phone_main": "+33600000001"}
FR_CONTACT = {"email": "atelier.morelluc@gmail.com", "phone": "+33600000001"}
FR_RES = {"siren": "000000001", "nom_complet": "ATELIER MOREL LUC", "etat_administratif": "A",
          "siege": {"code_postal": "26000", "liste_enseignes": ["DPF"]},
          "dirigeants": [{"nom": "MOREL (MOREL)", "prenoms": "LUC", "qualite": "Président de SAS",
                          "type_dirigeant": "personne physique"}]}

HOME = """<html><head><title>Bright Pixel Design Ltd</title></head><body>
<h1>Bright Pixel Design Ltd</h1><p>Call us: <a href="tel:+442079460000">020 7946 0000</a></p>
<p>Email <a href="mailto:hello@brightpixel.co.uk">hello@brightpixel.co.uk</a></p>
<a href="/contact">Contact</a></body></html>"""
CONTACT = """<html><body><h2>Contact Bright Pixel Design Ltd</h2><p>Director: Sarah Thompson</p>
<p>12 High Street, London, EC1A 1BB</p><p>Company number 12345678</p></body></html>"""
UK_CO = {"name": "Bright Pixel Design Ltd", "country": "UK", "address": "12 High Street, London, EC1A 1BB",
         "website": "https://brightpixel.co.uk", "phone_main": "+442079460000"}


class RegisterTests(unittest.TestCase):
    def test_fr_record_dirigeant_and_ei(self):
        r = K.fr_record(FR_RES, "id")
        self.assertEqual((r["name"], r["role"], r["postcode"], r["active"]), ("Luc Morel", "Président de SAS", "26000", True))
        ei = {"siren": "1", "nom_complet": "MARIE DUPONT", "nature_juridique": "1000", "etat_administratif": "A",
              "siege": {"code_postal": "75011"}, "dirigeants": []}
        self.assertEqual(K.fr_record(ei, "id")["name"], "Marie Dupont")
        self.assertEqual(K.fr_record(ei, "id")["role"], "Entrepreneur individuel")

    def test_fr_establishment_postcode_counts(self):
        res = {**FR_RES, "siege": {"code_postal": "75008"}, "matching_etablissements": [{"code_postal": "26000"}]}
        k = K.merge(FR_CO, FR_CONTACT, {}, K.fr_record(res, "id"), None, TODAY)
        self.assertIn("plz", k["person"]["belege"])  # SIRET der Niederlassung: PLZ der Niederlassung passt
        self.assertEqual(k["widerspruch"], [])

    def test_fr_pick_needs_name_and_postcode_and_exactly_one(self):
        res = [FR_RES]
        self.assertIs(K.fr_pick(res, "Atelier MOREL Luc", "26000"), FR_RES)
        self.assertIsNone(K.fr_pick(res, "Atelier MOREL Luc", "75001"))   # andere PLZ
        self.assertIsNone(K.fr_pick(res, "Autre Société", "26000"))       # anderer Name
        self.assertIsNone(K.fr_pick([FR_RES, dict(FR_RES)], "Atelier MOREL Luc", "26000"))  # nicht eindeutig

    def test_uk_pick(self):
        items = [{"title": "BRIGHT PIXEL DESIGN LIMITED", "company_number": "12345678", "company_status": "active",
                  "address": {"postal_code": "EC1A 1BB"}},
                 {"title": "BRIGHT PIXEL DESIGN LIMITED", "company_number": "999", "company_status": "dissolved",
                  "address": {"postal_code": "EC1A 1BB"}}]
        self.assertEqual(K.uk_pick(items, "Bright Pixel Design Ltd", "EC1A1BB")["company_number"], "12345678")
        self.assertIsNone(K.uk_pick(items, "Bright Pixel Design Ltd", "SW1A1AA"))

    def test_postcodes(self):
        self.assertEqual(K.lead_postcode(FR_CO), "26000")
        self.assertEqual(K.lead_postcode(UK_CO), "EC1A1BB")
        self.assertEqual(K.lead_postcode({"country": "US", "address": "5450 N Central Ave, Chicago, IL 60630-1305"}), "60630")


class MergeTests(unittest.TestCase):
    def test_register_by_id_with_postcode_and_email_name_is_confirmed(self):
        reg = K.fr_record(FR_RES, "id")
        k = K.merge(FR_CO, FR_CONTACT, {"name": None, "role": "Gérant"}, reg, None, TODAY)
        self.assertEqual(k["person"]["name"], "Luc Morel")
        self.assertEqual(k["person"]["belege"], ["email_name", "plz", "register_id"])
        self.assertTrue(k["person_neu"])
        self.assertEqual(k["email"]["belegt"], ["email_name"])
        self.assertEqual((k["stufe"], k["premium_punkt"]), ("bestaetigt", True))

    def test_other_postcode_is_contradiction_and_no_person(self):
        reg = {**K.fr_record(FR_RES, "id"), "postcode": "75001", "postcodes": ["75001"]}
        k = K.merge(FR_CO, {"email": "info@x.fr", "phone": "+33600000001"}, {}, reg, None, TODAY)
        self.assertIsNone(k["person"])
        self.assertIn("plz_register_abweichend", k["widerspruch"])
        self.assertEqual(k["stufe"], "widerspruch")
        self.assertFalse(k["premium_punkt"])

    def test_single_beleg_is_not_enough(self):
        reg = {**K.fr_record(FR_RES, "id"), "postcode": "", "postcodes": []}  # nur die Nummer, keine PLZ, keine Mail mit Namen
        k = K.merge(FR_CO, {"email": "contact@x.fr", "phone": "+33600000001"}, {}, reg, None, TODAY)
        self.assertIsNone(k["person"])
        self.assertEqual(k["stufe"], "leer")

    def test_known_other_name_is_kept_and_flagged(self):
        reg = K.fr_record(FR_RES, "id")
        k = K.merge(FR_CO, FR_CONTACT, {"name": "Paul Martin", "role": "Gérant"}, reg, None, TODAY)
        self.assertIn("person_bestand_abweichend", k["widerspruch"])
        self.assertEqual(k["person"]["name"], "Paul Martin")  # nichts überschrieben
        self.assertFalse(k["person_neu"])

    def test_website_confirms_phone_email_and_director(self):
        pages = {"https://brightpixel.co.uk/": HOME, "https://brightpixel.co.uk/contact": CONTACT}
        reg = {"name": "Sarah Thompson", "role": "Director", "source": K.UK_SOURCE, "via": "id", "postcode": "EC1A 1BB",
               "active": True}
        site = K.site_facts(pages, "https://brightpixel.co.uk/", {**UK_CO, "registry_id": "12345678"}, reg["name"])
        self.assertTrue(site["verified"])
        k = K.merge(UK_CO, {"email": "hello@brightpixel.co.uk", "phone": "+442079460000"}, {}, reg, site, TODAY)
        self.assertEqual(k["person"]["belege"], ["impressum", "plz", "register_id"])
        self.assertEqual(k["phone"]["belegt"], ["website"])
        self.assertEqual(k["email"]["belegt"], ["domain", "website"])
        self.assertEqual(k["stufe"], "bestaetigt")

    def test_website_person_differs_from_register(self):
        pages = {"https://brightpixel.co.uk/": HOME, "https://brightpixel.co.uk/contact": CONTACT}
        reg = {"name": "John Miller", "role": "Director", "source": K.UK_SOURCE, "via": "id", "postcode": "EC1A 1BB",
               "active": True}
        site = K.site_facts(pages, "https://brightpixel.co.uk/", {**UK_CO, "registry_id": "12345678"}, reg["name"])
        k = K.merge(UK_CO, {"email": "hello@brightpixel.co.uk", "phone": "+442079460000"}, {}, reg, site, TODAY)
        self.assertIn("person_website_abweichend", k["widerspruch"])
        self.assertIsNone(k["person"])
        self.assertEqual(k["stufe"], "widerspruch")  # Widerspruch geht vor (Kontakt allein reicht nicht)

    def test_no_guessed_email(self):
        reg = K.fr_record(FR_RES, "id")
        k = K.merge(FR_CO, {"phone": "+33600000001"}, {}, reg, None, TODAY)
        self.assertIsNone(k["email"])
        self.assertNotIn("email", k["funde"])
        self.assertNotEqual(k["stufe"], "bestaetigt")


class PremiumTests(unittest.TestCase):
    def test_nachtrag(self):
        k = {"premium_punkt": True}
        score, p = K.premium_nachtrag(60, {"tier": "standard", "reasons": ["frisch_3_tage", "kontakt"]}, k)
        self.assertEqual(score, 75)
        self.assertEqual(p["tier"], "premium")
        self.assertIn("person", p["reasons"])
        self.assertIsNone(K.premium_nachtrag(75, p, k))  # nur einmal
        self.assertIsNone(K.premium_nachtrag(None, None, k))  # noch nicht bewertet: Bewertung zählt die Person selbst
        self.assertIsNone(K.premium_nachtrag(60, {}, {"premium_punkt": False}))
        # 15–30 Tage alt: Punkte ja, Premium nein (Premium = frisch ≤ 14 Tage)
        s3, p3 = K.premium_nachtrag(60, {"tier": "standard", "reasons": ["frisch_20_tage", "beleg", "kontakt"]}, k)
        self.assertEqual((s3, p3["tier"]), (75, "standard"))
        s2, p2 = K.premium_nachtrag(60, {"reasons": ["kontakt"]}, k)
        self.assertEqual((s2, p2["tier"]), (75, "standard"))  # ohne frisches Ereignis nie premium


class FakeSources:
    def __init__(self, reg=None, pages=None):
        self.reg, self.pages, self.calls = reg, pages, {}

    def register(self, row):
        return self.reg

    def website(self, row):
        return self.pages


class RunTests(unittest.TestCase):
    def _db(self, **extra):
        lead = {"lead_id": "L1", "company_id": "C1", "country": "FR", "premium_score": 60,
                "premium": {"tier": "standard", "reasons": ["frisch_2_tage", "kontakt"]}, "name": FR_CO["name"],
                "address": FR_CO["address"], "website": None, "phone_main": FR_CO["phone_main"],
                "registry_source": "rge", "registry_id": "00000000100011", "website_fetched_at": None, **extra}
        db = FakeDB({"leads": [{"id": "L1", "company_id": "C1"}],
                     "observations": [{"company_id": "C1", "kind": "other", "key": "contact", "details": FR_CONTACT},
                                      {"company_id": "C1", "kind": "other", "key": "person",
                                       "details": {"name": None, "role": "Gérant"}}],
                     "lead_checks": [], "owner_settings": []})
        db.rpc_handlers["kontakt_candidates"] = lambda a, p=None: [lead] if a["p_group"] == "premium" else []
        return db

    def test_run_writes_lead_person_and_premium(self):
        import kontaktwerk as KW
        db = self._db()
        total = KW.run(db, (0, 1), deadline_min=1, batch=10, apply=True, ch_key=None, log=lambda *a: None,
                       src=FakeSources(reg=K.fr_record(FR_RES, "id")))
        self.assertEqual((total["geprueft"], total["bestaetigt"], total["person_neu"], total["premium"]), (1, 1, 1, 1))
        lead = db.tables["leads"][0]
        self.assertEqual(lead["kontakt"]["stufe"], "bestaetigt")
        self.assertEqual(lead["premium_score"], 75)
        person = [o for o in db.tables["observations"] if o["key"] == "person"][0]
        self.assertEqual(person["details"]["name"], "Luc Morel")
        stats = [r for r in db.tables.get("run_stats", [])]
        self.assertEqual(stats[0]["werk"], "kontakt-werk")
        self.assertEqual((stats[0]["green"], stats[0]["extra"]["personen_neu"]), (1, 1))

    def test_probelauf_writes_nothing_and_web_respects_daily_limit(self):
        import kontaktwerk as KW
        now = KW._now().isoformat()
        db = self._db(website="https://example.fr", website_fetched_at=now)
        src = FakeSources(reg=None, pages={"https://example.fr/": "<html></html>"})
        total = KW.run(db, (0, 1), deadline_min=1, batch=10, apply=False, ch_key=None, log=lambda *a: None, src=src)
        self.assertEqual(total.get("web_spaeter"), 1)  # heute schon gelesen: nicht nochmal, nicht als geprüft markiert
        self.assertNotIn("kontakt", db.tables["leads"][0])
        self.assertFalse(KW.web_allowed({"lead_id": "x", "website": "https://a.fr"}, {"x"}, KW._now()))
        self.assertTrue(KW.web_allowed({"lead_id": "x", "website": "https://a.fr"}, set(), KW._now()))


if __name__ == "__main__":
    unittest.main()
