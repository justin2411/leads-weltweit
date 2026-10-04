"""Prognose 30 Tage: gleiche Fälle wie app/lib/prognose.test.ts, ehrlich ohne Basis, Eingaben aus Zählungen."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import prognose as P  # noqa: E402
from lib.prognose import fmt_range, forecast, wilson  # noqa: E402

CASES = json.loads((ROOT / "tests/fixtures/prognose_cases.json").read_text(encoding="utf-8"))


class Faelle(unittest.TestCase):
    def test_gleich_wie_typescript(self):
        for c in CASES:
            p = forecast(c["in"])
            self.assertEqual(p["basis"], c["basis"], c["name"])
            self.assertEqual(p["mails30"], c["mails30"], c["name"])
            self.assertEqual([p["antworten30"], p["proben30"], p["kunden30"], p["umsatz30"]],
                             [c["antworten"], c["proben"], c["kunden"], c["umsatz"]], c["name"])

    def test_keine_basis_text(self):
        p = forecast(CASES[0]["in"])
        self.assertIn("noch keine Basis", p["text"])
        self.assertIsNone(p["kunden30"])

    def test_wilson_und_format(self):
        lo, hi = wilson(2, 20)
        self.assertTrue(lo < 0.1 < hi)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        self.assertEqual(fmt_range({"lo": 1, "mid": 3, "hi": 7}, " £"), "1–7 £")
        self.assertEqual(fmt_range({"lo": 3, "mid": 3, "hi": 3}), "3")


class Eingaben(unittest.TestCase):
    def test_tempo_7_volle_tage(self):
        today = dt.date(2026, 10, 4)
        daily = [{"day": f"2026-10-0{d}", "country": "UK", "sent": 14} for d in range(1, 5)] + [{"day": "2026-09-27", "country": "UK", "sent": 14}]
        self.assertAlmostEqual(P.per_day(daily, today)["UK"], 4 * 14 / 7)  # 27.09., 01.–03.10.; heute zählt nicht

    def test_antworten_ohne_abwesenheit(self):
        rows = [{"intent": "sample", "prospects": {"country": "US", "segment_id": "S2"}},
                {"intent": "out_of_office", "prospects": {"country": "US", "segment_id": "S2"}},
                {"intent": "question", "prospects": {"country": "US", "segment_id": "S5"}},
                {"intent": "question", "prospects": None}]
        self.assertEqual(P.inbound(rows, "S2"), {"US": {"replies": 1, "samples": 1}})

    def test_build_nimmt_groesseren_wert(self):
        stats = [{"segment_id": "S2", "country": "UK", "sent": 200, "replies": 1, "samples": 0, "customers": 0}]
        ps = P.build(stats, {"UK": {"replies": 4, "samples": 0}}, {"UK": 20}, {}, "S2", ["UK", "FR"])
        self.assertEqual(ps[0]["antworten30"]["mid"], 12)
        self.assertEqual(ps[1]["basis"], "kein_versand")


if __name__ == "__main__":
    unittest.main()
