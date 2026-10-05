"""Quellen-Scout R40 (05.10.2026): neu zertifizierte Diagnostiqueurs immobiliers (DGALN-Verzeichnis) als
S2-FR-Premium-Anlass (erstmals im Verzeichnis + keine Website). Ohne Netz."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import segments  # noqa: E402
from extraktor.run import dated_event  # noqa: E402
from extraktor.sources import fr_diag  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def row(nom, prenom, days, *, soc="individuel", email=None, cp="75011", tel="0612345678", typ="Gaz"):
    return {"Nom": nom, "Prenom": prenom, "Societe": soc, "Adresse": "12 rue de la paix", "CP": cp,
            "Ville": "paris", "Tel1": tel, "Tel2": "", "email": email or f"{prenom}.{nom}@gmail.com",
            "Organisme": "LCC QUALIXPERT", "Type de certificat": typ,
            "Date début validité": (TODAY - dt.timedelta(days=days)).isoformat(), "Date fin validité": "2033-01-01"}


class Diag(unittest.TestCase):
    def test_fresh_only_new_people(self):
        old = [row("ancien", "paul", 2000), row("autre", "x", 2000, email="moved@gmail.com")]
        new = [row("ancien", "paul", 3),                      # Verlängerung: stand schon im alten Verzeichnis
               row("neuer", "nom", 3, email="moved@gmail.com"),  # gleiche E-Mail wie vorher -> nicht neu
               row("dupont", "marie", 5), row("dupont", "marie", 6, typ="DPE"),
               row("vieux", "jean", 45),                      # zu alt
               row("futur", "luc", -3)]                       # in der Zukunft
        got = fr_diag.fresh(new, old, TODAY)
        self.assertEqual([g["Nom"] for g in got], ["dupont"])
        self.assertEqual(got[0]["first"], (TODAY - dt.timedelta(days=6)).isoformat())
        self.assertEqual(got[0]["types"], ["DPE", "Gaz"])

    def test_companies_freemail_phone_and_no_networks(self):
        items = fr_diag.fresh([row("a", "b", 3), row("c", "d", 3, email="c@reseau-diag.fr"),
                               row("e", "f", 3, tel=""), row("g", "h", 3, soc="centre f"),
                               row("i", "j", 3, soc="centre f"), row("k", "l", 3, soc="SARL Sebi")], [], TODAY)
        self.assertEqual(sorted(d["Nom"] for d in fr_diag.companies(items)), ["a", "k"])

    def test_candidate_person_only_for_sole_trader(self):
        items = fr_diag.companies(fr_diag.fresh([row("martin", "paul", 4), row("k", "l", 4, soc="sarl sebi")], [], TODAY))
        c = {d["Nom"]: fr_diag.to_candidate(d, TODAY) for d in items}
        self.assertEqual(c["martin"]["person_name"], "Paul Martin")
        self.assertEqual(c["martin"]["name"], "Paul Martin Diagnostic Immobilier")
        self.assertEqual(c["k"]["person_name"], "")
        self.assertEqual(c["k"]["name"], "SARL Sebi")
        ok, _ = segments.fits("S2", c["martin"])
        self.assertTrue(ok)
        t = segments.texts("S2", c["martin"])
        self.assertIn("diagnostiqueur", t["signal"])
        ev = dated_event({"facts": c["martin"]["facts"]})
        self.assertIn("diagnostiqueur_certification", ev)


if __name__ == "__main__":
    unittest.main()
