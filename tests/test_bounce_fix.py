"""Bounce-Analyse 05.10.2026: 4.x.x zählt als vorübergehend, 5.x.x weiter voll; strenge Syntax; Reihenfolge."""
import datetime as dt
import sys
import unittest
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from kundenwerk import address_ok, syntax_strict  # noqa: E402
from lib.bounce_class import details  # noqa: E402
from lib.deliverability import BOUNCE_STOP, MIN_SAMPLE, count_bounces, emergency_stop, is_transient  # noqa: E402
from lib.send_priority import fresh, score  # noqa: E402


def ev(to, status, typ="Permanent", kind="bounced"):
    return {"type": kind, "to_email": to, "payload": {"bounce": {"type": typ, "status": status}}}


class CountTest(unittest.TestCase):
    def test_4xx_not_counted_once(self):
        self.assertTrue(is_transient({"type": "Permanent", "status": "4.4.1"}))
        self.assertEqual(count_bounces([ev("a@x.com", "4.4.1")]), (0, 0))
        # wiederholt bei derselben Adresse: zählt (wie bisher bei „Transient“)
        self.assertEqual(count_bounces([ev("a@x.com", "4.4.1"), ev("a@x.com", "4.4.7")]), (1, 0))

    def test_5xx_and_unknown_count_fully(self):
        for st in ("5.1.1", "5.4.1", "5.1.3", "5.0.0", "5.7.1", "", None):
            self.assertFalse(is_transient({"type": "Permanent", "status": st}))
            self.assertEqual(count_bounces([ev("b@x.com", st)]), (1, 0))

    def test_duplicates_once(self):
        # gleiche Adresse aus Posteingang, Spam-Ordner und zweitem Postfach: einmal
        self.assertEqual(count_bounces([ev("C@x.com", "5.1.1"), ev("c@x.com", "5.1.1"), ev("c@x.com", "5.4.1")]), (1, 0))

    def test_complaint_and_thresholds_unchanged(self):
        self.assertEqual(BOUNCE_STOP, 0.05)
        self.assertEqual(MIN_SAMPLE, 100)
        self.assertIsNotNone(emergency_stop(10, 0, 1))
        self.assertIsNotNone(emergency_stop(100, 6, 0))
        self.assertIsNone(emergency_stop(100, 5, 0))

    def test_details_marks_4xx_transient(self):
        msg = EmailMessage()
        msg["From"] = "MAILER-DAEMON@strato.de"
        msg["Subject"] = "Undelivered Mail Returned to Sender"
        msg.set_content("This is the mail system.\n\n<info@slow.example.com>: delivery failed permanently\n"
                        "    451 4.4.1 Timeout connecting to mail.slow.example.com\n")
        d = details(msg, {"nextgen-profit.de"})
        self.assertEqual(d["info@slow.example.com"]["type"], "Transient")
        msg2 = EmailMessage()
        msg2["From"] = "MAILER-DAEMON@strato.de"
        msg2["Subject"] = "Undelivered Mail Returned to Sender"
        msg2.set_content("<info@gone.example.com>: delivery failed permanently\n"
                         "    550 5.4.1 Recipient address rejected: Access denied\n")
        self.assertEqual(details(msg2, {"nextgen-profit.de"})["info@gone.example.com"]["type"], "Permanent")


class SyntaxTest(unittest.TestCase):
    def test_bad(self):
        for bad in ("%20service@soap.com", ".info@x.com", "info.@x.com", "a..b@x.com", "mailto:info@x.com",
                    "info@-x.com", "info@x-.com", "info@x_y.com", "info@x..com", "jürgen@x.de", "info@x.c0m",
                    "a@b@x.com", "x" * 65 + "@x.com"):
            self.assertFalse(address_ok(bad), bad)

    def test_good(self):
        for good in ("info@example.co.uk", "hello@my-agency.com", "first.last@x.io", "o'neil@x.com", "a+b@x.fr"):
            self.assertTrue(syntax_strict(good), good)
            self.assertTrue(address_ok(good), good)


class PriorityTest(unittest.TestCase):
    def test_fresh_first(self):
        now = dt.datetime.now(dt.timezone.utc)
        p = {"domain": "x.com", "source_url": "https://x.com/contact", "country": "UK", "legal_form": "Ltd",
             "checked_at": (now - dt.timedelta(days=3)).isoformat()}
        old = dict(p, checked_at=(now - dt.timedelta(days=40)).isoformat())
        ov = dict(p, source_url="https://overturemaps.org/x")
        self.assertTrue(fresh(p))
        self.assertFalse(fresh(old))
        self.assertFalse(fresh(ov))
        self.assertGreater(score({"to_email": "info@x.com", "prospects": p}),
                           score({"to_email": "info@x.com", "prospects": old}))


if __name__ == "__main__":
    unittest.main()
