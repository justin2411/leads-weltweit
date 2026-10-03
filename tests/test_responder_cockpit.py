"""Antworten-Cockpit (Nachtschicht 03./04.10.2026): Zuordnung über den Mail-Verlauf, eine Zeile je menschlicher Mail
in inbound_replies, Entwürfe nur aus festen Bausteinen, Push bei Kaufinteresse/Fragen, ehrliche FAQ."""
import datetime as dt
import os
import re
import sys
import unittest
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.pop("ANTHROPIC_API_KEY", None)

import inbox  # noqa: E402
import responder as r  # noqa: E402
from fakedb import FakeDB  # noqa: E402

OWN = {"hello@nextgen-profit.de", "@nextgen-profit.de"}
FORBIDDEN = re.compile(r"[€$£]|\d\s*(eur|usd|gbp)\b|\bpreis|\bprice|\bpricing|\bprix\b|\btarif|guarant|garanti|"
                       r"\bcost\b", re.I)


def mail(frm, subject, body="", mid="<m1@x>", when=None, **headers):
    m = EmailMessage()
    m["From"] = frm
    m["Subject"] = subject
    m["Message-ID"] = mid
    m["Date"] = format_datetime(when or dt.datetime.now(dt.timezone.utc))
    for k, v in headers.items():
        m[k.replace("_", "-")] = v
    m.set_content(body)
    return m


def two_prospects():
    """Zwei Käufer: die Antwort kommt von der Domain von B, verweist aber auf unsere Mail an A."""
    return FakeDB({
        "prospects": [
            {"id": "pA", "company_name": "Alpha Web Studio", "segment_id": "S2", "country": "US", "region": None,
             "domain": "alpha-web.com"},
            {"id": "pB", "company_name": "Beta Design LLC", "segment_id": "S2", "country": "US", "region": None,
             "domain": "beta-design.com"}],
        "messages": [
            {"id": "mA", "prospect_id": "pA", "status": "sent", "subject": "Local businesses without a website",
             "language": "en", "experiment_id": "e1", "sent_at": "2026-10-03", "smtp_message_id": "<sentA@nextgen-profit.de>"},
            {"id": "mB", "prospect_id": "pB", "status": "sent", "subject": "Hello Beta", "language": "en",
             "experiment_id": "e1", "sent_at": "2026-10-02", "smtp_message_id": "<sentB@nextgen-profit.de>"}],
    })


class MatchTest(unittest.TestCase):
    def test_in_reply_to_beats_domain(self):
        db = two_prospects()
        msg = mail("owner@beta-design.com", "Re: Local businesses", "How much is it per month?",
                   In_Reply_To="<sentA@nextgen-profit.de>")
        p, m, how = r.match_sent(db, msg, "owner@beta-design.com")
        self.assertEqual((p["id"], m["id"], how), ("pA", "mA", "verlauf"))

    def test_domain_fallback(self):
        db = two_prospects()
        msg = mail("owner@beta-design.com", "Re: Hello", "Yes please")
        p, m, how = r.match_sent(db, msg, "owner@beta-design.com")
        self.assertEqual((p["id"], m["id"], how), ("pB", "mB", "domain"))

    def test_freemail_sender_matched_by_thread(self):
        # vorher „unbekannter Absender“: Antwort von Gmail auf unsere Mail an info@alpha-web.com
        db = two_prospects()
        msg = mail("joe.alpha@gmail.com", "Re: Local businesses", "How much does it cost?", mid="<g1@x>",
                   References="<other@x> <sentA@nextgen-profit.de>")
        with mock.patch.object(r, "notify_owner") as note, mock.patch.object(r, "send_reply"):
            self.assertEqual(r.handle_message(db, msg, "<g1@x>", True, OWN), "owner")
        note.assert_called_once()
        row = db.rows("inbound_replies")[0]
        self.assertEqual((row["prospect_id"], row["message_id"]), ("pA", "mA"))


class InboundRowTest(unittest.TestCase):
    def test_owner_case_row_draft_link_and_push(self):
        db = two_prospects()
        when = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) - dt.timedelta(minutes=12)
        if True:
            msg = mail("info@alpha-web.com", "Re: Local businesses", "We want weekly leads, how much per month?",
                       mid="<b1@x>", when=when, In_Reply_To="<sentA@nextgen-profit.de>")
            with mock.patch.object(r, "send_reply") as send, \
                    mock.patch.object(r.requests, "post") as post, \
                    mock.patch.object(r, "push", return_value=True) as push, \
                    mock.patch.dict(os.environ, {"OWNER_EMAIL": "owner@example.org", "RESEND_API_KEY": "k",
                                                 "MAIL_FROM": "a@nextgen-profit.de", "SITE_URL": "https://site.test"}):
                self.assertEqual(r.handle_message(db, msg, "<b1@x>", True, OWN), "owner")
        send.assert_called_once()  # kurze Eingangsbestätigung wie bisher
        rows = db.rows("inbound_replies")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["imap_message_id"], "<b1@x>")
        self.assertEqual(row["intent"], "buy")
        self.assertEqual(row["auto_action"], "owner")
        self.assertEqual(row["received_at"], when.isoformat())
        self.assertIn("weekly leads", row["body_text"])
        self.assertEqual(row["draft_kind"], "buchungslink")
        self.assertIn("/us/", row["draft_text"])
        self.assertTrue(row.get("alert_sent_at"))
        # Push mit Deep-Link auf genau diese Antwort
        title, body, url, kind = push.call_args[0]
        self.assertEqual(url, f"https://site.test/dashboard/antworten/{row['id']}")
        self.assertEqual(kind, "buy")
        self.assertIn("Alpha Web Studio", title)
        mail_text = post.call_args[1]["json"]["text"]
        self.assertIn(f"https://site.test/dashboard/antworten/{row['id']}", mail_text)
        # nächster Lauf: keine zweite Zeile
        with mock.patch.object(r, "notify_owner"), mock.patch.object(r, "send_reply"):
            self.assertEqual(r.handle_message(db, msg, "<b1@x>", True, OWN), "done")
        self.assertEqual(len(db.rows("inbound_replies")), 1)

    def test_unknown_sender_row(self):
        db = FakeDB()
        msg = mail("jane@other-firm.com", "Question about your leads", "Can you cover Texas?", mid="<u1@x>")
        with mock.patch.object(r, "notify_owner") as note:
            self.assertEqual(r.handle_message(db, msg, "<u1@x>", True, OWN), "owner")
        row = db.rows("inbound_replies")[0]
        self.assertIsNone(row["prospect_id"])
        self.assertIsNone(row["message_id"])
        self.assertEqual(row["from_email"], "jane@other-firm.com")
        self.assertEqual(row["auto_action"], "unknown")
        self.assertTrue(row["draft_text"])
        self.assertEqual(note.call_args[1]["reply_id"], row["id"])
        self.assertIn(note.call_args[1]["kind"], ("buy", "question", "unclear"))

    def test_auto_reply_writes_no_row(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Automatic reply: Local businesses", "I am away", mid="<a1@x>",
                   In_Reply_To="<sentA@nextgen-profit.de>")
        self.assertEqual(r.handle_message(db, msg, "<a1@x>", True, OWN), "ignore")
        self.assertEqual(db.rows("inbound_replies"), [])
        db2 = FakeDB()
        msg2 = mail("jane@other-firm.com", "Out of office", "away", mid="<a2@x>", Auto_Submitted="auto-replied")
        self.assertEqual(r.handle_message(db2, msg2, "<a2@x>", True, OWN), "ignore")
        self.assertEqual(db2.rows("inbound_replies"), [])

    def test_unsubscribe_row_is_done(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: Local businesses", "Please remove us from your list", mid="<x1@x>",
                   In_Reply_To="<sentA@nextgen-profit.de>")
        self.assertEqual(r.handle_message(db, msg, "<x1@x>", True, OWN), "suppress")
        self.assertTrue(db.is_suppressed("info@alpha-web.com"))
        self.assertEqual(db.rows("inbound_replies")[0]["status"], "erledigt")

    def test_dry_run_writes_nothing(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<d1@x>")
        self.assertEqual(r.handle_message(db, msg, "<d1@x>", False, OWN), "owner")
        self.assertEqual(db.rows("inbound_replies"), [])

    def test_paused_records_row_and_pushes_once(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<p1@x>")
        with mock.patch.object(r, "auto_replies_paused", return_value=True), \
                mock.patch.object(r, "push", return_value=True) as push, \
                mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<p1@x>", True, OWN), "paused")
            self.assertEqual(r.handle_message(db, msg, "<p1@x>", True, OWN), "paused")
        send.assert_not_called()
        push.assert_called_once()
        self.assertEqual(len(db.rows("inbound_replies")), 1)
        self.assertEqual(db.rows("email_events"), [])  # Mail bleibt offen wie bisher

    def test_cockpit_write_failure_does_not_block_reply(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "Yes please, send it over", mid="<f1@x>")
        real_insert = db.insert

        def insert(table, rows, **kw):
            if table == "inbound_replies":
                raise RuntimeError("Tabelle fehlt")
            return real_insert(table, rows, **kw)
        db.insert = insert
        with mock.patch.object(r, "regional_sample", return_value=([("s.csv", b"x")], True)), \
                mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<f1@x>", True, OWN), "sample")
        send.assert_called_once()


class DraftTest(unittest.TestCase):
    def test_drafts_never_contain_prices_or_guarantees(self):
        p = {"segment_id": "S2", "country": "US"}
        cases = [{"intent": i, "faq": f} for i in ("buy", "question", "other", "sample")
                 for f in (["none"], ["sources", "data_privacy"], list(r.FAQ["en"]))]
        with mock.patch.dict(os.environ, {"SENDER_PHONE": "+49 170 1234567"}):
            for lang in ("en", "fr"):
                for c in cases:
                    for prospect in (p, {"segment_id": "S2", "country": "FR"}, None):
                        text, kind = r.owner_draft(c, lang, prospect)
                        self.assertTrue(text and kind)
                        self.assertIsNone(FORBIDDEN.search(text), (lang, c, kind, text))
                for t in (r.hold_text(lang), r.faq_text(lang, list(r.FAQ["en"]))):
                    self.assertIsNone(FORBIDDEN.search(t), t)

    def test_draft_kinds(self):
        p = {"segment_id": "S2", "country": "US"}
        self.assertEqual(r.owner_draft({"intent": "buy"}, "en", p)[1], "buchungslink")
        self.assertEqual(r.owner_draft({"intent": "buy"}, "en", {"segment_id": "S2", "country": "IE"})[1], "eingang")
        self.assertEqual(r.owner_draft({"intent": "question", "faq": ["sources"]}, "en", p)[1], "faq")
        self.assertEqual(r.owner_draft({"intent": "question", "faq": ["none"]}, "en", p)[1], "eingang")
        self.assertEqual(r.owner_draft({"intent": "other"}, "fr", p)[1], "eingang")


class FaqTruthTest(unittest.TestCase):
    def test_no_false_privacy_claim(self):
        for lang in ("en", "fr"):
            txt = r.FAQ[lang]["data_privacy"]
            self.assertNotIn("No private", txt)
            self.assertNotIn("Aucune coordonnée privée", txt)
            self.assertNotIn("no other employees", txt)
        self.assertIn("official registers", r.FAQ["en"]["data_privacy"])
        self.assertIn("registres officiels", r.FAQ["fr"]["data_privacy"])


class PushTest(unittest.TestCase):
    def test_push_never_raises(self):
        fake = mock.MagicMock()
        fake.notify.side_effect = RuntimeError("boom")
        with mock.patch.dict(sys.modules, {"lib.push": fake}):
            self.assertFalse(r.push("t", "b", "u", "buy"))
        fake.notify.side_effect = None
        fake.notify.return_value = True
        with mock.patch.dict(sys.modules, {"lib.push": fake}):
            self.assertTrue(r.push("t", "b", "u", "buy"))
        fake.notify.assert_called_with("t", "b", "u", "buy")

    def test_notify_owner_calls_push_with_deep_link(self):
        with mock.patch.object(r, "push") as push, mock.patch.object(r, "alert_address", return_value=None), \
                mock.patch.dict(os.environ, {"SITE_URL": "https://site.test/"}):
            r.notify_owner("[Leads] Interessent: X", "Text", reply_id="abc", kind="question", push_body="Frage")
        push.assert_called_once_with("Interessent: X", "Frage", "https://site.test/dashboard/antworten/abc", "question")

    def test_plain_notice_without_push(self):
        with mock.patch.object(r, "push") as push, mock.patch.object(r, "alert_address", return_value=None):
            r.notify_owner("[Leads] Probe gesendet", "Text")
        push.assert_not_called()


class ReceivedAtTest(unittest.TestCase):
    def test_date_header(self):
        now = dt.datetime(2026, 10, 4, 3, 0, tzinfo=dt.timezone.utc)
        m = mail("a@b.com", "x", when=dt.datetime(2026, 10, 4, 4, 30, tzinfo=dt.timezone(dt.timedelta(hours=2))))
        self.assertEqual(inbox.received_at(m, now), "2026-10-04T02:30:00+00:00")
        future = mail("a@b.com", "x", when=now + dt.timedelta(days=2))
        self.assertIsNone(inbox.received_at(future, now))
        broken = EmailMessage()
        broken["Date"] = "kein Datum"
        self.assertIsNone(inbox.received_at(broken, now))

    def test_inbox_event_uses_received_at(self):
        db = two_prospects()
        db.rows("messages")[0]["to_email"] = "info@alpha-web.com"
        when = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) - dt.timedelta(hours=3)
        msg = mail("info@alpha-web.com", "Re: x", "Yes please", mid="<i1@x>", when=when,
                   In_Reply_To="<sentA@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<i1@x>", True), "reply")
        self.assertEqual(db.rows("email_events")[0]["occurred_at"], when.isoformat())


if __name__ == "__main__":
    unittest.main()
