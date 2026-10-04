"""Eigene Agenten aus dem Baukasten (scripts/agents_run.py, docs/BAUKASTEN-MASTER.md): Auslöser, Ziele, Protokoll,
Fehler je Agent, Pause, Markt aus dem Text. Nie Versand an Käufer oder Leads."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402

import agents_run as A  # noqa: E402

POOL = "11111111-2222-3333-4444-555555555555"
UTC = dt.timezone.utc


def flow(source="leads", countries=("US",), extra=()):
    nodes = [{"id": "q", "kind": "quelle", "x": 0, "y": 0, "source": source, "segment": "S2", "countries": list(countries),
              "status": ["new"], "size": 2000},
             {"id": "w", "kind": "weiche", "x": 0, "y": 0, "cond": {"f": "hat_telefon", "op": "ja"}},
             {"id": "s", "kind": "speicher", "x": 0, "y": 0, "pool_id": POOL, "pool_name": "Telefon"},
             {"id": "m", "kind": "melden", "x": 0, "y": 0},
             {"id": "a", "kind": "agent", "x": 0, "y": 0, "agent": 2, "task": "pruefen"},
             {"id": "x", "kind": "export", "x": 0, "y": 0}, *extra]
    edges = [{"id": "1", "from": "q", "port": "out", "to": "w"}, {"id": "2", "from": "w", "port": "ja", "to": "s"},
             {"id": "3", "from": "w", "port": "ja", "to": "m"}, {"id": "4", "from": "w", "port": "nein", "to": "a"},
             {"id": "5", "from": "q", "port": "out", "to": "x"}]
    return {"v": 1, "nodes": nodes, "edges": edges}


def rows(n=1500):
    return [{"id": f"l{i:04d}", "firma": f"Firma {i}", "hat_telefon": i % 3 == 0, "land": "US", "segment": "S2"}
            for i in range(n)]


def make_db(agents, flows=None, data=None):
    db = FakeDB({"custom_agents": agents, "flows": flows or [{"id": "f1", "name": "Telefon-Check", "def": flow(),
                                                              "status": "entwurf", "kind": "agent"}],
                 "lead_pools": [{"id": POOL, "name": "Telefon"}], "lead_pool_items": [], "agent_tasks": [],
                 "agent_runs": [], "leads": []})
    data = rows() if data is None else data

    def page(args, params):
        off, lim = int(params.get("offset", 0)), int(params.get("limit", 1000))
        return data[off:off + lim]
    db.rpc_handlers["flow_lead_rows"] = page
    db.rpc_handlers["flow_buyer_rows"] = page
    return db


def agent(**kw):
    return {"id": "abcdef12-0000-0000-0000-000000000000", "name": "Telefon", "flow_id": "f1", "trigger": "stuendlich",
            "at_hour": None, "ai_brief": None, "ai_market": None, "last_run_at": None, "enabled": True,
            "created_at": "2026-10-04T00:00:00Z", **kw}


class DueTest(unittest.TestCase):
    def test_hourly(self):
        # alt 'stuendlich' = alle 1 Stunde zur vollen Stunde deutscher Zeit (12:00 UTC = 14:00 MESZ)
        now = dt.datetime(2026, 10, 4, 12, 5, tzinfo=UTC)
        self.assertTrue(A.due(agent(), now)[0])
        self.assertFalse(A.due(agent(last_run_at="2026-10-04T12:01:00+00:00"), now)[0])
        self.assertTrue(A.due(agent(last_run_at="2026-10-04T11:30:00+00:00"), now)[0])

    def test_daily_in_german_time(self):
        a = agent(trigger="taeglich", at_hour=8)  # 08:00 MESZ = 06:00 UTC
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 4, 5, 59, tzinfo=UTC))[0])
        self.assertTrue(A.due(a, dt.datetime(2026, 10, 4, 6, 0, tzinfo=UTC))[0])
        a["last_run_at"] = "2026-10-04T06:01:00+00:00"
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 4, 20, 0, tzinfo=UTC))[0])
        self.assertTrue(A.due(a, dt.datetime(2026, 10, 5, 6, 5, tzinfo=UTC))[0])
        # Winterzeit: 08:00 MEZ = 07:00 UTC
        w = agent(trigger="taeglich", at_hour=8, last_run_at="2026-11-01T07:00:00+00:00")
        self.assertFalse(A.due(w, dt.datetime(2026, 11, 2, 6, 30, tzinfo=UTC))[0])
        self.assertTrue(A.due(w, dt.datetime(2026, 11, 2, 7, 0, tzinfo=UTC))[0])

    def test_daily_minute_and_weekdays(self):
        # Di–Do 14:15 deutscher Zeit; 06.10.2026 ist ein Dienstag (MESZ: 12:15 UTC)
        a = agent(trigger="taeglich", at_hour=14, at_minute=15, weekdays=[2, 3, 4], last_run_at="2026-10-01T12:20:00+00:00")
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 6, 12, 14, tzinfo=UTC))[0])
        ok, why = A.due(a, dt.datetime(2026, 10, 6, 12, 18, tzinfo=UTC))
        self.assertTrue(ok)
        self.assertIn("Di 14:15", why)
        a["last_run_at"] = "2026-10-06T12:18:00+00:00"
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 6, 12, 33, tzinfo=UTC))[0])   # nie doppelt
        ok, why = A.due(a, dt.datetime(2026, 10, 10, 9, 0, tzinfo=UTC))                # Samstag: Do schon um
        self.assertTrue(ok)                                                            # Do 14:15 verpasst → nachholen
        self.assertIn("Do 14:15", why)
        a["last_run_at"] = "2026-10-08T12:18:00+00:00"
        ok, why = A.due(a, dt.datetime(2026, 10, 11, 9, 0, tzinfo=UTC))                # Sonntag: kein Termin
        self.assertFalse(ok)
        self.assertIn("Di 14:15", why)
        # Minute außerhalb des Rasters wird abgerundet
        self.assertEqual(A.schedule_of(agent(trigger="taeglich", at_hour=9, at_minute=44))["minute"], 30)

    def test_missed_runs_only_once(self):
        a = agent(trigger="alle_stunden", every_hours=1, last_run_at="2026-10-04T06:00:00+00:00")
        now = dt.datetime(2026, 10, 4, 12, 5, tzinfo=UTC)   # sechs Termine verpasst
        self.assertTrue(A.due(a, now)[0])
        a["last_run_at"] = now.isoformat()
        self.assertFalse(A.due(a, now + dt.timedelta(minutes=15))[0])

    def test_every_hours(self):
        # alle 3 Stunden ab 00:00 MESZ: 00, 03, 06, 09, 12, 15 … (15:00 MESZ = 13:00 UTC)
        a = agent(trigger="alle_stunden", every_hours=3, last_run_at="2026-10-04T10:00:00+00:00")  # 12:00 MESZ
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 4, 12, 59, tzinfo=UTC))[0])
        self.assertTrue(A.due(a, dt.datetime(2026, 10, 4, 13, 3, tzinfo=UTC))[0])
        self.assertEqual(A.schedule_of(agent(trigger="alle_stunden", every_hours=5))["every"], 1)  # unbekannt → 1
        self.assertEqual(A.schedule_of(agent(trigger="stuendlich", every_hours=6))["every"], 1)    # alt bleibt stündlich
        # mit Wochentagen: nur Mo–Fr (04.10.2026 = Sonntag)
        b = agent(trigger="alle_stunden", every_hours=2, weekdays=[1, 2, 3, 4, 5], last_run_at="2026-10-02T21:00:00+00:00")
        self.assertFalse(A.due(b, dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC))[0])
        self.assertTrue(A.due(b, dt.datetime(2026, 10, 4, 22, 3, tzinfo=UTC))[0])   # Mo 00:00 MESZ

    def test_dst_switch(self):
        # Herbst 25.10.2026: 03:00 MESZ → 02:00 MEZ. 02:30 gibt es zweimal – nur ein Lauf.
        a = agent(trigger="taeglich", at_hour=2, at_minute=30, last_run_at="2026-10-24T00:31:00+00:00")
        self.assertTrue(A.due(a, dt.datetime(2026, 10, 25, 0, 33, tzinfo=UTC))[0])    # erstes 02:30 (MESZ)
        a["last_run_at"] = "2026-10-25T00:33:00+00:00"
        self.assertFalse(A.due(a, dt.datetime(2026, 10, 25, 1, 33, tzinfo=UTC))[0])   # zweites 02:30 (MEZ)
        # stündlich am Herbsttag: 25 Stunden, aber jeder Termin genau einmal
        h = A.schedule_of(agent(trigger="alle_stunden", every_hours=1))
        self.assertEqual(len(A._slots_on(h, dt.date(2026, 10, 25))), 24)
        # Frühjahr 28.03.2027: 02:00 MEZ → 03:00 MESZ. 02:30 fehlt – läuft einmal nach der Umstellung.
        b = agent(trigger="taeglich", at_hour=2, at_minute=30, last_run_at="2027-03-27T01:31:00+00:00")
        self.assertFalse(A.due(b, dt.datetime(2027, 3, 28, 0, 59, tzinfo=UTC))[0])
        self.assertTrue(A.due(b, dt.datetime(2027, 3, 28, 1, 33, tzinfo=UTC))[0])
        b["last_run_at"] = "2027-03-28T01:33:00+00:00"
        self.assertFalse(A.due(b, dt.datetime(2027, 3, 28, 20, 0, tzinfo=UTC))[0])
        # 08:00 Ortszeit bleibt 08:00 über die Umstellung (vorher 06:00 UTC, danach 07:00 UTC)
        c = agent(trigger="taeglich", at_hour=8, last_run_at="2026-10-24T06:00:00+00:00")
        self.assertFalse(A.due(c, dt.datetime(2026, 10, 25, 6, 30, tzinfo=UTC))[0])
        self.assertTrue(A.due(c, dt.datetime(2026, 10, 25, 7, 3, tzinfo=UTC))[0])

    def test_new_agent_waits_for_first_slot(self):
        a = agent(trigger="taeglich", at_hour=7, created_at="2026-10-04T18:00:00+00:00")   # 20:00 MESZ angelegt
        ok, why = A.due(a, dt.datetime(2026, 10, 4, 18, 3, tzinfo=UTC))
        self.assertFalse(ok)
        self.assertIn("Mo 07:00", why)
        self.assertTrue(A.due(a, dt.datetime(2026, 10, 5, 5, 3, tzinfo=UTC))[0])

    def test_new_leads(self):
        now = dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
        a = agent(trigger="neue_leads", last_run_at="2026-10-04T10:00:00+00:00")
        self.assertFalse(A.due(a, now, lambda _: False)[0])
        self.assertTrue(A.due(a, now, lambda _: True)[0])
        db = FakeDB({"leads": [{"id": "l1", "segment_id": "S2", "country": "US", "created_at": "2026-10-04T11:00:00+00:00"}]})
        self.assertTrue(A.has_new_leads(db, a, flow()))
        self.assertFalse(A.has_new_leads(db, a, flow(countries=("UK",))))


class MarketTest(unittest.TestCase):
    def test_guess_market_and_kind(self):
        self.assertEqual(A.guess_market("er soll uk käufer finden"), "UK")
        self.assertEqual(A.guess_market("Käufer in Großbritannien"), "UK")
        self.assertEqual(A.guess_market("neue Quelle für Frankreich"), "FR")
        self.assertIsNone(A.guess_market("find buyers for us"))   # englisches „us“ ist kein Markt
        self.assertIsNone(A.guess_market("UK und Frankreich"))    # nicht eindeutig
        self.assertEqual(A.guess_kind("uk käufer finden"), "kaeufer")
        self.assertEqual(A.guess_kind("neue Quelle suchen"), "quelle")
        self.assertEqual(A.guess_kind("Stichprobe prüfen"), "pruefen")
        self.assertEqual(A.guess_kind("wie läuft es"), "frage")

    def test_market_order(self):
        self.assertEqual(A.market_of(agent(ai_market="fr"), {"countries": ["US"]}, "UK"), "FR")
        self.assertEqual(A.market_of(agent(), {"countries": ["US"]}, "uk käufer"), "US")
        self.assertEqual(A.market_of(agent(), {"countries": []}, "uk käufer"), "UK")


class RunTest(unittest.TestCase):
    def run_agents(self, db, apply=True, now=None):
        with mock.patch.object(A, "notify_owner", return_value=True) as note:
            st = A.run(db, apply, log=lambda *_: None, now=now or dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC))
        return st, note

    def test_targets(self):
        db = make_db([agent()])
        st, note = self.run_agents(db)
        self.assertEqual(st, {"faellig": 1, "ok": 1, "fehler": 0})
        n_tel = sum(1 for r in rows() if r["hat_telefon"])
        items = db.rows("lead_pool_items")
        self.assertEqual(len(items), n_tel)
        self.assertEqual({i["added_by"] for i in items}, {"agent:abcdef12"})
        note.assert_called_once()
        self.assertIn(f"{n_tel} Leads", note.call_args[0][0])
        task = db.rows("agent_tasks")[0]
        self.assertEqual((task["agent"], task["kind"], task["market"], task["status"] if "status" in task else "offen"),
                         (2, "pruefen", "US", "offen"))
        self.assertLessEqual(len(task["brief"]), 1000)
        self.assertIn("1.500 Zeilen", task["brief"])
        run = db.rows("agent_runs")[0]
        self.assertEqual(run["rows_in"], 1500)
        self.assertIsNone(run["error"])
        self.assertEqual(len(run["result"]["ziele"]["x"]["ids"]), 1500)
        last = db.rows("custom_agents")[0]
        self.assertTrue(last["last_run_at"])
        self.assertNotIn("ids", last["last_result"]["ziele"]["x"])
        # Seitenweise geladen (PostgREST höchstens 1000 je Abruf)
        calls = [a for f, a in db.rpcs if f == "flow_lead_rows"]
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["p_countries"], ["US"])

    def test_claim_prevents_double_run(self):
        db = make_db([agent()])
        a = dict(db.rows("custom_agents")[0])
        self.assertTrue(A.claim(db, dict(a), "2026-10-04T12:00:00+00:00"))
        self.assertFalse(A.claim(db, dict(a), "2026-10-04T12:00:05+00:00"))   # anderer Lauf las den alten Stand
        stale = dict(a)
        with mock.patch.object(db, "select", side_effect=lambda t, p=None: [stale] if t == "custom_agents" else FakeDB.select(db, t, p)):
            st, _ = self.run_agents(db)
        self.assertEqual(st["faellig"], 0)
        self.assertEqual(db.rows("agent_runs"), [])

    def test_count_due(self):
        db = make_db([agent(), agent(id="x2", trigger="taeglich", at_hour=23),
                      agent(id="x3", trigger="neue_leads", last_run_at="2026-10-04T10:00:00+00:00")])
        now = dt.datetime(2026, 10, 4, 12, 5, tzinfo=UTC)
        self.assertEqual(A.count_due(db, now, log=lambda *_: None), 1)          # keine neuen Leads → nur der stündliche
        db.tables["leads"].append({"id": "l1", "segment_id": "S2", "country": "US", "created_at": "2026-10-04T11:00:00+00:00"})
        self.assertEqual(A.count_due(db, now, log=lambda *_: None), 2)

    def test_second_run_idempotent_and_no_task_pile(self):
        db = make_db([agent()])
        self.run_agents(db)
        db.rows("custom_agents")[0]["last_run_at"] = "2026-10-04T10:00:00+00:00"
        self.run_agents(db)
        self.assertEqual(len(db.rows("agent_tasks")), 1)  # letzter Auftrag noch offen
        self.assertEqual(len(db.rows("lead_pool_items")), sum(1 for r in rows() if r["hat_telefon"]))

    def test_error_isolated(self):
        db = make_db([agent(id="bad00000-0", flow_id="nope"), agent()])
        st, _ = self.run_agents(db)
        self.assertEqual(st, {"faellig": 2, "ok": 1, "fehler": 1})
        errs = [r["error"] for r in db.rows("agent_runs") if r.get("error")]
        self.assertEqual(len(errs), 1)
        self.assertIn("Flow fehlt", errs[0])
        self.assertIn("error", db.rows("custom_agents")[0]["last_result"])

    def test_ai_brief_market_from_text(self):
        f = flow(countries=())
        f["nodes"] = [n for n in f["nodes"] if n["kind"] != "agent"]
        db = make_db([agent(ai_brief="Bitte UK Käufer finden, die zu diesen Leads passen")],
                     flows=[{"id": "f1", "name": "x", "def": f, "status": "entwurf", "kind": "agent"}])
        self.run_agents(db)
        t = db.rows("agent_tasks")[0]
        self.assertEqual((t["agent"], t["kind"], t["market"]), (1, "kaeufer", "UK"))
        self.assertTrue(t["brief"].startswith("Bitte UK Käufer finden"))

    def test_buyers_never_go_to_pool(self):
        db = make_db([agent()], flows=[{"id": "f1", "name": "x", "def": flow(source="kaeufer"), "status": "entwurf", "kind": "agent"}])
        self.run_agents(db)
        self.assertEqual(db.rows("lead_pool_items"), [])
        self.assertTrue(any(f == "flow_buyer_rows" for f, _ in db.rpcs))

    def test_probelauf_writes_nothing(self):
        db = make_db([agent()])
        st, note = self.run_agents(db, apply=False)
        self.assertEqual(st["ok"], 1)
        note.assert_not_called()
        for t in ("lead_pool_items", "agent_tasks", "agent_runs"):
            self.assertEqual(db.rows(t), [], t)
        self.assertIsNone(db.rows("custom_agents")[0]["last_run_at"])

    def test_unknown_node_is_error(self):
        db = make_db([agent()], flows=[{"id": "f1", "name": "x", "def": flow(extra=({"id": "z", "kind": "versand", "x": 0, "y": 0},)),
                                        "status": "entwurf", "kind": "agent"}])
        st, _ = self.run_agents(db)
        self.assertEqual(st["fehler"], 1)
        self.assertEqual(db.rows("lead_pool_items"), [])

    def test_paused(self):
        db = FakeDB({"owner_settings": [{"key": "werke_paused", "value": {"agenten": "2026-10-04T09:00:00Z"}}]})
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(A, "run") as r:
            self.assertEqual(A.main(["--apply"]), 0)
        r.assert_not_called()


class WiringTest(unittest.TestCase):
    def test_workflow_watchdog_tagescheck_switches(self):
        import tagescheck
        import wachhund
        from lib import owner_settings
        wf = yaml.safe_load((ROOT / ".github" / "workflows" / "agenten-werk.yml").read_text())
        steps = wf["jobs"]["run"]["steps"]
        runs = " ".join(s.get("run") or "" for s in steps)
        self.assertIn("scripts/pools.py fill $APPLY", runs)
        self.assertIn("gh workflow run wachhund.yml", runs)
        self.assertEqual(wf["jobs"]["run"]["permissions"]["actions"], "write")
        cron = wf[True]["schedule"][0]["cron"]
        self.assertEqual(int(cron.split()[0]) % 2, 1)
        self.assertIn(f"github.event.schedule == '{cron}'", wf["jobs"]["run"]["if"])
        # eigene Agenten alle 15 min, Vorab-Check beendet ohne fälligen Agenten sofort
        quick = wf[True]["schedule"][1]["cron"]
        mins = [int(m) for m in quick.split()[0].split(",")]
        self.assertEqual(len(mins), 4)
        self.assertEqual({(b - a) for a, b in zip(mins, mins[1:])}, {15})
        self.assertEqual(quick.split()[1:], ["*", "*", "*", "*"])
        ag = wf["jobs"]["agenten"]
        self.assertIn(f"github.event.schedule != '{cron}'", ag["if"])
        aruns = [s.get("run") or "" for s in ag["steps"]]
        self.assertTrue(any("agents_run.py --faellig" in r for r in aruns))
        self.assertTrue(any("scripts/agents_run.py $APPLY" in r for r in aruns))
        gated = [s for s in ag["steps"] if "requirements.txt" in (s.get("run") or "") or "$APPLY" in (s.get("run") or "")]
        self.assertTrue(gated and all("faellig != '0'" in s["if"] for s in gated))
        job = next(j for j in wachhund.JOBS if j["wf"] == "agenten-werk.yml")
        self.assertEqual(job["kind"], "hourly")
        self.assertEqual(wachhund.PAUSE_KEY["agenten-werk.yml"], "agenten")
        self.assertIn("agenten-werk.yml", tagescheck.WORKFLOWS)
        self.assertIn("agenten", owner_settings.WERKE)
        ts = (ROOT / "app" / "lib" / "owner-settings.ts").read_text(encoding="utf-8")
        self.assertIn('agenten: { label: "Agenten-Werk", via: "werke_paused" }', ts)
        regler = (ROOT / "app" / "lib" / "regler.ts").read_text(encoding="utf-8")
        self.assertIn(f'cron: "{cron}", file: "agenten-werk.yml"', regler)

    def test_markets_match_dashboard(self):
        ts = (ROOT / "app" / "lib" / "agents.ts").read_text(encoding="utf-8")
        self.assertIn("MARKETS = [" + ", ".join(f'"{m}"' for m in A.MARKETS) + "]", ts)


if __name__ == "__main__":
    unittest.main()
