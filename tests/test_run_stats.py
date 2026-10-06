"""Zähler je Lauf fürs Dashboard „Werke“ (03.10.2026)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib.run_stats import record, rows_from_buyer_stats, rows_from_lead_report, rows_from_stock_summary, rows_pool_empty  # noqa: E402


class RunStatsTest(unittest.TestCase):
    def test_lead_report(self):
        rows = rows_from_lead_report({"S2/US": {"pool": 100, "processed": 80, "green": 50, "yellow": 20, "red": 10,
                                               "top_reasons": [("missing:email", 15), ("signal_too_old", 3)]}})
        self.assertEqual(rows, [{"segment_id": "S2", "country": "US", "candidates": 100, "processed": 80, "green": 50,
                                 "yellow": 20, "red": 10, "reasons": {"missing:email": 15, "signal_too_old": 3}, "extra": {}}])

    def test_buyer_stats(self):
        rows = rows_from_buyer_stats({"ok": 5, "S2/US:ok": 4, "S2/US:call_only": 6, "S2/UK:rejected": 1, "fehler": 2}, 30)
        by = {r["country"]: r for r in rows}
        self.assertEqual((by["US"]["green"], by["US"]["yellow"], by["US"]["processed"]), (4, 6, 10))
        self.assertEqual(by["UK"]["red"], 1)
        self.assertEqual(by["US"]["extra"]["kandidaten_gesamt"], 30)

    def test_pool_empty_row_is_recorded(self):
        rows = rows_pool_empty(["S1", "S2"])
        self.assertEqual(rows[0]["extra"], {"pool_leer": True, "fokus": ["S1", "S2"]})
        self.assertEqual(record(FakeDB({}), "kunden-werk", rows), 1)

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

class StagesTest(unittest.TestCase):
    def test_lead_funnel_stages(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        from extraktor.run import stages
        mk = lambda a, qc="green", sc="pass", why="": {"ampel": a, "qc": {"status": qc, "blocking": [why] if why else []}, "sc": {"status": sc}}  # noqa: E731
        ls = [mk("skip", "skip", "skip", "already_in_database"), mk("skip", "skip", "skip", "site_ok"),
              mk("red", "red"), mk("red", "green", "fail"), mk("yellow", "yellow"), mk("green"), mk("green")]
        self.assertEqual(stages(ls, 10), {"kandidaten": 10, "bearbeitet": 7, "sicherheitsfilter": 6, "befund": 5,
                                          "kontaktdaten": 4, "signal": 3, "gruen": 2})
        rows = rows_from_lead_report({"S2/UK": {"pool": 10, "processed": 7, "stufen": stages(ls, 10)}})
        self.assertEqual(rows[0]["extra"]["stufen"]["gruen"], 2)

