"""Quellen-Scout R37 (05.10.2026): neue Bio-Betriebe aus dem Agence-Bio-Verzeichnis als S2-FR-Premium-Anlass
(Ersteintrag mit Datum + keine Website + Gérant). Ohne Netz."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import qc, sc, segments  # noqa: E402
from extraktor.sources import fr_bio  # noqa: E402

TODAY = dt.date.today()
QUIET = lambda *_: None  # noqa: E731


def item(i, days, *, site="", phone="06 12 34 56 78", state="ENGAGEE", email="ferme.dupont@gmail.com",
         gerant="JEAN DUPONT", name="FERME DUPONT", lieu="12 CHEMIN DES VIGNES"):
    return {
        "id": i, "raisonSociale": name, "denominationcourante": name, "siret": "90000000100011", "numeroBio": 300000 + i,
        "telephone": phone, "telephoneNational": None, "telephoneCommerciale": None, "gerant": gerant, "email": email,
        "siteWebs": [{"url": site, "active": True}],
        "adressesOperateurs": [{"lieu": lieu, "codePostal": "07400", "ville": "VALVIGNERES", "active": True,
                                "pays": "FRANCE", "typeAdresseOperateurs": ["Siège social"]}],
        "annuaireActivites": [{"nom": "Arboriculture"}], "activites": [{"nom": "Production"}],
        "certificats": [{"etatCertification": state, "organisme": "Ecocert France",
                         "dateEngagement": (TODAY - dt.timedelta(days=days)).isoformat()}],
        "venteAnnuaire": {"venteParticuliers": True},
        "datePremierEngagement": (TODAY - dt.timedelta(days=days)).isoformat(),
    }


def items():
    return [
        item(1, 5),                                    # frisch, passt
        item(2, 12, name="EARL LES PRES", gerant="Marie Martin"),  # frisch, passt
        item(3, 45),                                   # zu alt
        item(4, 3, site="https://ferme.fr"),          # hat Website
        item(5, 3, phone=None),                        # ohne Telefon
        item(6, 3, state="ARRETEE"),                   # Zertifikat beendet
        item(7, -2),                                   # Datum in der Zukunft
        item(8, 3, name="0000"),                       # Platzhalter
        item(9, 3, lieu="0000"),                       # Platzhalter-Adresse
    ]


class AgenceBio(unittest.TestCase):
    def test_fresh_age(self):
        self.assertEqual(fr_bio.fresh_age(item(1, 5), TODAY), 5)
        self.assertIsNone(fr_bio.fresh_age(item(3, 45), TODAY))
        self.assertIsNone(fr_bio.fresh_age(item(6, 3, state="ARRETEE"), TODAY))
        self.assertIsNone(fr_bio.fresh_age(dict(item(1, 5), datePremierEngagement="Invalid date"), TODAY))

    def test_companies_keep_only_fresh_without_site_with_phone(self):
        got = fr_bio.companies(items(), TODAY)
        self.assertEqual(sorted(d["id"] for d in got), [1, 2])

    def test_candidate_and_texts(self):
        c = fr_bio.to_candidate(fr_bio.companies(items(), TODAY)[0], TODAY)
        self.assertEqual(c["source"], "agence_bio")
        self.assertEqual(c["country"], "FR")
        self.assertEqual(c["person_name"], "Jean Dupont")
        self.assertEqual(c["person_role"], "Gérant")
        self.assertEqual(c["city"], "Valvigneres")
        self.assertEqual(c["facts"]["bio_new"]["date"], (TODAY - dt.timedelta(days=5)).isoformat())
        ok, _ = segments.fits("S2", c)
        self.assertTrue(ok)
        self.assertFalse(segments.fits("S4", c)[0])
        self.assertFalse(segments.fits("S2", dict(c, email="contact@ferme-dupont.fr"))[0])
        t = segments.texts("S2", c)
        self.assertEqual(t["signal_date"], c["event_date"])
        self.assertIn("Agence Bio", t["signal"])
        self.assertNotRegex(t["opener"], r"\d+ ?%|garanti")
        c["evidence"] = {"mx": True}
        self.assertIn(qc.run(c, "S2")["status"], ("green", "yellow"))
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)

    def test_sole_trader_name_not_contact(self):
        d = fr_bio.companies([item(1, 5, name="ACHILLE CROIZIER", gerant="Achille Croizier")], TODAY)[0]
        c = fr_bio.to_candidate(d, TODAY)
        self.assertEqual(c["person_name"], "")
        d = fr_bio.companies([item(1, 5, gerant="DUPONT")], TODAY)[0]
        self.assertEqual(fr_bio.to_candidate(d, TODAY)["person_name"], "")

    def test_placeholder_person_dropped(self):
        self.assertEqual(fr_bio.person("00000"), "")
        self.assertEqual(fr_bio.person("CHEIKH RABAH"), "Cheikh Rabah")

    def test_load_newest_first_skips_known_and_overture_phones(self):
        from extraktor.sources.overture import phone_key
        with mock.patch.object(fr_bio, "cached", return_value=items()):
            got = fr_bio.load(None, log=QUIET)
            self.assertEqual([c["source_id"] for c in got], ["1", "2"])
            self.assertEqual(fr_bio.load(None, log=QUIET, exclude={"1"})[0]["source_id"], "2")
            self.assertEqual(fr_bio.load(None, log=QUIET, skip_phones={phone_key("06 12 34 56 78")}), [])

    def test_premium_on_store(self):
        from extraktor import run
        from extraktor.store import _premium
        with mock.patch.object(fr_bio, "cached", return_value=items()):
            new = fr_bio.load(None, log=QUIET)[0]
        ev = json.loads(run.dated_event({"facts": new["facts"]}))
        self.assertEqual(ev["dated_event"]["kind"], "bio_first_engagement")
        r = {"segment": "S2", "source": "agence_bio", "signal_type": "", "signal_date": new["event_date"].isoformat(),
             "source_url": new["source_url"], "signal_evidence": json.dumps(ev), "contact_name": new["person_name"],
             "phone": new["phone"], "email": new["email"]}
        p = _premium(r)["premium"]
        self.assertEqual(p["tier"], "premium", p)
        self.assertTrue(any(x.startswith("kombi:") for x in p["reasons"]))
        self.assertIn("person", p["reasons"])
        self.assertEqual(_premium(dict(r, signal_evidence=""))["premium"]["tier"], "standard")


if __name__ == "__main__":
    unittest.main()
