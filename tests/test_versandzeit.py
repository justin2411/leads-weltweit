"""Versandzeit: nur Di–Do zur Bürozeit der Empfänger (Inhaber 04.10.2026: „übernimm alle 3 punkte“)."""
import contextlib
import datetime as dt
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import outreach  # noqa: E402
import tagescheck  # noqa: E402
import wachhund as w  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import versandzeit as vz  # noqa: E402

UTC = dt.timezone.utc
BERLIN = ZoneInfo("Europe/Berlin")


def utc(s):
    return dt.datetime.fromisoformat(s).replace(tzinfo=UTC)


class PlanTest(unittest.TestCase):
    def test_send_yml_crons_cover_summer_and_winter(self):
        """Je Gruppe ein Cron für Sommer- (UTC+2) und Winterzeit (UTC+1), nur Di–Do."""
        wf = yaml.safe_load((ROOT / ".github/workflows/send.yml").read_text())
        crons = {c["cron"] for c in wf[True]["schedule"]}
        self.assertTrue(all(c.endswith(" * * 2-4") for c in crons), crons)
        for g in vz.load()["laeufe"]:
            h, m = map(int, g["start"].split(":"))
            for off in (2, 1):
                self.assertIn(f"{m} {h - off} * * 2-4", crons, (g["gruppe"], off))

    def test_group_now(self):
        # Sommerzeit (MESZ): Di 06.10.2026
        self.assertEqual(vz.group_now(utc("2026-10-06T06:37"))["gruppe"], "europa")   # 08:37
        self.assertEqual(vz.group_now(utc("2026-10-06T07:37"))["gruppe"], "europa")   # 09:37 zweiter Durchgang
        self.assertIsNone(vz.group_now(utc("2026-10-06T08:45")))                      # 10:45 zu spät
        self.assertEqual(vz.group_now(utc("2026-10-06T12:37"))["gruppe"], "us")       # 14:37
        self.assertEqual(vz.group_now(utc("2026-10-06T13:37"))["gruppe"], "us")       # 15:37 zweiter Durchgang
        self.assertIsNone(vz.group_now(utc("2026-10-06T11:00")))
        # Winterzeit (MEZ): Di 27.10.2026 – der Sommer-Cron landet vor dem Fenster
        self.assertIsNone(vz.group_now(utc("2026-10-27T06:37")))                      # 07:37 MEZ
        self.assertEqual(vz.group_now(utc("2026-10-27T07:37"))["gruppe"], "europa")   # 08:37 MEZ
        self.assertIsNone(vz.group_now(utc("2026-10-27T12:37")))                      # 13:37 MEZ
        self.assertEqual(vz.group_now(utc("2026-10-27T13:37"))["gruppe"], "us")       # 14:37 MEZ
        # Mo, Fr, Sa, So: nie
        for day in ("2026-10-05", "2026-10-09", "2026-10-10", "2026-10-11"):
            self.assertIsNone(vz.group_now(utc(f"{day}T06:37")), day)
            self.assertIsNone(vz.group_now(utc(f"{day}T12:37")), day)
        self.assertEqual(vz.group("europa")["laender"][:2], ["UK", "FR"])
        self.assertEqual(vz.group("us")["laender"], ["US"])

    def test_deadline_and_due(self):
        g = vz.group("europa")
        self.assertEqual(vz.deadline(g, utc("2026-10-06T06:40")), dt.datetime(2026, 10, 6, 11, 0, tzinfo=BERLIN))
        g, t = vz.last_due(utc("2026-10-12T10:00"))                 # Montag -> Do US-Lauf
        self.assertEqual((g["gruppe"], t.astimezone(UTC)), ("us", utc("2026-10-08T12:37")))
        self.assertEqual(vz.send_day_start(utc("2026-10-12T10:00")).astimezone(UTC), utc("2026-10-08T06:37"))
        g, t = vz.next_start(utc("2026-10-08T18:00"))
        self.assertEqual(t.astimezone(UTC), utc("2026-10-13T06:37"))
        self.assertEqual(vz.label(utc("2026-10-13T06:37")), "Di 13.10. 08:37")

    def test_cli_outputs(self):
        with tempfile.NamedTemporaryFile("r", suffix=".txt") as f, mock.patch.dict(os.environ, {"GITHUB_OUTPUT": f.name}), \
                contextlib.redirect_stdout(io.StringIO()):
            vz.main(["--gruppe", "us"])
            vz.main(["--gruppe", "alle"])
            out = f.read()
        self.assertIn("ok=true\ngruppe=us\nlaender=US\nbis=\n", out)   # feste Gruppe per Hand: ohne Zeitfenster
        self.assertIn("ok=true\ngruppe=alle\nlaender=\nbis=\n", out)


class WachhundTest(unittest.TestCase):
    def jobs(self):
        return {j["gruppe"]: j for j in w.JOBS if j["wf"] == "send.yml"}

    def test_two_send_jobs_in_german_time(self):
        jobs = self.jobs()
        self.assertEqual(set(jobs), {"europa", "us"})
        self.assertEqual(jobs["europa"]["weekdays"], [1, 2, 3])
        self.assertEqual(jobs["us"]["inputs"]["gruppe"], "auto")
        self.assertEqual(jobs["europa"]["inputs"]["probelauf"], "false")

    def test_overdue_only_tue_to_thu(self):
        eu, us = self.jobs()["europa"], self.jobs()["us"]
        self.assertTrue(w.overdue(eu, [], utc("2026-10-06T07:30"))[0])      # Di 09:30 MESZ, kein Lauf
        self.assertFalse(w.overdue(eu, [], utc("2026-10-05T07:30"))[0])     # Montag
        self.assertFalse(w.overdue(eu, [], utc("2026-10-09T07:30"))[0])     # Freitag
        self.assertFalse(w.overdue(eu, [], utc("2026-10-06T08:30"))[0])     # 10:30: Nachholfenster vorbei
        self.assertFalse(w.overdue(eu, [{"created_at": "2026-10-06T06:40:00Z", "status": "completed"}],
                                   utc("2026-10-06T07:30"))[0])
        self.assertTrue(w.overdue(eu, [], utc("2026-10-27T08:30"))[0])      # Winterzeit: 09:30 MEZ
        # US: der Morgenlauf zählt nicht als US-Lauf
        morning = [{"created_at": "2026-10-06T06:40:00Z", "status": "completed"}]
        self.assertTrue(w.overdue(us, morning, utc("2026-10-06T13:30"))[0])  # 15:30 MESZ
        self.assertFalse(w.overdue(us, morning, utc("2026-10-06T12:50"))[0])  # noch in der Karenz


class TagescheckTest(unittest.TestCase):
    def test_send_max_age_follows_plan(self):
        # Montag 19:37 MESZ: letzter fälliger Lauf Do 14:37 MESZ -> ~4 Tage + 5 h ok, kein Fehler am Wochenende
        age = tagescheck.send_max_age(utc("2026-10-12T17:37"))
        self.assertAlmostEqual(age, (utc("2026-10-12T17:37") - utc("2026-10-08T12:37")).total_seconds() / 3600 + 0.25)
        # Mittwoch abends: US-Lauf von heute muss gelaufen sein
        self.assertLess(tagescheck.send_max_age(utc("2026-10-07T17:37")), 5.5)


P = {"id": "p1", "company_name": "Acme Web Ltd", "segment_id": "S2", "country": "UK", "legal_form": "Ltd"}
PU = {"id": "p2", "company_name": "Acme Web Inc", "segment_id": "S2", "country": "US", "legal_form": "Inc"}
E = {"id": "e1", "segment_id": "S2", "variant": "A"}


def msg(mid, to, p):
    return {"id": mid, "kind": "initial", "status": "approved", "to_email": to, "prospect_id": p["id"],
            "experiment_id": "e1", "subject": "Leads", "body": "Hi", "language": "en", "unsubscribe_token": "tok-" + mid,
            "approved_at": "2026-10-01", "prospects": p, "experiments": E}


class OutreachTest(unittest.TestCase):
    def run_send(self, db, **kw):
        out = io.StringIO()
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(outreach, "total_limit", return_value=None), \
                mock.patch("lib.deliverability.domain_accepts_mail", return_value=True), \
                mock.patch("lib.fokus.focus_only", return_value=False), \
                mock.patch.object(outreach, "lint_draft", return_value=mock.Mock(errors=[])), \
                contextlib.redirect_stdout(out):
            outreach.cmd_send(SimpleNamespace(live=False, owner_ok=None, limit=400, pause=0, **kw))
        return out.getvalue()

    def test_countries_filter(self):
        db = FakeDB({"messages": [msg("a1", "info@acme.co.uk", P), msg("a2", "info@acme.com", PU)]})
        out = self.run_send(db, countries="US")
        self.assertIn("würde senden an info@acme.com", out)
        self.assertNotIn("info@acme.co.uk", out)
        out = self.run_send(db, countries="UK,FR")
        self.assertIn("würde senden an info@acme.co.uk", out)
        self.assertNotIn("info@acme.com", out)
        out = self.run_send(db)  # ohne Filter: alle
        self.assertIn("info@acme.co.uk", out)
        self.assertIn("info@acme.com", out)

    def test_window_over_stops(self):
        db = FakeDB({"messages": [msg("a1", "info@acme.co.uk", P)]})
        past = (dt.datetime.now(BERLIN) - dt.timedelta(minutes=5)).strftime("%H:%M")
        if past > dt.datetime.now(BERLIN).strftime("%H:%M"):  # kurz nach Mitternacht: Test sinnlos
            self.skipTest("Mitternacht")
        out = self.run_send(db, countries="UK", bis=past)
        self.assertIn("Versandfenster vorbei", out)
        self.assertNotIn("würde senden an", out)

    def test_window_pause(self):
        self.assertEqual(outreach.window_pause(60, None, 100), 60)
        self.assertEqual(outreach.window_pause(60, 7200, 60), 60)        # Zeit reicht: normale Pause
        self.assertEqual(outreach.window_pause(60, 3600, 120), 30)       # verteilt bis zum Fensterende
        self.assertEqual(outreach.window_pause(60, 600, 120), outreach.MIN_PAUSE)  # nie schneller als 20 s
        self.assertEqual(outreach.country_filter(" uk, FR ,"), {"UK", "FR"})
        self.assertIsNone(outreach.country_filter(""))


class SeedTest(unittest.TestCase):
    def test_no_secret_no_mail(self):
        db = FakeDB()
        with mock.patch.dict(os.environ, {"SEED_INBOXES": ""}), mock.patch.object(outreach, "deliver") as d:
            outreach.seed_copy(db, {"id": "m1", "unsubscribe_token": "tok"}, "UK", "S", "T tok", None, None, None, set())
        d.assert_not_called()
        self.assertEqual(db.inserts, [])

    def test_one_copy_per_country_and_seed(self):
        db = FakeDB()
        done: set[str] = set()
        sent = []
        def fake_deliver(to, subject, text, unsub, html=None, mailbox=None, attachments=None):
            sent.append((to, text, html, unsub))
            return {"smtp_message_id": "<x@y>", "sent_from": "info@nextgen-profit.de"}
        env = {"SEED_INBOXES": "kontrolle1@gmail.com, kontrolle2@outlook.com", "UNSUBSCRIBE_MODE": "link",
               "APP_BASE_URL": "https://www.nextgen-profit.de"}
        m = {"id": "m1", "unsubscribe_token": "tok123"}
        with mock.patch.dict(os.environ, env), mock.patch.object(outreach, "deliver", side_effect=fake_deliver), \
                contextlib.redirect_stdout(io.StringIO()):
            outreach.seed_copy(db, m, "UK", "Subj", "Body ?r=tok123 unsub t=tok123", "<a>tok123</a>", None, None, done)
            outreach.seed_copy(db, {"id": "m2", "unsubscribe_token": "t2"}, "UK", "Subj", "B", None, None, None, done)
            outreach.seed_copy(db, {"id": "m3", "unsubscribe_token": "t3"}, "US", "Subj", "B", None, None, None, done)
        self.assertEqual([s[0] for s in sent], ["kontrolle1@gmail.com", "kontrolle2@outlook.com"] * 2)
        self.assertNotIn("tok123", sent[0][1])                         # Käufer-Token nie in der Kontrollmail
        self.assertNotIn("tok123", sent[0][2])
        self.assertTrue(sent[0][3].endswith("t=kontrolle"))
        rows = [r for t, r in db.inserts if t == "seed_checks"]
        self.assertEqual([(r["country"], r["message_id"]) for r in rows], [("UK", "m1"), ("UK", "m1"), ("US", "m3"), ("US", "m3")])
        self.assertNotIn("messages", {t for t, _ in db.inserts})        # keine Kaltmail


if __name__ == "__main__":
    unittest.main()
