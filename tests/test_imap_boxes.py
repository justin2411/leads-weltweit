"""Alle Postfächer lesen (Nachtschicht 04.10.2026): Hauptpostfach + Versand-Postfächer, Spam nur für eigene Rückläufer."""
import imaplib
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from lib import imap_boxes as ib  # noqa: E402

ENV = {
    "IMAP_HOST": "imap.example.de", "IMAP_USER": "info@nextgen-profit.de", "IMAP_PASSWORD": "p0",
    "SMTP_USER": "info@nextgen-profit.de", "SMTP_PASSWORD": "p0", "MAIL_FROM": "Justin <info@nextgen-profit.de>",
    "SMTP_USER_2": "kontakt@nextgen-profit.de", "SMTP_PASSWORD_2": "p2",
    "SMTP_USER_3": "team@nextgen-profit.de", "SMTP_PASSWORD_3": "p3", "IMAP_HOST_3": "imap3.example.de",
}


def raw(frm: str, subject: str, mid: str, extra: str = "", ctype: str = "text/plain") -> bytes:
    return (f"From: {frm}\r\nTo: x@nextgen-profit.de\r\nSubject: {subject}\r\nMessage-ID: {mid}\r\n{extra}"
            f"Content-Type: {ctype}\r\n\r\nHallo\r\n").encode()


class FakeImap:
    """Postfächer je (Server, Benutzer): {Ordner: [rohe Mails]}; fehlender Ordner -> NO wie echte Server."""
    boxes: dict = {}
    logins: list = []

    def __init__(self, host):
        self.host = host
        self.user = None
        self.folder = None

    def login(self, user, pw):
        if pw == "falsch":
            raise imaplib.IMAP4.error("AUTHENTICATIONFAILED")
        self.user = user
        FakeImap.logins.append((self.host, user))

    def select(self, folder, readonly=False):
        assert readonly, "nur lesend"
        if folder not in FakeImap.boxes.get((self.host, self.user), {}):
            return "NO", [b"no such folder"]
        self.folder = folder
        return "OK", [b"1"]

    def search(self, charset, *crit):
        n = len(FakeImap.boxes[(self.host, self.user)][self.folder])
        return "OK", [" ".join(str(i + 1) for i in range(n)).encode()]

    def fetch(self, num, what):
        assert "PEEK" in what, "nie als gelesen markieren"
        return "OK", [(b"1 (BODY[] {1}", FakeImap.boxes[(self.host, self.user)][self.folder][int(num) - 1]), b")"]

    def logout(self):
        pass


class AccountsTest(unittest.TestCase):
    def test_main_box_and_sending_boxes_once(self):
        accts = ib.accounts(ENV)
        self.assertEqual([(a["n"], a["user"], a["host"]) for a in accts], [
            (0, "info@nextgen-profit.de", "imap.example.de"),       # Postfach 1 = Hauptpostfach, nicht doppelt
            (2, "kontakt@nextgen-profit.de", "imap.example.de"),   # gleicher Server wie Postfach 1
            (3, "team@nextgen-profit.de", "imap3.example.de"),     # eigener Server
        ])

    def test_without_password_box_is_skipped(self):
        env = {**ENV, "SMTP_PASSWORD_2": ""}
        self.assertNotIn(2, [a["n"] for a in ib.accounts(env)])

    def test_own_domains_and_addresses(self):
        self.assertEqual(ib.own_domains(ENV), {"nextgen-profit.de"})
        self.assertIn("team@nextgen-profit.de", ib.own_addresses(ENV))


class ReadAllTest(unittest.TestCase):
    def setUp(self):
        dsn = raw("MAILER-DAEMON@mx.example", "Undelivered", "<d1@mx>", ctype="multipart/report; report-type=delivery-status")
        FakeImap.logins = []
        FakeImap.boxes = {
            ("imap.example.de", "info@nextgen-profit.de"): {
                "INBOX": [raw("joe@firma.com", "Re: Leads", "<a1@firma.com>")],
                "Spam": [raw("spam@viagra.biz", "WIN", "<s1@x>")],
            },
            ("imap.example.de", "kontakt@nextgen-profit.de"): {
                "INBOX": [dsn],
                "Spam": [raw("ann@firma2.com", "Re: Leads", "<a2@firma2.com>",
                             "In-Reply-To: <abc.123@nextgen-profit.de>\r\n"),
                         raw("bob@other.com", "Re: hi", "<a3@other.com>", "In-Reply-To: <z@other.com>\r\n")],
                "Junk": [dsn],
            },
            ("imap3.example.de", "team@nextgen-profit.de"): {"INBOX": [raw("max@firma3.com", "Out of office", "<a4@f3>")]},
        }

    def test_reads_all_boxes_and_filters_spam(self):
        seen = []
        stats = ib.read_all("01-Oct-2026", lambda a, f, n, m: seen.append((a["n"], f, m["Message-ID"])), env=ENV,
                            connect=FakeImap)
        self.assertEqual(seen, [
            (0, "INBOX", "<a1@firma.com>"),                     # Spam des Hauptpostfachs ohne Bezug: nie gelesen
            (2, "INBOX", "<d1@mx>"),                            # Rückläufer an Postfach 2
            (2, "Spam", "<a2@firma2.com>"),                     # Antwort auf unsere Mail im Spam
            (2, "Junk", "<d1@mx>"),                             # Rückläufer im Junk
            (3, "INBOX", "<a4@f3>"),
        ])
        self.assertEqual(stats["boxes"], {"Hauptpostfach": 1, "Postfach 2": 3, "Postfach 3": 1})
        self.assertEqual(stats["errors"], {})

    def test_failed_login_does_not_stop_other_boxes(self):
        env = {**ENV, "SMTP_PASSWORD_2": "falsch"}
        seen = []
        stats = ib.read_all("01-Oct-2026", lambda a, f, n, m: seen.append(a["n"]), env=env, connect=FakeImap)
        self.assertEqual(seen, [0, 3])
        self.assertIn("Postfach 2", stats["errors"])

    def test_failing_mail_does_not_stop_the_run(self):
        def handle(a, f, n, m):
            if a["n"] == 0:
                raise RuntimeError("kaputt")
            seen.append(a["n"])
        seen = []
        stats = ib.read_all("01-Oct-2026", handle, env=ENV, connect=FakeImap)
        self.assertEqual(stats["failed"], 1)
        self.assertEqual(seen, [2, 2, 2, 3])
        self.assertEqual(stats["errors"], {})

    def test_without_main_box_nothing_is_read(self):
        env = {k: v for k, v in ENV.items() if not k.startswith("IMAP_USER")}
        self.assertEqual(ib.read_all("01-Oct-2026", lambda *a: None, env=env, connect=FakeImap)["boxes"], {})
        self.assertEqual(FakeImap.logins, [])

    def test_fallback_ids_unique_per_box_and_folder(self):
        main = {"n": 0}
        self.assertEqual(ib.fallback_id(main, "INBOX", "7"), "imap-7")       # wie bisher (keine Doppelbearbeitung)
        self.assertEqual(ib.fallback_id(main, "Spam", "7"), "imap-0-spam-7")
        self.assertEqual(ib.fallback_id({"n": 2}, "INBOX", "7"), "imap-2-inbox-7")


class InboxIntegrationTest(unittest.TestCase):
    def test_spam_bounce_only_for_recipients_we_mailed(self):
        import inbox
        from email import message_from_bytes, policy
        dsn = message_from_bytes(
            b"From: MAILER-DAEMON@mx\r\nSubject: Undelivered\r\nMessage-ID: <d9@mx>\r\n"
            b"Content-Type: multipart/report; report-type=delivery-status; boundary=B\r\n\r\n--B\r\n"
            b"Content-Type: text/plain\r\n\r\nfailed\r\n--B\r\nContent-Type: message/delivery-status\r\n\r\n"
            b"Reporting-MTA: dns; mx\r\n\r\nFinal-Recipient: rfc822; known@firma.com\r\nAction: failed\r\n\r\n"
            b"Final-Recipient: rfc822; stranger@else.com\r\nAction: failed\r\n--B--\r\n", policy=policy.default)
        db = mock.Mock()
        db.select.side_effect = lambda t, p: [{"id": "m1"}] if p.get("to_email") == "eq.known@firma.com" else []
        with mock.patch.object(inbox, "suppress") as sup:
            out = inbox.handle_bounce(db, dsn, "imap:<d9@mx>", True, known_only=True)
        self.assertEqual(out, ["known@firma.com"])
        sup.assert_called_once_with(db, "known@firma.com", "bounce", "imap-dsn")
        with mock.patch.object(inbox, "suppress") as sup:
            out = inbox.handle_bounce(db, dsn, "imap:<d9@mx>", True, known_only=False)
        self.assertEqual(out, ["known@firma.com", "stranger@else.com"])  # Hauptpostfach-Posteingang wie bisher


if __name__ == "__main__":
    unittest.main()
