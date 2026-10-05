"""Belegungsplan der Werke (Inhaber 03.10.2026: Plätze je Linie im Leitstand steuern)."""
import datetime as dt
import re
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
            self.assertIn(l["werk"], ("lead-werk", "kunden-werk", "pruefer-werk", "kontakt-werk"))
            self.assertTrue(0 <= l["default"] <= l["max"] <= 21, l["id"])
            if l["werk"] == "lead-werk":
                self.assertNotIn("--shard", l["args"])  # Aufteilung macht der Plan
                self.assertNotIn("--deadline", l["args"])

    def test_default_without_plan_or_db(self):
        n, why = W.counts(self.reg, None)
        self.assertEqual(why, "Standardbelegung")
        self.assertEqual(n["web-us"], 18)  # 21 -> 20 (s2-neu) -> 18: zwei Plätze an s2-ukfr (Scout 04.10.2026)
        self.assertEqual(n["s2-ukfr"], 2)
        self.assertEqual(n["s2-neu"], 1)
        self.assertEqual(len(W.matrix(self.reg, "lead-werk", n)), 30)
        self.assertEqual(len(W.matrix(self.reg, "kunden-werk", n)), 4)  # 8 -> 4: Platz für 4 Prüfer (05.10.2026)
        self.assertEqual(W.matrix(self.reg, "pruefer-werk", n), [{"name": f"pruefer-{i}", "shard": i, "of": 4} for i in range(4)])
        self.assertEqual(W.matrix(self.reg, "kontakt-werk", n), [])  # Standard 0: Plätze aus der Inhaber-Belegung
        self.assertEqual(W.matrix(self.reg, "kontakt-werk", {"kontakt": 4}),
                         [{"name": f"kontakt-{i}", "shard": i, "of": 4} for i in range(4)])

    def test_owner_plan_is_clamped_and_used(self):
        n, why = W.counts(self.reg, {"web-us": 5, "web-uk": 99, "kunden": 4, "pruefer": 0, "kontakt": 0, "unbekannt": 5})
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
            self.assertEqual(lines["teile"], "4")
            self.assertEqual(len(json.loads(lines["matrix"])["include"]), 4)



class PrueferLaneTests(unittest.TestCase):
    def test_lane_of_and_other_werke_merge(self):
        self.assertEqual(W.lane_of("pruefer-werk", "pruefer-2"), "pruefer")
        self.assertEqual(W.lane_of("pruefer-werk", "run --shard 1/4 --deadline-min 80"), "pruefer")
        self.assertIsNone(W.lane_of("pruefer-werk", "kpi"))
        self.assertEqual(W.lane_of("kontakt-werk", "kontakt-1"), "kontakt")
        self.assertEqual(W.lane_of("kontakt-werk", "run --shard 0/3 --deadline-min 80"), "kontakt")
        self.assertIsNone(W.lane_of("kontakt-werk", "kpi"))
        reg = W.load_lines()
        # andere Werke: fehlende Linien zählen mit ihrer Basis (Prüfer 4), gemeldete mit dem letzten Plan
        res = W.decide(reg, "lead-werk", {"settings": {"slot_autopilot": {"on": True}}, "rows": [], "other": {"kunden": 16}})
        self.assertLessEqual(sum(res["plan"].values()) + 16 + 4, reg["total_slots"] - reg["reserve"])
        res = W.decide(reg, "pruefer-werk", {"settings": {"slot_plan": {"pruefer": 6, "web-us": 0}, "slot_autopilot": {"on": False}}, "rows": []})
        self.assertEqual(res["plan"], {"pruefer": 6})


class MinBelegtTests(unittest.TestCase):
    """Werke immer ausgelastet (Inhaber 05.10.2026: „mind. 30 gleichzeitig“)."""

    def setUp(self):
        import datetime as dt
        self.reg = W.load_lines()
        self.now = dt.datetime(2026, 10, 3, 21, 0, tzinfo=dt.timezone.utc)
        self.lead = {"web-us": 3, "web-uk": 8, "web-fr": 10, "web-north": 1, "s2-us": 3, "s2-neu": 1,
                     "s1-us-lca": 0, "s1-uk-tender": 0}

    def stats(self):
        rows = []
        for lane in ("web-uk", "web-fr", "s2-us"):
            rows += _rows(lane, "r1", 1, 1, 0) + _rows(lane, "r0", 1, 1, 0, start="2026-10-03T15:00:00+00:00")
        rows += _rows("web-us", "r1", 3, 40, 900, 60) + _rows("web-north", "r1", 2, 46, 7000, 480)
        rows += _rows("s2-neu", "r1", 1, 37, 2000, 1900)
        return W.lane_stats(rows, "lead-werk")

    def test_constant(self):
        self.assertEqual(W.MIN_BELEGT, 30)

    def test_fills_up_to_30_website_lanes_first(self):
        # ohne Minimum: 18 Lead-Plätze + 8 Kunden = 26 -> mit Minimum 30, Zusatz an web-us (Website US/UK/FR)
        p0, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8}, now=self.now,
                            min_belegt=0)
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8}, now=self.now)
        self.assertLess(sum(p0.values()) + 8, 30)
        self.assertEqual(sum(plan.values()) + 8, 30)
        self.assertGreater(plan["web-us"], p0["web-us"])
        self.assertIn(W.MIN_WHY, why["web-us"])
        for lane in ("web-uk", "web-fr", "s2-us"):  # leere Linien bekommen nichts
            self.assertEqual(plan[lane], 0, lane)
        self.assertEqual(plan["s1-us-lca"], 0)  # vom Inhaber auf 0

    def test_kunden_werk_fills_when_lead_werk_low(self):
        rows = _rows("kunden", "k1", 4, 40, 500, werk="kunden-werk")
        plan, why = W.autopilot(self.reg, "kunden-werk", {"kunden": 4}, W.lane_stats(rows, "kunden-werk"),
                                other={"web-us": 10})
        self.assertEqual(plan["kunden"], 16)  # max der Linie (10 + 16 = 26, mehr geht nicht)
        self.assertIn(W.MIN_WHY, why["kunden"])
        plan, _ = W.autopilot(self.reg, "kunden-werk", {"kunden": 4}, W.lane_stats(rows, "kunden-werk"),
                              other={"web-us": 24})
        self.assertEqual(plan["kunden"], 6)

    def test_brake_and_locks_win(self):
        for brake in ("drossel", "ohne-rohbestand", "stopp"):
            plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8},
                                  now=self.now, brake=brake)
            self.assertLessEqual(sum(plan.values()), 0 if brake == "stopp" else W.BRAKE_LEAD_MAX, brake)
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8}, now=self.now,
                              locks={"web-us": 3})
        self.assertEqual(plan["web-us"], 3)

    def test_never_over_cap_or_max(self):
        cap = self.reg["total_slots"] - self.reg["reserve"]
        lanes = {l["id"]: l for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 0}, now=self.now,
                              min_belegt=500)
        self.assertLessEqual(sum(plan.values()), cap)
        for k, v in plan.items():
            self.assertLessEqual(v, lanes[k]["max"])


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
        self.lead = {k: v for k, v in self.base.items() if k not in ("kunden", "pruefer", "kontakt")}

    def test_stats_count_each_part_once(self):
        s = W.lane_stats(_rows("web-us", "r1", 3, 2, 0), "lead-werk")["web-us"]
        self.assertEqual((s["parts"], s["parts_last"], s["empty"]), (3, 3, 3))  # 12 Zeilen = 3 Teile
        self.assertAlmostEqual(s["avg_min"], 2)

    def test_exhausted_lane_keeps_one_watch_slot(self):
        # vorher ergiebig, die letzten beiden Läufe leer -> erschöpft (nicht „Vorrat leer“: das Fenster hatte Kandidaten)
        stats = W.lane_stats(_rows("web-us", "r1", 21, 2, 0) + _rows("web-us", "r0", 21, 2, 0, start="2026-10-03T18:00:00+00:00")
                             + _rows("web-us", "rx", 21, 75, 5000, 300, start="2026-10-03T16:00:00+00:00"), "lead-werk")
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
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, stats, other={"kunden": 8}, min_belegt=0)
        # ceil(75 * 1 / 30) = 3, dazu Plätze der leeren Linien bis 2 * 1 + 2 = 4
        self.assertEqual(plan["web-north"], 4)
        self.assertIn("voll ausgelastet", why["web-north"])
        self.assertIn("+1 aus leeren Linien", why["web-north"])
        stats = W.lane_stats(empty + _rows("web-north", "r1", 3, 70, 7000, 500), "lead-werk")
        self.assertEqual(W.autopilot(self.reg, "lead-werk", self.lead, stats, other={"kunden": 8},
                                     min_belegt=0)[0]["web-north"], 8)
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
        res = W.decide(self.reg, "lead-werk", {"settings": None, "rows": [], "mix_pct": 0})
        self.assertEqual(res["plan"], self.lead)
        # Autopilot aus -> Belegung des Inhabers
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_autopilot": {"on": False}, "lead_mix": {"premium_pct": 0}},
                                               "rows": _rows("web-us", "r1", 21, 1, 0)})
        self.assertEqual((res["mode"], res["plan"]["web-us"]), ("standard", 18))
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


class EmptyLaneTests(unittest.TestCase):
    """Leere Linien (Scout 04.10.2026: web-uk/web-fr liefen mit 8/10 Plätzen und 0 Kandidaten)."""

    def setUp(self):
        import datetime as dt
        self.reg = W.load_lines()
        self.lead = {"web-us": 3, "web-uk": 8, "web-fr": 10, "web-north": 1, "s2-us": 3, "s2-neu": 1,
                     "s1-us-lca": 0, "s1-uk-tender": 0}
        self.now = dt.datetime(2026, 10, 3, 21, 0, tzinfo=dt.timezone.utc)

    def stats(self, last="2026-10-03T20:00:00+00:00"):
        rows = []
        for lane in ("web-uk", "web-fr", "s2-us"):
            rows += _rows(lane, "r1", 1, 1, 0, start=last) + _rows(lane, "r0", 1, 1, 0, start="2026-10-03T15:00:00+00:00")
        rows += _rows("web-us", "r1", 3, 40, 900, 60) + _rows("web-north", "r1", 2, 46, 7000, 480)
        rows += _rows("s2-neu", "r1", 1, 37, 2000, 1900)
        return W.lane_stats(rows, "lead-werk")

    def test_empty_lane_gets_zero_and_slots_go_to_productive_lanes(self):
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8}, now=self.now,
                                min_belegt=0)
        for lane in ("web-uk", "web-fr", "s2-us"):
            self.assertEqual(plan[lane], 0, lane)
            self.assertTrue(why[lane].startswith(W.EMPTY_WHY), why[lane])
        # 21 freie Plätze, verteilt auf grüne Linien bis 2 × Teile + 2 (web-north 2 -> 6, web-us 3 -> 8, s2-neu max 4)
        self.assertEqual((plan["web-north"], plan["web-us"], plan["s2-neu"]), (6, 8, 4))
        self.assertIn("aus leeren Linien", why["web-north"])
        self.assertLessEqual(sum(plan.values()), 38 - 8)

    def test_probe_slot_every_four_hours_and_recovery(self):
        st = self.stats(last="2026-10-03T16:00:00+00:00")
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, st, other={"kunden": 8}, now=self.now)
        self.assertEqual(plan["web-uk"], 1)
        self.assertIn("Prüfplatz", why["web-uk"])
        # nach einer Leer-Meldung reicht ein leerer Prüflauf
        one = W.lane_stats(_rows("web-uk", "p1", 1, 1, 0, start="2026-10-03T20:30:00+00:00"), "lead-werk")
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, one, other={"kunden": 8}, now=self.now,
                                prev={"web-uk": W.EMPTY_WHY + " (2 Läufe ohne Kandidaten) – 1 Prüfplatz alle 4 h"})
        self.assertEqual(plan["web-uk"], 0)
        # ohne Laufzahlen im Fenster, aber zuletzt leer -> Prüfplatz statt der vollen Belegung
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, {}, other={"kunden": 8}, now=self.now,
                                prev={"web-uk": W.EMPTY_WHY + " (2 Läufe ohne Kandidaten)"})
        self.assertEqual(plan["web-uk"], 1)
        # Prüfplatz findet Kandidaten -> sofort wieder die Belegung des Inhabers
        back = W.lane_stats(_rows("web-uk", "p2", 1, 70, 3000, 120, start="2026-10-03T19:00:00+00:00"), "lead-werk")
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, back, other={"kunden": 8}, now=self.now,
                                prev={"web-uk": W.EMPTY_WHY + " (2 Läufe ohne Kandidaten)"})
        self.assertEqual(plan["web-uk"], 8)
        self.assertIn("wieder da", why["web-uk"])

    def test_locks_owner_zero_and_brake_win(self):
        plan, why = W.autopilot(self.reg, "lead-werk", {**self.lead, "web-uk": 0}, self.stats(), locks={"web-fr": 5},
                                other={"kunden": 8}, now=self.now)
        self.assertEqual((plan["web-uk"], plan["web-fr"]), (0, 5))
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 8}, brake="drossel",
                              now=self.now)
        self.assertLessEqual(sum(plan.values()), W.BRAKE_LEAD_MAX)
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, self.stats(), other={"kunden": 28}, now=self.now)
        self.assertLessEqual(sum(plan.values()), 38 - 28)

    def test_decide_reads_previous_reasons(self):
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_plan": dict(self.lead, kunden=8)}, "rows": [],
                                               "prev_reasons": {"web-fr": W.EMPTY_WHY + " (3 Läufe ohne Kandidaten)"}})
        self.assertEqual(res["plan"]["web-fr"], 1)
        self.assertTrue(res["reasons"]["web-fr"].startswith(W.EMPTY_WHY))


class VorrangResetTests(unittest.TestCase):
    """Zurücksetzen einer Linie und Länder-Vorrang UK/FR vor US (Inhaber 04.10.2026)."""

    def setUp(self):
        import datetime as dt
        self.reg = W.load_lines()
        self.lead = {"web-us": 13, "web-uk": 8, "web-fr": 10, "web-north": 1, "s2-us": 3, "s2-neu": 1,
                     "s1-us-lca": 0, "s1-uk-tender": 0}
        self.now = dt.datetime(2026, 10, 4, 15, 0, tzinfo=dt.timezone.utc)
        self.rule = {"segment": "S2", "vor": ["UK", "FR"], "nach": ["US"], "faktor": 3.0}

    def old_empty_rows(self):
        rows = []
        for lane in ("web-uk", "web-fr"):
            rows += _rows(lane, "r1", 1, 1, 0, start="2026-10-04T14:00:00+00:00")
            rows += _rows(lane, "r0", 1, 1, 0, start="2026-10-04T13:00:00+00:00")
        return rows

    def test_reset_ignores_old_empty_runs_and_previous_empty_reason(self):
        prev = {k: W.EMPTY_WHY + " (7 Läufe ohne Kandidaten)" for k in ("web-uk", "web-fr")}
        reset = {"web-uk": "2026-10-04T14:40:00+00:00", "web-fr": "2026-10-04T14:40:00+00:00"}
        st = W.lane_stats(self.old_empty_rows(), "lead-werk", reset=reset)
        self.assertNotIn("web-uk", st)
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, st, other={"kunden": 1}, prev=prev, now=self.now,
                                reset=reset)
        self.assertEqual((plan["web-uk"], plan["web-fr"]), (8, 10))
        self.assertIn("zurückgesetzt", why["web-uk"])
        # ohne Zurücksetzen bleiben sie leer
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, W.lane_stats(self.old_empty_rows(), "lead-werk"),
                              other={"kunden": 1}, prev=prev, now=self.now)
        self.assertEqual((plan["web-uk"], plan["web-fr"]), (0, 0))
        # neue Läufe nach dem Zeitpunkt zählen wieder
        new = _rows("web-uk", "r2", 8, 40, 500, 30, start="2026-10-04T14:45:00+00:00")
        st = W.lane_stats(self.old_empty_rows() + new, "lead-werk", reset=reset)
        self.assertEqual(st["web-uk"]["parts"], 8)

    def test_vorrang_moves_us_slots_to_uk_fr(self):
        stock = {"US": 446356, "UK": 91920, "FR": 68970}
        reset = {"web-uk": "2026-10-04T14:40:00+00:00", "web-fr": "2026-10-04T14:40:00+00:00"}
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, {}, other={"kunden": 1}, now=self.now,
                                reset=reset, vorrang=self.rule, stock=stock)
        self.assertEqual((plan["web-us"], plan["s2-us"]), (1, 1))
        self.assertIn("Länder-Vorrang", why["web-us"])
        self.assertGreater(plan["web-uk"], 8)
        self.assertGreater(plan["web-fr"], 10)
        self.assertLessEqual(plan["web-uk"], 21)
        self.assertLessEqual(sum(plan.values()), 38 - 1)
        self.assertEqual(plan["web-north"], 1)  # andere Länder unberührt
        # US unter 3× -> kein Vorrang
        plan, why = W.autopilot(self.reg, "lead-werk", self.lead, {}, other={"kunden": 1}, now=self.now,
                                vorrang=self.rule, stock={"US": 200000, "UK": 91920, "FR": 68970})
        self.assertEqual(plan["web-us"], 13)
        self.assertNotIn("Vorrang", why["web-us"])

    def test_vorrang_off_when_uk_fr_empty_or_rule_missing(self):
        stock = {"US": 446356, "UK": 91920, "FR": 68970}
        prev = {k: W.EMPTY_WHY + " (7 Läufe ohne Kandidaten)" for k in ("web-uk", "web-fr")}
        plan, _ = W.autopilot(self.reg, "lead-werk", self.lead, W.lane_stats(self.old_empty_rows(), "lead-werk"),
                              other={"kunden": 1}, prev=prev, now=self.now, vorrang=self.rule, stock=stock)
        self.assertGreater(plan["web-us"], 1)  # UK/FR leer -> US behält Plätze
        self.assertEqual(W.vorrang_active(None, stock), (False, ""))
        self.assertFalse(W.vorrang_active(self.rule, {"US": 5})[0])

    def test_decide_passes_reset_and_vorrang(self):
        res = W.decide(self.reg, "lead-werk", {
            "settings": {"slot_plan": dict(self.lead, kunden=1),
                         "lane_reset": {"web-uk": "2026-10-04T14:40:00+00:00"}, "lead_mix": {"premium_pct": 0}},
            "rows": self.old_empty_rows(), "prev_reasons": {"web-uk": W.EMPTY_WHY + " (7 Läufe)"},
            "vorrang": self.rule, "stock": {"US": 446356, "UK": 91920, "FR": 68970}})
        self.assertGreaterEqual(res["plan"]["web-uk"], 8)
        self.assertEqual(res["plan"]["web-us"], 1)

    def test_vorrang_lanes_are_kept_when_sum_is_cut(self):
        # Lauf 04.10.2026: web-north lief zuletzt mit 6 Teilen, web-fr frisch zurückgesetzt ohne Laufzahlen
        lead = {"web-us": 1, "web-uk": 15, "web-fr": 17, "web-north": 1, "s2-us": 1, "s2-neu": 1,
                "s1-us-lca": 0, "s1-uk-tender": 0}
        rows = _rows("web-north", "r1", 6, 46, 7000, 480, start="2026-10-04T14:50:00+00:00")
        rows += _rows("s2-neu", "r1", 4, 37, 2000, 300, start="2026-10-04T14:50:00+00:00")
        reset = {"web-uk": "2026-10-04T14:36:00+00:00", "web-fr": "2026-10-04T14:36:00+00:00"}
        plan, why = W.autopilot(self.reg, "lead-werk", lead, W.lane_stats(rows, "lead-werk"), other={"kunden": 1},
                                now=self.now, reset=reset, vorrang=self.rule,
                                stock={"US": 446356, "UK": 91920, "FR": 68970})
        self.assertEqual((plan["web-uk"], plan["web-fr"]), (15, 17))
        self.assertLessEqual(sum(plan.values()), 37)
        self.assertGreaterEqual(plan["web-north"], 1)

    def test_fokus_config_has_rule(self):
        from lib.fokus import laender_vorrang
        self.assertEqual(laender_vorrang(), self.rule)


class LeadMixTests(unittest.TestCase):
    """Mischung im Lead-Werk (Inhaber 05.10.2026): 100 % = nur Premium, 1–99 % = Plätze im Verhältnis."""

    def setUp(self):
        self.reg = W.load_lines()

    def test_default_is_only_premium(self):
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_autopilot": {"on": False}}, "rows": []})
        self.assertTrue(res["nur_premium"])
        self.assertEqual(res["mix_pct"], 100)
        lanes = {l["id"]: l for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        for k, n in res["plan"].items():
            flag = lanes[k].get("premium")
            if flag is None:
                self.assertEqual(n, 0, k)
            elif flag == "basis":
                self.assertLessEqual(n, W.BASIS_MAX, k)
        self.assertGreater(sum(n for k, n in res["plan"].items() if lanes[k].get("premium") == "ja"), 0)
        cap = self.reg["total_slots"] - self.reg["reserve"]
        self.assertLessEqual(sum(res["plan"].values()) + sum(l["default"] for l in self.reg["lanes"]
                                                           if l["werk"] != "lead-werk"), cap)

    def test_locked_lane_stays(self):
        res = W.decide(self.reg, "lead-werk", {"settings": {"slot_autopilot": {"on": True, "locks": {"web-us": 3}}},
                                               "rows": []})
        self.assertEqual(res["plan"]["web-us"], 3)

    def test_unreadable_mix_is_strict(self):
        self.assertEqual(W.mix_from({"lead_mix": {"premium_pct": "x"}}), 100)
        self.assertEqual(W.mix_from(None), 100)
        self.assertEqual(W.mix_from({"lead_mix": {"premium_pct": 140}}), 100)
        self.assertEqual(W.mix_from({"lead_mix": {"premium_pct": 30}}), 30)

    def test_mix_shares_slots(self):
        plan = {l["id"]: 0 for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        plan.update({"web-us": 8, "radar": 1, "s2-ukfr": 1})
        why = {}
        W.mix_plan(self.reg, "lead-werk", plan, why, {}, 50)
        self.assertEqual(sum(plan.values()), 10)
        prem = plan["radar"] + plan["s2-ukfr"]
        self.assertGreater(prem, 2)
        self.assertLessEqual(prem, 5)
        # 0 % und 100 % ändern hier nichts
        p0 = dict(plan)
        self.assertEqual(W.mix_plan(self.reg, "lead-werk", p0, {}, {}, 0), 0)
        self.assertEqual(W.mix_plan(self.reg, "lead-werk", p0, {}, {}, 100), 0)

    def test_min_tier_skips_standard_lanes_in_premium_mode(self):
        lanes = {l["id"]: l for l in self.reg["lanes"]}
        self.assertIsNone(W._min_tier(lanes["web-us"], None, nur_premium=True))
        self.assertEqual(W._min_tier(lanes["web-uk"], None, nur_premium=True), 1)  # Radar-Basis (bis BASIS_MAX)
        self.assertEqual(W._min_tier(lanes["radar"], None, nur_premium=True), 1)
        self.assertEqual(W._min_tier(lanes["kunden"], None, nur_premium=True), 2)


class LeadWerkHochTests(unittest.TestCase):
    """Lead-Werk hoch (Inhaber 05.10.2026): Nur Premium füllt das Lead-Werk nach Premium-Ertrag, Radar je Land."""

    def setUp(self):
        self.reg = W.load_lines()
        self.lanes = {l["id"]: l for l in self.reg["lanes"]}
        self.now = dt.datetime(2026, 10, 5, 9, 0, tzinfo=dt.timezone.utc)

    def _stats(self):
        rows = []
        for lane, parts, prem, cand, green in (("radar", 2, 60, 9000, 70), ("radar-uk", 4, 160, 30000, 190),
                                                ("radar-us", 6, 240, 50000, 300), ("s2-ukfr", 6, 2, 9000, 900),
                                                ("web-uk", 1, 0, 9000, 350), ("web-fr", 1, 0, 9000, 480)):
            for i in range(parts):
                for run in ("r1", "r2"):
                    rows.append({"werk": "lead-werk", "part": f"{lane}-{i}", "run_id": run,
                                 "started_at": "2026-10-05T07:00:00+00:00" if run == "r1" else "2026-10-05T08:00:00+00:00",
                                 "finished_at": "2026-10-05T07:58:00+00:00" if run == "r1" else "2026-10-05T08:58:00+00:00",
                                 "candidates": cand // parts, "processed": cand // parts, "green": green // parts,
                                 "extra": {"premium": prem // parts}})
        return W.lane_stats(rows, "lead-werk")

    def test_radar_split_by_country_with_own_partitions(self):
        radar = [l for l in self.reg["lanes"] if "--radar " in l.get("args", "")]
        self.assertEqual({l["id"] for l in radar}, {"radar", "radar-uk", "radar-us"})
        seen = set()
        for l in radar:
            m = re.search(r"--radar-countries (\S+)", l["args"])
            self.assertIsNotNone(m, l["id"])
            cs = set(m.group(1).split(","))
            self.assertEqual(len(cs), 1, l["id"])  # ein Land je Linie
            self.assertFalse(cs & seen, l["id"])   # kein Land doppelt
            seen |= cs
            self.assertEqual(l["premium"], "ja")
        self.assertEqual(seen, {"US", "UK", "FR"})
        # jeder Platz bekommt einen eigenen Teil (--shard i/K, K = max), nie dieselben Firmen
        rows = W.matrix(self.reg, "lead-werk", {}, shards={"radar-us": list(range(6))})
        self.assertEqual([r["args"].split("--shard ")[1] for r in rows], [f"{i}/6" for i in range(6)])

    def test_fmcsa_max_stays_small(self):
        # 14-Tage-Fenster ~5.400 Neuzugänge; jeder Teil lädt den ganzen Datensatz von Socrata -> 2 reichen
        self.assertEqual(self.lanes["fmcsa-us"]["max"], 2)

    def test_basis_up_to_basis_max(self):
        self.assertEqual(W.lane_limit(self.lanes["web-uk"], True), W.BASIS_MAX)
        self.assertEqual(W.lane_limit(self.lanes["web-uk"], False), 21)
        self.assertEqual(W.lane_limit(self.lanes["radar-us"], True), 6)
        plan = {l["id"]: 0 for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        plan.update({"web-uk": 15, "web-us": 9})
        why = {}
        W.premium_only_plan(self.reg, "lead-werk", plan, why, {}, 30)
        self.assertEqual(plan["web-uk"], W.BASIS_MAX)
        self.assertEqual(plan["web-us"], 0)

    def test_yield_weights_measured(self):
        st = self._stats()
        hit = W.radar_hit(self.reg, st)
        self.assertAlmostEqual(hit, 460 / 89000, places=4)
        w = W.premium_yield(self.reg, st)
        self.assertGreater(w["radar-us"], w["web-fr"])
        self.assertGreater(w["web-fr"], w["s2-ukfr"])  # Basis-Vorrat schlägt eine Premium-Linie ohne Ertrag
        self.assertNotIn("web-us", w)
        self.assertEqual(w["fmcsa-us"], max(w["radar"], w["radar-uk"], w["radar-us"]))  # neu = wie die beste

    def test_lead_werk_fills_to_min_by_yield(self):
        st = self._stats()
        plan = {l["id"]: 0 for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        plan.update({"radar": 1, "radar-uk": 1, "radar-us": 1, "fmcsa-us": 1, "s2-ukfr": 6, "web-uk": 1, "web-fr": 1})
        why = {}
        W.premium_only_plan(self.reg, "lead-werk", plan, why, {}, 22, st)
        self.assertEqual(sum(plan.values()), 22)
        self.assertGreaterEqual(sum(plan.values()), W.LEAD_MIN_PREMIUM)
        self.assertEqual((plan["radar"], plan["radar-uk"], plan["radar-us"], plan["fmcsa-us"]), (2, 4, 6, 2))
        self.assertGreater(plan["web-fr"], plan["s2-ukfr"])
        self.assertTrue(all(plan[k] <= W.lane_limit(self.lanes[k], True) for k in plan))
        self.assertIn(W.LEAD_MIN_WHY, why["radar-us"])

    def test_locked_and_exhausted_lanes_keep_value(self):
        st = self._stats()
        plan = {l["id"]: 0 for l in self.reg["lanes"] if l["werk"] == "lead-werk"}
        plan.update({"radar": 1, "radar-uk": 1, "radar-us": 1, "web-uk": 3, "web-fr": 1})
        why = {"radar-uk": "Vorrat erschöpft (2/4 Teile leer, Ø 6 min) – 1 Wachplatz"}
        W.premium_only_plan(self.reg, "lead-werk", plan, why, {"web-uk": 3}, 20, st)
        self.assertEqual(plan["web-uk"], 3)
        self.assertEqual(plan["radar-uk"], 1)
        self.assertLessEqual(sum(plan.values()), 20)

    def test_other_werke_yield_to_lead_min(self):
        other = {l["id"]: 0 for l in self.reg["lanes"] if l["werk"] != "kunden-werk"}
        other.update({"radar-us": 6, "radar-uk": 4, "pruefer": 8, "kontakt": 6})  # Lead-Werk erst bei 10
        plan, why = {"kunden": 12}, {}
        W.yield_to_lead(self.reg, "kunden-werk", plan, why, other, {})
        cap = self.reg["total_slots"] - self.reg["reserve"]
        self.assertEqual(plan["kunden"], cap - 8 - 6 - W.LEAD_MIN_PREMIUM)
        self.assertIn(W.LEAD_MIN_WHY, why["kunden"])
        # festgesetzt bleibt, und nie unter 1
        plan = {"kunden": 12}
        W.yield_to_lead(self.reg, "kunden-werk", plan, {}, other, {"kunden": 12})
        self.assertEqual(plan["kunden"], 12)
        plan = {"kunden": 5}
        W.yield_to_lead(self.reg, "kunden-werk", plan, {}, {**other, "pruefer": 8, "kontakt": 16}, {})
        self.assertEqual(plan["kunden"], 1)
        self.assertEqual(W.yield_to_lead(self.reg, "pruefer-werk", {"pruefer": 8}, {}, other, {}), 0)

    def test_decide_owner_plan_reaches_lead_min(self):
        sp = {"radar": 2, "radar-uk": 4, "radar-us": 6, "fmcsa-us": 2, "s2-ukfr": 2, "web-uk": 3, "web-fr": 3,
              "kunden": 4, "pruefer": 8, "kontakt": 4}
        sp.update({l["id"]: 0 for l in self.reg["lanes"] if l["id"] not in sp})
        settings = {"slot_plan": sp, "slot_autopilot": {"on": True, "locks": {}}, "lead_mix": {"premium_pct": 100}}
        res = W.decide(self.reg, "lead-werk", {"settings": settings, "rows": [], "db_bytes": int(5.4 * W.GB)})
        self.assertGreaterEqual(sum(res["plan"].values()), W.LEAD_MIN_PREMIUM)
        self.assertLessEqual(sum(res["plan"].values()) + 16, self.reg["total_slots"] - self.reg["reserve"])
        kun = W.decide(self.reg, "kunden-werk", {"settings": settings, "rows": [], "db_bytes": int(5.4 * W.GB),
                                                 "other": res["plan"]})
        self.assertLessEqual(sum(kun["plan"].values()) + sum(res["plan"].values()) + 12,
                             self.reg["total_slots"] - self.reg["reserve"])

    def test_storage_brake_unchanged(self):
        sp = {l["id"]: 0 for l in self.reg["lanes"]}
        sp.update({"radar-us": 6, "radar-uk": 4, "radar": 2, "web-uk": 6, "web-fr": 6, "kunden": 4, "pruefer": 8})
        settings = {"slot_plan": sp, "slot_autopilot": {"on": True, "locks": {}}}
        res = W.decide(self.reg, "lead-werk", {"settings": settings, "rows": [], "db_bytes": int(6.1 * W.GB)})
        self.assertLessEqual(sum(res["plan"].values()), W.BRAKE_LEAD_MAX)
        res = W.decide(self.reg, "lead-werk", {"settings": settings, "rows": [], "db_bytes": int(7.6 * W.GB)})
        self.assertEqual(sum(res["plan"].values()), 0)
        self.assertEqual((W.BRAKE_LEAD_MAX, dict(W.BRAKE)["drossel"], dict(W.BRAKE)["stopp"]), (8, 6.0, 7.5))
