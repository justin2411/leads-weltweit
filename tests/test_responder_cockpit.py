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

    def test_pause_owner_action_unpause_sends_nothing(self):
        # Review 04.10.2026: während der Pause beantwortet der Inhaber im Cockpit; nach dem Einschalten keine
        # automatische Zwischenantwort / Probe / Meldung mehr an jemanden, dem er schon geantwortet hat
        for body, action in (("How much per month?", "antwort_gesendet"), ("Yes please, send it over", "probe_gesendet")):
            db = two_prospects()
            msg = mail("info@alpha-web.com", "Re: x", body, mid="<po@x>", In_Reply_To="<sentA@nextgen-profit.de>")
            with mock.patch.object(r, "auto_replies_paused", return_value=True), \
                    mock.patch.object(r, "push", return_value=True):
                self.assertEqual(r.handle_message(db, msg, "<po@x>", True, OWN), "paused")
            row = db.rows("inbound_replies")[0]
            row.update({"status": "erledigt", "owner_action": action})
            with mock.patch.object(r, "auto_replies_paused", return_value=False), \
                    mock.patch.object(r, "send_reply") as send, mock.patch.object(r, "notify_owner") as note, \
                    mock.patch.object(r, "regional_sample") as sample:
                self.assertEqual(r.handle_message(db, msg, "<po@x>", True, OWN), "done")
                self.assertEqual(r.handle_message(db, msg, "<po@x>", True, OWN), "done")
            send.assert_not_called()
            note.assert_not_called()
            sample.assert_not_called()
            ev = [e for e in db.rows("email_events") if e.get("dedupe_key") == "reply:<po@x>"]
            self.assertEqual(len(ev), 1)
            self.assertIn("Cockpit", ev[0]["note"])

    def test_pause_reuses_stored_classification(self):
        # Nachtschicht 04.10.2026: während der Pause kommt die Mail alle 10 min wieder – nur einmal Claude fragen
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<pc@x>")
        real = r.classify
        with mock.patch.object(r, "auto_replies_paused", return_value=True), mock.patch.object(r, "push"), \
                mock.patch.object(r, "classify", side_effect=real) as cl:
            for _ in range(3):
                self.assertEqual(r.handle_message(db, msg, "<pc@x>", True, OWN), "paused")
        self.assertEqual(cl.call_count, 1)
        with mock.patch.object(r, "classify", side_effect=real) as cl, mock.patch.object(r, "notify_owner"), \
                mock.patch.object(r, "send_reply"):
            r.handle_message(db, msg, "<pc@x>", True, OWN)
        self.assertEqual(cl.call_count, 1)  # nach der Pause frisch eingeordnet (FAQ-Schlüssel stehen nicht im Cockpit)

    def test_unknown_sender_classified_and_alerted_once_when_mail_fails(self):
        db = two_prospects()
        msg = mail("someone@else.org", "Partnership", "Hi, can we talk about a partnership?", mid="<uk@x>")
        with mock.patch.object(r, "classify", return_value={"intent": "question", "faq": ["none"], "needs_owner": True,
                                                             "summary_de": "Frage", "by": "test"}) as cl, \
                mock.patch.object(r, "is_recent", return_value=True), \
                mock.patch.object(r, "notify_owner", side_effect=[RuntimeError("Resend 500"), None]) as note:
            self.assertEqual(r.handle_message(db, msg, "<uk@x>", True, OWN), "error")
            self.assertEqual(r.handle_message(db, msg, "<uk@x>", True, OWN), "owner")
            self.assertEqual(r.handle_message(db, msg, "<uk@x>", True, OWN), "done")
        self.assertEqual(cl.call_count, 1)
        self.assertEqual(note.call_count, 2)

    def test_owner_status_later_also_stops_automation(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<pl@x>")
        with mock.patch.object(r, "auto_replies_paused", return_value=True), mock.patch.object(r, "push"):
            r.handle_message(db, msg, "<pl@x>", True, OWN)
        db.rows("inbound_replies")[0].update({"status": "spaeter", "owner_action": "status:spaeter"})
        with mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<pl@x>", True, OWN), "done")
        send.assert_not_called()

    def test_unsubscribe_after_owner_action_still_suppresses(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "Please remove us from your list", mid="<us@x>")
        db.insert("inbound_replies", {"imap_message_id": "<us@x>", "status": "erledigt", "owner_action": "antwort_gesendet"})
        self.assertEqual(r.handle_message(db, msg, "<us@x>", True, OWN), "suppress")
        self.assertTrue(db.is_suppressed("info@alpha-web.com"))

    def test_owner_alert_not_repeated_when_hold_reply_fails(self):
        # Review 04.10.2026: Meldung ging raus, Zwischenantwort scheitert -> nächster Lauf (10 min) meldet nicht erneut
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<rf@x>")
        with mock.patch.object(r, "notify_owner") as note, \
                mock.patch.object(r, "send_reply", side_effect=RuntimeError("Resend 500")):
            self.assertEqual(r.handle_message(db, msg, "<rf@x>", True, OWN), "error")
            self.assertEqual(r.handle_message(db, msg, "<rf@x>", True, OWN), "error")
        self.assertEqual(note.call_count, 1)
        with mock.patch.object(r, "notify_owner") as note, mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<rf@x>", True, OWN), "owner")
        note.assert_not_called()
        send.assert_called_once()

    def test_unpause_after_pause_push_no_second_alert(self):
        db = two_prospects()
        msg = mail("info@alpha-web.com", "Re: x", "How much per month?", mid="<pp@x>")
        with mock.patch.object(r, "auto_replies_paused", return_value=True), \
                mock.patch.object(r, "push", return_value=True) as push:
            r.handle_message(db, msg, "<pp@x>", True, OWN)
        push.assert_called_once()
        with mock.patch.object(r, "notify_owner") as note, mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<pp@x>", True, OWN), "owner")
        note.assert_not_called()
        send.assert_called_once()  # Zwischenantwort an den Absender geht wie bisher raus

    def test_sample_leads_reserved_then_released_on_failure(self):
        # Review 04.10.2026: ein Fehlversuch darf keine 10 Leads verbrennen – aber vergeben werden sie sofort, damit der
        # Proben-Vorrat sie nicht gleichzeitig in eine andere Probe packt (exklusiv)
        db = two_prospects()
        db.insert("leads", [{"id": f"l{i}", "status": "new"} for i in range(10)])
        msg = mail("info@alpha-web.com", "Re: x", "Yes please, send it over", mid="<sm@x>")
        seen_at_send = []

        def fake_sample(db_, seg, country, region, mark=True, picked_out=None, **kw):
            self.assertFalse(mark)
            picked_out.extend({"id": f"l{i}"} for i in range(10))
            return [("s.csv", b"x")], True

        def failing_send(*a, **kw):
            seen_at_send.append({l["status"] for l in db.rows("leads")})
            raise RuntimeError("Resend 500")
        with mock.patch.object(r, "regional_sample", side_effect=fake_sample), \
                mock.patch.object(r, "send_reply", side_effect=failing_send):
            self.assertEqual(r.handle_message(db, msg, "<sm@x>", True, OWN), "error")
        self.assertEqual(seen_at_send, [{"sample"}])  # beim Versand schon vergeben
        self.assertEqual({l["status"] for l in db.rows("leads")}, {"new"})  # danach wieder frei
        with mock.patch.object(r, "regional_sample", side_effect=fake_sample), mock.patch.object(r, "send_reply"):
            self.assertEqual(r.handle_message(db, msg, "<sm@x>", True, OWN), "sample")
        self.assertEqual({l["status"] for l in db.rows("leads")}, {"sample"})

    def test_sample_leads_stay_taken_when_sent_but_later_step_fails(self):
        db = two_prospects()
        db.insert("leads", [{"id": f"l{i}", "status": "new"} for i in range(10)])
        msg = mail("info@alpha-web.com", "Re: x", "Yes please, send it over", mid="<sl@x>")

        def fake_sample(db_, seg, country, region, mark=True, picked_out=None, **kw):
            picked_out.extend({"id": f"l{i}"} for i in range(10))
            return [("s.csv", b"x")], True
        real_insert = db.insert

        def insert(table, rows, **kw):
            if table == "email_events" and isinstance(rows, dict) and rows.get("dedupe_key") == "reply:<sl@x>":
                raise RuntimeError("DB weg")
            return real_insert(table, rows, **kw)
        db.insert = insert
        with mock.patch.object(r, "regional_sample", side_effect=fake_sample), \
                mock.patch.object(r, "send_reply") as send, self.assertRaises(RuntimeError):
            r.handle_message(db, msg, "<sl@x>", True, OWN)
        send.assert_called_once()
        self.assertEqual({l["status"] for l in db.rows("leads")}, {"sample"})  # Probe ist angekommen: bleibt vergeben

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

    def test_open_data_sources_named(self):
        # S2-Leads (US, Overture/OSM) stammen aus offenen Datensätzen – die FAQ muss das nennen (Review 04.10.2026)
        for key in ("data_privacy", "sources"):
            self.assertIn("open business directories", r.FAQ["en"][key], key)
            self.assertIn("annuaires ouverts", r.FAQ["fr"][key], key)


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
