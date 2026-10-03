"""Belegungsplan der Werke (Inhaber 03.10.2026: Plätze je Linie im Leitstand steuern)."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import werk_plan as W  # noqa: E402


class WerkPlanTests(unittest.TestCase):
    def setUp(self):
        self.reg = W.load_lines()

    def test_registry_is_consistent(self):
        ids = [l["id"] for l in self.reg["lanes"]]
        self.assertEqual(len(ids), len(set(ids)))
        cap = self.reg["total_slots"] - self.reg["reserve"]
        self.assertLessEqual(sum(l["default"] for l in self.reg["lanes"]), cap)
        for l in self.reg["lanes"]:
            self.assertIn(l["werk"], ("lead-werk", "kunden-werk"))
            self.assertTrue(0 <= l["default"] <= l["max"] <= 21, l["id"])
            if l["werk"] == "lead-werk":
                self.assertNotIn("--shard", l["args"])  # Aufteilung macht der Plan
                self.assertNotIn("--deadline", l["args"])

    def test_default_without_plan_or_db(self):
        n, why = W.counts(self.reg, None)
        self.assertEqual(why, "Standardbelegung")
        self.assertEqual(n["web-us"], 21)
        self.assertEqual(len(W.matrix(self.reg, "lead-werk", n)), 30)
        self.assertEqual(len(W.matrix(self.reg, "kunden-werk", n)), 8)

    def test_owner_plan_is_clamped_and_used(self):
        n, why = W.counts(self.reg, {"web-us": 5, "web-uk": 99, "kunden": 4, "unbekannt": 5})
        self.assertEqual(why, "Belegung des Inhabers")
        self.assertEqual(n["web-us"], 5)
        self.assertEqual(n["web-uk"], 21)  # höchstens max je Linie
        rows = W.matrix(self.reg, "lead-werk", n)
        us = [r for r in rows if r["name"].startswith("web-us-")]
        self.assertEqual([r["name"] for r in us], [f"web-us-{i}" for i in range(5)])
        self.assertTrue(all(f"--shard {i}/5" in r["args"] for i, r in enumerate(us)))
        self.assertEqual(W.matrix(self.reg, "kunden-werk", n), [{"shard": i, "of": 4} for i in range(4)])

    def test_single_part_has_no_shard_and_zero_means_off(self):
        n, _ = W.counts(self.reg, {"web-fr": 1, "s2-us": 0})
        rows = W.matrix(self.reg, "lead-werk", n)
        fr = [r for r in rows if r["name"].startswith("web-fr-")]
        self.assertEqual(len(fr), 1)
        self.assertNotIn("--shard", fr[0]["args"])
        self.assertFalse(any(r["name"].startswith("s2-us-") for r in rows))

    def test_too_many_slots_or_garbage_fall_back_to_default(self):
        n, why = W.counts(self.reg, {l["id"]: l["max"] for l in self.reg["lanes"]})
        self.assertIn("Standardbelegung", why)
        self.assertEqual(n, W.counts(self.reg, None)[0])
        n, why = W.counts(self.reg, {"web-us": "viele"})
        self.assertIn("ungültig", why)

    def test_main_writes_matrix_output(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out"
            env = {k: v for k, v in os.environ.items() if k not in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")}
            old = dict(os.environ)
            os.environ.clear(); os.environ.update(env); os.environ["GITHUB_OUTPUT"] = str(out)
            try:
                W.main(["kunden-werk"])
            finally:
                os.environ.clear(); os.environ.update(old)
            lines = dict(l.split("=", 1) for l in out.read_text().splitlines())
            self.assertEqual(lines["teile"], "8")
            self.assertEqual(len(json.loads(lines["matrix"])["include"]), 8)


if __name__ == "__main__":
    unittest.main()
