"""Bounce-Gründe (04.10.2026): Klasse, DSN-Felder und Text-Rückläufer (Strato/Postfix, Gmail, Outlook, Exim)."""
import sys
import unittest
from email import message_from_string, policy
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import inbox  # noqa: E402
from lib import bounce_class as B  # noqa: E402
from lib.deliverability import count_bounces  # noqa: E402

STRATO_DSN = """From: MAILER-DAEMON@smtp.strato.de (Mail Delivery System)
To: info@nextgen-profit.de
Subject: Undelivered Mail Returned to Sender
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: text/plain

This is the mail system at host smtp.strato.de.

<info@reach-media.com>: host mail.reach-media.com[162.214.153.62] said: 451 4.4.1
    Timeout connecting to mail.reach-media.com

--B
Content-Type: message/delivery-status

Reporting-MTA: dns; smtp.strato.de

Final-Recipient: rfc822; info@reach-media.com
Action: failed
Status: 4.4.1
Remote-MTA: dns; mail.reach-media.com
Diagnostic-Code: smtp; 451 4.4.1 Timeout connecting to mail.reach-media.com

--B--
"""

# Strato-DSN ohne Status/Diagnostic-Code im delivery-status: Grund steht nur im lesbaren Teil
STRATO_BARE = """From: MAILER-DAEMON@smtp.strato.de
To: info@nextgen-profit.de
Subject: Undelivered Mail Returned to Sender
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: text/plain

<hello@gone-agency.com>: host mx.gone-agency.com[1.2.3.4] said: 550 5.1.1
    <hello@gone-agency.com>: Recipient address rejected: User unknown (in reply to RCPT TO command)

--B
Content-Type: message/delivery-status

Reporting-MTA: dns; smtp.strato.de

Final-Recipient: rfc822; hello@gone-agency.com
Action: failed

--B--
"""

GMAIL_TEXT = """From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: webagency@nextgen-profit.de
Subject: Delivery Status Notification (Failure)
X-Failed-Recipients: info@nobody-studio.com
Content-Type: text/plain; charset=UTF-8

Address not found

Your message wasn't delivered to info@nobody-studio.com because the address couldn't be found, or is unable
to receive mail.

The response from the remote server was:
550 5.1.1 The email account that you tried to reach does not exist.
"""

OUTLOOK_TEXT = """From: postmaster@outlook.com
To: leads@nextgen-profit.de
Subject: Undeliverable: Leads across the US
Content-Type: text/plain; charset=UTF-8

Delivery has failed to these recipients or groups:

contact@blocked-co.com (contact@blocked-co.com)
Your message couldn't be delivered. The recipient's email system rejected it.

Diagnostic information for administrators:

Generating server: BN8PR.prod.outlook.com
Remote Server returned '550 5.7.1 Service unavailable, Client host [81.169.146.1] blocked using Spamhaus'
"""

DOMAIN_TEXT = """From: MAILER-DAEMON@smtp.strato.de
To: info@nextgen-profit.de
Subject: Undelivered Mail Returned to Sender
Content-Type: text/plain

I'm sorry to have to inform you that your message could not be delivered to one or more recipients.

<info@no-such-domain.co.uk>: Host or domain name not found. Name service error for
    name=no-such-domain.co.uk type=MX: Host not found, try again
"""

DELAY_TEXT = """From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: info@nextgen-profit.de
Subject: Delivery Status Notification (Delay)
Content-Type: text/plain

Message temporarily deferred. Your message to slow@slow-host.com has not yet been delivered. We will retry.
451 4.4.1 Timeout
"""


def msg(s):
    return message_from_string(s, policy=policy.default)


class Klasse(unittest.TestCase):
    def test_klassen(self):
        self.assertEqual(B.klasse("5.1.1", "550 5.1.1 User unknown"), "hart")
        self.assertEqual(B.klasse("5.4.4", "Host or domain name not found"), "hart")
        self.assertEqual(B.klasse("4.4.1", "451 4.4.1 Timeout connecting to mail.x.com"), "weich")
        self.assertEqual(B.klasse("5.2.2", "552 5.2.2 Mailbox full"), "weich")
        self.assertEqual(B.klasse("5.7.1", "554 5.7.1 blocked using Spamhaus"), "richtlinie")
        self.assertEqual(B.klasse("", "550 Message rejected as spam"), "richtlinie")
        self.assertEqual(B.klasse(None, "550 5.1.10 RESOLVER.ADR.RecipientNotFound"), "hart")
        self.assertEqual(B.klasse("5.7.1", "554 5.7.1 Recipient address rejected: mailbox is over quota"), "weich")
        self.assertEqual(B.klasse("5.7.1", "550 5.7.1 User unknown"), "hart")
        self.assertEqual(B.klasse(None, None), "unbekannt")
        self.assertEqual(B.klasse("5.0.0", "something odd"), "unbekannt")


class Parsen(unittest.TestCase):
    def test_strato_dsn_mit_remote_mta(self):
        d = B.details(msg(STRATO_DSN))["info@reach-media.com"]
        self.assertEqual((d["status"], d["klasse"], d["remote_mta"], d["quelle"]),
                         ("4.4.1", "weich", "mail.reach-media.com", "dsn"))
        self.assertEqual(d["type"], "Permanent")  # Notbremse zählt voll – nie lockern
        self.assertEqual(count_bounces([{"type": "bounced", "to_email": "x", "payload": {"bounce": d}}]), (1, 0))

    def test_dsn_ohne_felder_nimmt_grund_aus_text(self):
        d = B.details(msg(STRATO_BARE))["hello@gone-agency.com"]
        self.assertEqual((d["status"], d["klasse"]), ("5.1.1", "hart"))
        self.assertIn("User unknown", d["diagnostic"])
        self.assertNotIn("hello@", d["diagnostic"])
        self.assertTrue(d["diagnostic"].startswith("550 5.1.1"))
        self.assertEqual(d["remote_mta"], "mx.gone-agency.com")

    def test_gmail_text(self):
        d = B.details(msg(GMAIL_TEXT), {"nextgen-profit.de"})
        self.assertIn("info@nobody-studio.com", d)
        self.assertEqual((d["info@nobody-studio.com"]["status"], d["info@nobody-studio.com"]["klasse"]), ("5.1.1", "hart"))
        self.assertEqual(d["info@nobody-studio.com"]["quelle"], "text")

    def test_outlook_text_richtlinie(self):
        d = B.details(msg(OUTLOOK_TEXT), {"nextgen-profit.de"})["contact@blocked-co.com"]
        self.assertEqual((d["status"], d["klasse"]), ("5.7.1", "richtlinie"))

    def test_domain_fehlt(self):
        d = B.details(msg(DOMAIN_TEXT), {"nextgen-profit.de"})["info@no-such-domain.co.uk"]
        self.assertEqual(d["klasse"], "hart")

    def test_verzoegerung_ist_kein_bounce(self):
        self.assertEqual(B.details(msg(DELAY_TEXT), {"nextgen-profit.de"}), {})


class Speichern(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict("os.environ", {"MAIL_FROM": "info@nextgen-profit.de"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_text_rueckläufer_nur_an_eigene_empfaenger(self):
        db = mock.Mock()
        db.select.side_effect = lambda t, p: ([{"id": "m1"}] if t == "messages" and p["to_email"] == "eq.info@nobody-studio.com"
                                              else [])
        with mock.patch.object(inbox, "suppress") as sup:
            out = inbox.handle_bounce(db, msg(GMAIL_TEXT), "imap:<g1>", True)
        self.assertEqual(out, ["info@nobody-studio.com"])
        ev = db.insert.call_args[0][1]
        self.assertEqual((ev["type"], ev["bounce_class"], ev["message_id"]), ("bounced", "hart", "m1"))
        sup.assert_called_once_with(db, "info@nobody-studio.com", "bounce", "imap-dsn")

    def test_text_rueckläufer_fremde_adresse_zaehlt_nicht(self):
        db = mock.Mock()
        db.select.return_value = []
        with mock.patch.object(inbox, "suppress") as sup:
            out = inbox.handle_bounce(db, msg(GMAIL_TEXT), "imap:<g1>", True)
        self.assertEqual(out, [])
        db.insert.assert_not_called()
        sup.assert_not_called()

    def test_alter_rueckläufer_bekommt_grund_nachgetragen(self):
        db = mock.Mock()

        def select(t, p):
            if t == "messages":
                return [{"id": "m1"}]
            return [{"id": "e1", "payload": {"refs": []}, "bounce_class": "unbekannt"}]
        db.select.side_effect = select
        with mock.patch.object(inbox, "suppress"):
            inbox.handle_bounce(db, msg(STRATO_DSN), "imap:<s1>", True)
        db.insert.assert_not_called()
        match, vals = db.update.call_args[0][1:]
        self.assertEqual(match, {"id": "e1"})
        self.assertEqual((vals["bounce_class"], vals["payload"]["bounce"]["status"]), ("weich", "4.4.1"))


if __name__ == "__main__":
    unittest.main()
