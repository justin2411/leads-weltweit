"""Prüfung 04.10.2026: Antwort-Assistent, Postfach-Abgleich und Versand (Befunde A1–A13)."""
import contextlib
import io
import os
import sys
import unittest
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.pop("ANTHROPIC_API_KEY", None)

import datetime as dt  # noqa: E402

import inbox  # noqa: E402
import outreach  # noqa: E402
import responder as r  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib.rules import UNSUBSCRIBE_BY_REPLY, UNSUBSCRIBE_LINK, render_footer  # noqa: E402

OWN = {"hello@nextgen-profit.de", "@nextgen-profit.de"}
FOOTER_EN = render_footer("en", sender_name="NextGen Profit", postal_address="Leipzig", company="acme.co.uk",
                          unsubscribe_url=None)
FOOTER_FR = render_footer("fr", sender_name="NextGen Profit", postal_address="Leipzig", company="acme.fr",
                          unsubscribe_url=None)
OUR_MAIL = ("Hi Acme team,\n\nWe find local businesses across the UK without a website.\n\n"
            "Shall I send you a free sample of 10?\n\nBest regards,\nJustin\n\n" + FOOTER_EN)


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


def outlook(own_words: str) -> str:
    return (own_words + "\n\n________________________________\nFrom: Justin Koch <hello@nextgen-profit.de>\n"
            "Sent: Saturday, October 4, 2026 9:00 AM\nTo: info@acme.co.uk\nSubject: Leads\n\n" + OUR_MAIL)


def db_with_prospect(**msg_extra):
    return FakeDB({"prospects": [{"id": "p1", "company_name": "Acme Web Ltd", "segment_id": "S2", "country": "UK",
                                  "region": None, "domain": "acme.co.uk"}],
                   "messages": [{"id": "m1", "prospect_id": "p1", "status": "sent", "subject": "Leads",
                                 "language": "en", "experiment_id": "e1", "sent_at": "2026-10-03",
                                 "to_email": "info@acme.co.uk", "smtp_message_id": "<sent1@nextgen-profit.de>",
                                 **msg_extra}]})


class QuoteTest(unittest.TestCase):
    """A1: zitierte Kaltmail (Outlook u. a.) mit unserem Abmelde-Hinweis ist keine Abmeldung."""

    def test_strip_quoted_variants(self):
        for quoted in ("\n> Hi Acme team", "\n________________________________\nFrom: X\nSent: Y",
                       "\nFrom: Justin <a@b.de>\nSent: Monday", "\nDe : Justin <a@b.de>\nEnvoyé : lundi",
                       "\nVon: Justin <a@b.de>\nGesendet: Montag", "\n-----Original Message-----\nhi",
                       "\nOn Sat, 4 Oct 2026 at 09:00, Justin <a@b.de> wrote:\n> hi",
                       "\nLe sam. 4 oct. 2026 à 09:00, Justin <a@b.de> a écrit :\n> salut",
                       "\nAm Sa., 4. Okt. 2026 um 09:00 Uhr schrieb Justin <a@b.de>:\n> hallo"):
            self.assertEqual(inbox.strip_quoted("Yes please send it" + quoted + "\nunsubscribe"), "Yes please send it",
                             quoted)

    def test_outlook_quote_with_our_footer_is_not_optout(self):
        self.assertFalse(inbox.is_optout_text(outlook("Yes, please send the sample. How much is it per month?")))
        # Antwort unten (bottom posting) mit „>“-Zitat und Fußzeile
        quoted = "\n".join("> " + ln for ln in OUR_MAIL.split("\n"))
        self.assertFalse(inbox.is_optout_text("On Sat Justin wrote:\n" + quoted + "\n\nSounds good, send it."))
        # nur unser Hinweis ohne Zitat-Zeichen (z. B. Weiterleitung als Text), auch umbrochen und französisch
        self.assertFalse(inbox.is_optout_text("Interested.\n\n" + FOOTER_EN.replace("reply ", "reply\n")))
        self.assertFalse(inbox.is_optout_text("Intéressé.\n\n" + FOOTER_FR))
        self.assertFalse(inbox.is_optout_text("ok\n" + UNSUBSCRIBE_LINK["en"].format(
            url="https://www.nextgen-profit.de/api/unsubscribe?t=abc")))

    def test_own_words_always_optout(self):
        for words in ("unsubscribe", "Please remove me from your list", "Remove us", "STOP", "stop",
                      "Don't contact us again", "do not call", "please remove this address", "Désinscrire svp",
                      "opt out"):
            self.assertTrue(inbox.is_optout_text(outlook(words)), words)
            self.assertTrue(inbox.is_optout_text(words + "\n\n" + FOOTER_EN), words)
        # unter dem Zitat (Antwort unten)
        self.assertTrue(inbox.is_optout_text("> Hi\n> " + UNSUBSCRIBE_BY_REPLY["en"] + "\n\nunsubscribe"))

    def test_inbox_handle_reply_outlook_buy_is_not_suppressed(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "RE: Leads", outlook("We'd like weekly leads, what does it cost?"),
                   mid="<o1@x>", In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg, "imap:<o1@x>", True), "reply")
        self.assertFalse(db.is_suppressed("info@acme.co.uk"))
        msg2 = mail("info@acme.co.uk", "RE: Leads", outlook("Please remove us"), mid="<o2@x>",
                    In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(inbox.handle_reply(db, msg2, "imap:<o2@x>", True), "optout")
        self.assertTrue(db.is_suppressed("info@acme.co.uk"))

    def test_responder_text_strips_outlook_quote(self):
        msg = mail("info@acme.co.uk", "RE: Leads", outlook("Yes please send it"))
        self.assertEqual(r._text(msg), "Yes please send it")

    def test_html_quote_cut(self):
        m = EmailMessage()
        m["From"] = "info@acme.co.uk"
        m.set_content("<div>Yes please</div><blockquote>If you would rather not hear from us, reply "
                      "&quot;unsubscribe&quot;</blockquote>", subtype="html")
        self.assertEqual(r._text(m), "Yes please")


class RulesFallbackTest(unittest.TestCase):
    """A2: Regel-Fallback – Abmeldung und Absage vor Kaufinteresse; Kauf nur per Regel: keine Zwischenantwort."""

    def test_order(self):
        self.assertEqual(r.classify("Please don't call us, not interested")["intent"], "unsubscribe")
        self.assertEqual(r.classify("Not interested in a call, thanks")["intent"], "not_interested")
        self.assertEqual(r.classify("STOP")["intent"], "unsubscribe")
        self.assertEqual(r.classify("please remove this address")["intent"], "unsubscribe")
        self.assertEqual(r.classify("What does the subscription cost?")["intent"], "buy")

    def test_rules_buy_only_alerts_owner(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "What does the subscription cost?", mid="<b1@x>")
        with mock.patch.object(r, "send_reply") as send, mock.patch.object(r, "notify_owner") as note:
            self.assertEqual(r.handle_message(db, msg, "<b1@x>", True, OWN), "owner")
        send.assert_not_called()
        note.assert_called_once()
        self.assertIn("nicht geantwortet", note.call_args[0][1])

    def test_claude_buy_sends_hold(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "What does the subscription cost?", mid="<b2@x>")
        c = {"intent": "buy", "faq": ["none"], "needs_owner": True, "summary_de": "Kauf", "by": "claude"}
        with mock.patch.object(r, "classify", return_value=c), mock.patch.object(r, "send_reply") as send, \
                mock.patch.object(r, "notify_owner"):
            self.assertEqual(r.handle_message(db, msg, "<b2@x>", True, OWN), "owner")
        send.assert_called_once()

    def test_optout_text_overrides_claude(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "Interesting, but please remove us.", mid="<b3@x>")
        c = {"intent": "sample", "faq": ["none"], "needs_owner": False, "summary_de": "Probe", "by": "claude"}
        with mock.patch.object(r, "classify", return_value=c), mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<b3@x>", True, OWN), "suppress")
        send.assert_not_called()


class PauseAlertTest(unittest.TestCase):
    """A3: In der Pause bei Kaufinteresse Mail + Push; Mail geht vor dem Push raus."""

    def test_pause_buy_mails_owner(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "What does it cost per month?", mid="<p1@x>")
        with mock.patch.object(r, "auto_replies_paused", return_value=True), \
                mock.patch.object(r, "notify_owner") as note, mock.patch.object(r, "push") as push:
            self.assertEqual(r.handle_message(db, msg, "<p1@x>", True, OWN), "paused")
            self.assertEqual(r.handle_message(db, msg, "<p1@x>", True, OWN), "paused")
        note.assert_called_once()
        push.assert_not_called()

    def test_notify_owner_mail_before_push(self):
        order = []
        with mock.patch.object(r.requests, "post", side_effect=lambda *a, **k: order.append("mail") or mock.Mock()), \
                mock.patch.object(r, "push", side_effect=lambda *a, **k: order.append("push")), \
                mock.patch.object(r, "alert_address", return_value="owner@example.org"), \
                mock.patch.dict(os.environ, {"RESEND_API_KEY": "k", "MAIL_FROM": "a@nextgen-profit.de"}):
            r.notify_owner("s", "t", kind="buy")
        self.assertEqual(order, ["mail", "push"])

    def test_push_error_after_mail_does_not_raise(self):
        with mock.patch.object(r.requests, "post"), mock.patch.object(r, "push", side_effect=RuntimeError("x")), \
                mock.patch.object(r, "alert_address", return_value="owner@example.org"), \
                mock.patch.dict(os.environ, {"RESEND_API_KEY": "k", "MAIL_FROM": "a@nextgen-profit.de"}):
            r.notify_owner("s", "t", kind="buy")


class SuppressBothTest(unittest.TestCase):
    """A4: Abmeldung von einer anderen Adresse sperrt auch die angeschriebene Adresse."""

    def test_both_addresses(self):
        db = db_with_prospect()
        msg = mail("joe@gmail.com", "Re: Leads", "Not interested, thanks", mid="<s1@x>",
                   In_Reply_To="<sent1@nextgen-profit.de>")
        self.assertEqual(r.handle_message(db, msg, "<s1@x>", True, OWN), "suppress")
        self.assertTrue(db.is_suppressed("joe@gmail.com"))
        self.assertTrue(db.is_suppressed("info@acme.co.uk"))


class SuppressedNoAutoReplyTest(unittest.TestCase):
    """A5: gesperrte Adresse bekommt keine automatische Antwort, Inhaber wird informiert."""

    def test_blocked(self):
        db = db_with_prospect()
        db.suppressed.add("info@acme.co.uk")
        msg = mail("info@acme.co.uk", "Re: Leads", "Yes please, send it over", mid="<x1@x>")
        with mock.patch.object(r, "regional_sample") as sample, mock.patch.object(r, "send_reply") as send, \
                mock.patch.object(r, "notify_owner") as note:
            self.assertEqual(r.handle_message(db, msg, "<x1@x>", True, OWN), "blocked")
            self.assertEqual(r.handle_message(db, msg, "<x1@x>", True, OWN), "done")
        sample.assert_not_called()
        send.assert_not_called()
        note.assert_called_once()
        ev = db.rows("email_events")[0]
        self.assertIn("Sperrliste", ev["note"])
        self.assertEqual(ev["type"], "reply_positive")

    def test_unreadable_suppression_blocks(self):
        db = FakeDB()
        with mock.patch.object(db, "is_suppressed", side_effect=RuntimeError("down")):
            self.assertTrue(r.suppressed_any(db, "a@b.co.uk"))


class ThreadTest(unittest.TestCase):
    """A6: Antworten bleiben im Verlauf (References)."""

    def test_references(self):
        msg = mail("info@acme.co.uk", "Re: Leads", "hi", mid="<in1@x>")
        self.assertEqual(r.thread_references(msg, {"smtp_message_id": "<sent1@nextgen-profit.de>"}, "<in1@x>"),
                         "<sent1@nextgen-profit.de> <in1@x>")
        msg2 = mail("info@acme.co.uk", "Re: Leads", "hi", mid="<in2@x>",
                    References="<sent1@nextgen-profit.de> <mid@x>")
        self.assertEqual(r.thread_references(msg2, {}, "<in2@x>"), "<sent1@nextgen-profit.de> <mid@x> <in2@x>")
        c = r.reply_content("acme.co.uk", "Leads", "Hello", "<in2@x>", "en", references="<a@x> <in2@x>")
        self.assertEqual(c["headers"], {"In-Reply-To": "<in2@x>", "References": "<a@x> <in2@x>"})
        self.assertEqual(c["subject"], "Re: Leads")

    def test_faq_reply_passes_references_and_key(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "Where do the leads come from?", mid="<f1@x>")
        c = {"intent": "question", "faq": ["sources"], "needs_owner": False, "summary_de": "Frage", "by": "claude"}
        with mock.patch.object(r, "classify", return_value=c), mock.patch.object(r, "send_reply") as send:
            self.assertEqual(r.handle_message(db, msg, "<f1@x>", True, OWN), "faq")
        kw = send.call_args.kwargs
        self.assertEqual(kw["references"], "<sent1@nextgen-profit.de> <f1@x>")
        self.assertEqual(kw["idempotency_key"], "reply-<f1@x>-faq")
        # A9: automatisch erledigt -> im Cockpit „erledigt“ (bleibt sichtbar)
        self.assertEqual(db.rows("inbound_replies")[0]["status"], "erledigt")


class IdempotencyTest(unittest.TestCase):
    """A8: scheitert das Speichern nach dem Versand, geht beim nächsten Lauf keine zweite Antwort raus."""

    def test_409_counts_as_sent(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "Where do the leads come from?", mid="<i1@x>")
        c = {"intent": "question", "faq": ["sources"], "needs_owner": False, "summary_de": "Frage", "by": "claude"}
        with mock.patch.object(r, "classify", return_value=c), \
                mock.patch.object(r, "send_reply", side_effect=RuntimeError("Resend 409 invalid_idempotent_request")):
            self.assertEqual(r.handle_message(db, msg, "<i1@x>", True, OWN), "faq")
        self.assertEqual([e["dedupe_key"] for e in db.rows("email_events")], ["reply:<i1@x>"])

    def test_event_insert_is_idempotent(self):
        db = FakeDB()
        c = {"intent": "question", "faq": ["sources"], "by": "claude"}
        r.record_event(db, "m1", "reply", "reply:<x>", "n", c)
        r.record_event(db, "m1", "reply", "reply:<x>", "n", c)
        self.assertEqual(len(db.rows("email_events")), 1)


class CockpitStatusTest(unittest.TestCase):
    """A9: Fälle für den Inhaber bleiben offen."""

    def test_owner_case_stays_open(self):
        db = db_with_prospect()
        msg = mail("info@acme.co.uk", "Re: Leads", "Can we talk about custom work?", mid="<c1@x>")
        with mock.patch.object(r, "notify_owner"), mock.patch.object(r, "send_reply"):
            r.handle_message(db, msg, "<c1@x>", True, OWN)
        self.assertNotEqual(db.rows("inbound_replies")[0].get("status"), "erledigt")


P = {"id": "p1", "company_name": "Acme Web Ltd", "segment_id": "S2", "country": "UK", "region": None,
     "legal_form": "Ltd"}
E = {"id": "e1", "segment_id": "S2", "variant": "A"}
RECENT = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=5)).isoformat()


def out_msg(mid, kind, status, to="info@acme.co.uk", prospect=P, **kw):
    return {"id": mid, "kind": kind, "status": status, "to_email": to, "prospect_id": prospect["id"],
            "experiment_id": "e1", "subject": "Leads", "body": "x", "language": "en", "unsubscribe_token": "tok12345",
            "approved_at": "2026-10-03", "sent_at": RECENT if status == "sent" else None,
            "prospects": prospect, "experiments": E, **kw}


def run_send(db, live=False):
    out = io.StringIO()
    with mock.patch("lib.db.DB", return_value=db), mock.patch.object(outreach, "total_limit", return_value=None), \
            mock.patch("lib.deliverability.domain_accepts_mail", return_value=True), \
            mock.patch("lib.address_risk.check", return_value=[]), \
            mock.patch("lib.fokus.focus_only", return_value=False), \
            mock.patch.object(outreach, "lint_draft", return_value=mock.Mock(errors=[])), \
            contextlib.redirect_stdout(out):
        code = outreach.cmd_send(SimpleNamespace(live=live, owner_ok="test", limit=400, pause=0))
    return code, out.getvalue()


class SendChecksTest(unittest.TestCase):
    def test_a7_cockpit_reply_blocks_followup(self):
        db = FakeDB({"messages": [out_msg("s1", "initial", "sent"),
                                  out_msg("f1", "followup", "approved", parent_id="s1")],
                     "inbound_replies": [{"id": "r1", "prospect_id": "p1", "received_at": RECENT}]})
        self.assertIn("Antwort im Antworten-Cockpit", outreach.followup_block_reason(db, db.rows("messages")[1]))
        # Cockpit nicht lesbar: blockieren
        db2 = FakeDB({"messages": [out_msg("s1", "initial", "sent")]})
        real = db2.select
        db2.select = lambda t, p=None: (_ for _ in ()).throw(RuntimeError("x")) if t == "inbound_replies" else real(t, p)
        self.assertIsNotNone(outreach.followup_block_reason(db2, out_msg("f1", "followup", "approved", parent_id="s1")))

    def test_a7_sample_followup(self):
        later = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).isoformat()
        db = FakeDB({"messages": [out_msg("s1", "initial", "sent")],
                     "email_events": [{"message_id": "s1", "type": "sample_requested", "created_at": RECENT}],
                     "inbound_replies": [{"id": "r1", "prospect_id": "p1", "received_at": later}]})
        m = out_msg("q1", "sample_followup", "approved", parent_id="s1")
        self.assertIn("Cockpit", outreach.followup_block_reason(db, m))

    def test_a11_link_is_default_and_live_requires_link(self):
        with mock.patch.dict(os.environ, {"APP_BASE_URL": "https://x.test"}):
            os.environ.pop("UNSUBSCRIBE_MODE", None)
            self.assertEqual(outreach.unsubscribe_target("t1"), "https://x.test/api/unsubscribe?t=t1")
        with mock.patch.dict(os.environ, {"UNSUBSCRIBE_MODE": "reply", "MAIL_TRANSPORT": "smtp"}):
            db = FakeDB({"messages": [out_msg("a1", "initial", "approved")]})
            with mock.patch("lib.db.DB", return_value=db), self.assertRaises(SystemExit) as cm:
                outreach.cmd_send(SimpleNamespace(live=True, owner_ok="t", limit=10, pause=0))
            self.assertIn("Abmeldelink", str(cm.exception))

    def test_a12_country_rules_rechecked(self):
        sole = dict(P, id="p2", legal_form="Sole trader")
        db = FakeDB({"messages": [out_msg("a1", "initial", "approved", to="joe@acme.co.uk"),
                                  out_msg("a2", "initial", "approved", to="info@sole.co.uk", prospect=sole),
                                  out_msg("a3", "initial", "approved", to="info@good.co.uk")]})
        _, out = run_send(db)
        self.assertIn("BLOCKIERT joe@acme.co.uk: in diesem Land nur allgemeine Firmenadressen", out)
        self.assertIn("BLOCKIERT info@sole.co.uk: Rechtsform", out)
        self.assertIn("würde senden an info@good.co.uk", out)

    def test_a10_notbremse_during_send(self):
        # 25 freigegebene Mails; nach den ersten 20 kommen Rückläufer an -> Abbruch vor Mail 21
        msgs = [out_msg(f"a{i}", "initial", "approved", to=f"info@firm{i}.co.uk") for i in range(25)]
        just_now = dt.datetime.now(dt.timezone.utc).isoformat()  # nach notbremse_ab (config/versand.yaml)
        sent_before = [out_msg(f"s{i}", "initial", "sent", to=f"info@old{i}.co.uk", sent_at=just_now)
                       for i in range(100)]
        db = FakeDB({"messages": msgs + sent_before})
        state = {"n": 0}

        def deliver(*a, **k):
            state["n"] += 1
            if state["n"] == 20:  # Rückläufer schreibt antworten.yml parallel in die Datenbank
                db.insert("email_events", [{"message_id": f"s{i}", "type": "bounced", "payload": {},
                                            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                            "messages": {"to_email": f"info@old{i}.co.uk"}} for i in range(10)])
            return {"smtp_message_id": f"<x{state['n']}@x>"}

        env = {"UNSUBSCRIBE_MODE": "link", "MAIL_TRANSPORT": "smtp", "MAIL_FROM": "a@nextgen-profit.de",
               "SENDER_NAME": "J", "APP_BASE_URL": "https://x.test", "SMTP_HOST": "h", "SMTP_USER": "u",
               "SMTP_PASSWORD": "p"}
        with mock.patch.dict(os.environ, env), mock.patch.object(outreach, "deliver", side_effect=deliver), \
                mock.patch.object(outreach, "_auto_send_allowed", return_value=(True, "")), \
                mock.patch("lib.mailboxes.mailboxes", return_value=[{"n": 1, "from": "a@nextgen-profit.de"}]), \
                mock.patch("lib.mailboxes.box_cap", return_value=500), \
                mock.patch("lib.freshness.needs_rescan", return_value=False), \
                mock.patch("lib.owner_settings.country_limit", return_value=500), \
                mock.patch.object(outreach, "html_version", return_value=None), \
                mock.patch.object(outreach, "landing_link", return_value=None):
            code, out = run_send(db, live=True)
        self.assertEqual(code, 2, out)
        self.assertEqual(state["n"], 20)
        self.assertIn("NOTBREMSE während des Versands", out)

    def test_a10_send_yml_reads_mailboxes_before_sending(self):
        import yaml
        wf = yaml.safe_load((Path(__file__).resolve().parents[1] / ".github/workflows/send.yml").read_text())
        steps = wf["jobs"]["send"]["steps"]
        names = [s.get("name") or s.get("run", "") for s in steps]
        i_inbox = next(i for i, s in enumerate(steps) if "inbox.py --days 14 --apply" in (s.get("run") or ""))
        i_send = names.index("Senden")
        self.assertLess(i_inbox, i_send)
        self.assertTrue(steps[i_inbox].get("continue-on-error"))
        env = wf["jobs"]["send"]["env"]
        for k in ("IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD", "SMTP_USER_2", "SMTP_PASSWORD_2"):
            self.assertIn(k, env)


class StatsOwnerKeyTest(unittest.TestCase):
    """A13: Kaufinteresse aus dem Cockpit (owner:<Message-ID>) zählt mit inbox/responder als eine Antwort."""

    def test_distinct(self):
        from lib.stats import distinct_replies
        evs = [{"id": "1", "type": "reply", "dedupe_key": "imap:<m@x>", "message_id": "m"},
               {"id": "2", "type": "reply", "dedupe_key": "reply:<m@x>", "message_id": "m"},
               {"id": "3", "type": "reply_positive", "dedupe_key": "owner:<m@x>", "message_id": "m"}]
        self.assertEqual([e["id"] for e in distinct_replies(evs)], ["3"])


if __name__ == "__main__":
    unittest.main()
