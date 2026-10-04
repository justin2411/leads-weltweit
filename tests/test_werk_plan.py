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


def _rows(lane, run, parts, minutes, cand, green=0, rows_per_part=4, start="2026-10-03T20:00:00+00:00", werk="lead-werk"):
    """run_stats-Zeilen wie im Lead-Werk: je Teil mehrere Zeilen (je Zielgruppe/Land)."""
    import datetime as dt
    st = dt.datetime.fromisoformat(start)
    out = []
    for i in range(parts):
        for j in range(rows_per_part):
            out.append({"werk": werk, "part": f"{lane}-{i}" if werk == "lead-werk" else f"run --shard {i}/{parts}",
                        "run_id": run, "started_at": st.isoformat(),
                        "finished_at": (st + dt.timedelta(minutes=minutes)).isoformat(),
                        "candidates": cand if j == 0 else 0, "processed": cand if j == 0 else 0,
                        "green": green if j == 0 else 0})
    return out


class AutopilotTests(unittest.TestCase):
    """Autopilot (Inhaber 03.10.2026: „Ja, Autopilot an“) und Speicher-Bremse."""

    def setUp(self):
        self.reg = W.load_lines()
        self.base = W.counts(self.reg, None)[0]
        self.lead = {k: v for k, v in self.base.items() if k != "kunden"}

    def test_stats_count_each_part_once(self):
        s = W.lane_stats(_rows("web-us", "r1", 3, 2, 0), "lead-werk")["web-us"]
        self.assertEqual((s["parts"], s["parts_last"], s["empty"]), (3, 3, 3))  # 12 Zeilen = 3 Teile
        self.assertAlmostEqual(s["avg_min"], 2)

    def test_exhausted_lane_keeps_one_watch_slot(self):
        stats = W.lane_stats(_rows("web-us", "r1", 21, 2, 0) + _rows("web-us", "r0", 21, 2, 0, start="2026-10-03T18:00:00+00:00"), "lead-werk")
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, stats, other={"kunden": 8})
        self.assertEqual(plan["web-us"], 1)
        self.assertIn("Wachplatz", why["web-us"])

    def test_refilled_source_is_not_cut_by_old_empty_runs(self):
        # Nachtschicht 04.10.2026: zwei alte Leerläufe (42 Teile, 1 min, 0 Kandidaten), dann ein ergiebiger Lauf
        # (21 Teile, 75 min) nach Auffüllen der US-Quelle -> nicht auf 1 kürzen
        old = _rows("web-us", "r0", 42, 1, 0, start="2026-10-03T16:00:00+00:00")
        new = _rows("web-us", "r1", 21, 75, 5000, 300)
        stats = W.lane_stats(old + new, "lead-werk")["web-us"]
        self.assertGreaterEqual(stats["empty"] / stats["parts"], 0.5)  # zusammen sähe es erschöpft aus
        plan, why = W.autopilot(self.reg, "lead-werk", {**self.lead, "web-us": 21}, {"web-us": stats}, other={"kunden": 1})
        self.assertEqual(plan["web-us"], 21)
        self.assertIn("letzter Lauf ergiebig", why["web-us"])
        # umgekehrt: letzter Lauf leer -> Wachplatz wie bisher
        stats = W.lane_stats(_rows("web-us", "r0", 21, 75, 5000, 300, start="2026-10-03T16:00:00+00:00")
                             + _rows("web-us", "r1", 21, 1, 0), "lead-werk")
        plan, _ = W.autopilot(self.reg, "lead-werk", {**self.lead, "web-us": 21}, stats, other={"kunden": 1})
        self.assertEqual(plan["web-us"], 1)

    def test_full_lane_grows_toward_30_minute_parts(self):
        # alle anderen Linien erschöpft (je 1 Wachplatz) -> genug freie Plätze
        empty = [r for l in self.lead if l != "web-north" for r in _rows(l, "r1", 2, 1, 0)]
        stats = W.lane_stats(empty + _rows("web-north", "r1", 1, 75, 7000, 500), "lead-werk")
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, stats, other={"kunden": 8})
        self.assertEqual(plan["web-north"], 3)  # ceil(75 * 1 / 30) = 3, höchstens 2 * 1 + 2 = 4
        self.assertIn("voll ausgelastet", why["web-north"])
        stats = W.lane_stats(empty + _rows("web-north", "r1", 3, 70, 7000, 500), "lead-werk")
        self.assertEqual(W.autopilot(self.reg, "lead-werk", self.lead, stats, other={"kunden": 8})[0]["web-north"], 7)
        # ohne freie Plätze (andere Linien laufen gut) wächst nichts über die Summe
        busy = [r for l in self.lead if l != "web-north" for r in _rows(l, "r1", self.lead[l] or 1, 40, 100)]
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, W.lane_stats(busy + _rows("web-north", "r1", 1, 75, 7000, 500), "lead-werk"), other={"kunden": 8})
        self.assertLessEqual(sum(plan.values()), 30)

    def test_owner_zero_and_locks_stay(self):
        base = dict(self.lead, **{"web-fr": 0})
        stats = W.lane_stats(_rows("web-fr", "r1", 1, 75, 5000, 100) + _rows("web-uk", "r1", 5, 1, 0), "lead-werk")
        plan, why = W.autopilot(self.reg, "lead-werk", base, stats, locks={"web-uk": 4}, other={"kunden": 8})
        self.assertEqual(plan["web-fr"], 0)
        self.assertEqual(plan["web-uk"], 4)
        self.assertIn("festgesetzt", why["web-uk"])

    def test_sum_never_exceeds_cap_and_lane_max(self):
        import random
        rnd = random.Random(7)
        lanes = [l for l in self.reg["lanes"] if l["werk"] == "lead-werk"]
        cap = self.reg["total_slots"] - self.reg["reserve"]
        for n in range(300):
            rows = []
            for l in lanes:
                parts = rnd.randint(1, 21)
                rows += _rows(l["id"], "r1", parts, rnd.choice([1, 5, 40, 60, 75]), rnd.choice([0, 0, 50, 5000]),
                              rnd.randint(0, 900), rows_per_part=rnd.randint(1, 4))
            base = {l["id"]: rnd.randint(0, l["max"]) for l in lanes}
            other = {"kunden": rnd.randint(0, 16)}
            brake = rnd.choice(["aus", "hinweis", "drossel", "ohne-rohbestand"])
            plan, _ = W.autopilot(self.reg, "lead-werk", base, W.lane_stats(rows, "lead-werk"), other=other, brake=brake)
            limit = min(cap - other["kunden"], W.BRAKE_LEAD_MAX if brake in ("drossel", "ohne-rohbestand") else 99)
            self.assertLessEqual(sum(plan.values()), max(limit, 0), (n, plan, other, brake))
            for l in lanes:
                self.assertLessEqual(plan[l["id"]], l["max"])
                if base[l["id"]] == 0:
                    self.assertEqual(plan[l["id"]], 0)

    def test_brake_levels_with_hysteresis(self):
        gb = W.GB
        self.assertEqual(W.brake_level(int(5.4 * gb)), "aus")
        self.assertEqual(W.brake_level(int(5.6 * gb)), "hinweis")
        self.assertEqual(W.brake_level(int(6.1 * gb)), "drossel")
        self.assertEqual(W.brake_level(int(7.2 * gb)), "ohne-rohbestand")
        self.assertEqual(W.brake_level(int(6.9 * gb), "ohne-rohbestand"), "ohne-rohbestand")  # 0,2 GB Abstand
        self.assertEqual(W.brake_level(int(6.7 * gb), "ohne-rohbestand"), "drossel")
        self.assertEqual(W.brake_level(None, "drossel"), "drossel")  # ohne Messwert gilt die letzte Stufe

    def test_decide_falls_back_and_applies_brake(self):
        # Einstellungen nicht lesbar -> Belegung wie bisher (kein Autopilot)
        res = W.decide(self.reg, "lead-werk", {"settings": None, "rows": []})
        self.assertEqual(res["plan"], self.lead)
        # Autopilot aus -> Belegung des Inhabers
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_autopilot": {"on": False}}, "rows": _rows("web-us", "r1", 21, 1, 0)})
        self.assertEqual((res["mode"], res["plan"]["web-us"]), ("standard", 21))
        # Bremse ab 7 GB: höchstens 8 Lead-Plätze und ohne Rohbestand
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_autopilot": {"on": False}}, "rows": [],
                                               "db_bytes": int(7.1 * W.GB)})
        self.assertLessEqual(sum(res["plan"].values()), W.BRAKE_LEAD_MAX)
        self.assertEqual(res["extra"], " --no-raw")
        self.assertTrue(all("--no-raw" in r["args"] for r in W.matrix(self.reg, "lead-werk", res["plan"], res["extra"])))
        # Kunden-Werk: nie --no-raw
        self.assertEqual(W.decide(self.reg, "kunden-werk", {"settings": {}, "rows": [], "db_bytes": int(7.5 * W.GB)})["extra"], "")

    def test_kunden_lane_uses_processed(self):
        rows = _rows("kunden", "r1", 8, 3, 40, 10, werk="kunden-werk")
        plan, why = W.autopilot(self.reg, "kunden-werk", {"kunden": 8}, W.lane_stats(rows, "kunden-werk"), other={})
        self.assertEqual(plan["kunden"], 1)  # Pool durchgeprüft: Teile nach 3 min fertig


class StorageStopTests(unittest.TestCase):
    """Speicher-Stopp ab 7,5 GB (Prüfung 04.10.2026: ~1,3 GB/Tag Wachstum, 8 GB inklusive)."""

    def setUp(self):
        self.reg = W.load_lines()

    def test_stop_level_with_hysteresis(self):
        gb = W.GB
        self.assertEqual(W.brake_level(int(7.6 * gb)), "stopp")
        self.assertEqual(W.brake_level(int(7.4 * gb), "stopp"), "stopp")            # 0,2 GB Abstand
        self.assertEqual(W.brake_level(int(7.25 * gb), "stopp"), "ohne-rohbestand")
        self.assertEqual(W.brake_level(None, "stopp"), "stopp")

    def test_stop_sets_all_lead_lanes_to_zero_even_locked(self):
        for settings in ({"slot_autopilot": {"on": False}},
                         {"slot_autopilot": {"on": True, "locks": {"web-us": 5}}}):
            res = W.decide(self.reg, "lead-werk", {"settings": settings, "rows": [], "db_bytes": int(7.6 * W.GB)})
            self.assertEqual(res["brake"], "stopp")
            self.assertEqual(sum(res["plan"].values()), 0, settings)
            self.assertTrue(all(v == W.BRAKE_STOP_WHY for v in res["reasons"].values()))
            self.assertEqual(W.matrix(self.reg, "lead-werk", res["plan"], res["extra"]), [])

    def test_stop_leaves_kunden_werk_alone(self):
        res = W.decide(self.reg, "kunden-werk", {"settings": {"slot_autopilot": {"on": False}}, "rows": [],
                                                 "db_bytes": int(7.9 * W.GB)})
        self.assertEqual(res["plan"], {"kunden": W.counts(self.reg, None)[0]["kunden"]})
        self.assertEqual(res["extra"], "")

    def test_fast_parts_without_empty_ones_read_as_checked_not_exhausted(self):
        stats = W.lane_stats(_rows("web-uk", "r1", 2, 3, 40, 2), "lead-werk")
        lead = {k: v for k, v in W.counts(self.reg, None)[0].items() if k != "kunden"}
        plan, why = W.autopilot(self.reg, "lead-werk", lead, stats, other={"kunden": 8})
        self.assertEqual(plan["web-uk"], 1)
        self.assertIn("Quelle durchgeprüft (Ø 3 min, kaum neue Kandidaten)", why["web-uk"])
        self.assertNotIn("erschöpft", why["web-uk"])
