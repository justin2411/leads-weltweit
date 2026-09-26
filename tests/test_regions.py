import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.regions import area_of, lead_matches  # noqa: E402


class RegionsTest(unittest.TestCase):
    def test_area_of(self):
        self.assertEqual(area_of("Stockport, Greater Manchester"), "Greater Manchester")
        self.assertEqual(area_of("Long Island, NY"), "Long Island")
        self.assertEqual(area_of("Brooklyn, NY"), "New York City")
        self.assertEqual(area_of("Poughkeepsie, NY"), "Hudson Valley")
        self.assertIsNone(area_of(None))

    def test_new_areas(self):
        self.assertTrue(lead_matches("UK", "Brighton", {"address": "BN1 1AA"}))
        self.assertFalse(lead_matches("UK", "Brighton", {"address": "B1 1AA"}))
        self.assertTrue(lead_matches("US", "Buffalo", {}, {"county": "Erie"}))


if __name__ == "__main__":
    unittest.main()
