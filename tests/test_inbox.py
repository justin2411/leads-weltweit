import os
import sys
import unittest
from email import message_from_string, policy
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import inbox as mb  # noqa: E402
import outreach  # noqa: E402

DSN = """From: MAILER-DAEMON@mx.zoho.eu
To: hello@signalwerk-mail.com
Subject: Undelivered Mail Returned to Sender
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: text/plain

Delivery failed.

--B
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.zoho.eu

Final-Recipient: rfc822; info@gone-company.co.uk
Action: failed
Status: 5.1.1

--B--
"""


class MailboxTest(unittest.TestCase):
    def test_bounce(self):
        msg = message_from_string(DSN, policy=policy.default)
        self.assertTrue(mb.is_bounce(msg))
        self.assertEqual(mb.parse_bounce(msg), ["info@gone-company.co.uk"])

    def test_bounce_details_status_and_diagnostic_without_addresses(self):
        dsn = DSN.replace("Status: 5.1.1\n", "Status: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 <info@gone-company.co.uk>:\n"
                                                "  Recipient address rejected: User unknown\n")
        msg = message_from_string(dsn, policy=policy.default)
        d = mb.bounce_details(msg)["info@gone-company.co.uk"]
        self.assertEqual((d["type"], d["status"]), ("Permanent", "5.1.1"))
        self.assertIn("User unknown", d["diagnostic"])
        self.assertNotIn("gone-company", d["diagnostic"])  # keine Adressen im gespeicherten Text
        db = mock.Mock()
        db.select.return_value = [{"id": "m1"}]
        with mock.patch.object(mb, "suppress"):
            mb.handle_bounce(db, msg, "imap:<x>", True)
        payload = db.insert.call_args[0][1]["payload"]
        self.assertEqual(payload["bounce"]["status"], "5.1.1")

    def test_failed_with_4xx_status_stays_hard_bounce(self):
        # z. B. 4.4.7 Zustellzeit abgelaufen: endgültig gescheitert -> zählt für die Notbremse wie bisher voll
        msg = message_from_string(DSN.replace("Status: 5.1.1", "Status: 4.4.7"), policy=policy.default)
        d = mb.bounce_details(msg)["info@gone-company.co.uk"]
        self.assertEqual((d["type"], d["status"]), ("Permanent", "4.4.7"))
        from lib.deliverability import count_bounces
        self.assertEqual(count_bounces([{"type": "bounced", "to_email": "a@b.c", "payload": {"bounce": d}}]), (1, 0))

    def test_optout(self):
        self.assertTrue(mb.OPTOUT.search("Please remove us from your list"))
        self.assertTrue(mb.OPTOUT.search("Merci de ne plus nous contacter"))
        self.assertFalse(mb.OPTOUT.search("Yes, please send the sample"))


class DeliverSmtpTest(unittest.TestCase):
    def test_plain_text_with_unsubscribe_headers(self):
        env = {"MAIL_TRANSPORT": "smtp", "MAIL_FROM": "Signalwerk <hello@signalwerk-mail.com>", "SMTP_HOST": "h",
               "SMTP_USER": "u", "SMTP_PASSWORD": "p", "SMTP_PORT": "465"}
        with mock.patch.dict(os.environ, env), mock.patch("smtplib.SMTP_SSL") as smtp:
            out = outreach.deliver("info@acme.co.uk", "Subject", "Body", "https://x/api/unsubscribe?t=ab")
        with mock.patch.dict(os.environ, {**env, "REPLY_TO": "justin@example.com"}), mock.patch("smtplib.SMTP_SSL") as smtp2:
            outreach.deliver("info@acme.co.uk", "Subject", "Body", None)
        reply_msg = smtp2.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(reply_msg["List-Unsubscribe"], "<mailto:justin@example.com?subject=unsubscribe>")
        self.assertIsNone(reply_msg["List-Unsubscribe-Post"])
        self.assertEqual(reply_msg["Reply-To"], "justin@example.com")
        sent = smtp.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(sent.get_content_type(), "text/plain")
        self.assertEqual(sent["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click")
        self.assertIn("@signalwerk-mail.com>", out["smtp_message_id"])


if __name__ == "__main__":
    unittest.main()
