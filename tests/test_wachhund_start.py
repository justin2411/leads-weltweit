"""Direktstart (Inhaber 03.10.2026): der Wachhund startet offene Startwünsche aus dem Dashboard – nur erlaubte
Abläufe, nie bei Pause durch den Inhaber, nie den Versand. Nur erfundene Testzeilen."""
import datetime as dt
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import wachhund as w  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 3, 19, 41, tzinfo=UTC)


def req(i, wf, minutes_ago, status="offen"):
    return {"id": f"id{i}", "workflow": wf, "status": status,
            "created_at": (NOW - dt.timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")}


class FakeDB:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []
        self.selects = []

    def select(self, table, params=None):
        self.selects.append((table, params))
        return [r for r in self.rows if r["status"] == "offen"]

    def update(self, table, match, values):
        self.updates.append((table, match, values))
        return [values]


class PlanStartsTest(unittest.TestCase):
    def test_newest_per_workflow_and_limits(self):
        rows = [req(1, "lead-werk", 5), req(2, "lead-werk", 30), req(3, "kunden-werk", 200), req(4, "send", 1),
                req(5, "proben-vorrat", 10)]
        got = {r["id"]: (what, why) for r, what, why in w.plan_starts(rows, None, NOW)}
        self.assertEqual(got["id1"][0], "starten")
        self.assertEqual(got["id2"], ("verworfen", "doppelt (neuerer Wunsch)"))
        self.assertEqual(got["id3"][0], "verworfen")          # älter als 2 h
        self.assertEqual(got["id4"], ("verworfen", "Ablauf nicht erlaubt"))  # Versand nie
        self.assertEqual(got["id5"][0], "starten")

    def test_owner_pause_wins(self):
        settings = {"werke_paused": {"lead-werk": "2026-10-03T18:00:00Z"}}
        got = w.plan_starts([req(1, "lead-werk", 5), req(2, "kunden-werk", 5)], settings, NOW)
        self.assertEqual([(r["id"], what) for r, what, _ in got], [("id1", "verworfen"), ("id2", "starten")])
        self.assertIn("pausiert durch Inhaber", got[0][2])

    def test_whitelist_never_contains_sending(self):
        files = {v["wf"] for v in w.START_WF.values()}
        self.assertFalse(any(re.search(r"send|versand|followup|nachfass|antwort", f) for f in files))
        self.assertTrue(all((ROOT / ".github" / "workflows" / f).exists() for f in files))

    def test_whitelist_matches_migration(self):
        sql = (ROOT / "supabase" / "migrations" / "20261004030100_signalwerk_start_requests.sql").read_text()
        m = re.search(r"workflow in \(([^)]*)\)", sql)
        self.assertEqual(set(re.findall(r"'([^']+)'", m.group(1))), set(w.START_WF))


class HandleStartsTest(unittest.TestCase):
    def test_apply_dispatches_and_marks(self):
        db = FakeDB([req(1, "lead-werk", 5), req(2, "kunden-werk", 300), req(3, "proben-vorrat", 3)])
        calls = []

        def dispatch(wf, inputs):
            calls.append((wf, inputs))
            return (wf != "proben-vorrat.yml", "GitHub 422 kaputt")

        started = w.handle_starts(db, None, dispatch, NOW, apply=True)
        self.assertEqual(started, ["lead-werk.yml"])
        self.assertEqual(sorted(calls), [("lead-werk.yml", {}), ("proben-vorrat.yml", {"befehl": "run", "probelauf": "false"})])
        by_id = {m["id"]: v for _, m, v in db.updates}
        self.assertEqual(by_id["id1"]["status"], "gestartet")
        self.assertTrue(by_id["id1"]["started_at"])
        self.assertEqual(by_id["id2"]["status"], "verworfen")
        self.assertEqual(by_id["id3"], {"status": "fehler", "note": "GitHub 422 kaputt"})
        # nur offene Wünsche anfassen (kein Überschreiben eines inzwischen direkt gestarteten Wunsches)
        self.assertTrue(all(m["status"] == "offen" for _, m, _ in db.updates))

    def test_dry_run_changes_nothing(self):
        db = FakeDB([req(1, "lead-werk", 5)])
        started = w.handle_starts(db, None, lambda *_: self.fail("kein Start im Probelauf"), NOW, apply=False)
        self.assertEqual(started, [])
        self.assertEqual(db.updates, [])

    def test_paused_is_not_dispatched(self):
        db = FakeDB([req(1, "kunden-werk", 5)])
        settings = {"werke_paused": {"kunden-werk": "2026-10-03T18:00:00Z"}}
        started = w.handle_starts(db, settings, lambda *_: self.fail("pausiert darf nicht starten"), NOW, apply=True)
        self.assertEqual(started, [])
        self.assertEqual(db.updates[0][2]["status"], "verworfen")


class WorkflowEnvTest(unittest.TestCase):
    def test_wachhund_has_db_env_and_actions_write(self):
        yml = (ROOT / ".github" / "workflows" / "wachhund.yml").read_text()
        for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "actions: write"):
            self.assertIn(k, yml)


if __name__ == "__main__":
    unittest.main()
