"""Antwort-Assistent und Postfach: Reihenfolge, unbekannte Absender, Abmeldung per Betreff (Audit 28.09.2026)."""
import os
import sys
import unittest
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.pop("ANTHROPIC_API_KEY", None)

import datetime as dt  # noqa: E402

import inbox  # noqa: E402
import responder as r  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib.rules import suppress  # noqa: E402

OWN = {"hello@nextgen-profit.de", "@nextgen-profit.de"}


def mail(frm, subject, body="", mid="<m1@x>", **headers):
    m = EmailMessage()
    m["From"] = frm
    m["Subject"] = subject
    m["Message-ID"] = mid
    m["Date"] = format_datetime(dt.datetime.now(dt.timezone.utc))
    for k, v in headers.items():
        m[k.replace("_", "-")] = v
    m.set_content(body)
    return m


def db_with_prospect():
    return FakeDB({"prospects": [{"id": "p1", "company_name": "Acme Recruitment Ltd", "segment_id": "S1",
                                  "country": "UK", "region": None, "domain": "acme.co.uk"}],
                   "messages": [{"id": "m1", "prospect_id": "p1", "status": "sent", "subject": "Leads", "language": "en",
                                 "experiment_id": "e1", "sent_at": "2026-09-27"}]})


class OrderTest(unittest.TestCase):
    """Fix 5: das Ereignis mit dedupe_key erst nach erfolgreicher Aktion speichern."""

    def test_failed_reply_is_retried_next_run(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "Yes please, send it over")
        files = [("sample.csv", b"x")]
        with mock.patch.object(r, "regional_sample", return_value=(files, True)), \
                mock.patch.object(r, "send_reply", side_effect=RuntimeError("Resend 500")):
            self.assertEqual(r.handle_message(db, msg, "<m1@x>", True, OWN), "error")
        self.assertEqual(db.rows("email_events"), [])
        with mock.patch.object(r, "regional_sample", return_value=(files, True)), \
                mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<m1@x>", True, OWN), "sample")
        send.assert_called_once()
        self.assertEqual([e["dedupe_key"] for e in db.rows("email_events")], ["reply:<m1@x>"])
        # dritter Lauf: erledigt, keine zweite Antwort
        with mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<m1@x>", True, OWN), "done")
        send.assert_not_called()

    def test_owner_notice_failing_after_reply_still_records_event(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "How much does this cost per month?")
        claude = {"intent": "buy", "faq": ["none"], "needs_owner": True, "summary_de": "Kauf", "by": "claude"}
        with mock.patch.object(r, "classify", return_value=claude), mock.patch.object(r, "notify_owner"), \
                mock.patch.object(r, "send_reply", side_effect=RuntimeError("x")):
            self.assertEqual(r.handle_message(db, msg, "<m2@x>", True, OWN), "error")
        self.assertEqual(db.rows("email_events"), [])

    def test_hold_text_has_no_time_promise(self):
        # Fix 20
        self.assertNotIn("today", r.hold_text("en"))
        self.assertNotIn("dans la journée", r.hold_text("fr"))
        self.assertIn("personally with the details", r.hold_text("en"))
        self.assertIn("personnellement avec les détails", r.hold_text("fr"))


class UnknownSenderTest(unittest.TestCase):
    """Fix 6: Mails unbekannter Absender einmal an den Inhaber melden."""

    def test_notified_once(self):
        db = FakeDB()
        msg = mail("jane@other-firm.com", "Question about your leads", "Can you cover Wales?", mid="<u1@x>")
        with mock.patch.object(r, "notify_owner") as note:
            self.assertEqual(r.handle_message(db, msg, "<u1@x>", True, OWN), "owner")
            self.assertEqual(r.handle_message(db, msg, "<u1@x>", True, OWN), "done")
        note.assert_called_once()
        ev = db.rows("email_events")[0]
        self.assertEqual((ev["message_id"], ev["type"], ev["dedupe_key"]), (None, "reply", "unknown:<u1@x>"))

    def test_notice_failure_leaves_no_event(self):
        db = FakeDB()
        msg = mail("jane@other-firm.com", "Question", "Hi", mid="<u2@x>")
        with mock.patch.object(r, "notify_owner", side_effect=RuntimeError("down")):
            self.assertEqual(r.handle_message(db, msg, "<u2@x>", True, OWN), "error")
        self.assertEqual(db.rows("email_events"), [])

    def test_system_and_own_mail_ignored(self):
        db = FakeDB()
        cases = [mail("MAILER-DAEMON@mx.example.com", "Undelivered Mail"),
                 mail("noreply@stripe.com", "Your receipt"),
                 mail("hello@nextgen-profit.de", "Test"),
                 mail("reports@google.com", "Report Domain: nextgen-profit.de Submitter: google.com"),
                 mail("news@shop.com", "Offers", List_Id="<news.shop.com>"),
                 mail("jane@other-firm.com", "Out of office", Auto_Submitted="auto-replied")]
        with mock.patch.object(r, "notify_owner") as note:
            for m in cases:
                self.assertEqual(r.handle_message(db, m, m["Message-ID"], True, OWN), "ignore", m["From"])
        note.assert_not_called()

    def test_old_mail_not_reported(self):
        m = mail("jane@other-firm.com", "Hello")
        del m["Date"]
        m["Date"] = format_datetime(dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=5))
        self.assertFalse(r.is_recent(m))

    def test_gmail_reply_to_does_not_hide_gmail_senders(self):
        with mock.patch.dict(os.environ, {"REPLY_TO": "Justin <justin@gmail.com>", "MAIL_FROM": "a@nextgen-profit.de"}):
            own = r.own_addresses()
        self.assertIn("justin@gmail.com", own)
        self.assertNotIn("@gmail.com", own)
        self.assertIn("@nextgen-profit.de", own)


class SubjectOptoutTest(unittest.TestCase):
    """Fix 7: Abmeldung per Betreff (List-Unsubscribe mailto) sperrt auch ohne In-Reply-To."""

    def test_subject_detection(self):
        self.assertTrue(r.subject_optout("unsubscribe"))
        self.assertTrue(r.subject_optout("UNSUBSCRIBE"))
        self.assertTrue(r.subject_optout("Re: please remove us"))
        self.assertFalse(r.subject_optout("Re: Leads for recruiters across the UK"))
        self.assertEqual(r.classify("", "unsubscribe")["intent"], "unsubscribe")

    def test_known_prospect_empty_body(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "unsubscribe", "", mid="<o1@x>")
        self.assertEqual(r.handle_message(db, msg, "<o1@x>", True, OWN), "suppress")
        self.assertTrue(db.is_suppressed("info@acme.co.uk"))

    def test_unknown_sender_is_suppressed(self):
        db = FakeDB()
        msg = mail("ops@elsewhere.co.uk", "Unsubscribe", "", mid="<o2@x>")
        with mock.patch.object(r, "notify_owner") as note:
            self.assertEqual(r.handle_message(db, msg, "<o2@x>", True, OWN), "suppress")
        note.assert_not_called()
        self.assertTrue(db.is_suppressed("ops@elsewhere.co.uk"))

    def test_inbox_without_reference(self):
        db = FakeDB()
        msg = mail("ops@elsewhere.co.uk", "unsubscribe", "")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<o3@x>", True), "optout")
        self.assertTrue(db.is_suppressed("ops@elsewhere.co.uk"))
        self.assertEqual(db.rows("email_events")[0]["type"], "unsubscribed")
        self.assertIsNone(inbox.handle_reply(FakeDB(), mail("a@b.co.uk", "Hello"), "imap:<o4@x>", True))


class InboxAutoReplyTest(unittest.TestCase):
    """03.10.2026: „Automatic reply“ zählte im Dashboard als Antwort – Postfach-Abgleich erkennt Autoresponder."""

    def _db(self):
        db = db_with_prospect()
        db.rows("messages")[0].update({"to_email": "info@acme.co.uk", "smtp_message_id": "<sent1@nextgen-profit.de>"})
        return db

    def test_auto_reply_subject_is_not_a_reply(self):
        db = self._db()
        msg = mail("info@acme.co.uk", "Automatic reply: Local businesses across the US without a website", "I am away", mid="<a1@x>", In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<a1@x>", True), "auto_reply")
        self.assertEqual(db.rows("email_events")[0]["type"], "auto_reply")

    def test_auto_submitted_header_is_not_a_reply(self):
        db = self._db()
        msg = mail("info@acme.co.uk", "Re: Leads", "Thanks, I am out", mid="<a2@x>", Auto_Submitted="auto-replied", In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<a2@x>", True), "auto_reply")

    def test_real_reply_stays_reply(self):
        db = self._db()
        msg = mail("info@acme.co.uk", "Re: Leads", "Yes please send the sample", mid="<a3@x>", In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<a3@x>", True), "reply")
        self.assertEqual(db.rows("email_events")[0]["type"], "reply")


class FreemailSuppressTest(unittest.TestCase):
    """Fix 22: Freemail-Adressen nur als Adresse sperren, nie die ganze Domain."""

    def test_freemail_only_address(self):
        db = FakeDB()
        suppress(db, "Jane@Gmail.com", "reply_optout", "test")
        self.assertEqual(db.rpcs, [])
        row = db.rows("suppression")[0]
        self.assertEqual((row["kind"], row["value"]), ("email", "jane@gmail.com"))
        for dom in ("yahoo.fr", "gmx.de", "web.de", "t-online.de", "orange.fr", "btinternet.com", "icloud.com"):
            db2 = FakeDB()
            suppress(db2, f"x@{dom}", "bounce", "test")
            self.assertEqual(db2.rpcs, [], dom)

    def test_company_uses_db_function(self):
        db = FakeDB()
        suppress(db, "info@acme.co.uk", "bounce", "test")
        self.assertEqual(db.rpcs[0][0], "suppress_email")


if __name__ == "__main__":
    unittest.main()
