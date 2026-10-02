import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from match import matches_filter, quality  # noqa: E402

TODAY = dt.date(2026, 9, 27)
CO = {"name": "Acme Ltd", "address": "M1 1AA", "city": "Manchester", "region": "Greater Manchester", "website": "acme.co.uk"}


class MatchTest(unittest.TestCase):
    def test_quality(self):
        fresh, _ = quality({"event_date": "2026-09-20", "signal_type": "new_incorporation", "source_url": "x"}, CO, TODAY)
        self.assertEqual(fresh, 100)
        old, _ = quality({"event_date": "2026-05-01", "signal_type": "outdated_website"}, {"name": "X"}, TODAY)
        self.assertLess(old, 60)

    def test_filter(self):
        lead = {"signal_type": "new_incorporation", "segment_id": "S2"}
        tag = {"quality": 80, "segments": ["S2", "S4"], "region": "Greater Manchester", "industry": "Software"}
        self.assertTrue(matches_filter(lead, tag, CO, {"segment_id": "S4", "regions": ["Stockport, Greater Manchester"]}))
        self.assertFalse(matches_filter(lead, tag, CO, {"regions": ["Leeds"]}))
        self.assertFalse(matches_filter(lead, tag, CO, {"exclusions": ["acme"]}))
        self.assertFalse(matches_filter(lead, {**tag, "quality": 50}, CO, {}))
        self.assertFalse(matches_filter(lead, tag, CO, {"signals": ["job_open_30d"]}))
        # Formular-Schlüssel je Branche (02.10.2026): Wunsch-Schlüssel und alte Schlüssel greifen
        web = {"signal_type": "website_broken", "segment_id": "S2"}
        self.assertTrue(matches_filter(web, tag, CO, {"signals": ["broken"]}))
        self.assertTrue(matches_filter(web, tag, CO, {"signals": ["website_outdated"]}))
        self.assertTrue(matches_filter(web, tag, CO, {"signals": ["outdated_website"]}))
        self.assertFalse(matches_filter(web, tag, CO, {"signals": ["security", "no_website"]}))
        self.assertTrue(matches_filter(lead, {**tag, "industry": "Restaurant"}, CO, {"industries": ["Restaurants"]}))
        self.assertTrue(matches_filter({"signal_type": "no_https"}, tag, CO, {"signals": ["security"]}))


if __name__ == "__main__":
    unittest.main()
