"""Zähler je Lauf fürs Dashboard „Werke“ (03.10.2026)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib.run_stats import record, rows_from_buyer_stats, rows_from_lead_report, rows_from_stock_summary  # noqa: E402


class RunStatsTest(unittest.TestCase):
    def test_lead_report(self):
        rows = rows_from_lead_report({"S2/US": {"pool": 100, "processed": 80, "green": 50, "yellow": 20, "red": 10,
                                               "top_reasons": [("missing:email", 15), ("signal_too_old", 3)]}})
        self.assertEqual(rows, [{"segment_id": "S2", "country": "US", "candidates": 100, "processed": 80, "green": 50,
                                 "yellow": 20, "red": 10, "reasons": {"missing:email": 15, "signal_too_old": 3}}])

    def test_buyer_stats(self):
        rows = rows_from_buyer_stats({"ok": 5, "S2/US:ok": 4, "S2/US:call_only": 6, "S2/UK:rejected": 1, "fehler": 2}, 30)
        by = {r["country"]: r for r in rows}
        self.assertEqual((by["US"]["green"], by["US"]["yellow"], by["US"]["processed"]), (4, 6, 10))
        self.assertEqual(by["UK"]["red"], 1)
        self.assertEqual(by["US"]["extra"]["kandidaten_gesamt"], 30)

    def test_stock_summary_and_record(self):
        rows = rows_from_stock_summary({"S2/US": {"soll": 6, "vorher": 4, "neu": 2}})
        db = FakeDB({})
        self.assertEqual(record(db, "proben-vorrat", rows), 1)
        self.assertEqual(db.tables["run_stats"][0]["green"], 2)
        self.assertEqual(record(db, "unbekannt", rows), 0)

        class Broken:
            def insert(self, *a, **k):
                raise RuntimeError("Tabelle fehlt")
        self.assertEqual(record(Broken(), "lead-werk", rows, log=lambda *_: None), 0)
