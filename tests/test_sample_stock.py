"""Proben-Vorrat (Inhaber 03.10.2026): fertige Proben bauen, reservieren, verfallen lassen, nach dem Klick vergeben."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests  # noqa: E402

import responder  # noqa: E402
import sample_stock as ss  # noqa: E402
import web_samples  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from gatestub import setUpModule, tearDownModule  # noqa: E402,F401  (Freigabe-Durchreiche)


class StockDB(FakeDB):
    """FakeDB + die SQL-Funktionen des Vorrats mit derselben Bedeutung wie in der Migration."""

    def rpc(self, fn, args):
        if fn not in ("add_sample_stock", "claim_sample_stock", "finish_sample_stock", "expire_sample_stock",
                      "lock_sample_request"):
            return super().rpc(fn, args)
        self.rpcs.append((fn, args))
        leads = {l["id"]: l for l in self.tables.setdefault("leads", [])}
        stock = self.tables.setdefault("sample_stock", [])
        if fn == "add_sample_stock":
            p = args["p"]
            if len(set(p["lead_ids"])) != 10 or len(set(p["company_ids"])) != 10:
                raise RuntimeError("Probe braucht genau 10 verschiedene Leads und Firmen")
            free = [i for i in p["lead_ids"] if leads.get(i, {}).get("status") == "new"]
            if len(free) != 10:
                raise RuntimeError(f"Leads nicht mehr frei ({len(free)} von 10)")
            for i in free:
                leads[i]["status"] = "reserved"
            row = {**p, "id": f"st{len(stock) + 1}", "status": "ready", "request_id": None}
            stock.append(row)
            return row["id"]
        if fn == "lock_sample_request":
            for r in self.tables.get("sample_requests", []):
                if r["id"] == args["p_request"] and r["status"] == "new" and not r.get("claimed_at"):
                    r["claimed_at"] = "jetzt"
                    return True
            return False
        if fn == "claim_sample_stock":
            wish = args["p_wish"] or []
            cand = [s for s in stock if s["segment_id"] == args["p_segment"] and s["country"] == args["p_country"]
                    and s["status"] == "ready"]
            # wie die SQL-Funktion: Premium-Proben zuerst (premium_n), dann Wunsch, dann Score
            cand.sort(key=lambda s: (-int(s.get("premium_n") or 0),
                                     -sum((s.get("wish_match") or {}).get(k, 0) for k in wish), -s.get("score", 0)))
            for s in cand:
                if sum(leads[i]["status"] == "reserved" for i in s["lead_ids"]) != 10:
                    s["status"] = "expired"
                    for i in s["lead_ids"]:
                        if leads[i]["status"] == "reserved":
                            leads[i]["status"] = "new"
                    continue
                s.update(status="claimed", request_id=args["p_request"])
                return [{"id": s["id"], "storage_path": s["storage_path"], "subject": s["subject"], "lang": s["lang"]}]
            return []
        if fn == "finish_sample_stock":
            s = next(x for x in stock if x["id"] == args["p_stock"])
            if s["status"] != "claimed":
                return None
            if args["p_ok"]:
                s["status"] = "sent"
                for i in s["lead_ids"]:
                    leads[i]["status"] = "sample"
                for r in self.tables.get("sample_requests", []):
                    if r["id"] == s["request_id"]:
                        r["status"] = "sent"
            elif args.get("p_release"):
                s.update(status="ready", request_id=None)
            else:
                s["status"] = "failed"
                for i in s["lead_ids"]:
                    leads[i]["status"] = "sample"
            return None
        if fn == "expire_sample_stock":
            n = 0
            for s in stock:
                if s["status"] == "ready" and s.get("_old"):
                    s["status"] = "expired"
                    for i in s["lead_ids"]:
                        if leads[i]["status"] == "reserved":
                            leads[i]["status"] = "new"
                    n += 1
            return n
        return None


def make_leads(n, seg="S2", cc="US", start=0):
    return [{"id": f"l{i}", "company_id": f"c{i}", "segment_id": seg, "country": cc, "status": "new",
             "signal_type": "no_website" if i % 2 else "no_https", "urgency": "high", "event_date": "2026-10-02",
             "event_summary": "x", "watch_companies": {"name": f"Firma {i}"}} for i in range(start, start + n)]


def fake_regional(db, seg, country, region, wish=None, mark=True, picked_out=None, exclude_companies=None, **kw):
    """Wie responder.regional_sample: nur freie Leads (new), je Firma einer, genau 10 – sonst nichts."""
    free = [l for l in db.tables["leads"] if l["segment_id"] == seg and l["country"] == country
            and l["status"] == "new" and l["company_id"] not in (exclude_companies or set())]
    if kw.get("premium_only"):  # wie responder.regional_sample(premium_only=True): nur Leads, die heute Premium sind
        from lib.premium import tier_now
        free = [l for l in free if tier_now(l) == "premium"]
    # mit Wunsch passende zuerst; ohne Wunsch kommen (wie bei echten S2-Leads) die dringlicheren Website-Mängel zuerst
    free.sort(key=lambda l: (l["signal_type"] != "no_website") if wish else (l["signal_type"] == "no_website"))
    if len(free) < 10:
        return [], False
    picked = free[:10]
    if picked_out is not None:
        picked_out.extend(dict(l) for l in picked)
    return [("Your-10-Free-Leads-US.pdf", b"%PDF"), ("sample-leads.csv", b"company\n")], True


ENV = {"SENDER_NAME": "Justin Koch", "SENDER_POSTAL_ADDRESS": "Nikolaistraße 3-7, 04109 Leipzig, Germany",
       "MAIL_FROM": "NextGen Profit <hello@nextgen-profit.de>", "RESEND_API_KEY": "re_test", "REPLY_TO": ""}


@mock.patch.dict(os.environ, ENV)
class BuildTest(unittest.TestCase):
    def setUp(self):
        self.db = StockDB({"leads": make_leads(25), "landing_pages": [], "settings": [{"legal_ready": True}]})
        self.uploads = {}
        p1 = mock.patch.object(ss, "upload", side_effect=lambda db, path, data: self.uploads.__setitem__(path, data))
        p2 = mock.patch.object(ss, "remove", side_effect=lambda db, paths: [self.uploads.pop(x, None) for x in paths])
        p3 = mock.patch.object(responder, "regional_sample", side_effect=fake_regional)
        for p in (p1, p2, p3):
            p.start()
            self.addCleanup(p.stop)

    def test_exactly_10_distinct_and_reserved(self):
        row = ss.build_one(self.db, "S2", "US", [], set(), 48, True, log=lambda *a: None)
        self.assertEqual(len(set(row["lead_ids"])), 10)
        self.assertEqual(len(set(row["company_ids"])), 10)
        reserved = [l for l in self.db.rows("leads") if l["status"] == "reserved"]
        self.assertEqual(len(reserved), 10)
        payload = json.loads(next(iter(self.uploads.values())))
        self.assertEqual(payload["subject"], "Your 10 free leads from across the US")
        self.assertIn(ss.PLACEHOLDER, payload["text"])
        self.assertIn("free sample", payload["text"])  # Fußzeile „angefordert“
        names = [a["filename"] for a in payload["attachments"]]
        self.assertIn("Your-10-Free-Leads-US.pdf", names)
        self.assertIn("sample-leads.csv", names)

    def test_no_lead_in_two_samples(self):
        ex = set()
        a = ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None)
        b = ss.build_one(self.db, "S2", "US", ["no_website"], ex, 48, True, log=lambda *a: None)
        self.assertFalse(set(a["lead_ids"]) & set(b["lead_ids"]))
        self.assertFalse(set(a["company_ids"]) & set(b["company_ids"]))
        # nur noch 5 freie Leads: keine dritte Probe, nichts halb reserviert
        self.assertIsNone(ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None))
        self.assertEqual(sum(l["status"] == "new" for l in self.db.rows("leads")), 5)

    def test_without_pdf_no_sample(self):
        with mock.patch.object(responder, "regional_sample",
                               side_effect=lambda *a, **k: ([("sample-leads.csv", b"x")], True)):
            with self.assertRaises(RuntimeError):
                ss.build_one(self.db, "S2", "US", [], set(), 48, True, log=lambda *a: None)
        self.assertFalse(self.uploads)

    def test_taken_meanwhile_removes_file(self):
        real = StockDB.rpc

        def racing(db, fn, args):
            if fn == "add_sample_stock":  # Leads wurden inzwischen anderweitig vergeben
                for l in db.tables["leads"][:1]:
                    l["status"] = "sample"
            return real(db, fn, args)
        with mock.patch.object(StockDB, "rpc", racing), self.assertRaises(RuntimeError):
            ss.build_one(self.db, "S2", "US", [], set(), 48, True, log=lambda *a: None)
        self.assertFalse(self.uploads)
        self.assertFalse([l for l in self.db.rows("leads") if l["status"] == "reserved"])

    def test_expiry_releases_leads(self):
        ss.build_one(self.db, "S2", "US", [], set(), 48, True, log=lambda *a: None)
        self.db.rows("sample_stock")[0]["_old"] = True
        self.assertEqual(self.db.rpc("expire_sample_stock", {"p_hours": 48}), 1)
        self.assertFalse([l for l in self.db.rows("leads") if l["status"] == "reserved"])

    def test_run_fills_up_to_target(self):
        self.db.tables["landing_pages"] = [{"segment_id": "S2", "country": "US", "slug": "us/web-agencies", "status": "live"},
                                           {"segment_id": "S5", "country": "UK", "slug": "uk/accountants", "status": "live"}]
        with mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "US")]), \
                mock.patch.object(ss, "settings", return_value={"fokus_je_seite": 2, "andere_je_seite": 1,
                                                                "max_alter_stunden": 48, "laufzeit_minuten": 40}), \
                mock.patch.object(ss, "cleanup_files", return_value=0):
            res = ss.run(self.db, True, log=lambda *a: None)
        self.assertEqual(res["built"], 2)  # S2/US 2 Proben; S5/UK hat keine Leads
        self.assertNotIn("S5/UK", res["summary"])  # ruhender Markt (nicht im Fokus): nicht befüllt
        self.assertEqual(ss.inventory(self.db), {"S2/US": 2})
        self.assertEqual(self.db.rows("sample_stock")[1]["wish"], ["no_website"])  # zweite Probe: erster Wunsch


def make_premium(leads, n):
    """Die ersten n Leads heute Premium (frisch, Stufe premium)."""
    import datetime as dt
    for l in leads[:n]:
        l.update(premium={"tier": "premium"}, premium_score=85,
                 event_date=(dt.date.today() - dt.timedelta(days=2)).isoformat())
    return leads


@mock.patch.dict(os.environ, ENV)
class PremiumStockTest(unittest.TestCase):
    """Premium-Proben (Inhaber 05.10.2026): 10 verschiedene Firmen, alle Premium, sonst keine Premium-Probe."""

    def setUp(self):
        self.db = StockDB({"leads": make_premium(make_leads(30), 14), "landing_pages": [],
                           "settings": [{"legal_ready": True}]})
        self.uploads = {}
        for p in (mock.patch.object(ss, "upload", side_effect=lambda db, path, data: self.uploads.__setitem__(path, data)),
                  mock.patch.object(ss, "remove", side_effect=lambda db, paths: [self.uploads.pop(x, None) for x in paths]),
                  mock.patch.object(ss, "download", side_effect=lambda db, path: self.uploads[path]),
                  mock.patch.object(responder, "regional_sample", side_effect=fake_regional)):
            p.start()
            self.addCleanup(p.stop)

    def test_premium_sample_all_ten_premium(self):
        ex = set()
        row = ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None, premium_only=True)
        self.assertEqual(row["premium_n"], 10)
        self.assertEqual(len(set(row["company_ids"])), 10)
        prem = {l["id"] for l in self.db.rows("leads") if (l.get("premium") or {}).get("tier") == "premium"}
        self.assertTrue(set(row["lead_ids"]) <= prem)
        # nur noch 4 freie Premium-Leads: keine zweite Premium-Probe, nichts aufgefüllt, nichts reserviert
        self.assertIsNone(ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None, premium_only=True))
        self.assertEqual(sum(l["status"] == "reserved" for l in self.db.rows("leads")), 10)

    def test_premium_only_rejects_mixed_selection(self):
        # Sicherheitsnetz: liefert die Auswahl doch Standard-Leads, entsteht keine Premium-Probe
        with mock.patch.object(responder, "regional_sample",
                               side_effect=lambda *a, **k: fake_regional(*a, **{**k, "premium_only": False})):
            for l in self.db.rows("leads")[:14]:
                l["premium"] = {"tier": "standard"}
            self.assertIsNone(ss.build_one(self.db, "S2", "US", [], set(), 48, True, log=lambda *a: None,
                                           premium_only=True))
        self.assertFalse(self.uploads)
        self.assertFalse([l for l in self.db.rows("leads") if l["status"] == "reserved"])

    def _run(self, cfg_extra, owner=None):
        self.db.tables["landing_pages"] = [{"segment_id": "S2", "country": "US", "slug": "us/web-agencies", "status": "live"}]
        if owner is not None:
            self.db.tables["owner_settings"] = [{"key": "sample_premium_targets", "value": owner}]
        cfg = {"fokus_je_seite": 2, "andere_je_seite": 1, "max_alter_stunden": 48, "laufzeit_minuten": 40, **cfg_extra}
        with mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "US")]), \
                mock.patch.object(ss, "settings", return_value=cfg), \
                mock.patch.object(ss, "cleanup_files", return_value=0):
            return ss.run(self.db, True, log=lambda *a: None)

    def test_run_builds_premium_up_to_soll(self):
        res = self._run({"premium_us": 1})
        self.assertEqual(res["built"], 2)
        self.assertEqual(sorted(r["premium_n"] for r in self.db.rows("sample_stock")), [4, 10])
        self.assertEqual(res["summary"]["S2/US"]["premium_soll"], 1)
        self.assertEqual(res["summary"]["S2/US"]["premium_bereit"], 1)

    def test_owner_premium_target_and_too_few_premium(self):
        # Regler-Soll 2 > Premium-Vorrat (14 Leads = 1 Probe): zweite Probe normal, nichts aufgeweicht
        res = self._run({"premium_us": 0}, owner={"S2/US": 2})
        self.assertEqual(res["summary"]["S2/US"]["premium_soll"], 2)
        self.assertEqual(sum(r["premium_n"] == 10 for r in self.db.rows("sample_stock")), 1)
        self.assertEqual(res["built"], 2)

    def test_claim_prefers_premium_sample(self):
        ex = set()
        prem = ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None, premium_only=True)
        normal = ss.build_one(self.db, "S2", "US", ["no_website"], ex, 48, True, log=lambda *a: None)
        self.assertGreater(normal["wish_match"].get("no_website", 0), prem["wish_match"].get("no_website", 0))
        self.assertLess(normal["premium_n"], 10)
        got = self.db.rpc("claim_sample_stock", {"p_segment": "S2", "p_country": "US", "p_wish": ["no_website"],
                                                 "p_request": "r1"})
        self.assertEqual(got[0]["id"], prem["id"])

    def test_refresh_premium_n_backfills_and_downgrades(self):
        import datetime as dt
        ex = set()
        a = ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None, premium_only=True)
        b = ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None)
        stock = {r["id"]: r for r in self.db.rows("sample_stock")}
        stock[b["id"]]["premium_n"] = None  # Probe von vor der Premium-Bewertung
        later = dt.date.today() + dt.timedelta(days=20)  # Ereignisse älter als 14 Tage: keine Premium-Probe mehr
        res = ss.refresh_premium_n(self.db, True, log=lambda *a: None, today=later)
        self.assertEqual(res, {"nachgetragen": 1, "geaendert": 1})
        self.assertEqual(stock[a["id"]]["premium_n"], 0)
        self.assertEqual(stock[b["id"]]["premium_n"], 0)
        self.assertEqual(stock[a["id"]]["status"], "ready")  # nichts verworfen

    def test_claim_sql_orders_premium_first(self):
        # die zuletzt angelegte Fassung von claim_sample_stock sortiert zuerst nach premium_n
        import re
        mig = sorted((Path(__file__).resolve().parents[1] / "supabase" / "migrations").glob("*.sql"))
        last = [m for m in mig if "function signalwerk.claim_sample_stock" in m.read_text(encoding="utf-8").lower()][-1]
        body = last.read_text(encoding="utf-8").lower().split("function signalwerk.claim_sample_stock")[-1]
        order = re.search(r"order by\s+([^\n]+)", body).group(1)
        self.assertTrue(order.startswith("coalesce(s.premium_n, 0) desc"), order)

    def test_claim_sql_only_premium_at_full_mix(self):
        # Nur Premium (Inhaber 05.10.2026): bei lead_mix 100 % gibt der Abruf nur 10/10-Premium-Proben heraus
        mig = sorted((Path(__file__).resolve().parents[1] / "supabase" / "migrations").glob("*.sql"))
        last = [m for m in mig if "function signalwerk.claim_sample_stock" in m.read_text(encoding="utf-8").lower()][-1]
        body = last.read_text(encoding="utf-8").lower().split("function signalwerk.claim_sample_stock")[-1]
        self.assertIn("(v_mix < 100 or coalesce(s.premium_n, 0) >= 10)", body)
        self.assertIn("v_mix := coalesce(v_mix, 100)", body)  # ohne Eintrag: Standard 100 = nur Premium


class PlanTest(unittest.TestCase):
    def test_premium_targets_default_and_override(self):
        pages = [{"segment_id": "S2", "country": "US"}, {"segment_id": "S2", "country": "UK"},
                 {"segment_id": "S2", "country": "FR"}, {"segment_id": "S5", "country": "SE"}]
        cfg = ss.settings()
        t = ss.premium_targets(pages, cfg, {"S2/UK": 5})
        self.assertEqual(t, {("S2", "US"): 10, ("S2", "UK"): 5, ("S2", "FR"): 1, ("S5", "SE"): 0})

    def test_targets_focus_first(self):
        pages = [{"segment_id": "S5", "country": "UK"}, {"segment_id": "S2", "country": "US"}]
        t = ss.targets(pages, {"fokus_je_seite": 6, "andere_je_seite": 3}, [("S2", "US")])
        self.assertEqual(list(t.items()), [(("S2", "US"), 6)])  # S5/UK ruht (nicht im Fokus, Inhaber 05.10.2026)
        t = ss.targets(pages, {"fokus_je_seite": 6, "andere_je_seite": 3}, [])  # ohne Fokus-Liste: alle
        self.assertEqual(list(t.items()), [(("S2", "US"), 3), (("S5", "UK"), 3)])

    def test_plan_cycles_wishes(self):
        self.assertEqual(ss.plan(0, 3, ["a", "b"]), [[], ["a"], ["b"]])
        self.assertEqual(ss.plan(2, 4, ["a"]), [[], ["a"]])
        self.assertEqual(ss.plan(5, 3, ["a"]), [])

    def test_wish_keys_from_form(self):
        self.assertEqual(ss.wish_keys("us/web-agencies"),
                         ["no_website", "website_outdated", "not_mobile", "security", "broken"])
        self.assertEqual(ss.wish_keys("uk/recruitment"), ["job_open_30d", "jobs_3plus", "new_location"])
        self.assertEqual(ss.wish_keys("xx/unknown"), [])

    def test_config_about_50(self):
        cfg = ss.settings()
        total = 3 * cfg["fokus_je_seite"] + 12 * cfg["andere_je_seite"]
        self.assertTrue(45 <= total <= 60, total)
        self.assertEqual(cfg["max_alter_stunden"], 48)

    def test_best_first(self):
        rows = [{"id": "a", "urgency": "low", "event_date": "2026-10-03"},
                {"id": "b", "urgency": "high", "event_date": "2026-09-01"},
                {"id": "c", "urgency": "high", "event_date": "2026-10-01"}]
        self.assertEqual([r["id"] for r in responder.best_first(rows)], ["c", "b", "a"])

    def test_score_prefers_urgent_and_fresh(self):
        import datetime as dt
        today = dt.date(2026, 10, 3)
        hi = [{"urgency": "high", "event_date": "2026-10-02"}] * 10
        old = [{"urgency": "high", "event_date": "2026-08-01"}] * 10
        lo = [{"urgency": "low", "event_date": "2026-10-02"}] * 10
        self.assertGreater(ss.score(hi, today), ss.score(old, today))
        self.assertGreater(ss.score(old, today), ss.score(lo, today))


@mock.patch.dict(os.environ, ENV)
class SendTest(unittest.TestCase):
    def setUp(self):
        self.db = StockDB({"leads": make_leads(20), "sample_requests": [
            {"id": "r1", "email": "jo@agency.com", "segment_id": "S2", "country": "US", "status": "new",
             "company_name": "Agency", "note": None, "created_at": "2026-10-03T10:00:00Z"}]})
        self.files = {}
        for p in (mock.patch.object(ss, "upload", side_effect=lambda db, path, data: self.files.__setitem__(path, data)),
                  mock.patch.object(ss, "download", side_effect=lambda db, path: self.files[path]),
                  mock.patch.object(ss, "remove", side_effect=lambda db, paths: None),
                  mock.patch.object(responder, "regional_sample", side_effect=fake_regional)):
            p.start()
            self.addCleanup(p.stop)
        ex = set()
        ss.build_one(self.db, "S2", "US", [], ex, 48, True, log=lambda *a: None)
        self.wished = ss.build_one(self.db, "S2", "US", ["no_website"], ex, 48, True, log=lambda *a: None)
        self.req = self.db.rows("sample_requests")[0]

    def test_sent_marks_everything(self):
        with mock.patch.object(responder, "resend_post", return_value="re_1") as post:
            self.assertEqual(ss.send_stock(self.db, self.req, "jo@agency.com", ["no_website"]), "sent")
        mail, key = post.call_args[0][0], post.call_args[1]["idempotency_key"]
        self.assertEqual(mail["to"], ["jo@agency.com"])
        self.assertNotIn(ss.PLACEHOLDER, mail["text"] + mail["html"])
        self.assertIn("agency.com", mail["text"])
        self.assertEqual(key, "sample-r1")
        self.assertEqual(self.req["status"], "sent")
        sent = [s for s in self.db.rows("sample_stock") if s["status"] == "sent"]
        self.assertEqual(sent[0]["id"], self.wished["id"])
        self.assertEqual(sent[0]["wish"], ["no_website"])  # Wunsch passt am besten
        self.assertEqual(sum(l["status"] == "sample" for l in self.db.rows("leads")), 10)

    def test_resend_rejects_puts_sample_back(self):
        with mock.patch.object(responder, "resend_post", side_effect=RuntimeError("Resend 422")):
            self.assertEqual(ss.send_stock(self.db, self.req, "jo@agency.com", []), "error")
        self.assertEqual(sorted(s["status"] for s in self.db.rows("sample_stock")), ["ready", "ready"])
        self.assertEqual(self.req["status"], "new")

    def test_unclear_send_never_reuses_leads(self):
        with mock.patch.object(responder, "resend_post", side_effect=requests.Timeout("weg")):
            self.assertEqual(ss.send_stock(self.db, self.req, "jo@agency.com", []), "error")
        self.assertIn("failed", [s["status"] for s in self.db.rows("sample_stock")])
        self.assertEqual(sum(l["status"] == "sample" for l in self.db.rows("leads")), 10)

    def test_no_double_assignment(self):
        with mock.patch.object(responder, "resend_post", return_value="re_1"):
            a = ss.send_stock(self.db, self.req, "jo@agency.com", [])
            b = ss.send_stock(self.db, {**self.req, "id": "r2"}, "x@other.com", [])
            c = ss.send_stock(self.db, {**self.req, "id": "r3"}, "y@other.com", [])
        self.assertEqual((a, b, c), ("sent", "sent", "none"))
        claimed = [s["request_id"] for s in self.db.rows("sample_stock")]
        self.assertEqual(sorted(claimed), ["r1", "r2"])

    def test_owner_test_send_consumes_nothing(self):
        with mock.patch.dict(os.environ, {"OWNER_EMAIL": "owner@example.com"}), \
                mock.patch.object(responder, "resend_post", return_value="re_t") as post:
            self.assertEqual(ss.test_send(self.db, True, None, None, log=lambda *a: None), 0)
        self.assertEqual(post.call_args[0][0]["to"], ["owner@example.com"])
        self.assertTrue(post.call_args[0][0]["subject"].startswith("[TEST Vorrat]"))
        self.assertEqual([s["status"] for s in self.db.rows("sample_stock")], ["ready", "ready"])
        self.assertFalse([r for r in self.db.rpcs if r[0] in ("claim_sample_stock", "finish_sample_stock")])

    def test_web_samples_uses_stock_first(self):
        self.db.tables["messages"] = []
        with mock.patch.object(responder, "resend_post", return_value="re_1"), \
                mock.patch.object(responder, "regional_sample") as fresh, \
                mock.patch("lib.db.DB", return_value=self.db):
            web_samples.main(["--apply"])
        fresh.assert_not_called()
        self.assertEqual(self.req["status"], "sent")

    def test_web_samples_skips_request_in_progress(self):
        self.req["claimed_at"] = "2099-01-01T00:00:00+00:00"  # App sendet gerade
        with mock.patch.object(responder, "resend_post") as post, mock.patch("lib.db.DB", return_value=self.db):
            web_samples.main(["--apply"])
        post.assert_not_called()
        self.assertEqual(self.req["status"], "new")


class TagescheckStockTest(unittest.TestCase):
    def test_inventory_line(self):
        import tagescheck
        db = FakeDB({"settings": [{"legal_ready": True}],
                     "landing_pages": [{"segment_id": "S2", "country": "US", "slug": "us/web-agencies", "status": "live"},
                                       {"segment_id": "S5", "country": "UK", "slug": "uk/accountants", "status": "live"}],
                     "sample_stock": [{"id": "a", "segment_id": "S2", "country": "US", "status": "ready"},
                                      {"id": "b", "segment_id": "S2", "country": "US", "status": "sent",
                                       "sent_at": "2999-01-01T00:00:00+00:00"}]})
        c = tagescheck.Check()
        with mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "US")]):
            tagescheck.check_sample_stock(c, db)
        area, status, title, detail = c.rows[0]
        self.assertEqual(status, tagescheck.OK)  # S5/UK ruht (nicht im Fokus), zählt nicht als leer
        self.assertIn("1 fertige Proben", title)
        self.assertIn("1 in 24 h sofort gesendet", title)
        self.assertIn("S2/US 1/6", detail)
        self.assertNotIn("S5/UK", detail)


if __name__ == "__main__":
    unittest.main()
