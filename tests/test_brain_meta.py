"""Meta-Review: das Gehirn optimiert sich selbst (scripts/brain_meta.py, Inhaber 04.10.2026).
Regeln aus tests/fixtures/brain_meta_cases.json; Lauf mit FakeDB: Takt halbieren/pausieren/verdoppeln, Wissen,
Vorschläge (höchstens 3), einmal je Tag, umkehrbar, ohne Basis nichts ändern."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import brain_meta as M  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc
T = dt.datetime(2026, 10, 20, 19, 10, tzinfo=UTC)      # 21:10 deutscher Zeit
CASES = json.loads((ROOT / "tests" / "fixtures" / "brain_meta_cases.json").read_text(encoding="utf-8"))
RAW = CASES["score"][0]["roh"]


def task(i, kind="gehirn", status="fertig", wirkung=None, routine_id=None, day=10, market=None, by="Gehirn-Routine",
         brief="x"):
    start = dt.datetime(2026, 10, day, 8, 0, tzinfo=UTC)
    return {"id": f"t{i}", "agent": 1, "kind": kind, "market": market, "brief": brief, "status": status, "created_by": by,
            "created_at": start.isoformat(), "started_at": start.isoformat(),
            "finished_at": (start + dt.timedelta(minutes=12)).isoformat(),
            "wirkung": {"bewertung": wirkung} if wirkung else None, "routine_id": routine_id}


def routine(rid, name, takt=1, aktiv=True, **x):
    return {"id": rid, "name": name, "aufgabe": "etwas prüfen", "takt": takt, "aktiv": aktiv, "meta_at": None,
            "created_at": "2026-10-01T00:00:00+00:00", **x}


def make_db(routines, tasks, **extra):
    db = FakeDB({"brain_routines": routines, "agent_tasks": tasks, "kpi_daily": [], "brain_meta_runs": [],
                 "brain_improvements": [], "brain_knowledge": [], "decisions": [], **extra})
    db.rpc_handlers["gehirn_score_teile"] = lambda a, p: [RAW]
    return db


class RulesTest(unittest.TestCase):
    def test_urteil_cases(self):
        for c in CASES["urteil"]:
            with self.subTest(c["name"]):
                self.assertEqual(M.judge({**c["bilanz"]}), c["urteil"])

    def test_takt_cases(self):
        for c in CASES["takt"]:
            with self.subTest(c):
                res = M.next_takt(c["takt"], c["urteil"])
                self.assertEqual(None if res is None else [res[0], res[1]], c["neu"])

    def test_score_cases(self):
        for c in CASES["score"]:
            with self.subTest(c["name"]):
                parts = M.score_parts(c["roh"])
                self.assertEqual({k: v["punkte"] for k, v in parts.items()}, c["teile"])
                self.assertEqual(M.score_of(parts), c["score"])

    def test_trend(self):
        d = dt.date(2026, 10, 20)
        hist = {d - dt.timedelta(days=i): 50.0 for i in range(1, 8)}
        self.assertEqual(M.trend({**hist, d: 55.0}, d)["richtung"], "steigt")
        self.assertEqual(M.trend({**hist, d: 44.0}, d)["richtung"], "fällt")
        self.assertEqual(M.trend({**hist, d: 51.0}, d)["richtung"], "gleich")
        self.assertEqual(M.trend({d: 51.0}, d)["richtung"], "neu")
        self.assertEqual(M.trend(hist, d)["richtung"], "keine Basis")

    def test_verdict_prefers_datenfluss_then_score(self):
        scores = {dt.date(2026, 10, 9): 40.0, dt.date(2026, 10, 11): 45.0}
        self.assertEqual(M.task_verdict(task(1, wirkung="sinkt"), scores), "sinkt")
        self.assertEqual(M.task_verdict(task(1), scores), "wirkt")             # +5 Punkte
        self.assertEqual(M.task_verdict(task(1, status="fehler"), scores), "fehler")
        self.assertEqual(M.task_verdict(task(1), {}), "keine Daten")
        self.assertEqual(M.task_verdict(task(1, wirkung="keine Vergleichsdaten"), {}), "keine Daten")

    def test_routine_match_by_id_or_brief(self):
        rs = [routine("r1", "Glatt"), routine("r2", "Umsatz")]
        self.assertEqual(M.routine_of(task(1, routine_id="r2"), rs)["id"], "r2")
        self.assertEqual(M.routine_of(task(1, brief="Gehirn-Routine Glatt (10 min): x"), rs)["id"], "r1")
        self.assertIsNone(M.routine_of(task(1, brief="Gehirn-Routine Glattx (10 min)"), rs))


class ReviewTest(unittest.TestCase):
    def test_no_basis_changes_nothing(self):
        db = make_db([routine("r1", "Glatt")], [task(i, routine_id="r1", wirkung="neutral") for i in range(4)])
        res = M.review(db, T, apply=True, countries=["US", "UK", "FR"])
        self.assertEqual(res["aenderungen"], [])
        self.assertEqual(res["basis"], "noch keine Basis")
        self.assertEqual(db.rows("brain_routines")[0]["takt"], 1)
        self.assertEqual(db.rows("decisions"), [])
        self.assertEqual(db.rows("brain_meta_runs")[0]["basis"], "noch keine Basis")
        # Score trotzdem gespeichert (kpi_daily, Land ALL)
        self.assertIn(46.5, [r["value"] for r in db.rows("kpi_daily") if r["metric"] == "gehirn_score"])

    def test_halve_pause_increase_and_protect_meta(self):
        rs = [routine("r1", "Glatt"), routine("r2", "Umsatz", takt=0.5), routine("r3", "Recherche", takt=2),
              routine("r4", M.META_ROUTINE, aufgabe="python scripts/brain_meta.py lauf --apply")]
        ts = ([task(i, routine_id="r1", wirkung="neutral") for i in range(5)]
              + [task(10 + i, routine_id="r2", wirkung="sinkt") for i in range(5)]
              + [task(20 + i, routine_id="r3", wirkung="wirkt") for i in range(5)]
              + [task(30 + i, routine_id="r4", wirkung="neutral") for i in range(6)])
        db = make_db(rs, ts)
        res = M.review(db, T, apply=True, countries=["US"])
        by = {r["id"]: r for r in db.rows("brain_routines")}
        self.assertEqual((by["r1"]["takt"], by["r1"]["aktiv"]), (0.5, True))      # halbiert
        self.assertEqual((by["r2"]["takt"], by["r2"]["aktiv"]), (0.5, False))     # pausiert, nicht gelöscht
        self.assertEqual((by["r3"]["takt"], by["r3"]["aktiv"]), (4.0, True))      # verdoppelt (max 4)
        self.assertEqual((by["r4"]["takt"], by["r4"]["aktiv"]), (1, True))        # Meta-Review nie
        self.assertEqual(len(res["aenderungen"]), 3)
        decs = db.rows("decisions")
        meta = [d for d in decs if d["metrics"].get("meta") == "routine_takt"]
        self.assertEqual(len(meta), 3)
        for d in decs:
            self.assertLessEqual(len(d["kurz_titel"]), 60)
            self.assertLessEqual(len(d["kurz_grund"]), 160)
            self.assertTrue(d["subject"].startswith(M.PREFIX))
        # zweiter Lauf am selben Tag: nichts mehr
        again = M.review(db, T + dt.timedelta(minutes=30), apply=True, countries=["US"])
        self.assertIn("heute schon gelaufen", again["hinweis"])
        self.assertEqual(len([d for d in db.rows("decisions") if d["metrics"].get("meta") == "routine_takt"]), 3)
        # umkehrbar
        d1 = next(d for d in meta if d["metrics"]["routine_id"] == "r2")
        M.zurueck(db, d1["id"], T)
        r2 = next(r for r in db.rows("brain_routines") if r["id"] == "r2")
        self.assertEqual((r2["takt"], r2["aktiv"]), (0.5, True))

    def test_only_runs_after_last_change_count(self):
        r = routine("r1", "Glatt", meta_at="2026-10-15T00:00:00+00:00")
        db = make_db([r], [task(i, routine_id="r1", wirkung="neutral", day=10) for i in range(6)])
        self.assertEqual(M.review(db, T, apply=True, countries=["US"])["aenderungen"], [])

    def test_patterns_knowledge_and_max_three_improvements(self):
        ts = ([task(i, kind="leads", wirkung="wirkt", by="Gehirn", market="US") for i in range(5)]
              + [task(10 + i, kind="kaeufer", wirkung="neutral", by="Gehirn", market="UK") for i in range(5)]
              + [task(20 + i, kind="quelle", wirkung="sinkt", by="Gehirn", market="FR") for i in range(5)]
              + [task(30 + i, kind="pruefen", status="fehler", by="Gehirn") for i in range(5)])
        db = make_db([], ts)
        res = M.review(db, T, apply=True, countries=["US"])
        self.assertEqual(res["basis"], "ok")
        self.assertTrue(any("Leads" in g for g in res["gelernt"]))
        self.assertTrue(any("Käufer" in b for b in res["fehlermuster"]))
        know = {k["slug"]: k for k in db.rows("brain_knowledge")}
        self.assertEqual(know[M.SLUG_GOOD]["typ"], "gelernt")
        self.assertEqual(know[M.SLUG_BAD]["typ"], "fehlermuster")
        imps = db.rows("brain_improvements")
        self.assertEqual(len(imps), 3)
        for i in imps:
            self.assertLessEqual(len(i["kurz_titel"]), 60)
            self.assertLessEqual(len(i["vorschlag"]), 300)
            self.assertTrue(i["beleg"])
        self.assertEqual(res["vorrang"][0], "leads")
        self.assertNotIn("kaeufer", res["vorrang"])
        # nächster Tag: weiterhin höchstens 3 offen, Muster nicht doppelt gemeldet
        n_dec = len(db.rows("decisions"))
        M.review(db, T + dt.timedelta(days=1), apply=True, countries=["US"])
        self.assertEqual(len([i for i in db.rows("brain_improvements") if i["status"] == "offen"]), 3)
        self.assertEqual(len(db.rows("decisions")), n_dec)

    def test_old_open_improvement_expires_not_deleted(self):
        old = {"id": "i1", "regel": "auftrag-konkreter", "status": "offen", "created_at": "2026-10-10T00:00:00+00:00"}
        db = make_db([], [], brain_improvements=[old])
        M.add_improvements(db, [], T)
        self.assertEqual(db.rows("brain_improvements")[0]["status"], "verworfen")

    def test_dry_run_writes_nothing(self):
        db = make_db([routine("r1", "Glatt")], [task(i, routine_id="r1", wirkung="neutral") for i in range(6)])
        res = M.review(db, T, apply=False, countries=["US"])
        self.assertEqual(len(res["aenderungen"]), 1)
        self.assertEqual(db.inserts, [])
        self.assertEqual(db.updates, [])


class AnleitungTest(unittest.TestCase):
    """Selbstverbesserung darf docs/GEHIRN-SITZUNG.md nur ergänzen – Grenzen-Abschnitte sind geschützt."""

    def test_protected_sections_unchanged(self):
        import hashlib
        text = (ROOT / "docs" / "GEHIRN-SITZUNG.md").read_text(encoding="utf-8")
        for head, digest in PROTECTED.items():
            with self.subTest(head):
                part = text.split(f"\n## {head}\n", 1)[1].split("\n## ", 1)[0].strip()
                self.assertEqual(hashlib.sha256(part.encode()).hexdigest()[:16], digest,
                                 f"Abschnitt „{head}“ ist geschützt – nur der Inhaber ändert ihn")


# Fingerabdrücke der geschützten Abschnitte (Änderung nur durch den Inhaber, nie durch die Selbstverbesserung)
PROTECTED = {
    "Darf das Gehirn allein": "5c286f7533a515d5",
    "Nie": "73a6ae9b5472c765",
    "Selbstverbesserung": "293c4f802ec7c5a9",
}

if __name__ == "__main__":
    unittest.main()
