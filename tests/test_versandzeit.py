"""Versand rund um die Uhr (Inhaber 04.10.2026: „es sollen immer mails rausgehen nicht nur di-do“)."""
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
    def test_send_yml_hourly_every_day(self):
        """Versand rund um die Uhr (Inhaber 04.10.2026): ein stündlicher Cron zur Plan-Minute, jeden Tag."""
        wf = yaml.safe_load((ROOT / ".github/workflows/send.yml").read_text())
        crons = [c["cron"] for c in wf[True]["schedule"]]
        self.assertEqual(crons, [f"{vz.load()['minute']} * * * *"])
        self.assertEqual(vz.load()["wochentage"], [1, 2, 3, 4, 5, 6, 7])

    def test_group_now_every_hour_every_day(self):
        for day in ("2026-10-05", "2026-10-06", "2026-10-09", "2026-10-10", "2026-10-11"):
            for hh in ("00", "03", "06", "12", "18", "23"):
                g = vz.group_now(utc(f"{day}T{hh}:37"))
                self.assertEqual((g["gruppe"], g["laender"]), ("alle", []), (day, hh))

    def test_slots_and_dst(self):
        self.assertEqual(len(vz.slots(dt.date(2026, 10, 6))), 24)
        self.assertEqual(len(vz.slots(dt.date(2026, 10, 25))), 25)   # Ende Sommerzeit: 25 Stunden
        self.assertEqual(len(vz.slots(dt.date(2027, 3, 28))), 23)    # Beginn Sommerzeit: 23 Stunden
        first = vz.slots(dt.date(2026, 10, 6))[0][1]
        self.assertEqual(first.astimezone(UTC), utc("2026-10-05T22:37"))   # 00:37 MESZ
        self.assertTrue(all(t.minute == 37 for _, t in vz.slots(dt.date(2026, 10, 25))))

    def test_due_and_next(self):
        g, t = vz.last_due(utc("2026-10-12T10:00"))                 # Montag 12:00 MESZ -> 10:37 MESZ
        self.assertEqual((g["gruppe"], t.astimezone(UTC)), ("alle", utc("2026-10-12T08:37")))
        self.assertEqual(vz.send_day_start(utc("2026-10-12T10:00")).astimezone(UTC), utc("2026-10-11T22:37"))
        g, t = vz.next_start(utc("2026-10-10T18:00"))               # Samstag
        self.assertEqual(t.astimezone(UTC), utc("2026-10-10T18:37"))
        self.assertEqual(vz.label(utc("2026-10-13T06:37")), "Di 13.10. 08:37")
        self.assertEqual(vz.plan_text(), "täglich 0–24 Uhr · stündlich :37")

    def test_share_spreads_evenly(self):
        self.assertEqual(vz.runs_left(utc("2026-10-06T00:37")), 24)
        self.assertEqual(vz.runs_left(utc("2026-10-06T23:37")), 1)
        self.assertEqual(vz.share(90, utc("2026-10-06T00:37")), 4)    # 90 / 24 aufgerundet
        self.assertEqual(vz.share(30, utc("2026-10-06T21:37")), 10)   # Rest 30 auf 3 Läufe
        self.assertEqual(vz.share(5, utc("2026-10-06T23:37")), 5)     # letzter Lauf: alles
        self.assertEqual(vz.share(0, utc("2026-10-06T12:37")), 0)
        self.assertEqual(vz.share(-3, utc("2026-10-06T12:37")), 0)
        # über einen Tag verteilt: keine Spitze, Summe = Tagesmenge
        rest, per = 90, []
        for h in range(24):
            n = vz.share(rest, utc(f"2026-10-06T{h:02d}:37"))
            per.append(n)
            rest -= n
        self.assertEqual(sum(per), 90)
        self.assertLessEqual(max(per) - min(per), 1)

    def test_cli_outputs(self):
        with tempfile.NamedTemporaryFile("r", suffix=".txt") as f, mock.patch.dict(os.environ, {"GITHUB_OUTPUT": f.name}), \
                contextlib.redirect_stdout(io.StringIO()):
            vz.main(["--gruppe", "auto"])
            vz.main(["--gruppe", "alle"])
            out = f.read()
        self.assertIn("ok=true\ngruppe=alle\nlaender=\nbis=\nminuten=45\nanteil=true\n", out)
        self.assertIn("ok=true\ngruppe=alle\nlaender=\nbis=\nminuten=\nanteil=false\n", out)  # Handstart


class WachhundTest(unittest.TestCase):
    def jobs(self):
        return [j for j in w.JOBS if j["wf"] == "send.yml"]

    def test_one_hourly_job(self):
        jobs = self.jobs()
        self.assertEqual(len(jobs), 1)
        j = jobs[0]
        self.assertEqual((j["kind"], j["window"], j["cond"]), ("hourly", (0, 23), "versand"))
        self.assertEqual(j["inputs"]["gruppe"], "auto")
        self.assertEqual(j["inputs"]["probelauf"], "false")

    def test_overdue_any_day(self):
        j = self.jobs()[0]
        for day in ("2026-10-05", "2026-10-10", "2026-10-11"):          # Mo, Sa, So
            self.assertTrue(w.overdue(j, [], utc(f"{day}T03:30"))[0], day)
        recent = [{"created_at": "2026-10-10T02:37:00Z", "status": "completed"}]
        self.assertFalse(w.overdue(j, recent, utc("2026-10-10T03:30"))[0])   # vor 53 min gelaufen
        self.assertTrue(w.overdue(j, recent, utc("2026-10-10T04:05"))[0])    # 88 min ohne Lauf


class TagescheckTest(unittest.TestCase):
    def test_send_max_age_hourly(self):
        # Sonntag 19:37 MESZ: letzter fälliger Lauf 18:37 MESZ (Karenz 60 min) -> 1 h + 1,5 h Puffer
        age = tagescheck.send_max_age(utc("2026-10-11T17:37"))
        self.assertAlmostEqual(age, 2.5)
        self.assertLess(tagescheck.send_max_age(utc("2026-10-07T17:00")), 4)


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
                mock.patch("lib.address_risk.check", return_value=[]), \
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

    def test_runtime_over_stops(self):
        db = FakeDB({"messages": [msg("a1", "info@acme.co.uk", P)]})
        out = self.run_send(db, countries="UK", minuten=-1)
        self.assertIn("Laufzeit vorbei", out)
        self.assertNotIn("würde senden an", out)

    def test_share_limits_run(self):
        """Stündlicher Lauf: nur der Anteil der Resttagesmenge (Inhaber 04.10.2026: rund um die Uhr, gleichmäßig)."""
        rows = [msg(f"a{i}", f"info@acme{i}.com", dict(PU, id=f"p{i}")) for i in range(6)]
        db = FakeDB({"messages": rows})
        with mock.patch("lib.versandzeit.share", return_value=2):
            out = self.run_send(db, anteil=True)
        self.assertEqual(out.count("würde senden an"), 2)
        self.assertIn("Anteil dieses Laufs erreicht (2)", out)

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
