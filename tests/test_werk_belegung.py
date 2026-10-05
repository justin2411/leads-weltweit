"""Nachfüller der Werke: Belegung lückenlos ≥ 30 (Inhaber 05.10.2026), ohne Grenzen zu lockern."""
import datetime as dt
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import werk_belegung as B  # noqa: E402
import werk_plan as W  # noqa: E402

NOW = dt.datetime(2026, 10, 5, 0, 0, tzinfo=dt.timezone.utc)
LEAD = None


def job(name, status="in_progress"):
    return {"name": name, "status": status}


def res(plan, reasons=None, brake="aus", nach=(), locks=None):
    return {"plan": plan, "reasons": reasons or {k: "läuft (30 min je Teil) – unverändert" for k in plan},
            "brake": brake, "nach": set(nach), "autopilot": {"on": True, "locks": locks or {}}}


class LaneParsing(unittest.TestCase):
    def test_job_and_title_lanes(self):
        self.assertEqual(B.job_lane("holen (web-us-3, 40, --segments S2 --countries US)"), "web-us")
        self.assertEqual(B.job_lane("holen (s1-us-lca-0, 16, --segments S1)"), "s1-us-lca")
        self.assertIsNone(B.job_lane("plan"))
        self.assertEqual(B.title_lanes("lead-werk · Linie web-north"), {"web-north"})
        self.assertIsNone(B.title_lanes("lead-werk"))
        self.assertEqual(B.parse_teile("web-us:3, s2-ukfr:6,kaputt,x:"), {"web-us": 3, "s2-ukfr": 6})


class Claims(unittest.TestCase):
    ALL = {"web-us", "s2-ukfr", "web-north"}

    def test_alle_run_claims_only_active_lanes_after_plan(self):
        run = {"id": 1, "status": "in_progress", "display_title": "lead-werk"}
        jobs = [job("plan", "in_progress")]
        self.assertEqual(B.run_claim(run, jobs, self.ALL), (self.ALL, False))  # Plan offen = alles belegt
        jobs = [{"name": "plan", "status": "completed"}, job("holen (s2-ukfr-0, 32, x)"),
                job("holen (web-north-0, 40, x)", "completed")]
        self.assertEqual(B.run_claim(run, jobs, self.ALL), ({"s2-ukfr"}, True))  # fertige Linie ist frei

    def test_older_run_wins_newer_only_with_started_jobs(self):
        runs = [{"id": 5, "status": "queued", "display_title": "lead-werk · Linie web-us"},
                {"id": 9, "status": "in_progress", "display_title": "lead-werk · Linie s2-ukfr"},
                {"id": 3, "status": "completed", "display_title": "lead-werk · Linie web-north"}]
        jobs = {5: [], 9: [job("holen (s2-ukfr-0, 32, x)")]}
        taken, clear = B.lanes_taken_by_others(7, runs, lambda r: jobs.get(r, []), self.ALL)
        self.assertEqual(taken, {"web-us", "s2-ukfr"})
        self.assertTrue(clear)
        # jüngerer Lauf ohne gestartete Jobs zählt nicht (er weicht selbst aus)
        taken, _ = B.lanes_taken_by_others(7, runs, lambda r: {5: [], 9: []}.get(r, []), self.ALL)
        self.assertEqual(taken, {"web-us"})

    def test_busy_jobs_counts_running_and_waiting(self):
        runs = [{"id": 1, "status": "in_progress"}, {"id": 2, "status": "completed"}]
        jobs = {1: [job("a"), job("b", "queued"), job("c", "completed")], 2: [job("d")]}
        self.assertEqual(B.busy_jobs(runs, lambda r: jobs[r]), 2)


class FillPlan(unittest.TestCase):
    def setUp(self):
        self.reg = W.load_lines()
        self.mx = {l["id"]: l["max"] for l in self.reg["lanes"]}

    def test_starts_free_lanes_and_fills_to_30(self):
        r = res({"web-us": 1, "s2-ukfr": 6, "web-north": 4, "s2-neu": 4, "s1-us-lca": 1},
                {"web-us": "voll – Länder-Vorrang UK/FR vor US", "s2-ukfr": "voll ausgelastet",
                 "web-north": "läuft (18 min je Teil) – unverändert", "s2-neu": "läuft (28 min je Teil)",
                 "s1-us-lca": "Quelle durchgeprüft (Ø 2 min) – 1 Wachplatz"}, nach={"web-us", "s2-us"})
        stats = {"web-north": {"cand_last": 900, "green_last": 50, "max_last": 18, "last_end": "2026-10-04T23:50:00+00:00"}}
        start, _ = B.fill_plan(self.reg, r, stats, busy_lanes={"s2-ukfr"}, busy=12, now=NOW)
        self.assertNotIn("s2-ukfr", start)              # läuft schon -> nie doppelt
        self.assertEqual(start["web-us"], 1)            # Nachrang-Linie: keine Zusatzplätze
        self.assertEqual(start["s1-us-lca"], 1)         # Wachplatz bleibt 1
        self.assertEqual(12 + sum(start.values()), 30)  # genau bis zur Mindestbelegung
        self.assertLessEqual(start["web-north"], self.mx["web-north"])
        self.assertEqual(start["s2-neu"], 4)            # max 4

    def test_never_over_total_slots(self):
        r = res({"web-north": 10, "s2-neu": 4})
        start, _ = B.fill_plan(self.reg, r, {}, set(), busy=33, now=NOW)
        self.assertLessEqual(33 + sum(start.values()), self.reg["total_slots"] - self.reg["reserve"])
        self.assertEqual(B.fill_plan(self.reg, r, {}, set(), busy=38, now=NOW)[0], {})

    def test_brake_and_locks_get_no_extra(self):
        r = res({"web-north": 2}, brake="drossel")
        self.assertEqual(B.fill_plan(self.reg, r, {}, set(), busy=5, now=NOW)[0], {"web-north": 2})
        self.assertEqual(B.fill_plan(self.reg, res({"web-north": 0}, brake="stopp"), {}, set(), busy=0, now=NOW)[0], {})
        r = res({"web-north": 2}, locks={"web-north": 2})
        self.assertEqual(B.fill_plan(self.reg, r, {}, set(), busy=5, now=NOW)[0], {"web-north": 2})

    def test_short_lane_without_yield_rests(self):
        r = res({"web-uk": 1, "web-north": 1})
        stats = {"web-uk": {"max_last": 2, "green_last": 0, "last_end": "2026-10-04T23:40:00+00:00"},
                 "web-north": {"max_last": 2, "green_last": 0, "last_end": "2026-10-04T22:40:00+00:00"}}
        start, _ = B.fill_plan(self.reg, r, stats, set(), busy=40 - 2 - 2, now=NOW)
        self.assertNotIn("web-uk", start)   # vor 20 min kurz und leer -> ruht 60 min
        self.assertIn("web-north", start)   # vor 80 min -> wieder dran

    def test_crash_loop_guard(self):
        recent = [{"display_title": "lead-werk · Linie web-north", "status": "completed",
                   "created_at": "2026-10-04T23:50:00Z", "run_started_at": "2026-10-04T23:50:00Z",
                   "updated_at": "2026-10-04T23:53:00Z"}]
        self.assertTrue(B.recently_short("web-north", recent, NOW))
        self.assertFalse(B.recently_short("web-us", recent, NOW))
        self.assertFalse(B.recently_short("web-north", recent, NOW + dt.timedelta(minutes=15)))
        start, _ = B.fill_plan(self.reg, res({"web-north": 3}), {}, set(), busy=36, now=NOW, recent=recent)
        self.assertEqual(start, {})


class RunCounts(unittest.TestCase):
    def setUp(self):
        self.reg = W.load_lines()

    def test_only_requested_lanes_never_taken_never_over_max(self):
        r = res({"web-us": 1, "web-north": 4, "s2-neu": 4})
        out, note = W.run_counts(self.reg, r, {"web-north": 99}, set())
        self.assertEqual(out["web-north"], 21)
        self.assertEqual(sum(out.values()), 21)
        out, note = W.run_counts(self.reg, r, {"web-north": 3}, {"web-north"})
        self.assertEqual(sum(out.values()), 0)
        self.assertIn("web-north", note)
        out, _ = W.run_counts(self.reg, r, None, {"web-us"})       # Lauf für alle: belegte Linie fällt weg
        self.assertEqual(out["web-us"], 0)
        self.assertEqual(out["s2-neu"], 4)

    def test_brake_limits_lane_runs(self):
        out, _ = W.run_counts(self.reg, res({"web-north": 2}, brake="drossel"), {"web-north": 10}, set())
        self.assertEqual(out["web-north"], 2)
        out, _ = W.run_counts(self.reg, res({"web-north": 0}, brake="stopp"), {"web-north": 10}, set())
        self.assertEqual(sum(out.values()), 0)

    def test_decide_reports_nach_lanes(self):
        lanes = W.nach_lanes(self.reg, {"segment": "S2", "vor": ["UK", "FR"], "nach": ["US"], "faktor": 3},
                             {"US": 446000, "UK": 92000, "FR": 69000})
        self.assertIn("web-us", lanes)
        self.assertIn("s2-us", lanes)
        self.assertNotIn("s1-us-lca", lanes)
        self.assertNotIn("s2-ukfr", lanes)
        self.assertEqual(W.nach_lanes(self.reg, None, None), set())


def _wf(name):
    return yaml.safe_load((ROOT / ".github" / "workflows" / name).read_text())


class Workflows(unittest.TestCase):
    def test_lead_werk_lane_runs(self):
        wf = _wf("lead-werk.yml")
        self.assertIn("linien", wf[True]["workflow_dispatch"]["inputs"])
        self.assertIn("teile", wf[True]["workflow_dispatch"]["inputs"])
        self.assertIn("Linie", wf["run-name"])
        self.assertIn("'lead-werk'", wf["concurrency"]["group"])  # Läufe für alle Linien weiter nacheinander
        plan = wf["jobs"]["plan"]
        self.assertEqual(plan["permissions"]["actions"], "read")
        self.assertIn("--github", plan["steps"][-1]["run"])
        self.assertIn("werk-nachfuellen.yml", wf["jobs"]["weiter"]["steps"][-1]["run"])

    def test_nachfueller_and_kicks(self):
        wf = _wf("werk-nachfuellen.yml")
        self.assertEqual(wf["concurrency"]["group"], "werk-nachfuellen")
        self.assertEqual(wf["permissions"]["actions"], "write")
        run = " ".join(s.get("run", "") for s in wf["jobs"]["nachfuellen"]["steps"])
        self.assertIn("werk_belegung.py nachfuellen --apply", run)
        self.assertNotIn("send", run)
        for name in ("kunden-werk.yml", "pruefer-werk.yml"):
            steps = _wf(name)["jobs"]["weiter"]["steps"]
            self.assertTrue(any("werk-nachfuellen.yml" in (s.get("run") or "") for s in steps), name)
        import wachhund
        job = next(j for j in wachhund.JOBS if j["wf"] == "werk-nachfuellen.yml")
        self.assertEqual(job["cond"], "lead_suche")
        self.assertEqual(wachhund.PAUSE_KEY["werk-nachfuellen.yml"], "lead-werk")

    def test_kunden_pool_uses_existing_cache(self):
        pool = _wf("kunden-werk.yml")["jobs"]["pool"]
        cache = next(s for s in pool["steps"] if s.get("id") == "cache")
        self.assertEqual(cache["uses"], "actions/cache/restore@v4")
        self.assertEqual(cache["with"]["restore-keys"], "kunden-pool-v10-")
        self.assertIn("kunden-pool.yml", next(s for s in pool["steps"] if s.get("id") == "key")["run"])
        pr = _wf("kunden-werk.yml")["jobs"]["pruefen"]["steps"]
        self.assertTrue(any(s.get("with", {}).get("key") == "${{ needs.pool.outputs.pool_key }}" for s in pr))
        self.assertIn("kunden-pool-v10-", str(_wf("kunden-pool.yml")))


class OtherWerke(unittest.TestCase):
    """Nachfüller deckt alle Werke ab (05.10.2026: nachts lagen kunden/kontakt/pruefer brach, 11 Jobs belegt)."""
    REG = W.load_lines()

    def w(self, werk, lane, plan, active=False, ok=True, why=""):
        return {"werk": werk, "lane": lane, "plan": plan, "active": active, "ok": ok, "why": why}

    def test_brach_liegende_werke_starten_puffer_kunden(self):
        werke = [self.w("kunden-werk", "kunden", 14), self.w("kontakt-werk", "kontakt", 6),
                 self.w("pruefer-werk", "pruefer", 6)]
        start, why = B.other_plan(werke, self.REG, busy=1, lead_sum=0)
        self.assertEqual(start["kontakt-werk"], 6)
        self.assertEqual(start["pruefer-werk"], 6)
        self.assertEqual(start["kunden-werk"], 16)  # 14 + Puffer, nie über max 16
        self.assertIn(W.MIN_WHY, why["kunden-werk"])

    def test_puffer_nur_bis_mindestbelegung(self):
        start, _ = B.other_plan([self.w("kunden-werk", "kunden", 4)], self.REG, busy=20, lead_sum=0)
        self.assertEqual(start["kunden-werk"], 10)  # 20 + 10 = 30

    def test_nie_doppelt_pause_null_plaetze(self):
        werke = [self.w("kunden-werk", "kunden", 14, active=True),
                 self.w("kontakt-werk", "kontakt", 6, ok=False, why="pausiert durch Inhaber"),
                 self.w("pruefer-werk", "pruefer", 0)]
        start, why = B.other_plan(werke, self.REG, busy=5, lead_sum=0)
        self.assertEqual(start, {})
        self.assertIn("läuft", why["kunden-werk"])
        self.assertIn("pausiert", why["kontakt-werk"])
        self.assertIn("0 Plätze", why["pruefer-werk"])

    def test_nie_ueber_summe(self):
        cap = self.REG["total_slots"] - self.REG["reserve"]
        werke = [self.w("kunden-werk", "kunden", 14), self.w("kontakt-werk", "kontakt", 6)]
        start, _ = B.other_plan(werke, self.REG, busy=cap - 8, lead_sum=0)
        self.assertEqual(sum(start.values()), 8)

    def test_lead_starts_zaehlen_mit(self):
        start, _ = B.other_plan([self.w("kunden-werk", "kunden", 4)], self.REG, busy=10, lead_sum=20)
        self.assertEqual(start["kunden-werk"], 4)  # 10 + 20 + 4 >= 30: kein Puffer

    def test_allowed(self):
        on = "lead_suche: true\nkunden_suche: true\n"
        self.assertEqual(B.other_allowed("kunden-werk", {"werke_paused": {}}, on), (True, ""))
        self.assertFalse(B.other_allowed("kunden-werk", None, on)[0])
        self.assertFalse(B.other_allowed("kontakt-werk", {"werke_paused": {"kontakt-werk": "x"}}, on)[0])
        self.assertFalse(B.other_allowed("kunden-werk", {"werke_paused": {}}, "kunden_suche: false\n")[0])
        self.assertTrue(B.other_allowed("pruefer-werk", {"werke_paused": {}}, "kunden_suche: false\n")[0])

    def test_buffer_teile_nur_mehr_nie_ueber_max_nie_bei_null(self):
        r = {"plan": {"kunden": 4}, "reasons": {"kunden": "x"}, "autopilot": {"locks": {}}}
        W.buffer_teile(self.REG, "kunden-werk", r, {"kunden": 40})
        self.assertEqual(r["plan"]["kunden"], 16)
        r = {"plan": {"kunden": 10}, "reasons": {}, "autopilot": {"locks": {}}}
        W.buffer_teile(self.REG, "kunden-werk", r, {"kunden": 3})
        self.assertEqual(r["plan"]["kunden"], 10)
        r = {"plan": {"kunden": 0}, "reasons": {}, "autopilot": {"locks": {}}}
        W.buffer_teile(self.REG, "kunden-werk", r, {"kunden": 12})
        self.assertEqual(r["plan"]["kunden"], 0)
        r = {"plan": {"kunden": 4}, "reasons": {}, "autopilot": {"locks": {"kunden": 4}}}
        W.buffer_teile(self.REG, "kunden-werk", r, {"kunden": 12})
        self.assertEqual(r["plan"]["kunden"], 4)

    def test_kunden_workflow_reicht_teile_durch(self):
        txt = (ROOT / ".github" / "workflows" / "kunden-werk.yml").read_text(encoding="utf-8")
        self.assertIn("inputs.teile", txt)
        self.assertIn('--teile "$TEILE"', txt)


if __name__ == "__main__":
    unittest.main()
