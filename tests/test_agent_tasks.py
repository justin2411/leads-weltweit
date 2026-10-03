"""Werkzeug der Agenten-Sitzung: übernehmen, Fortschritt, fertig (Inhaber 03.10.2026)."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import agent_tasks as A  # noqa: E402


class AgentTasksTest(unittest.TestCase):
    def test_flow(self):
        db = mock.Mock()
        db.update.return_value = [{"id": "t1"}]
        with mock.patch.object(A, "DB", return_value=db):
            A.main(["start", "t1"])
            A.main(["schritt", "t1", "150", "x" * 300])
            A.main(["fertig", "t1", "420 neue Leads", '{"leads": 420, "text": "nein"}'])
        calls = [c.args for c in db.update.call_args_list]
        self.assertEqual(calls[0][2]["status"], "laeuft")
        self.assertEqual(calls[1][2]["progress"], 99)  # nie 100 vor „fertig“
        self.assertEqual(len(calls[1][2]["step"]), 200)
        self.assertEqual(calls[2][2]["status"], "fertig")
        self.assertEqual(calls[2][2]["numbers"], {"leads": 420})  # nur Zahlen


    def test_start_is_atomic(self):
        db = mock.Mock()
        db.update.return_value = []  # schon von einer anderen Sitzung übernommen
        db.select.return_value = [{"status": "laeuft", "started_at": A.NOW()}]
        with mock.patch.object(A, "DB", return_value=db):
            self.assertEqual(A.main(["start", "t1"]), 3)
        self.assertEqual(db.update.call_args_list[0].args[1], {"id": "t1", "status": "offen"})
        self.assertEqual(db.update.call_count, 1)  # frisch laufend: nicht übernehmen

    def test_start_takes_over_stale(self):
        db = mock.Mock()
        db.update.side_effect = [[], [{"id": "t1"}]]
        db.select.return_value = [{"status": "laeuft", "started_at": "2026-01-01T00:00:00+00:00"}]
        with mock.patch.object(A, "DB", return_value=db):
            self.assertEqual(A.main(["start", "t1"]), 0)
        self.assertEqual(db.update.call_args_list[1].args[1]["status"], "laeuft")


if __name__ == "__main__":
    unittest.main()
