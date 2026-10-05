"""Teile-Läufe (05.10.2026): laufende Linien bekommen freie Teile als weiteren Lauf – Belegung ≥ 30 ohne Doppelarbeit."""
import datetime as dt
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import werk_belegung as B  # noqa: E402
import werk_plan as W  # noqa: E402

NOW = dt.datetime(2026, 10, 5, 4, 0, tzinfo=dt.timezone.utc)


def job(name, status="in_progress"):
    return {"name": name, "status": status}


def res(plan, reasons=None, nach=(), brake="aus"):
    return {"plan": plan, "reasons": reasons or {k: "läuft (40 min je Teil) – unverändert" for k in plan},
            "brake": brake, "nach": set(nach), "autopilot": {"on": True, "locks": {}}}


class Parsing(unittest.TestCase):
    def test_title_and_job(self):
        self.assertEqual(B.title_shards("lead-werk · Linie web-us · Teile 3,4,15"), (True, [3, 4, 15]))
        self.assertEqual(B.title_shards("lead-werk · Teile"), (True, []))
        self.assertEqual(B.title_shards("lead-werk · Linie web-us"), (False, []))
        self.assertEqual(B.title_lanes("lead-werk · Linie web-us · Teile 3,4"), {"web-us"})
        self.assertIsNone(B.title_lanes("lead-werk · Teile"))
        self.assertEqual(B.job_part("holen (web-us-17, 40, --segments S2 …)"), ("web-us", 17))
        self.assertEqual(B.job_part("holen (s1-us-lca-0, 16, x)"), ("s1-us-lca", 0))
        self.assertIsNone(B.job_part("plan"))


class Claims(unittest.TestCase):
    ALL = {"web-us", "web-uk", "s2-ukfr"}

    def test_new_run_claims_title_then_active_jobs(self):
        run = {"id": 5, "status": "queued", "display_title": "lead-werk · Linie web-us · Teile 2,3"}
        self.assertEqual(B.run_shards(run, [job("plan")], self.ALL), ({"web-us": {2, 3}}, True))
        jobs = [job("plan", "completed"), job("holen (web-us-2, 40, x)", "completed"), job("holen (web-us-3, 40, x)")]
        self.assertEqual(B.run_shards(run, jobs, self.ALL), ({"web-us": {3}}, True))  # fertiger Teil ist frei

    def test_old_and_unknown_runs_claim_whole_lane(self):
        old = {"id": 1, "status": "in_progress", "display_title": "lead-werk · Linie web-us"}
        self.assertEqual(B.run_shards(old, [job("holen (web-us-0, 40, x)")], self.ALL), ({"web-us": None}, True))
        full = {"id": 2, "status": "queued", "display_title": "lead-werk · Teile"}
        c, clear = B.run_shards(full, [job("plan")], self.ALL)
        self.assertEqual(c, {k: None for k in self.ALL})
        self.assertFalse(clear)

    def test_others_older_wins(self):
        runs = [{"id": 3, "status": "queued", "display_title": "lead-werk · Linie web-us · Teile 0,1"},
                {"id": 9, "status": "in_progress", "display_title": "lead-werk · Linie web-us · Teile 5"},
                {"id": 4, "status": "in_progress", "display_title": "lead-werk · Linie web-uk"}]
        jobs = {3: [], 9: [job("holen (web-us-5, 40, x)")], 4: [job("holen (web-uk-0, 40, x)")]}
        taken, clear = B.shards_taken_by_others(7, runs, lambda r: jobs[r], self.ALL)
        self.assertEqual(taken, {"web-us": {0, 1, 5}, "web-uk": None})
        self.assertTrue(clear)


class Pick(unittest.TestCase):
    def setUp(self):
        self.reg = W.load_lines()
        self.k = {l["id"]: W.lane_k(l) for l in self.reg["lanes"]}

    def test_never_a_claimed_part_lru_first(self):
        last = {("web-us", 0): "2026-10-05T03:00:00Z", ("web-us", 1): "2026-10-05T01:00:00Z"}
        got = W.pick_shards(self.reg, {"web-us": 3}, {"web-us": {2, 3}}, None, last)
        self.assertEqual(got, {"web-us": [4, 5, 6]})  # nie genutzte zuerst, 2/3 laufen
        got = W.pick_shards(self.reg, {"web-us": self.k["web-us"]}, {"web-us": {2, 3}}, None, last)
        self.assertEqual(len(got["web-us"]), self.k["web-us"] - 2)
        self.assertFalse({2, 3} & set(got["web-us"]))
        self.assertEqual(W.pick_shards(self.reg, {"web-us": 3}, {"web-us": None}), {})
        self.assertEqual(W.pick_shards(self.reg, {"web-us": 3}, {"web-us": {4}}, {"web-us": [4, 5, 99]}),
                         {"web-us": [5]})  # gewünscht, aber belegt bzw. außerhalb K -> fällt weg

    def test_last_used_from_titles(self):
        recent = [{"display_title": "lead-werk · Linie web-us · Teile 1,2", "created_at": "2026-10-05T02:00:00Z"},
                  {"display_title": "lead-werk · Linie web-us", "created_at": "2026-10-05T03:00:00Z"}]
        self.assertEqual(B.shard_last_used(recent), {("web-us", 1): "2026-10-05T02:00:00Z",
                                                     ("web-us", 2): "2026-10-05T02:00:00Z"})

    def test_matrix_fixed_split(self):
        rows = W.matrix(self.reg, "lead-werk", {"web-us": 2}, "", {"web-us": [4, 7]})
        self.assertEqual([r["name"] for r in rows], ["web-us-4", "web-us-7"])
        k = self.k["web-us"]
        self.assertTrue(rows[0]["args"].endswith(f"--shard 4/{k}"))
        for l in self.reg["lanes"]:
            if l["werk"] == "lead-werk":
                self.assertLessEqual(W.lane_k(l), 21)  # lead-werk.yml lädt das Gedächtnis der Teile 0 … 20


class GapFill(unittest.TestCase):
    def setUp(self):
        self.reg = W.load_lines()

    def test_running_lane_gets_free_parts(self):
        # web-us läuft mit 1 Teil, Plan 15 -> 14 weitere Teile, nie der laufende
        start, _ = B.fill_plan(self.reg, res({"web-us": 15}), {}, {"web-us": {0}}, busy=20, now=NOW)
        self.assertEqual(start, {"web-us": 14})
        shards = B.choose_shards(self.reg, start, {"web-us": {0}}, [])
        self.assertNotIn(0, shards["web-us"])
        self.assertEqual(len(shards["web-us"]), 14)

    def test_fill_to_30_nachrang_last(self):
        # Nacht 05.10.: 18 belegt, alle Linien laufen mit wenigen Teilen -> bis 30 auffüllen, UK/FR zuerst
        r = res({"web-us": 1, "web-uk": 1, "web-fr": 1, "s2-ukfr": 6, "radar": 2},
                {"web-us": "voll ausgelastet – Länder-Vorrang UK/FR vor US", "web-uk": "läuft (39 min je Teil)",
                 "web-fr": "läuft (38 min je Teil)", "s2-ukfr": "voll ausgelastet", "radar": "läuft"},
                nach={"web-us"})
        claims = {"web-us": {0}, "web-uk": {0}, "web-fr": {0}, "s2-ukfr": {0, 1, 2, 3, 4, 5}, "radar": {0, 1}}
        start, _ = B.fill_plan(self.reg, r, {}, claims, busy=18, now=NOW)
        self.assertEqual(18 + sum(start.values()), 30)
        self.assertNotIn("web-us", start)   # Vorrang-Linien haben genug freie Teile
        self.assertNotIn("s2-ukfr", start)  # alle 6 Teile laufen
        # sind UK/FR erschöpft (ruhen), ist web-us der Puffer
        stats = {k: {"max_last": 2, "green_last": 0, "last_end": "2026-10-05T03:50:00+00:00"} for k in ("web-uk", "web-fr")}
        start, _ = B.fill_plan(self.reg, r, stats, claims, busy=18, now=NOW)
        self.assertEqual(start, {"web-us": 12})

    def test_limits(self):
        r = res({"web-us": 21, "web-uk": 21})
        start, _ = B.fill_plan(self.reg, r, {}, {"web-us": {0}}, busy=30, now=NOW)
        self.assertEqual(30 + sum(start.values()), self.reg["total_slots"] - self.reg["reserve"])
        self.assertEqual(B.fill_plan(self.reg, r, {}, {"web-us": None}, busy=38, now=NOW)[0], {})
        # alte Läufe belegen die ganze Linie -> nie daneben starten
        self.assertEqual(B.fill_plan(self.reg, r, {}, {"web-us": None, "web-uk": None}, busy=2, now=NOW)[0], {})
        # Speicher-Bremse: keine Zusatzplätze über den Plan
        start, _ = B.fill_plan(self.reg, res({"web-uk": 2}, brake="drossel"), {}, {"web-uk": {0}}, busy=2, now=NOW)
        self.assertEqual(start, {"web-uk": 1})


class Workflow(unittest.TestCase):
    def test_lead_werk_shards_input(self):
        wf = yaml.safe_load((ROOT / ".github" / "workflows" / "lead-werk.yml").read_text())
        self.assertIn("shards", wf[True]["workflow_dispatch"]["inputs"])
        self.assertIn("· Teile", wf["run-name"])
        self.assertIn('--shards "$SHARDS"', wf["jobs"]["plan"]["steps"][-1]["run"])


if __name__ == "__main__":
    unittest.main()
