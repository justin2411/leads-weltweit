"""Engpass-Protokoll (JARVIS-Plan W1-2): höchstens 1×/h nach decisions, anhaltend = ≥ 6 der letzten 8 und ≥ 24 h,
ohne laufenden Test genau ein Agenten-Auftrag (gleiche Regeln wie brain_routines.auftrag)."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ab as cli  # noqa: E402
import brain_routines  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc
T0 = dt.datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
FUNNEL = [{"station": "mail", "n": 214, "k": 0}, {"station": "landing", "n": 197, "k": 1}]


def entries(stations: list[str], step_h: float = 1.0, start: dt.datetime = T0 - dt.timedelta(hours=1)) -> list[dict]:
    """Protokoll-Einträge, neueste zuerst, im Abstand step_h."""
    return [{"id": i, "type": "note", "subject": f"Engpass: {s}", "metrics": {"station": s},
             "created_at": (start - dt.timedelta(hours=i * step_h)).isoformat()} for i, s in enumerate(stations)]


def make_db(decisions=None, tests=None, tasks=None) -> FakeDB:
    db = FakeDB({"decisions": decisions or [], "ab_tests": tests or [], "agent_tasks": tasks or []})
    db.rpc_handlers["ab_funnel"] = lambda a, p: FUNNEL
    return db


class StreakTest(unittest.TestCase):
    def test_needs_six_of_eight(self):
        self.assertIsNone(cli.engpass_streak(entries(["mail"] * 7)))  # zu wenig Einträge
        self.assertIsNone(cli.engpass_streak(entries(["mail"] * 5 + ["landing"] * 3)))
        s = cli.engpass_streak(entries(["mail"] * 6 + ["landing"] * 2))
        self.assertEqual((s["station"], s["anzahl"]), ("mail", 6))

    def test_since_walks_back_while_rule_holds(self):
        s = cli.engpass_streak(entries(["mail"] * 30))
        self.assertEqual(s["seit"], T0 - dt.timedelta(hours=30))
        # davor anderer Engpass: „seit“ endet dort
        s = cli.engpass_streak(entries(["mail"] * 10 + ["landing"] * 10))
        self.assertLessEqual(T0 - dt.timedelta(hours=11) - s["seit"], dt.timedelta(hours=2))


class LogTest(unittest.TestCase):
    def test_logs_once_per_hour_with_kurz(self):
        db = make_db()
        res = cli.engpass_log(db, T0, beauftragen=lambda b, g: self.fail("kein Auftrag"))
        self.assertEqual(res["protokoll"], "mail")
        d = db.rows("decisions")[-1]
        self.assertEqual(d["subject"], "Engpass: mail")
        self.assertEqual(d["metrics"]["station"], "mail")
        self.assertEqual(d["kurz_titel"], "Engpass: Kaltmail")
        self.assertLessEqual(len(d["kurz_grund"]), 160)
        db.tables["decisions"][-1]["created_at"] = (T0 - dt.timedelta(minutes=20)).isoformat()
        res = cli.engpass_log(db, T0)
        self.assertEqual(res["protokoll"], "schon in dieser Stunde")
        self.assertEqual(len(db.rows("decisions")), 1)

    def test_no_data_no_entry(self):
        db = make_db()
        db.rpc_handlers["ab_funnel"] = lambda a, p: [{"station": "mail", "n": 3, "k": 0}]
        self.assertEqual(cli.engpass_log(db, T0)["protokoll"], "zu wenig Daten")
        self.assertEqual(db.rows("decisions"), [])

    def test_persistent_bottleneck_creates_exactly_one_task(self):
        db = make_db(entries(["mail"] * 30))
        calls = []
        res = cli.engpass_log(db, T0, beauftragen=lambda b, g: calls.append((b, g)) or {"agent": "A1"})
        self.assertEqual(res["anhaltend"]["station"], "mail")
        self.assertEqual(len(calls), 1)
        brief, grund = calls[0]
        self.assertEqual(grund, "Engpass seit 24 h: Kaltmail")
        # gleiche Regeln wie checkBrainTask (Art frage, kein verbotenes Wort, Längen)
        row = brain_routines.check_brain_task("frage", brief, grund, None, None, [], T0)
        self.assertEqual(row["kind"], "frage")

    def test_not_before_24h(self):
        db = make_db(entries(["mail"] * 10))
        res = cli.engpass_log(db, T0, beauftragen=lambda b, g: self.fail("zu früh"))
        self.assertIsNone(res["anhaltend"])

    def test_running_test_or_existing_task_blocks(self):
        db = make_db(entries(["mail"] * 30), tests=[{"id": "t1", "step": "mail_betreff", "country": "US", "status": "laeuft"}])
        self.assertEqual(cli.engpass_log(db, T0, beauftragen=lambda b, g: self.fail("Test läuft"))["auftrag"],
                         "Test läuft schon")
        db = make_db(entries(["mail"] * 30), tasks=[{"id": "x", "status": "offen", "grund": "Engpass seit 24 h: Kaltmail",
                                                     "created_at": (T0 - dt.timedelta(hours=30)).isoformat()}])
        self.assertEqual(cli.engpass_log(db, T0, beauftragen=lambda b, g: self.fail("doppelt"))["auftrag"],
                         "Auftrag besteht schon")

    def test_real_auftrag_goes_through_brain_rules(self):
        db = make_db(entries(["mail"] * 30))
        orig = brain_routines.auftrag
        brain_routines.auftrag = lambda d, kind, b, g, t=None, **k: orig(d, kind, b, g, t=t, note=lambda x: None)
        try:
            res = cli.engpass_log(db, T0)
        finally:
            brain_routines.auftrag = orig
        self.assertEqual(res["auftrag"]["agent"], "A1")
        task = db.rows("agent_tasks")[-1]
        self.assertEqual((task["kind"], task["created_by"], task["market"]), ("frage", "Gehirn", None))
        # nächster Lauf: kein zweiter Auftrag
        task.update(status="offen", created_at=T0.isoformat())
        db.tables["decisions"][-1]["created_at"] = T0.isoformat()
        self.assertEqual(cli.engpass_log(db, T0 + dt.timedelta(hours=2))["auftrag"], "Auftrag besteht schon")


if __name__ == "__main__":
    unittest.main()
