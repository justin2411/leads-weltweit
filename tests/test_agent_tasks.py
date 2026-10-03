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


if __name__ == "__main__":
    unittest.main()
