import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import wachhund as w  # noqa: E402

UTC = dt.timezone.utc


def run(ts, status="completed"):
    return {"created_at": ts, "status": status}


class WachhundTest(unittest.TestCase):
    def test_daily_missed_is_overdue(self):
        job = {"kind": "daily", "at": "04:47", "grace": 45}
        now = dt.datetime(2026, 9, 28, 10, 0, tzinfo=UTC)
        self.assertTrue(w.overdue(job, [run("2026-09-27T10:13:00Z")], now)[0])
        self.assertFalse(w.overdue(job, [run("2026-09-28T05:02:00Z")], now)[0])
        self.assertFalse(w.overdue(job, [], dt.datetime(2026, 9, 28, 5, 0, tzinfo=UTC))[0])  # noch in der Karenz

    def test_hourly_window_and_running(self):
        job = {"kind": "hourly", "window": (6, 21), "max_min": 90}
        now = dt.datetime(2026, 9, 28, 10, 0, tzinfo=UTC)
        self.assertTrue(w.overdue(job, [run("2026-09-27T23:01:00Z")], now)[0])
        self.assertFalse(w.overdue(job, [run("2026-09-28T09:10:00Z")], now)[0])
        self.assertFalse(w.overdue(job, [run("2026-09-27T23:01:00Z")], dt.datetime(2026, 9, 28, 3, 0, tzinfo=UTC))[0])
        self.assertFalse(w.overdue(job, [run("2026-09-28T09:59:00Z", "in_progress")], now)[0])

    def test_weekday_and_until(self):
        job = {"kind": "daily", "at": "04:53", "grace": 60, "weekdays": [0], "until": "12:00"}
        self.assertTrue(w.overdue(job, [], dt.datetime(2026, 9, 28, 7, 0, tzinfo=UTC))[0])   # Montag
        self.assertFalse(w.overdue(job, [], dt.datetime(2026, 9, 29, 7, 0, tzinfo=UTC))[0])  # Dienstag
        self.assertFalse(w.overdue(job, [], dt.datetime(2026, 9, 28, 13, 0, tzinfo=UTC))[0])  # zu spät

    def test_send_respects_switch(self):
        job = next(j for j in w.JOBS if j["wf"] == "send.yml")
        ok, _ = w.allowed(job)
        self.assertEqual(ok, w.cfg("versand.yaml", "aktiv") == "true")


if __name__ == "__main__":
    unittest.main()
