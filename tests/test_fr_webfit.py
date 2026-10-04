import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import kundenwerk as K  # noqa: E402
from extraktor.sources import fr_sirene  # noqa: E402
from lib import fr_webfit as F  # noqa: E402
from lib.rules import CheckResult, load_countries  # noqa: E402

AGENCY = "<html><body><h1>Agence web à Lyon</h1><p>Création de sites internet sur mesure.</p></body></html>"
SOFTWARE = "<html><body><h1>Logiciel RH</h1><p>Mentions légales du site. Éditeur du site : Combo SAS.</p></body></html>"


class VerdictTest(unittest.TestCase):
    def test_web_naf_and_evidence(self):
        ok, why = F.verdict("62.01Z", AGENCY)
        self.assertTrue(ok)
        self.assertIn("6201Z", why)

    def test_all_four_codes(self):
        for code in ("6201Z", "62.02A", "73.11Z", "7410z"):
            self.assertTrue(F.verdict(code, AGENCY)[0], code)

    def test_other_naf_fails(self):
        ok, why = F.verdict("70.22Z", AGENCY)
        self.assertFalse(ok)
        self.assertIn("7022Z", why)

    def test_missing_naf_fails(self):
        self.assertFalse(F.verdict(None, AGENCY)[0])

    def test_no_evidence_fails(self):
        # „site“ in den Mentions légales ist kein Webdesign-Nachweis
        self.assertFalse(F.verdict("6201Z", SOFTWARE)[0])

    def test_unreadable_fails(self):
        self.assertFalse(F.verdict("6201Z", AGENCY, loaded=False)[0])
        self.assertFalse(F.verdict("6201Z", "")[0])

    def test_parked_fails(self):
        html = "<title>agence-web.fr</title><p>Ce nom de domaine est à vendre. Création de sites.</p>"
        ok, why = F.verdict("6201Z", html)
        self.assertFalse(ok)
        self.assertIn("Park", why)
        self.assertTrue(F.parked("<p>This domain is for sale!</p>"))
        self.assertTrue(F.parked("", "https://sedoparking.com/x"))
        self.assertFalse(F.parked(AGENCY))

    def test_evidence_variants(self):
        for t in ("Webdesign", "web design", "conception de votre site", "réalisation de sites vitrines",
                  "intégratrice web", "refonte de site", "agence web", "Création de site e-commerce"):
            self.assertTrue(F.web_evidence(f"<p>{t}</p>"), t)
        self.assertIsNone(F.web_evidence("<p>Ce site utilise des cookies. Plan du site.</p>"))

    def test_applies_only_s2_fr(self):
        self.assertTrue(F.applies("S2", "FR"))
        self.assertFalse(F.applies("S2", "UK"))
        self.assertFalse(F.applies("S1", "FR"))


class FrwebValuesTest(unittest.TestCase):
    row = {"id": 1, "check_status": "ok", "check_reason": "OK | Regel-Nachprüfung 04.10.2026"}

    def test_downgrade_never_delete(self):
        v = K.frweb_values(self.row, False, "NAF 7022Z ist keine Web-/Design-Branche", CheckResult(True), "04.10.2026")
        self.assertEqual(v["check_status"], "rejected")
        self.assertIn(F.MARK, v["check_reason"])
        self.assertIn("kein Webdesign-Bezug", v["check_reason"])
        self.assertLessEqual(len(v["check_reason"]), 500)

    def test_fit_stays_ok_with_mark(self):
        v = K.frweb_values(self.row, True, "NAF 6201Z + Website „agence web“", CheckResult(True), "04.10.2026")
        self.assertEqual(v["check_status"], "ok")
        self.assertIn(F.MARK, v["check_reason"])
        self.assertIn("Regel-Nachprüfung", v["check_reason"])

    def test_fit_but_rule_fails_never_ok(self):
        r = {"id": 2, "check_status": "call_only", "check_reason": f"Regel OK, {F.PENDING}"}
        v = K.frweb_values(r, True, "NAF 6201Z + Website", CheckResult(False, ["Sperrliste"]), "04.10.2026")
        self.assertNotIn("check_status", v)

    def test_pending_upgrade_only_with_both(self):
        r = {"id": 3, "check_status": "call_only", "check_reason": f"Regel OK, {F.PENDING}"}
        self.assertEqual(K.frweb_values(r, True, "NAF 6201Z + Website", CheckResult(True), "x")["check_status"], "ok")
        self.assertEqual(K.frweb_values(r, False, "kein Code NAF", CheckResult(True), "x")["check_status"], "rejected")


class RulesRecheckTest(unittest.TestCase):
    def test_fr_s2_waits_for_webdesign_check(self):
        cfg = load_countries()
        r = {"id": 9, "segment_id": "S2", "country": "FR", "email": "contact@agence-exemple.fr",
             "website": "https://agence-exemple.fr", "legal_form": None, "source_url": "https://agence-exemple.fr/contact",
             "size_note": "x", "domain": "agence-exemple.fr", "check_status": "call_only",
             "check_reason": "nur Anruf/Brief – Rechtsform"}
        v = K.rules_recheck_values(r, cfg, set(), "04.10.2026")
        self.assertNotIn("check_status", v)
        self.assertIn(F.PENDING, v["check_reason"])


class TokensTest(unittest.TestCase):
    def test_name_tokens(self):
        self.assertEqual(fr_sirene._tokens("Agence Kalikado"), fr_sirene._tokens("KALIKADO"))
        self.assertEqual(fr_sirene._tokens("GROGNET CELINE"), fr_sirene._tokens("Céline Grognet"))
        self.assertNotEqual(fr_sirene._tokens("Web etc."), fr_sirene._tokens("Web Factory"))


if __name__ == "__main__":
    unittest.main()
