import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import takt  # noqa: E402
import wachhund  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 5, 0, 40, tzinfo=UTC)
SEND = next(j for j in takt.TAKT if j["wf"] == "send.yml")
ANSWER = next(j for j in takt.TAKT if j["wf"] == "antworten.yml")


def run(ts, status="completed", conclusion="success", event="schedule", rid=1):
    return {"id": rid, "created_at": ts, "status": status, "conclusion": None if status != "completed" else conclusion,
            "event": event}


def jobs(probe: bool):
    return [{"steps": [{"name": "Probelauf", "conclusion": "success" if probe else "skipped"},
                       {"name": "Senden", "conclusion": "skipped" if probe else "success"}]}]


class TaktTest(unittest.TestCase):
    def test_send_gap_night_05_10(self):
        """Nacht 04./05.10.: 21:52 echter Lauf, 23:27 gescheitert, 00:09 Probelauf -> überfällig."""
        runs = [run("2026-10-05T00:09:54Z", event="workflow_dispatch", rid=3),
                run("2026-10-04T23:27:40Z", conclusion="failure", event="workflow_dispatch", rid=2),
                run("2026-10-04T21:52:48Z", rid=1)]
        late, why = takt.decide(SEND, runs, NOW, lambda rid: jobs(probe=rid == 3))
        self.assertTrue(late, why)

    def test_send_recent_real_run(self):
        runs = [run("2026-10-04T23:50:00Z", event="workflow_dispatch", rid=5)]
        self.assertFalse(takt.decide(SEND, runs, NOW, lambda rid: jobs(probe=False))[0])

    def test_running_or_fresh_never_starts(self):
        self.assertFalse(takt.decide(SEND, [run("2026-10-04T20:00:00Z", status="queued")], NOW)[0])
        self.assertFalse(takt.decide(SEND, [run("2026-10-04T23:00:00Z", status="pending")], NOW)[0])
        fresh = [run("2026-10-05T00:37:00Z", conclusion="failure"), run("2026-10-04T20:00:00Z")]
        self.assertFalse(takt.decide(SEND, fresh, NOW)[0])

    def test_unreadable_jobs_count_as_run(self):
        def boom(rid):
            raise RuntimeError("503")
        runs = [run("2026-10-05T00:00:00Z", event="workflow_dispatch")]
        self.assertFalse(takt.decide(SEND, runs, NOW, boom)[0])

    def test_answers_after_25_min(self):
        self.assertTrue(takt.decide(ANSWER, [run("2026-10-05T00:09:00Z")], NOW)[0])
        self.assertFalse(takt.decide(ANSWER, [run("2026-10-05T00:20:00Z")], NOW)[0])
        self.assertTrue(takt.decide(ANSWER, [], NOW)[0])

    def test_switches_block_send(self):
        with mock.patch.object(wachhund, "cfg", return_value="false"):
            self.assertIn("ausgeschaltet", takt.blocked(SEND, {}))
        with mock.patch.object(wachhund, "cfg", return_value="true"):
            self.assertIsNone(takt.blocked(SEND, {}))
            self.assertEqual(takt.blocked(SEND, {"send_paused": True}), "Versand im Dashboard pausiert")
            with mock.patch.dict("os.environ", {"SENDEN_AKTIV": "nein"}):
                self.assertIn("SENDEN_AKTIV", takt.blocked(SEND, {}))
        self.assertIsNone(takt.blocked(ANSWER, {"send_paused": True, "werke_paused": {"lead-werk": "x"}}))

    def test_send_inputs(self):
        self.assertEqual(SEND["inputs"]["gruppe"], "auto")
        self.assertEqual(SEND["inputs"]["probelauf"], "false")
        self.assertIn("03.10.2026", SEND["inputs"]["freigabe"])
        self.assertIn("04.10.2026", SEND["inputs"]["freigabe"])


if __name__ == "__main__":
    unittest.main()
