"""Feedback-Werk (Inhaber 05.10.2026): Link in Lieferung/Probe, Gewichte je Anlass, nur Umgewichtung."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import feedback  # noqa: E402


class WeightTest(unittest.TestCase):
    def test_min_ratings_and_bounds(self):
        self.assertEqual(feedback.weight(2, 2), 1.0)
        self.assertEqual(feedback.weight(5, 0), 1.1)
        self.assertEqual(feedback.weight(0, 5), 0.9)
        self.assertEqual(feedback.weight(500, 0), feedback.W_MAX)
        self.assertEqual(feedback.weight(0, 500), feedback.W_MIN)

    def test_same_formula_as_app(self):
        """app/lib/feedback.ts weight() hat dieselben Konstanten."""
        ts = (Path(__file__).resolve().parents[1] / "app" / "lib" / "feedback.ts").read_text(encoding="utf-8")
        for k in ("MIN_N", "PRIOR", "SPREAD", "W_MIN", "W_MAX"):
            self.assertIn(f"{k} = {getattr(feedback, k)}", ts)

    def test_weights_from_stats_and_single_ratings(self):
        stats = [{"signal_type": "no_website", "country": "US", "gut": 6, "schlecht": 0, "gewonnen": 2},
                 {"signal_type": "no_website", "country": "UK", "gut": 0, "schlecht": 3, "gewonnen": 0},
                 {"signal_type": "relocation", "country": "FR", "gut": 1, "schlecht": 1, "gewonnen": 0}]
        w = feedback.weights(stats)
        self.assertGreater(w["no_website|US"], 1)
        self.assertNotIn("no_website|UK", w)  # 3 Bewertungen: zu wenig
        self.assertNotIn("relocation", w)
        self.assertGreater(w["no_website"], 1)
        single = [{"signal_type": "x", "country": "us", "rating": "schlecht", "won": False}] * 6
        self.assertLess(feedback.weights(single)["x|US"], 1)
        # gewonnen ohne Bewertung zählt positiv
        self.assertEqual(feedback._pos_neg({"rating": None, "won": True}), (1, 0))

    def test_weight_for_prefers_country(self):
        w = {"a|US": 1.2, "a": 0.9}
        self.assertEqual(feedback.weight_for({"signal_type": "a", "country": "US"}, w), 1.2)
        self.assertEqual(feedback.weight_for({"signal_type": "a", "country": "FR"}, w), 0.9)
        self.assertEqual(feedback.weight_for({"signal_type": "b", "country": "FR"}, w), 1.0)
        self.assertEqual(feedback.weight_for({"signal_type": "a"}, {}), 1.0)

    def test_load_weights_never_raises(self):
        class Broken:
            def select(self, *a, **k):
                raise RuntimeError("relation does not exist")
        self.assertEqual(feedback.load_weights(Broken()), {})


class PremiumReweightTest(unittest.TestCase):
    def test_only_order_within_tier(self):
        import datetime as dt
        from lib import premium
        today = dt.date(2026, 10, 5)
        prem = {"id": "p", "signal_type": "relocation", "country": "FR", "premium_score": 75,
                "premium": {"tier": "premium"}, "event_date": "2026-10-01"}
        std_a = {"id": "a", "signal_type": "no_website", "country": "US", "premium_score": 60, "premium": {"tier": "standard"}}
        std_b = {"id": "b", "signal_type": "website_outdated", "country": "US", "premium_score": 55,
                 "premium": {"tier": "standard"}}
        w = {"relocation": feedback.W_MIN, "website_outdated|US": feedback.W_MAX}
        order = sorted([std_a, std_b, prem], key=premium.key_with(w, today))
        # Premium bleibt vorn, auch mit schlechtem Feedback (Stufe unverändert); Standard umgewichtet: 55*1.25 > 60
        self.assertEqual([r["id"] for r in order], ["p", "b", "a"])
        self.assertEqual(premium.tier_now(prem, today), "premium")
        # ohne Gewichte wie bisher
        self.assertEqual([r["id"] for r in sorted([std_b, std_a, prem], key=premium.key_with(None, today))],
                         ["p", "a", "b"])
        self.assertEqual(premium.sort_key({"premium_score": None}, today), (1, 1))


class LinkTest(unittest.TestCase):
    def test_create_link_stores_leads(self):
        db = FakeDB({"lead_feedback_links": []})
        t = feedback.create_link(db, "lieferung", ["l1", "l2"], "US", "S2", "c1", "d1")
        self.assertTrue(t and len(t) >= 20)
        row = db.rows("lead_feedback_links")[0]
        self.assertEqual(row["lead_ids"], ["l1", "l2"])
        self.assertEqual(row["kind"], "lieferung")
        self.assertIsNone(feedback.create_link(db, "probe", [], "US"))
        self.assertIsNone(feedback.create_link(db, "pixel", ["l1"], "US"))

    def test_create_link_never_raises(self):
        class Broken:
            def insert(self, *a, **k):
                raise RuntimeError("down")
        self.assertIsNone(feedback.create_link(Broken(), "probe", ["l1"], "US"))

    def test_mail_line_before_greeting_without_tracking(self):
        body = "Hello,\n\nHere are your leads.\n\nBest regards,\nTeam"
        out, blocks = feedback.add_to_mail(body, "en", "T" * 32)
        paras = out.split("\n\n")
        self.assertEqual(paras[-1], "Best regards,\nTeam")
        self.assertIn("/bewerten?t=" + "T" * 32, paras[-2])
        html = blocks[paras[-2]]
        self.assertIn('href="https://', html)
        self.assertNotIn("<img", html)
        self.assertNotIn("utm_", html)
        # ohne Token unverändert
        self.assertEqual(feedback.add_to_mail(body, "en", None)[0], body)

    def test_french(self):
        out, _ = feedback.add_to_mail("Bonjour,\n\nTexte.\n\nCordialement", "fr", "x" * 32)
        self.assertIn("Facultatif", out)


if __name__ == "__main__":
    unittest.main()
