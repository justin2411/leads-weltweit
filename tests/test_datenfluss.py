"""Datenfluss steht still (C3) und Lernschleife Auftrag → Wirkung (C4), scripts/datenfluss.py."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import datenfluss as df  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc
T = dt.datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
ON = {"lead_suche": "true", "kunden_suche": "true", "aktiv": "true"}


def stand(**still_h) -> list[dict]:
    """Zeilen wie datenfluss_stand: leads alle 2 h (84 aktive Stunden), Mails alle 4 h (42)."""
    base = {"leads": 84, "kaeufer": 84, "proben": 24, "mails": 42, "antworten": 24}
    return [{"station": k, "active_hours": n, "last_at": (T - dt.timedelta(hours=still_h.get(k, 0.5))).isoformat(),
             "extra": 0 if k == "proben" else None} for k, n in base.items()]


def cfg_on(name, key):
    return ON.get(key)


class JudgeTest(unittest.TestCase):
    def test_levels_by_interval(self):
        res = {a["station"]: a for a in df.judge(stand(leads=5, mails=13, kaeufer=7, antworten=200), T)}
        self.assertEqual(res["leads"]["stufe"], "ok")        # Intervall 2 h, Grenze 6 h
        self.assertEqual(res["kaeufer"]["stufe"], "gelb")    # 7 h > 6 h, < 12 h
        self.assertEqual(res["mails"]["stufe"], "gelb")      # Intervall 4 h, Grenze 12 h, rot erst ab 24 h
        self.assertEqual(res["antworten"]["stufe"], "rot")   # Intervall 7 h, 200 h ≥ 42 h
        self.assertEqual(res["leads"]["grenze_h"], 6.0)

    def test_no_baseline_never_alarms(self):
        rows = [{"station": "mails", "active_hours": 0, "last_at": None, "extra": None}]
        self.assertEqual(df.judge(rows, T)[0]["stufe"], "keine_basis")

    def test_switched_off_stations(self):
        rows = {r["station"]: r for r in stand()}
        rows["proben"]["extra"] = 5
        with mock.patch.object(df, "cfg", side_effect=lambda n, k: {"aktiv": "false"}.get(k, "true")):
            off = df.switched_off({"werke_paused": {"kunden-werk": "x"}}, rows)
        self.assertIn("kaeufer", off)
        self.assertIn("proben", off)      # Vorrat da – kein Bau nötig
        self.assertIn("mails", off)       # Versand aus
        self.assertIn("antworten", off)   # ohne Mails keine Antworten
        self.assertNotIn("leads", off)
        res = {a["station"]: a for a in df.judge(stand(mails=500), T, off)}
        self.assertEqual(res["mails"]["stufe"], "aus")

    def test_texts_short(self):
        a = df.judge(stand(antworten=200), T)[-1]
        tx = df.texts(a)
        self.assertLessEqual(len(tx["titel"]), 60)
        self.assertLessEqual(len(tx["grund"]), 160)
        self.assertLessEqual(len(tx["update"]), 400)
        self.assertNotIn("Brauche", tx["update"])  # kein Handy-Push
        self.assertTrue(tx["titel"].startswith("Rot:"))


class PoolLeerTest(unittest.TestCase):
    def test_exhausted_pool_is_yellow_with_own_text(self):
        a = {x["station"]: x for x in df.judge(stand(kaeufer=25), T, empty={"kaeufer"})}["kaeufer"]
        self.assertEqual(a["stufe"], "gelb")  # ohne Pool-leer wäre das rot (25 h ≥ 24 h)
        self.assertTrue(a["erschoepft"])
        tx = df.texts(a)
        self.assertIn("erschöpft", tx["titel"])
        self.assertLessEqual(len(tx["titel"]), 60)
        self.assertLessEqual(len(tx["grund"]), 160)
        self.assertLessEqual(len(tx["update"]), 400)
        self.assertEqual({x["station"]: x for x in df.judge(stand(kaeufer=25), T)}["kaeufer"]["stufe"], "rot")
        ok = {x["station"]: x for x in df.judge(stand(), T, empty={"kaeufer"})}["kaeufer"]
        self.assertEqual(ok["stufe"], "ok")
        self.assertNotIn("erschoepft", ok)

    def test_pool_empty_needs_fresh_empty_runs_only(self):
        def run(h, leer):
            return {"werk": "kunden-werk", "finished_at": (T - dt.timedelta(hours=h)).isoformat(),
                    "extra": {"pool_leer": True} if leer else {"lauf": {"ok": 3}}}
        self.assertTrue(df.pool_empty(FakeDB({"run_stats": [run(0.2, True), run(1, True)]}), T))
        self.assertFalse(df.pool_empty(FakeDB({"run_stats": [run(0.2, True), run(1, False)]}), T))
        self.assertFalse(df.pool_empty(FakeDB({"run_stats": [run(5, True)]}), T))  # zu alt
        self.assertFalse(df.pool_empty(FakeDB({"run_stats": []}), T))


class StillstandTest(unittest.TestCase):
    def run_it(self, db, still, t=T):
        db.rpc_handlers["datenfluss_stand"] = lambda a, p: stand(**still)
        chats = []
        with mock.patch.object(df, "cfg", side_effect=cfg_on):
            res = df.stillstand(db, t=t, apply=True, settings={}, chat=chats.append)
        return res, chats

    def test_alarm_once_per_6h_and_close(self):
        db = FakeDB({"decisions": []})
        res, chats = self.run_it(db, {"mails": 13})
        props = [d for d in db.rows("decisions") if d["status"] == "proposed"]
        self.assertEqual(len(props), 1)
        self.assertTrue(props[0]["subject"].startswith("Vorschlag: Datenfluss steht still: Mails"))
        self.assertEqual(props[0]["metrics"]["stufe"], "gelb")
        self.assertEqual(len(chats), 1)
        for d in db.rows("decisions"):
            d["created_at"] = (T - dt.timedelta(hours=2)).isoformat()
        _, chats = self.run_it(db, {"mails": 15})  # 2 h später: keine zweite Meldung
        self.assertEqual(len([d for d in db.rows("decisions") if d["status"] == "proposed"]), 1)
        self.assertEqual(chats, [])
        for d in db.rows("decisions"):
            d["created_at"] = (T - dt.timedelta(hours=7)).isoformat()
        _, chats = self.run_it(db, {"mails": 30})  # 7 h später: neue Meldung ersetzt die alte
        props = [d for d in db.rows("decisions") if d["status"] == "proposed"]
        self.assertEqual(len(props), 1)
        self.assertEqual(props[0]["metrics"]["stufe"], "rot")
        self.assertEqual(len(chats), 1)
        self.run_it(db, {})  # fließt wieder: Vorschlag verschwindet (done, nichts gelöscht)
        self.assertEqual([d for d in db.rows("decisions") if d["status"] == "proposed"], [])
        self.assertEqual(len(db.rows("decisions")), 2)

    def test_nothing_written_without_apply(self):
        db = FakeDB({"decisions": []})
        db.rpc_handlers["datenfluss_stand"] = lambda a, p: stand(mails=50)
        with mock.patch.object(df, "cfg", side_effect=cfg_on):
            res = df.stillstand(db, t=T, settings={})
        self.assertEqual(db.rows("decisions"), [])
        self.assertIn("rot", [a["stufe"] for a in res])


def kpi(metric, values: dict, country="US"):
    return [{"day": d, "country": country, "metric": metric, "value": v} for d, v in values.items()]


class WirkungTest(unittest.TestCase):
    TASK = {"id": "t1", "agent": 2, "kind": "leads", "market": "US", "brief": "Neue Quelle US", "numbers": {},
            "status": "fertig", "created_at": "2026-10-05T08:00:00+00:00", "started_at": "2026-10-05T08:05:00+00:00",
            "finished_at": "2026-10-05T12:00:00+00:00", "wirkung_at": None}
    KPI = (kpi("leads_neu", {"2026-10-03": 100, "2026-10-04": 120, "2026-10-06": 200, "2026-10-07": 220,
                             "2026-10-08": 180, "2026-10-09": 999})
           + kpi("leads_neu", {"2026-10-04": 50, "2026-10-06": 50}, country="UK"))

    def test_measure_before_after(self):
        m = df.measure(self.TASK, self.KPI)
        k = m["kennzahlen"]["leads_neu"]
        self.assertEqual((k["vorher"], k["nachher"], k["tage_vorher"], k["tage_nachher"]), (110.0, 200.0, 2, 3))
        self.assertEqual(m["bewertung"], "wirkt")
        self.assertEqual(df.measure({**self.TASK, "market": None}, self.KPI)["kennzahlen"]["leads_neu"]["vorher"], 135.0)

    def test_quelle_and_no_data(self):
        m = df.measure({**self.TASK, "kind": "quelle"}, self.KPI)
        self.assertEqual(set(m["kennzahlen"]), {"leads_neu", "kaeufer_neu"})
        self.assertEqual(m["bewertung"], "wirkt")
        m = df.measure({**self.TASK, "market": "MX,BR"}, self.KPI)
        self.assertEqual(m["bewertung"], "keine Vergleichsdaten")
        self.assertFalse(df.ready(m, T, df._ts(self.TASK["finished_at"])))
        self.assertTrue(df.ready(m, T + dt.timedelta(days=5), df._ts(self.TASK["finished_at"])))

    def test_saves_and_writes_knowledge_once_per_hour(self):
        db = FakeDB({"agent_tasks": [dict(self.TASK), {**self.TASK, "id": "t2", "kind": "frage"},
                                     {**self.TASK, "id": "t3", "finished_at": (T - dt.timedelta(hours=10)).isoformat()}],
                     "kpi_daily": self.KPI, "brain_knowledge": []})
        out = df.wirkung(db, t=T, apply=True)
        self.assertEqual([o["id"] for o in out], ["t1"])
        t1 = db.rows("agent_tasks")[0]
        self.assertEqual(t1["wirkung"]["bewertung"], "wirkt")
        self.assertEqual(t1["numbers"]["wirkung"], "wirkt")
        self.assertEqual(t1["wirkung_at"], T.isoformat())
        note = db.rows("brain_knowledge")[0]
        self.assertEqual(note["slug"], "auftrag-wirkung")
        self.assertIn("Bilanz: Leads 1/1 wirkt", note["markdown"])
        self.assertIn("110 → 200", note["markdown"])
        db.rows("agent_tasks").append({**self.TASK, "id": "t4"})
        self.assertEqual(df.wirkung(db, t=T + dt.timedelta(minutes=30), apply=True), [])  # 1×/h
        self.assertEqual([o["id"] for o in df.wirkung(db, t=T + dt.timedelta(hours=2), apply=True)], ["t4"])

    def test_bilanz(self):
        rows = [{"kind": "leads", "wirkung": {"bewertung": "wirkt"}}, {"kind": "leads", "wirkung": {"bewertung": "neutral"}},
                {"kind": "kaeufer", "wirkung": {"bewertung": "keine Vergleichsdaten"}}]
        self.assertEqual(df.bilanz(rows), "Bilanz: Leads 1/2 wirkt")


if __name__ == "__main__":
    unittest.main()
