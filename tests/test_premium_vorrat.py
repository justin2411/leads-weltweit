"""Nur noch Premium (Inhaber 05.10.2026): Stufe veraltet, Proben-Vorrat meldet Auffüllung, Tagescheck, Lieferung,
Nachbewertung (scripts/premium_score.py). Erfundene Daten – keine echten Leads."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import premium  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def lead(i, tier="premium", age=3, score=85, **kw):
    return {"id": f"l{i}", "company_id": f"c{i}", "segment_id": "S2", "country": "UK", "signal_type": "website_broken",
            "premium_score": score, "premium": {"tier": tier},
            "event_date": (TODAY - dt.timedelta(days=age)).isoformat(), **kw}


class TierTest(unittest.TestCase):
    def test_premium_ages_out_after_30_days(self):
        self.assertEqual(premium.tier_now(lead(1, age=30), TODAY), "premium")
        self.assertEqual(premium.tier_now(lead(1, age=31), TODAY), "standard")
        self.assertEqual(premium.tier_now(lead(1, tier="standard"), TODAY), "standard")
        self.assertEqual(premium.tier_now({"premium": {"tier": "premium"}}, TODAY), "standard")

    def test_count_and_order(self):
        rows = [lead(1, tier="standard", score=95), lead(2, age=40, score=99), lead(3, score=70), lead(4, score=90)]
        self.assertEqual(premium.count(rows, TODAY), 2)
        self.assertEqual([r["id"] for r in sorted(rows, key=lambda r: premium.sort_key(r, TODAY))],
                         ["l4", "l3", "l2", "l1"])


class StockTest(unittest.TestCase):
    def test_premium_short_reports_filled_samples(self):
        from sample_stock import premium_short
        summary = {"S2/UK": {"neu": 2, "premium_leads_neu": 14}, "S2/US": {"neu": 1, "premium_leads_neu": 10}}
        self.assertEqual(premium_short(summary, {("S2", "UK"): 2, ("S2", "US"): 1}), ["S2/UK 14/20"])
        self.assertEqual(premium_short(summary, {}), [])


class TagescheckTest(unittest.TestCase):
    def test_lines(self):
        from tagescheck import OK, WARN, premium_lines
        rows = [{"segment_id": "S2", "country": "UK", "premium_frei": 4, "proben": 6, "proben_premium": 0, "zu_klein": True},
                {"segment_id": "S2", "country": "US", "premium_frei": 40, "proben": 6, "proben_premium": 6, "zu_klein": False},
                {"segment_id": "S4", "country": "UK", "premium_frei": 0, "proben": 3, "proben_premium": 0, "zu_klein": True}]
        st, title, detail = premium_lines(rows, {("S2", "UK"), ("S2", "US")})
        self.assertEqual(st, WARN)
        self.assertIn("Premium-Vorrat zu klein: S2/UK", title)
        self.assertNotIn("S4", title + detail)
        self.assertLessEqual(len(title), 60)
        st, title, _ = premium_lines(rows[1:2], {("S2", "US")})
        self.assertEqual(st, OK)


class DeliveryTest(unittest.TestCase):
    def test_premium_stays_ahead_of_customer_wishes(self):
        import customer_agents
        import deliveries
        now = dt.date.today().isoformat()
        rows = [lead(1, tier="standard", score=10, event_date=now), lead(2, event_date=now)]
        for r in rows:
            r["watch_companies"] = {}
        sub = {"segment_id": "S2", "filters": {"country": "UK", "max_per_week": 1, "agent": {"x": 1}}}
        with mock.patch.object(customer_agents, "lead_priority", side_effect=lambda l, *a: 5 if l["id"] == "l1" else 0):
            got = deliveries.select_leads(rows, sub, set(), {})
        self.assertEqual([l["id"] for l in got], ["l2"])


class ScoreScriptTest(unittest.TestCase):
    def test_filter_and_demote(self):
        import premium_score as P
        f = P.candidate_filter(TODAY)
        self.assertEqual(f["status"], "eq.new")
        self.assertEqual(f["premium_score"], "is.null")
        self.assertIn("relocation", f["or"])
        self.assertIn("source_name.ilike.*BODACC*", f["or"])
        self.assertIsNone(P.demote(lead(1), TODAY))
        self.assertEqual(P.demote(lead(1, age=45), TODAY)["tier"], "standard")

    def test_lead_input_uses_company_contact(self):
        import premium_score as P
        inp = P.lead_input({"signal_type": "new_incorporation", "event_date": "2026-10-01",
                            "source_name": "Companies House", "source_url": "https://example.org/c"},
                           {"findings": []}, {"phone": "+440000", "email": "a@example.org"}, {"name": "Jo Doe"})
        s = premium.score(inp, TODAY)
        self.assertEqual(s["tier"], "premium")
        self.assertIn("person", s["reasons"])
        self.assertIn("kontakt", s["reasons"])


if __name__ == "__main__":
    unittest.main()
