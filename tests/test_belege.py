"""Beleg-Einstieg (Gehirn 05.10.2026): Bereitschaft je Land, nur Firmen, 2 Belege, keine Personendaten."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import belege as B  # noqa: E402


def lead(name, sig="no_website", d="2026-10-01"):
    return {"company_name": name, "signal_type": sig, "event_date": d}


class BelegeTest(unittest.TestCase):
    def test_bereit_nur_mit_puffer(self):
        self.assertEqual(B.bedarf(), 200)
        self.assertTrue(B.bereit(2700))   # US
        self.assertFalse(B.bereit(317))   # UK
        self.assertFalse(B.bereit(142))   # FR
        self.assertFalse(B.bereit(None))

    def test_nur_kapitalgesellschaften(self):
        self.assertTrue(B.firma_ok("Blue Ridge Hauling LLC", "US"))
        self.assertTrue(B.firma_ok("Acme Inc.", "US"))
        self.assertTrue(B.firma_ok("SARL Dupont Bois", "FR"))
        self.assertFalse(B.firma_ok("John Smith Trucking", "US"))
        self.assertFalse(B.firma_ok("Smith & Co", "US"))  # Personengesellschaft
        self.assertFalse(B.firma_ok("Jane Doe", "UK"))
        self.assertFalse(B.firma_ok("", "UK"))

    def test_einstieg_en(self):
        t = B.einstieg([lead("John Smith Trucking"), lead("Blue Ridge Hauling LLC"),
                        lead("Blue Ridge Hauling LLC", d="2026-10-02"), lead("Acme Inc", "cert_expiring", "2026-10-04")],
                       "US")
        # kein „this week“ (Premium bis 14 Tage) und keine Aussage, die nicht für jeden Anlass stimmt
        self.assertEqual(t, "Two recent examples: Blue Ridge Hauling LLC (registered, no website yet, Oct 1) and "
                            "Acme Inc (security certificate about to expire, Oct 4).")
        self.assertNotIn("Smith", t)

    def test_einstieg_fr(self):
        t = B.einstieg([lead("Atelier Bois SAS", "no_https", "2026-10-03"), lead("SARL Dupont", d="2026-09-30")], "FR")
        self.assertTrue(t.startswith("Deux exemples récents : "))
        self.assertIn("Atelier Bois SAS (site sans HTTPS, 3 octobre)", t)

    def test_muster_nur_zur_pruefung(self):
        self.assertTrue(B.muster("US").startswith("Two recent examples: "))
        self.assertTrue(B.muster("UK").startswith("Two recent examples: "))
        self.assertTrue(B.muster("FR").startswith("Deux exemples récents : "))

    def test_zu_wenig_belege(self):
        self.assertIsNone(B.einstieg([lead("Acme Inc")], "US"))
        self.assertIsNone(B.einstieg([lead("Acme Inc"), lead("Beta LLC", "unbekannt")], "US"))
        self.assertIsNone(B.einstieg([lead("Acme Inc"), lead("Beta LLC", d=None)], "US"))


if __name__ == "__main__":
    unittest.main()
