import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.deliverability import DEFAULT_WARMUP, emergency_stop, interleave, provider_cap, warmup_cap  # noqa: E402


class DeliverabilityTest(unittest.TestCase):
    def test_warmup(self):
        d = dt.date(2026, 10, 1)
        self.assertEqual(warmup_cap(None, d, DEFAULT_WARMUP), 25)
        self.assertEqual(warmup_cap(d, d + dt.timedelta(days=5), DEFAULT_WARMUP), 75)
        # Endstufe 100, aber nie über der Anbietergrenze minus 10 Reserve (config/versand.yaml)
        self.assertEqual(warmup_cap(d, d + dt.timedelta(days=30), DEFAULT_WARMUP), min(100, provider_cap() - 10))

    def test_stop(self):
        self.assertIsNone(emergency_stop(10, 2, 0))          # zu wenig Daten
        self.assertIsNotNone(emergency_stop(120, 7, 0))      # 5,8 %
        self.assertIsNone(emergency_stop(120, 5, 0))         # 4,2 %
        self.assertIsNone(emergency_stop(25, 1, 0))          # 4 %, aber erst ab 100 bewertet
        self.assertIsNotNone(emergency_stop(5, 0, 1))        # Beschwerde

    def test_interleave(self):
        msgs = [{"experiment_id": e, "n": i} for i, e in enumerate("aaabbc")]
        self.assertEqual([m["experiment_id"] for m in interleave(msgs)], list("abcaba"))


if __name__ == "__main__":
    unittest.main()
