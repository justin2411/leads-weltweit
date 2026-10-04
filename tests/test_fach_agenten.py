"""Fach-Agenten (JARVIS „Team“, Inhaber 04.10.2026): Routinen eines Fach-Agenten legen Aufträge mit rolle und dessen
Auftragstext an; die Lernschleife misst sie an ihrer Ziel-Kennzahl (Richtung beachtet); Migration nicht destruktiv."""
import datetime as dt
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import brain_routines as B  # noqa: E402
import datenfluss as df  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc
MIG = ROOT / "supabase" / "migrations" / "20261005050000_signalwerk_agent_roles.sql"
ROLE = {"slug": "test", "name": "Test-Agent", "auftrag": "Test-Agent: ab.py auswerten.", "routine_id": "r1", "aktiv": True}


def routine(**x):
    return {"id": "r1", "name": "A/B-Prüfung Webagenturen", "aufgabe": "A/B zählen", "uhrzeit": "18:20", "tage": "taeglich",
            "wochentage": [], "dauer_min": 20, "aktiv": True, "last_run_at": None, "last_task_id": None,
            "last_result": None, "created_at": "2026-10-01T00:00:00+00:00", **x}


class RoutineRoleTest(unittest.TestCase):
    def test_role_brief(self):
        b = B.role_brief(ROLE, 20, "A/B zählen")
        self.assertTrue(b.startswith("Fach-Agent Test-Agent (20 min): Test-Agent: ab.py auswerten. Routine: A/B zählen"))
        self.assertLessEqual(len(B.role_brief({**ROLE, "auftrag": "x" * 2000}, 20, "y" * 900)), 1000)
        # Routinentext, der schon mit dem Namen beginnt, wird nicht doppelt angehängt
        self.assertNotIn("Routine:", B.role_brief(ROLE, 20, "Test-Agent: alles"))

    def test_due_routine_gets_role(self):
        t = dt.datetime(2026, 10, 4, 16, 25, tzinfo=UTC)  # 18:25 deutsche Zeit
        db = FakeDB({"brain_routines": [routine(), routine(id="r2", name="Sonst", uhrzeit="18:00")],
                     "agent_tasks": [], "agent_roles": [ROLE]})
        res = B.faellig(db, t, apply=True)
        self.assertEqual(len(res["neu"]), 2)
        rows = {r["brief"][:12]: r for r in db.rows("agent_tasks")}
        role_task = next(r for r in db.rows("agent_tasks") if r.get("rolle"))
        self.assertEqual(role_task["rolle"], "test")
        self.assertTrue(role_task["brief"].startswith("Fach-Agent Test-Agent"))
        self.assertEqual(sum(1 for r in db.rows("agent_tasks") if not r.get("rolle")), 1)
        self.assertTrue(rows)

    def test_without_roles_table_unchanged(self):
        class NoRoles(FakeDB):
            def select(self, table, params=None):
                if table == "agent_roles":
                    raise RuntimeError("relation does not exist")
                return super().select(table, params)
        t = dt.datetime(2026, 10, 4, 16, 25, tzinfo=UTC)
        db = NoRoles({"brain_routines": [routine()], "agent_tasks": []})
        B.faellig(db, t, apply=True)
        self.assertTrue(db.rows("agent_tasks")[0]["brief"].startswith("Gehirn-Routine"))
        self.assertNotIn("rolle", db.rows("agent_tasks")[0])


def kpi(rolle, vals):
    return [{"rolle": rolle, "day": d, "k": k, "n": n} for d, (k, n) in vals.items()]


class RoleWirkungTest(unittest.TestCase):
    TASK = {"id": "t1", "agent": 3, "kind": "gehirn", "rolle": "zustellung", "brief": "Fach-Agent Zustell-Agent", "numbers": {},
            "status": "fertig", "created_at": "2026-10-05T08:00:00+00:00", "started_at": "2026-10-05T08:05:00+00:00",
            "finished_at": "2026-10-05T12:00:00+00:00", "wirkung_at": None}
    ROWS = kpi("zustellung", {"2026-10-03": (5, 100), "2026-10-04": (5, 100), "2026-10-06": (1, 100), "2026-10-07": (1, 100)})

    def test_lower_is_better_for_bounces(self):
        m = df.measure_role(self.TASK, self.ROWS)
        k = m["kennzahlen"]["zustellung"]
        self.assertEqual((k["vorher"], k["nachher"], k["tage_vorher"], k["tage_nachher"]), (0.05, 0.01, 2, 2))
        self.assertEqual(m["bewertung"], "wirkt")
        worse = kpi("zustellung", {"2026-10-04": (1, 100), "2026-10-06": (5, 100), "2026-10-07": (5, 100)})
        self.assertEqual(df.measure_role(self.TASK, worse)["bewertung"], "sinkt")

    def test_higher_is_better_for_replies_and_unknown_role(self):
        rows = kpi("test", {"2026-10-04": (1, 100), "2026-10-06": (3, 100), "2026-10-07": (3, 100)})
        self.assertEqual(df.measure_role({**self.TASK, "rolle": "trichter"}, rows)["bewertung"], "wirkt")
        self.assertEqual(df.measure_role({**self.TASK, "rolle": "gibtsnicht"}, rows)["bewertung"], "keine Vergleichsdaten")

    def test_wirkung_saves_role_task(self):
        t = dt.datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
        db = FakeDB({"agent_tasks": [dict(self.TASK)], "kpi_daily": [], "brain_knowledge": []})
        db.rpc_handlers["agent_role_kpi"] = lambda a, p: self.ROWS
        out = df.wirkung(db, t=t, apply=True)
        self.assertEqual([o["id"] for o in out], ["t1"])
        row = db.rows("agent_tasks")[0]
        self.assertEqual(row["wirkung"]["bewertung"], "wirkt")
        self.assertIn("Zustell-Agent", db.rows("brain_knowledge")[0]["markdown"])


class MigrationTest(unittest.TestCase):
    def test_not_destructive_and_rights(self):
        sql = MIG.read_text(encoding="utf-8").lower()
        self.assertNotRegex(sql, r"\bdrop\s+(table|column)|\bdelete\s+from|\btruncate\s+(table\s+)?signalwerk")
        self.assertIn("revoke delete, truncate on signalwerk.agent_roles from service_role", sql)
        self.assertIn("revoke all on function signalwerk.agent_role_kpi(text, text[], int) from public, anon, authenticated", sql)
        slugs = set(re.findall(r"\('([a-z_]+)', '[^']+', '(?:testing|qualitaet)'", MIG.read_text(encoding="utf-8")))
        self.assertEqual(slugs, {"test", "trichter", "qualitaet", "lead_pruefer", "kaeufer_pruefer", "zustellung", "quellen"})
        self.assertEqual(set(df.ROLE_SERIES), slugs)


if __name__ == "__main__":
    unittest.main()
