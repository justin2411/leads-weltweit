import sys
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tagescheck as t  # noqa: E402
from fakedb import FakeDB  # noqa: E402


class TagescheckTest(unittest.TestCase):
    def test_subject_reflects_worst(self):
        c = t.Check()
        c.add("Versand", t.OK, "läuft")
        self.assertIn("alles läuft", t.mail(c)[0])
        c.add("Proben", t.WARN, "Hinweis")
        self.assertIn("1 Hinweis", t.mail(c)[0])
        c.add("Website", t.FAIL, "kaputt", "/ → 500")
        subject, body = t.mail(c)
        self.assertIn("1 Problem", subject)
        self.assertLess(body.index("PROBLEME"), body.index("HINWEISE"))
        self.assertEqual(c.worst, t.FAIL)

    def test_broken_check_is_reported_not_raised(self):
        c = t.Check()
        c.guard("Kunden", lambda: 1 / 0)
        self.assertEqual(c.rows[0][1], t.FAIL)

    def test_plan_and_brake(self):
        import datetime as dt
        now = dt.datetime.now(dt.timezone.utc)
        old = (now - dt.timedelta(hours=13)).isoformat()
        rows = [{"werk": "kunden-werk", "at": now.isoformat(), "mode": "autopilot", "bremse": "drossel",
                 "db_bytes": 6_100_000_000, "plan": {"kunden": 2}},
                {"werk": "lead-werk", "at": old, "mode": "inhaber", "bremse": "aus", "db_bytes": 5_000_000_000,
                 "plan": {"web-us": 3, "web-uk": 1}}]
        c = t.Check()
        t.check_plan(c, FakeDB({"werk_plan_log": rows}))
        got = {(r[0], r[2]): r[1] for r in c.rows}
        self.assertEqual(got[("Speicher", "Datenbank 6.10 GB von 8 GB")], t.WARN)
        self.assertEqual(got[("Werke", "kunden-werk: 2 Plätze (Autopilot)")], t.OK)
        self.assertEqual(got[("Werke", "lead-werk: 4 Plätze (deine Belegung)")], t.WARN)  # 13 h ohne Start

    def test_buyers_count_only_mail_ready(self):
        db = FakeDB({"prospects": [{"id": "a", "check_status": "ok"}, {"id": "b", "check_status": "call_only"},
                                   {"id": "c", "check_status": "call_only"}], "leads": []})
        c = t.Check()
        count = lambda db_, table, params: len(db_.select(table, params))  # noqa: E731 - wie _count (exakte Zahl)
        with mock.patch.object(t, "cfg", return_value="true"), mock.patch.object(t, "_count", side_effect=count):
            t.check_werke(c, db)
        row = next(r for r in c.rows if r[0] == "Kunden-Werk")
        self.assertEqual(row[2], "1 mail-fähige Käufer")
        self.assertIn("nur Anruf/Brief 2", row[3])

    def test_mailbox_lamps(self):
        recent = (t.NOW).isoformat()
        msgs = [{"id": f"a{i}", "status": "sent", "sent_at": recent, "sent_from": "NextGen <info@nextgen-profit.de>"}
                for i in range(40)]
        msgs += [{"id": f"b{i}", "status": "sent", "sent_at": recent, "sent_from": "webagency@nextgen-profit.de"}
                 for i in range(40)]
        msgs += [{"id": f"c{i}", "status": "sent", "sent_at": recent, "sent_from": "leads@nextgen-profit.de"}
                 for i in range(10)]
        msgs += [{"id": f"d{i}", "status": "sent", "sent_at": recent, "sent_from": None} for i in range(5)]  # alt: info@
        ev = [{"id": f"e{i}", "type": "bounced", "created_at": recent, "message_id": f"b{i}",
               "messages": {"to_email": f"x{i}@y.com"}} for i in range(3)]          # 3/40 = 7,5 % -> rot
        ev += [{"id": "e9", "type": "bounced", "created_at": recent, "message_id": "c1",
                "messages": {"to_email": "z@y.com"}}]                              # 1/10: zu wenig Mails
        c = t.Check()
        t.check_mailboxes(c, FakeDB({"messages": msgs, "email_events": ev}))
        rows = {r[2].split(":")[0]: r[1] for r in c.rows}
        self.assertEqual(rows, {"info@ (Hauptpostfach)": t.OK, "webagency@nextgen-profit.de": t.FAIL,
                                "leads@nextgen-profit.de": t.OK})
        self.assertIn("bei 45 Mails", next(r[3] for r in c.rows if r[2].startswith("info@")))

    def test_unsubscribe_scanner_suspects(self):
        ev = [{"occurred_at": "2026-10-03T15:30:43+00:00", "message_id": "m1",
               "messages": {"sent_at": "2026-10-03T15:30:29+00:00"}},                   # 14 s -> Verdacht
              {"occurred_at": "2026-10-03T16:10:02Z", "message_id": "m2",
               "messages": {"sent_at": "2026-10-03T15:20:10Z"}},                        # 50 min -> Mensch
              {"occurred_at": "2026-10-03T16:10:02Z", "message_id": None, "messages": None}]  # ohne Mail
        self.assertEqual(t.scanner_suspects(ev), 1)
        c = t.Check()
        t.check_unsubscribes(c, FakeDB({"email_events": [dict(e, type="unsubscribed", created_at=t.NOW.isoformat())
                                                         for e in ev]}))
        self.assertEqual(c.rows[0][1:3], (t.OK, "Abmeldungen in 7 Tagen: 3"))   # nur gezählt, nie rot
        self.assertIn("davon 1 weniger als 60 s", c.rows[0][3])

    def test_kpi_line_counts_funnel_of_one_test(self):
        db = FakeDB({
            "experiments": [{"id": "e1", "segment_id": "S4", "country": "US"},
                            {"id": "e2", "segment_id": "S5", "country": "US"}],
            "messages": [{"id": "m1", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m2", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m3", "experiment_id": "e2", "status": "sent", "kind": "initial"},
                         {"id": "m4", "experiment_id": "e1", "status": "approved", "kind": "initial"}],
            "email_events": [{"id": "a", "type": "reply", "dedupe_key": "imap:<x1>", "message_id": "m1"},
                             {"id": "b", "type": "sample_requested", "dedupe_key": "reply:<x1>", "message_id": "m1"},
                             {"id": "c", "type": "auto_reply", "dedupe_key": "imap:<x2>", "message_id": "m2"},
                             {"id": "d", "type": "reply_negative", "dedupe_key": "imap:<x3>", "message_id": "m3"}],
            "sample_requests": [{"id": "s1", "segment_id": "S4", "country": "US"}],
            "subscriptions": [
                {"id": "u1", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "active"}},
                {"id": "u2", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "trial", "stripe_customer_id": "cus_test"}}],
        })
        k = t.kpi_line(db, "S4", "US")
        self.assertEqual((k["sent"], k["replies"], k["positive"], k["samples"], k["customers"]), (2, 1, 1, 1, 1))
        self.assertEqual((k["revenue"], k["currency"]), (129, "$"))


if __name__ == "__main__":
    unittest.main()
