import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.deliverability import emergency_stop, interleave, warmup_cap  # noqa: E402


class DeliverabilityTest(unittest.TestCase):
    def test_warmup(self):
        d = dt.date(2026, 10, 1)
        self.assertEqual(warmup_cap(None, d), 25)
        self.assertEqual(warmup_cap(d, d + dt.timedelta(days=5)), 90)   # Gratis-Tarif: 100 - 10 Puffer
        self.assertEqual(warmup_cap(d, d + dt.timedelta(days=30)), 90)

    def test_stop(self):
        self.assertIsNone(emergency_stop(10, 2, 0))          # zu wenig Daten
        self.assertIsNotNone(emergency_stop(40, 2, 0))       # 5 %
        self.assertIsNone(emergency_stop(40, 1, 0))          # 2,5 %
        self.assertIsNotNone(emergency_stop(5, 0, 1))        # Beschwerde

    def test_interleave(self):
        msgs = [{"experiment_id": e, "n": i} for i, e in enumerate("aaabbc")]
        self.assertEqual([m["experiment_id"] for m in interleave(msgs)], list("abcaba"))


if __name__ == "__main__":
    unittest.main()
