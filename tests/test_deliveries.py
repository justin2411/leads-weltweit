import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from deliveries import select_leads, to_csv, week_start  # noqa: E402


def lead(i, company="c1", seg="S1", country="UK", st="job_open_30d", pc="M1 1AA"):
    return {"id": f"l{i}", "segment_id": seg, "country": country, "signal_type": st, "company_id": company,
            "event_summary": "e", "event_date": "2026-09-20", "source_name": "s", "source_url": "u",
            "source_date": "2026-09-21", "urgency": "high", "urgency_reason": "r", "opener": "o",
            "watch_companies": {"name": "Acme Ltd", "address": pc, "city": "Manchester", "region": "Greater Manchester"}}


SUB = {"segment_id": "S1", "filters": {"country": "UK", "areas": ["Greater Manchester"], "max_per_week": 5}}


class DeliveriesTest(unittest.TestCase):
    def test_filters_region_segment_and_already_delivered(self):
        leads = [lead(1), lead(2, company="c2", pc="LS1 1AA"), lead(3, seg="S2", company="c3"),
                 lead(4, company="c4"), lead(5, company="c5", country="US")]
        got = [l["id"] for l in select_leads(leads, SUB, {"l4"}, {})]
        self.assertEqual(got, ["l1"])

    def test_cap_and_max_three_per_company(self):
        leads = [lead(i) for i in range(5)] + [lead(10 + i, company=f"x{i}") for i in range(5)]
        got = select_leads(leads, SUB, set(), {})
        assert len(got) == 5
        assert sum(1 for l in got if l["company_id"] == "c1") == 3

    def test_signal_type_filter(self):
        sub = {**SUB, "filters": {**SUB["filters"], "signal_types": ["new_site"]}}
        assert select_leads([lead(1), lead(2, st="new_site", company="c2")], sub, set(), {})[0]["id"] == "l2"

    def test_csv_and_week_start(self):
        import datetime as dt
        assert to_csv([lead(1)]).decode().splitlines()[1].startswith("Acme Ltd,")
        assert week_start(dt.date(2026, 9, 26)) == dt.date(2026, 9, 21)


if __name__ == "__main__":
    unittest.main()
