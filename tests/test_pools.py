"""Speicher (docs/BAUKASTEN-MASTER.md): Master-Pipeline füllt Speicher (scripts/pools.py fill), Proben und Lieferungen
kommen strikt aus dem gesetzten Speicher (lib/pools.py), Tagescheck meldet zu kleine Speicher."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from gatestub import setUpModule, tearDownModule  # noqa: E402,F401  (Freigabe-Durchreiche)

import pools  # noqa: E402
from lib import pools as P  # noqa: E402

POOL = "11111111-2222-3333-4444-555555555555"
OTHER = "99999999-2222-3333-4444-555555555555"
NOW = dt.datetime(2026, 10, 4, 12, 0, tzinfo=dt.timezone.utc)


def master_flow(pool=POOL, extra_nodes=()):
    return {"v": 1, "nodes": [
        {"id": "q", "kind": "quelle", "x": 0, "y": 0, "source": "leads", "segment": "S2", "countries": ["US"],
         "status": [], "size": 1000},
        {"id": "f", "kind": "filter", "x": 0, "y": 0, "mode": "alle", "conds": [{"f": "hat_email", "op": "ja"}]},
        {"id": "g", "kind": "freigabe", "x": 0, "y": 0},
        {"id": "s", "kind": "speicher", "x": 0, "y": 0, "pool_id": pool, "pool_name": "US mit Mail"},
        *extra_nodes,
    ], "edges": [{"id": "e1", "from": "q", "port": "out", "to": "f"}, {"id": "e2", "from": "f", "port": "out", "to": "g"},
                 {"id": "e3", "from": "g", "port": "out", "to": "s"}]}


def lead(i, country="US", seg="S2", created="2026-10-04T10:00:00+00:00", status="new"):
    return {"id": f"l{i:02d}", "company_id": f"c{i:02d}", "country": country, "segment_id": seg, "status": status,
            "signal_type": "no_website", "created_at": created, "event_date": "2026-10-01", "source_name": "Overture"}


def fill_db(leads, mail=(), flow=None, updated="2026-10-04T08:00:00+00:00", cursor=None):
    tables = {
        "flows": [{"id": "m1", "name": "Master", "kind": "master", "status": "aktiv", "def": flow or master_flow(),
                   "updated_at": updated}],
        "lead_pools": [{"id": POOL, "name": "US mit Mail"}],
        "leads": leads,
        "watch_companies": [{"id": l["company_id"], "name": f"Firma {l['id']}"} for l in leads],
        "observations": [{"company_id": f"c{i:02d}", "kind": "other", "key": "contact", "details": {"email": f"a{i}@x.com"}}
                         for i in mail],
        "lead_checks": [], "lead_pool_items": [],
        "job_cursors": [] if cursor is None else [{"name": pools.CURSOR, "value": cursor}],
    }
    return FakeDB(tables)


class FillTest(unittest.TestCase):
    def test_fills_pool_once_and_remembers(self):
        db = fill_db([lead(1), lead(2), lead(3, country="UK")], mail=(1, 3))
        res = pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        self.assertEqual(res["leads"], 3)
        self.assertEqual(res["rows"], 2)  # UK ausserhalb der Quelle
        items = db.rows("lead_pool_items")
        self.assertEqual([(i["pool_id"], i["lead_id"], i["added_by"]) for i in items], [(POOL, "l01", "master")])
        cur = db.rows("job_cursors")[0]["value"]
        self.assertEqual((cur["id"], cur["flow"], cur["flow_updated"]), ("l03", "m1", "2026-10-04T08:00:00+00:00"))
        # zweiter Lauf: nichts Neues
        again = pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        self.assertEqual(again["leads"], 0)
        # neuer Lead mit derselben created_at wie der letzte (eine Ladung) wird trotzdem gefunden
        db.tables["leads"].append(lead(4, created="2026-10-04T10:00:00+00:00"))
        db.tables["watch_companies"].append({"id": "c04", "name": "Firma l04"})
        db.tables["observations"].append({"company_id": "c04", "kind": "other", "key": "contact", "details": {"email": "x@y.com"}})
        third = pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        self.assertEqual(third["leads"], 1)
        self.assertEqual(sorted(i["lead_id"] for i in db.rows("lead_pool_items")), ["l01", "l04"])

    def test_idempotent_without_cursor_table(self):
        db = fill_db([lead(1)], mail=(1,))
        del db.tables["job_cursors"]
        real = db.select

        def select(table, params=None):
            if table == "job_cursors":
                raise RuntimeError("Supabase GET job_cursors: 404 PGRST205")
            return real(table, params)
        db.select = select
        insert = db.insert

        def ins(table, rows, **kw):
            if table == "job_cursors":
                raise RuntimeError("Supabase POST job_cursors: 404 PGRST205")
            return insert(table, rows, **kw)
        db.insert = ins
        pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        res = pools.fill(db, apply=True, log=lambda *_: None, now=NOW)  # schaut wieder zurück, trägt nichts doppelt ein
        self.assertEqual(res["neu"], 0)
        self.assertEqual(len(db.rows("lead_pool_items")), 1)

    def test_probelauf_writes_nothing(self):
        db = fill_db([lead(1)], mail=(1,))
        res = pools.fill(db, apply=False, log=lambda *_: None, now=NOW)
        self.assertEqual(res["pairs"], 1)
        self.assertEqual(db.rows("lead_pool_items"), [])
        self.assertEqual(db.rows("job_cursors"), [])

    def test_changed_flow_replays_days(self):
        old = {"at": "2026-10-04T11:00:00+00:00", "id": "l09", "flow": "m1", "flow_updated": "2026-10-01T00:00:00+00:00"}
        db = fill_db([lead(1)], mail=(1,), cursor=old)
        res = pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        self.assertEqual(res["neu"], 1)  # Lead von 10:00 liegt vor dem Merkzettel, wird aber neu ausgewertet
        same = {**old, "flow_updated": "2026-10-04T08:00:00+00:00"}
        self.assertEqual(pools.start_point(same, {"id": "m1", "updated_at": same["flow_updated"]}, NOW), (old["at"], "l09"))
        self.assertEqual(pools.start_point({}, {"id": "m1", "updated_at": "x"}, NOW)[0], (NOW - dt.timedelta(days=7)).isoformat())
        self.assertEqual(pools.start_point(None, {"id": "m1", "updated_at": "x"}, NOW)[0], (NOW - dt.timedelta(hours=6)).isoformat())

    def test_unknown_node_or_pool_fills_nothing(self):
        db = fill_db([lead(1)], mail=(1,), flow=master_flow(extra_nodes=({"id": "z", "kind": "zauber", "x": 0, "y": 0},)))
        self.assertIn("baustein_unbekannt", pools.fill(db, apply=True, log=lambda *_: None, now=NOW)["fehler"])
        db = fill_db([lead(1)], mail=(1,), flow=master_flow(pool=OTHER))
        pools.fill(db, apply=True, log=lambda *_: None, now=NOW)
        self.assertEqual(db.rows("lead_pool_items"), [])

    def test_no_active_master(self):
        db = fill_db([lead(1)], mail=(1,))
        db.tables["flows"][0]["status"] = "entwurf"
        self.assertIsNone(pools.fill(db, apply=True, log=lambda *_: None, now=NOW)["flow"])

    def test_paused_stops_cleanly(self):
        db = FakeDB({"owner_settings": [{"key": "werke_paused", "value": {"agenten": "2026-10-04T09:00:00Z"}}]})
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(pools, "fill") as f:
            self.assertEqual(pools.main(["fill", "--apply"]), 0)
        f.assert_not_called()


# ---------------------------------------------------------------------------- Bedienen aus dem Speicher
def sample_lead(i):
    return {"id": f"l{i}", "company_id": f"c{i}", "signal_type": "new_incorporation", "event_summary": "",
            "event_date": f"2026-09-{(i % 28) + 1:02d}", "observation_ids": [f"o{i}"], "status": "new",
            "segment_id": "S5", "country": "UK", "watch_companies": {"name": f"Firm {i}"}}


class RegionalSamplePoolTest(unittest.TestCase):
    def run_sample(self, in_pool, route=True):
        import responder
        captured = {}

        def to_csv(picked, *a, **k):
            captured["ids"] = [l["id"] for l in picked]
            return b"csv"
        db = FakeDB({"leads": [sample_lead(i) for i in range(1, 16)],
                     "lead_pool_items": [{"pool_id": POOL, "lead_id": f"l{i}"} for i in in_pool],
                     "pool_routes": [{"segment_id": "S5", "country": "UK", "pool_id": POOL}] if route else []})
        with mock.patch("deliveries.contact_companies", return_value={f"c{i}": {} for i in range(1, 16)}), \
                mock.patch("deliveries.enrich"), mock.patch("deliveries.to_csv", side_effect=to_csv), \
                mock.patch("lib.leadreport.attachments", return_value=[("sample-leads.csv", b"csv")]), \
                mock.patch.object(responder, "sample_extras", return_value={}):
            files, ok = responder.regional_sample(db, "S5", "UK", None, mark=False)
        return ok, captured.get("ids") or []

    def test_only_pool_leads(self):
        ok, ids = self.run_sample(range(3, 13))
        self.assertTrue(ok)
        self.assertEqual(sorted(ids), sorted(f"l{i}" for i in range(3, 13)))

    def test_pool_too_small_no_fallback(self):
        ok, ids = self.run_sample(range(1, 10))  # nur 9 Firmen im Speicher
        self.assertFalse(ok)
        self.assertEqual(ids, [])

    def test_without_route_whole_stock(self):
        ok, ids = self.run_sample([], route=False)
        self.assertTrue(ok)
        self.assertEqual(len(ids), 10)


class DeliveryPoolTest(unittest.TestCase):
    def test_select_leads_respects_subscription_pool(self):
        import deliveries
        leads = [{"id": f"l{i}", "segment_id": "S1", "country": "UK", "signal_type": "x", "company_id": f"c{i}",
                  "_pools": {POOL} if i < 3 else set()} for i in range(6)]
        sub = {"segment_id": "S1", "filters": {"country": "UK", "max_per_week": 10}, "_pool": POOL}
        self.assertEqual([l["id"] for l in deliveries.select_leads(leads, sub, set(), {})], ["l0", "l1", "l2"])
        sub["_pool"] = None
        self.assertEqual(len(deliveries.select_leads(leads, sub, set(), {})), 6)

    def test_pool_for_prefers_subscription(self):
        db = FakeDB({"pool_routes": [{"segment_id": "S1", "country": "UK", "pool_id": OTHER}]})
        self.assertEqual(P.pool_for(db, "S1", "UK", {"pool_id": POOL}), POOL)
        self.assertEqual(P.pool_for(db, "S1", "UK", {"pool_id": None}), OTHER)
        self.assertIsNone(P.pool_for(db, "S1", "US", {}))

    def test_prepare_uses_pool(self):
        import deliveries
        today = dt.date.today().isoformat()
        rows = [{"id": f"l{i:02d}", "segment_id": "S1", "country": "UK", "signal_type": "job_open_30d",
                 "company_id": f"c{i}", "event_summary": "Hiring", "event_date": today, "source_name": "site",
                 "source_url": "https://x", "source_date": today, "urgency": "high", "urgency_reason": "r", "opener": "o",
                 "observation_ids": [], "created_at": today, "status": "new",
                 "watch_companies": {"name": f"Acme {i} Ltd", "address": "1 High St", "city": "Leeds", "region": "",
                                     "website": "acme.co.uk", "legal_form": "Ltd"}} for i in range(1, 6)]
        db = FakeDB({
            "subscriptions": [{"id": "s1", "customer_id": "k1", "segment_id": "S1", "status": "active", "pool_id": POOL,
                               "first_delivery_approved": True, "filters": {"country": "UK"},
                               "customers": {"company_name": "Real Ltd", "country": "UK", "billing_email": "r@r.co.uk",
                                             "status": "active", "stripe_customer_id": "cus_2", "notes": None}}],
            "deliveries": [], "leads": rows,
            "lead_pool_items": [{"pool_id": POOL, "lead_id": "l02"}, {"pool_id": POOL, "lead_id": "l04"}],
        })
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(deliveries, "REQUIRE_CONTACT", False), \
                mock.patch.object(deliveries, "enrich"):
            deliveries.cmd_prepare(SimpleNamespace(notify=False))
        new = db.rows("deliveries")
        self.assertEqual(sorted(new[0]["lead_ids"]), ["l02", "l04"])


class StockAndCheckTest(unittest.TestCase):
    def test_stock_outside_pool_is_discarded(self):
        import sample_stock
        db = FakeDB({"pool_routes": [{"segment_id": "S2", "country": "US", "pool_id": POOL}],
                     "sample_stock": [{"id": "a", "segment_id": "S2", "country": "US", "status": "ready", "lead_ids": ["l1", "l2"]},
                                      {"id": "b", "segment_id": "S2", "country": "US", "status": "ready", "lead_ids": ["l3"]},
                                      {"id": "c", "segment_id": "S2", "country": "UK", "status": "ready", "lead_ids": ["l9"]}],
                     "lead_pool_items": [{"pool_id": POOL, "lead_id": "l1"}, {"pool_id": POOL, "lead_id": "l2"}]})
        db.rpc_handlers["discard_sample_stock"] = lambda args, params: True
        n = sample_stock.drop_off_pool(db, apply=True, log=lambda *_: None)
        self.assertEqual(n, 1)
        self.assertEqual([a["p_stock"] for f, a in db.rpcs if f == "discard_sample_stock"], ["b"])

    def test_tagescheck_reports_small_pool(self):
        import tagescheck
        db = FakeDB({"pool_routes": [{"segment_id": "S2", "country": "US", "pool_id": POOL}],
                     "lead_pools": [{"id": POOL, "name": "US mit Mail"}],
                     "subscriptions": [],
                     "leads": [lead(i) for i in range(1, 6)],
                     "lead_pool_items": [{"pool_id": POOL, "lead_id": f"l{i:02d}"} for i in range(1, 6)]})
        c = tagescheck.Check()
        with mock.patch("deliveries.contact_companies", side_effect=lambda db, website_optional=False, only=None: {x: {} for x in only or []}):
            tagescheck.check_pools(c, db)
        self.assertEqual(len(c.rows), 1)
        self.assertIn("Speicher US mit Mail reicht nicht für S2/US", c.rows[0][2])
        self.assertIn("5 von 10", c.rows[0][3])
        # genug Firmen: kein Hinweis
        db.tables["leads"] += [lead(i) for i in range(6, 12)]
        db.tables["lead_pool_items"] += [{"pool_id": POOL, "lead_id": f"l{i:02d}"} for i in range(6, 12)]
        c = tagescheck.Check()
        with mock.patch("deliveries.contact_companies", side_effect=lambda db, website_optional=False, only=None: {x: {} for x in only or []}):
            tagescheck.check_pools(c, db)
        self.assertEqual(c.rows, [])

    def test_restrict_adds_inner_embed(self):
        p = P.restrict({"select": "id", "status": "eq.new"}, POOL)
        self.assertEqual(p["select"], "id,lead_pool_items!inner(pool_id)")
        self.assertEqual(p["lead_pool_items.pool_id"], f"eq.{POOL}")
        self.assertEqual(P.restrict({"select": "id"}, None), {"select": "id"})


if __name__ == "__main__":
    unittest.main()
