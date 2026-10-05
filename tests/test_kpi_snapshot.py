"""KPI-Tageswerte (JARVIS-Plan W1-1): deutscher Kalendertag, Upsert je Tag × Land × Segment × Kennzahl, nur bekannte
Kennzahlen, Zeitplan schreibt nur um 23:xx deutscher Zeit, Migration ohne Löschrechte."""
import datetime as dt
import re
import sys
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import kpi_snapshot as K  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc
SCOPE = (["S2"], ["US", "UK", "FR"])


def fake_kpi(args, params):
    out = []
    for c in args["p_countries"]:
        out += [{"country": c, "metric": "leads_lieferbar", "value": 100.0},
                {"country": c, "metric": "freigabe_quote", "value": "0.9888"},
                {"country": c, "metric": "leads_alter_median_tage", "value": None},
                {"country": c, "metric": "unbekannt", "value": 1}]
    return out + [{"country": "ALL", "metric": "mrr_cents", "value": 12900}]


class SnapshotTest(unittest.TestCase):
    def test_berlin_day_and_evening(self):
        # 22:30 UTC im Sommer = 00:30 MESZ des nächsten Tags
        self.assertEqual(K.berlin_day(dt.datetime(2026, 10, 4, 22, 30, tzinfo=UTC)), dt.date(2026, 10, 5))
        self.assertTrue(K.evening(dt.datetime(2026, 10, 4, 21, 50, tzinfo=UTC)))      # 23:50 MESZ
        self.assertFalse(K.evening(dt.datetime(2026, 10, 4, 22, 50, tzinfo=UTC)))     # 00:50 MESZ
        self.assertTrue(K.evening(dt.datetime(2026, 11, 4, 22, 50, tzinfo=UTC)))      # 23:50 MEZ
        self.assertFalse(K.evening(dt.datetime(2026, 11, 4, 21, 50, tzinfo=UTC)))     # 22:50 MEZ

    def test_abschluss_tag_late_runs_close_yesterday(self):
        self.assertEqual(K.abschluss_tag(dt.datetime(2026, 10, 4, 21, 20, tzinfo=UTC)), dt.date(2026, 10, 4))  # 23:20
        self.assertEqual(K.abschluss_tag(dt.datetime(2026, 10, 5, 0, 12, tzinfo=UTC)), dt.date(2026, 10, 4))   # 02:12
        self.assertEqual(K.abschluss_tag(dt.datetime(2026, 10, 5, 3, 59, tzinfo=UTC)), dt.date(2026, 10, 4))   # 05:59
        self.assertIsNone(K.abschluss_tag(dt.datetime(2026, 10, 5, 4, 0, tzinfo=UTC)))                         # 06:00
        self.assertIsNone(K.abschluss_tag(dt.datetime(2026, 10, 5, 20, 59, tzinfo=UTC)))                       # 22:59

    def test_late_run_skips_closed_day(self):
        db = FakeDB()
        db.rpc_handlers["kpi_day"] = fake_kpi
        day = dt.date(2026, 10, 4)
        self.assertFalse(K.abgeschlossen(db, day))
        K.snapshot(db, day, scope=SCOPE, t=dt.datetime(2026, 10, 4, 15, 44, tzinfo=UTC))   # Tageslauf zählt nicht
        self.assertFalse(K.abgeschlossen(db, day))
        K.snapshot(db, day, scope=SCOPE, t=dt.datetime(2026, 10, 4, 21, 25, tzinfo=UTC))   # 23:25 MESZ
        self.assertTrue(K.abgeschlossen(db, day))

    def test_upsert_idempotent(self):
        db = FakeDB()
        db.rpc_handlers["kpi_day"] = fake_kpi
        t = dt.datetime(2026, 10, 4, 21, 50, tzinfo=UTC)
        rows = K.snapshot(db, scope=SCOPE, t=t)
        self.assertEqual([a["p_countries"] for _, a in db.rpcs], [["US"], ["UK"], ["FR"]])
        self.assertEqual(db.rpcs[-1][1]["p_day"], "2026-10-04")
        self.assertEqual(len(rows), 3 * 3 + 1)
        self.assertNotIn("unbekannt", {r["metric"] for r in rows})
        us = {r["metric"]: r["value"] for r in rows if r["country"] == "US"}
        self.assertEqual(us, {"leads_lieferbar": 100, "freigabe_quote": 0.9888, "leads_alter_median_tage": None})
        K.snapshot(db, scope=SCOPE, t=t)
        self.assertEqual(len(db.rows("kpi_daily")), 10)

    def test_zeigen_writes_nothing(self):
        db = FakeDB()
        db.rpc_handlers["kpi_day"] = fake_kpi
        K.snapshot(db, dt.date(2026, 10, 4), scope=SCOPE, write=False)
        self.assertEqual(db.rows("kpi_daily"), [])


class FilesTest(unittest.TestCase):
    def test_workflow_crons_summer_and_winter_not_full_hour(self):
        wf = yaml.safe_load((ROOT / ".github" / "workflows" / "kpi-tag.yml").read_text())
        crons = [c["cron"] for c in wf[True]["schedule"]]
        self.assertEqual(sorted(crons), ["20 21 * * *", "20 22 * * *"])
        self.assertIn("abschluss", wf[True]["workflow_dispatch"]["inputs"])
        run = [s.get("run", "") for s in wf["jobs"]["snapshot"]["steps"] if "kpi_snapshot" in s.get("run", "")][0]
        self.assertIn("--nur-abends", run)
        self.assertIn("inputs.abschluss", run)

    def test_wachhund_holds_kpi_closing(self):
        import wachhund as W
        job = [j for j in W.JOBS if j["wf"] == "kpi-tag.yml"][0]
        self.assertEqual(job["inputs"], {"abschluss": "true"})
        late, _ = W.overdue(job, [], dt.datetime(2026, 10, 5, 21, 45, tzinfo=UTC))      # 23:45 MESZ, kein Lauf
        self.assertTrue(late)
        late, _ = W.overdue(job, [], dt.datetime(2026, 10, 5, 21, 30, tzinfo=UTC))      # 23:30 MESZ, Karenz
        self.assertFalse(late)
        ran = [{"created_at": "2026-10-05T21:21:00Z", "status": "completed"}]
        self.assertFalse(W.overdue(job, ran, dt.datetime(2026, 10, 5, 21, 50, tzinfo=UTC))[0])
        for wf in ("aufraeumen.yml", "premium-s5.yml", "zustellbarkeit.yml"):
            self.assertIn(wf, {j["wf"] for j in W.JOBS})

    def test_kpi_day_retries_on_statement_timeout(self):
        calls, sleeps = [], []

        class DB:
            def rpc(self, fn, args):
                calls.append(args["p_countries"])
                if len(calls) < 3:
                    raise RuntimeError("Supabase POST rpc/kpi_day: 500 {\"code\":\"57014\"}")
                return [{"country": "US", "metric": "leads_neu", "value": 1}]

        rows = K._kpi_day(DB(), dt.date(2026, 10, 5), "S2", "US", sleep=sleeps.append)
        self.assertEqual(len(calls), 3)
        self.assertEqual(sleeps, [20, 40])
        self.assertEqual(rows[0]["metric"], "leads_neu")

    def test_kpi_day_other_errors_and_last_timeout_raise(self):
        class DB:
            def __init__(self, msg):
                self.msg = msg

            def rpc(self, fn, args):
                raise RuntimeError(self.msg)

        with self.assertRaises(RuntimeError):
            K._kpi_day(DB("500 other"), dt.date(2026, 10, 5), "S2", "US", sleep=lambda s: None)
        with self.assertRaises(RuntimeError):
            K._kpi_day(DB("57014"), dt.date(2026, 10, 5), "S2", "US", sleep=lambda s: None)

    def test_migration_non_destructive_with_rls(self):
        sql = next((ROOT / "supabase" / "migrations").glob("*_signalwerk_kpi_daily.sql")).read_text(encoding="utf-8")
        self.assertIn("enable row level security", sql)
        self.assertIn("revoke delete, truncate on signalwerk.kpi_daily from service_role", sql)
        self.assertIsNone(re.search(r"\b(drop table|delete from|truncate table)\b", sql, re.I))
        self.assertIn("check_status = 'ok'", sql)
        for m in K.METRICS:
            self.assertIn(f"'{m}'", sql)


if __name__ == "__main__":
    unittest.main()
