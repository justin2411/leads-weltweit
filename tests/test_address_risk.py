"""Adressprüfung vor der Erstmail (Rückläufer-Analyse 05.10.2026): nur strenger, ohne Netz."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import address_risk as ar  # noqa: E402
from lib.deliverability import is_m365  # noqa: E402

GOOGLE = ["aspmx.l.google.com", "alt1.aspmx.l.google.com"]
M365 = ["acme-com.mail.protection.outlook.com"]
SMALL = ["mail.acme.com"]


class ProblemsTest(unittest.TestCase):
    def test_big_provider_ok(self):
        self.assertEqual(ar.problems("info@acme.com", GOOGLE, False), [])
        self.assertEqual(ar.problems("hello@acme.com", M365, False), [])

    def test_no_mx_blocked_even_with_a_record(self):
        self.assertIn("kein MX", ar.problems("info@acme.com", [], True)[0])

    def test_null_mx(self):
        self.assertIn("Null-MX", ar.problems("info@acme.com", [""], True)[0])
        self.assertIn("Null-MX", ar.problems("info@acme.com", ["localhost"], True)[0])

    def test_unclear_dns_not_sent_not_blocked(self):
        self.assertEqual(ar.problems("info@acme.com", None, None), [ar.UNKLAR])
        self.assertEqual(ar.problems("info@acme.com", SMALL, None), [ar.UNKLAR])

    def test_spam_gateways(self):
        for h in ("fallbackmx.spamexperts.eu", "d1.a.ess.uk.barracudanetworks.com"):
            self.assertIn("Spam-Filter", ar.problems("info@acme.co.uk", [h], True)[0])

    def test_parking_and_disposable(self):
        self.assertIn("geparkt", ar.problems("info@acme.com", ["mx.sedoparking.com"], True)[0])
        self.assertEqual(ar.problems("info@mailinator.com", GOOGLE, True), ["Wegwerf-Domain"])

    def test_m365_collective_addresses(self):
        for lp in ("info", "admin", "INFO"):
            self.assertIn("Microsoft 365", ar.problems(f"{lp}@acme.co.uk", M365, True)[0])
        self.assertIn("Microsoft 365", ar.problems("info@moirae.co.uk", ["moirae-co-uk.mail.eo.outlook.com"], True)[0])
        self.assertEqual(ar.problems("contact@acme.co.uk", M365, True), [])

    def test_small_server_needs_dmarc(self):
        self.assertIn("ohne DMARC", ar.problems("info@acme.com", SMALL, False)[0])
        self.assertIn("ohne DMARC", ar.problems("info@acme.fr", ["mx0.mail.ovh.net"], False)[0])
        self.assertEqual(ar.problems("info@acme.com", SMALL, True), [])

    def test_check_uses_lookups_and_skips_dmarc_for_big(self):
        calls = []
        dm = lambda d: calls.append(d) or False  # noqa: E731
        self.assertEqual(ar.check("info@acme.com", lambda d: GOOGLE, dm), [])
        self.assertEqual(calls, [])
        self.assertIn("ohne DMARC", ar.check("info@acme.com", lambda d: SMALL, dm)[0])
        self.assertEqual(calls, ["acme.com"])

    def test_m365_eo_detected(self):
        self.assertTrue(is_m365(["moirae-co-uk.mail.eo.outlook.com"]))


class RoleTest(unittest.TestCase):
    def test_webmaster_blocked(self):
        import outreach
        self.assertTrue(outreach.role_address("webmaster@acme.com"))
        self.assertFalse(outreach.role_address("hello@acme.com"))


class ScanTest(unittest.TestCase):
    def test_scan_skips_unclear(self):
        import adresspruefung
        res = {"a@x.com": ["kein MX-Eintrag"], "b@y.com": [ar.UNKLAR], "c@z.com": []}
        rows = [{"id": "1", "to_email": "a@x.com"}, {"id": "2", "to_email": "b@y.com"}, {"id": "3", "to_email": "c@z.com"}]
        self.assertEqual(adresspruefung.scan(rows, check=lambda e: res[e], workers=2), {"1": ["kein MX-Eintrag"]})


if __name__ == "__main__":
    unittest.main()
