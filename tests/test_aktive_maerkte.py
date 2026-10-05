"""Nur aktive Märkte befüllen (Inhaber 05.10.2026: „immer das was wir gerade aktiv machen und was umsatz bringt“;
HK raus: „weil wir HK nicht easy nutzen dürfen laut rechtliches“). Zentrale Liste: scripts/lib/laender.py."""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib import laender  # noqa: E402

FOKUS = [("S2", "US"), ("S2", "UK"), ("S2", "FR")]


class LaenderTest(unittest.TestCase):
    def test_hk_always_out(self):
        self.assertIn("HK", laender.INACTIVE)
        self.assertEqual(laender.active(("US", "HK", "SG")), ("US", "SG"))
        self.assertFalse(laender.pair_producing("S2", "HK", pairs=[]))
        self.assertFalse(laender.pair_producing("S2", "HK", pairs=[("S2", "HK")]))

    def test_producing_follows_fokus(self):
        self.assertEqual(laender.producing(["US", "SE", "FR", "HK"], FOKUS), ["US", "FR"])
        self.assertTrue(laender.pair_producing("S2", "UK", FOKUS))
        self.assertFalse(laender.pair_producing("S2", "SE", FOKUS))
        self.assertFalse(laender.pair_producing("S4", "US", FOKUS))
        # ohne Fokus-Liste (Datei fehlt/kaputt): keine Einschränkung außer HK
        self.assertEqual(laender.producing(("US", "SE", "HK"), []), ("US", "SE"))

    def test_real_fokus_file(self):
        self.assertTrue(laender.focus_pairs())
        self.assertNotIn("HK", {c for _, c in laender.focus_pairs()})


class AutopilotTest(unittest.TestCase):
    def test_resting_lanes_get_zero_and_slots_move(self):
        import werk_plan as W
        reg = json.loads((ROOT / "app/lib/werk-linien.json").read_text(encoding="utf-8"))
        ruht = W.resting_lanes(reg, "lead-werk", FOKUS)
        self.assertIn("web-north", ruht)
        self.assertIn("s2-neu", ruht)
        self.assertIn("s1-us-lca", ruht)
        self.assertNotIn("web-us", ruht)
        self.assertNotIn("s2-ukfr", ruht)
        self.assertEqual(W.resting_lanes(reg, "lead-werk", []), set())
        res = W.decide(reg, "lead-werk", {"settings": {"slot_plan": {}, "slot_autopilot": {"on": True, "locks": {}}},
                                          "rows": [], "fokus": FOKUS})
        for k in ruht:
            self.assertEqual(res["plan"][k], 0, k)
            self.assertEqual(res["reasons"][k], W.RUHT_WHY)

    def test_without_autopilot_also_zero(self):
        import werk_plan as W
        reg = json.loads((ROOT / "app/lib/werk-linien.json").read_text(encoding="utf-8"))
        res = W.decide(reg, "lead-werk", {"settings": {"slot_plan": {"web-north": 3}, "slot_autopilot": {"on": False}},
                                          "rows": [], "fokus": FOKUS})
        self.assertEqual(res["plan"]["web-north"], 0)


class ExtraktorTest(unittest.TestCase):
    def test_run_skips_resting_countries(self):
        from extraktor import run
        with mock.patch("lib.laender.focus_pairs", return_value=FOKUS):
            self.assertEqual(run.producing(["FI", "SG", "US"]), ["US"])


if __name__ == "__main__":
    unittest.main()
