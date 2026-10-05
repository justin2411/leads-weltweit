"""Versand über viele Domains und Postfächer (Auftrag 05.10.2026): SMTP_BOXES, Freischaltung nach Prüfung,
Rotation, eigene Kurve je Postfach, Notbremse je Postfach und je Domain. Nichts wird gesendet."""
import contextlib
import datetime as dt
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import dns_check  # noqa: E402
import mailbox_test  # noqa: E402
import outreach  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import deliverability as dv  # noqa: E402
from lib import mailboxes as mb  # noqa: E402

ENV = {"SMTP_HOST": "smtp.strato.de", "SMTP_USER": "info@nextgen-profit.de", "SMTP_PASSWORD": "x",
       "MAIL_FROM": "NextGen Profit <info@nextgen-profit.de>",
       "SMTP_USER_2": "leads@nextgen-profit.de", "SMTP_PASSWORD_2": "y",
       "SMTP_BOXES": json.dumps([
           {"user": "anna@np-leads.com", "password": "p1", "host": "smtp.neu.de", "imap_host": "imap.neu.de",
            "start": 20, "schritt": 5, "limit": 40},
           {"user": "ben@np-leads.com", "password": "p2"},
           {"user": "leads@nextgen-profit.de", "password": "doppelt"},   # schon Postfach 2
           {"user": "ohne@np-leads.com"},                                # ohne Passwort
           {"user": "carl@np-mail.io", "password": "p3", "limit": 999},  # nie über postfach_tageslimit
       ])}


class BoxListTests(unittest.TestCase):
    def test_json_boxes_with_domain(self):
        boxes = mb.mailboxes(ENV)
        self.assertEqual([(b["n"], b["domain"]) for b in boxes],
                         [(1, "nextgen-profit.de"), (2, "nextgen-profit.de"), (11, "np-leads.com"),
                          (12, "np-leads.com"), (15, "np-mail.io")])
        anna = boxes[2]
        self.assertEqual((anna["host"], anna["imap_host"], anna["start"], anna["limit"]),
                         ("smtp.neu.de", "imap.neu.de", 20, 40))
        self.assertEqual(anna["from"], "NextGen Profit <anna@np-leads.com>")
        self.assertEqual(boxes[3]["host"], "smtp.strato.de")  # Standard wie Postfach 1
        self.assertEqual(mb.main_domain(ENV), "nextgen-profit.de")

    def test_bad_json_adds_nothing(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(len(mb.mailboxes({**ENV, "SMTP_BOXES": "{kaputt"})), 2)

    def test_own_curve_never_above_global_limit(self):
        boxes = {b["n"]: b for b in mb.mailboxes(ENV)}
        d = dt.date(2026, 10, 5)
        cfg = {"postfach_start": "60", "postfach_schritt": "15", "postfach_tageslimit": "150"}
        with mock.patch.object(mb, "_cfg", side_effect=cfg.get):
            self.assertEqual(mb.box_cap(boxes[11], None, d), 20)
            self.assertEqual(mb.box_cap(boxes[11], d, d + dt.timedelta(days=2)), 30)
            self.assertEqual(mb.box_cap(boxes[11], d, d + dt.timedelta(days=30)), 40)
            self.assertEqual(mb.box_cap(boxes[12], None, d), 60)        # ohne eigene Kurve: wie bisher
            self.assertEqual(mb.box_cap(boxes[15], d, d + dt.timedelta(days=30)), 150)  # 999 -> 150

    def test_rotation_even_by_share(self):
        boxes = mb.mailboxes(ENV)
        caps = {1: 150, 2: 150, 11: 40, 12: 40, 15: 40}
        sent: dict = {}
        for _ in range(42):
            b = mb.pick(boxes, caps, sent)
            sent[b["n"]] = sent.get(b["n"], 0) + 1
        # alle füllen sich im gleichen Takt (Anteil), keines läuft allein voll
        shares = [sent.get(n, 0) / caps[n] for n in caps]
        self.assertLess(max(shares) - min(shares), 0.05)
        self.assertIsNone(mb.pick(boxes, {1: 1}, {1: 1}))

    def test_activation_only_after_green_check(self):
        boxes = mb.mailboxes(ENV)
        checks = {"anna@np-leads.com": {"ok": True}, "ben@np-leads.com": {"ok": False, "detail": "rot: DKIM"}}
        active, off = mb.active_boxes(boxes, checks, "nextgen-profit.de")
        self.assertEqual([b["n"] for b in active], [1, 2, 11])     # Hauptdomain wie heute + grün geprüft
        self.assertIn("rot: DKIM", off[12])
        self.assertIn("noch nicht freigeschaltet", off[15])

    def test_load_checks_newest_per_address(self):
        db = FakeDB({"mailbox_checks": [
            {"address": "anna@np-leads.com", "ok": True, "checked_at": "2026-10-05T10:00:00Z"},
            {"address": "anna@np-leads.com", "ok": False, "checked_at": "2026-10-04T10:00:00Z"}]})
        self.assertTrue(mb.load_checks(db)["anna@np-leads.com"]["ok"])
        broken = mock.Mock(select=mock.Mock(side_effect=RuntimeError("fehlt")))
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(mb.load_checks(broken), {})


class ScopedStopTests(unittest.TestCase):
    def _sent(self, n, frm, prefix):
        return [{"id": f"{prefix}{i}", "sent_from": frm} for i in range(n)]

    def test_box_and_domain_levels(self):
        boxes = mb.mailboxes(ENV)
        dom = {b["n"]: b["domain"] for b in boxes}
        sent = (self._sent(100, "info@nextgen-profit.de", "a") + self._sent(100, "anna@np-leads.com", "b")
                + self._sent(50, "ben@np-leads.com", "c") + self._sent(10, "carl@np-mail.io", "d"))
        ev = [{"message_id": f"b{i}", "type": "bounced", "to_email": f"x{i}@y.com"} for i in range(6)]  # 6 %
        ev += [{"message_id": "d1", "type": "complained", "to_email": "z@y.com"}]                      # Beschwerde
        key = lambda f: mb.box_of(f, boxes)  # noqa: E731
        by_box, by_dom = dv.scoped_stops(sent, ev, key, lambda f: dom[key(f)])
        self.assertEqual(sorted(by_box), [11, 15])
        self.assertIn("Bounce-Quote 6/100", by_box[11])
        self.assertIn("Spam-Beschwerde", by_box[15])
        # Domain np-leads.com: 6/150 = 4 % -> nicht gestoppt; np-mail.io: Beschwerde -> sofort aus (auch unter 100)
        self.assertEqual(sorted(by_dom), ["np-mail.io"])

    def test_below_min_sample_no_stop(self):
        sent = self._sent(99, "anna@np-leads.com", "b")
        ev = [{"message_id": f"b{i}", "type": "bounced", "to_email": f"x{i}@y.com"} for i in range(20)]
        by_box, by_dom = dv.scoped_stops(sent, ev, lambda f: 11, lambda f: "np-leads.com")
        self.assertEqual((by_box, by_dom), ({}, {}))

    def test_box_stops_from_db_domain_wins(self):
        boxes = mb.mailboxes(ENV)
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        msgs = [{"id": f"b{i}", "status": "sent", "sent_at": now, "sent_from": "anna@np-leads.com"} for i in range(5)]
        ev = [{"message_id": "b1", "type": "complained", "created_at": now, "messages": {"to_email": "q@y.com"}}]
        with mock.patch.dict(os.environ, ENV):
            out = outreach.box_stops(FakeDB({"messages": msgs, "email_events": ev}), boxes)
        self.assertEqual(sorted(out), [11, 12])           # die ganze Domain np-leads.com
        self.assertTrue(out[12].startswith("Domain np-leads.com"))


    def test_box_reset_counts_only_newer_mails(self):
        # Postfach-Neustart (Inhaber 05.10.2026): alte Rückläufer dieses Postfachs zählen nicht mehr, neue schon
        boxes = mb.mailboxes(ENV)
        old, new = "2026-10-04T10:00:00+00:00", "2026-10-05T14:00:00+00:00"
        msgs = [{"id": f"b{i}", "status": "sent", "sent_at": old, "sent_from": "carl@np-mail.io"} for i in range(100)]
        ev = [{"message_id": f"b{i}", "type": "bounced", "created_at": old, "messages": {"to_email": f"x{i}@y.com"}}
              for i in range(10)]
        db = FakeDB({"messages": msgs, "email_events": ev})
        reset = dt.datetime(2026, 10, 5, 13, 30, tzinfo=dt.timezone.utc)
        n = mb.box_of("carl@np-mail.io", boxes)
        with mock.patch.dict(os.environ, ENV), mock.patch.object(dv, "window_start", lambda now: reset - dt.timedelta(days=5)):
            self.assertIn(n, outreach.box_stops(db, boxes))                       # ohne Neustart: 10 % -> aus
            with mock.patch.object(dv, "box_reset", lambda k: reset if k == n else None):
                self.assertNotIn(n, outreach.box_stops(db, boxes))                # nach Neustart: zählt neu
                fresh = [{"id": f"n{i}", "status": "sent", "sent_at": new, "sent_from": "carl@np-mail.io"}
                         for i in range(100)]
                fresh_ev = [{"message_id": f"n{i}", "type": "bounced", "created_at": new,
                             "messages": {"to_email": f"n{i}@y.com"}} for i in range(6)]
                db2 = FakeDB({"messages": msgs + fresh, "email_events": ev + fresh_ev})
                self.assertIn(n, outreach.box_stops(db2, boxes))                  # neue 6 % -> wieder aus


class DnsTests(unittest.TestCase):
    def rec(self, data):
        return lambda name, rtype: data.get((name, rtype), [])

    def test_generic_domain(self):
        good = {("np-leads.com", "MX"): ["10 mx.neu.de."],
                ("np-leads.com", "TXT"): ["v=spf1 include:_spf.neu.de ~all"],
                ("_dmarc.np-leads.com", "TXT"): ["v=DMARC1; p=none"],
                ("google._domainkey.np-leads.com", "TXT"): ["v=DKIM1; k=rsa; p=MIIB"]}
        ok, missing = dns_check.domain_ok("np-leads.com", self.rec(good))
        self.assertTrue(ok, missing)
        bad = {**good, ("np-leads.com", "TXT"): ["v=spf1 +all", "v=spf1 a ~all"]}
        bad.pop(("_dmarc.np-leads.com", "TXT"))
        ok, missing = dns_check.domain_ok("np-leads.com", self.rec(bad))
        self.assertFalse(ok)
        self.assertEqual(missing, ["genau ein SPF-Eintrag", "SPF ohne +all", "DMARC vorhanden"])

    def test_main_domain_keeps_strict_check(self):
        labels = [x[0] for x in dns_check.domain_checks("nextgen-profit.de", self.rec({}))]
        self.assertIn("Resend-DKIM unverändert", labels)

    def test_all_domains(self):
        self.assertEqual(dns_check.all_domains(ENV), ["nextgen-profit.de", "np-leads.com", "np-mail.io"])


class MailboxTestTests(unittest.TestCase):
    def test_box_green_only_with_dns_smtp_dkim(self):
        box = [b for b in mb.mailboxes(ENV) if b["n"] == 11][0]
        fetched = {}

        def fetch(token, **kw):
            fetched.update(kw)
            return b"raw"
        with mock.patch.dict(os.environ, {"OWNER_EMAIL": "o@x.de"}), contextlib.redirect_stdout(io.StringIO()):
            row = mailbox_test.test_box(box, "t1", send=lambda *a, **k: None, fetch=fetch,
                                        dkim=lambda raw, d: d == "np-leads.com", dns_ok=lambda d: (True, []))
            self.assertTrue(row["ok"])
            self.assertEqual(fetched["host"], "imap.neu.de")
            self.assertNotIn("password", row)
            red = mailbox_test.test_box(box, "t1", send=lambda *a, **k: None, fetch=fetch,
                                        dkim=lambda raw, d: True, dns_ok=lambda d: (False, ["DMARC vorhanden"]))
        self.assertFalse(red["ok"])
        self.assertEqual(red["detail"], "rot: DNS")
        db = FakeDB()
        with contextlib.redirect_stdout(io.StringIO()):
            mailbox_test.save_checks([row, red], db)
        self.assertEqual(len(db.tables["mailbox_checks"]), 2)


class SendIntegrationTests(unittest.TestCase):
    def test_unchecked_domain_gets_no_mail(self):
        from test_outreach_send import msg
        db = FakeDB({"messages": [msg(f"a{i}", "initial", "approved", to=f"info@z{i}.co.uk") for i in range(6)]})
        out = io.StringIO()
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(outreach, "total_limit", return_value=None), \
                mock.patch("lib.deliverability.domain_accepts_mail", return_value=True), \
                mock.patch("lib.fokus.focus_only", return_value=False), \
                mock.patch.object(outreach, "lint_draft", return_value=mock.Mock(errors=[])), \
                mock.patch.dict(os.environ, ENV), contextlib.redirect_stdout(out):
            outreach.cmd_send(SimpleNamespace(live=False, owner_ok=None, limit=400, pause=0))
        text = out.getvalue()
        self.assertIn("POSTFACH AUS 11: anna@np-leads.com: noch nicht freigeschaltet", text)
        used = {line.rsplit("Postfach ", 1)[1].split(")")[0] for line in text.splitlines() if line.startswith("PROBELAUF würde senden")}
        self.assertTrue(used, text)
        self.assertLessEqual(used, {"1", "2"})


if __name__ == "__main__":
    unittest.main()
