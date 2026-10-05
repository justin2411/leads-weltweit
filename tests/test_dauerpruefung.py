"""Dauerprüfung (Inhaber 04.10.2026): Prüf-Agenten ohne Tokens – Lead-Prüfer, Käufer-Prüfer, Qualitätswert, Auswahl."""
import datetime as dt
import random
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))

import dauerpruefung as D  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import quality as Q  # noqa: E402
from lib import release_gate as G  # noqa: E402

NOW = dt.datetime(2026, 10, 4, 12, 0, tzinfo=dt.timezone.utc)
CFG = {"countries": {"US": {"allowed": True}, "UK": {"allowed": True, "company_forms_only": True}},
       "generic_local_parts": ["info", "hello"]}


def lead(i, cid, seg="S2", c="US", **kw):
    return {"id": f"00000000-0000-0000-0000-00000000000{i}", "company_id": cid, "segment_id": seg, "country": c,
            "status": "new", **kw}


def complete(cid):
    return ([{"company_id": cid, "kind": "other", "key": "contact", "details": {"email": "a@b.com", "phone": "1"}},
             {"company_id": cid, "kind": "other", "key": "person", "details": {"name": "X"}}],
            {"id": cid, "address": "1 Main St"})


def db_with(leads, firms, **tables):
    obs, cos = [], []
    for f in firms:
        o, c = complete(f)
        obs += o
        cos.append(c)
    return FakeDB({"leads": leads, "observations": obs, "watch_companies": cos, **tables})


class QualityTest(unittest.TestCase):
    def test_score_grows_with_checks_and_age(self):
        self.assertEqual(Q.score(1, 0), 40)
        self.assertEqual(Q.score(2, 0), 55)
        self.assertEqual(Q.score(4, 0), 85)
        self.assertEqual(Q.score(9, 0), 85)          # höchstens 4 Prüfungen zählen
        self.assertEqual(Q.score(4, 60), 100)        # Alter bis +15
        self.assertGreater(Q.score(2, 10), Q.score(2, 0))
        self.assertEqual(Q.failed_score(80), 30)
        self.assertEqual(Q.failed_score(None), 0)

    def test_intervals_widen(self):
        steps = Q.intervals({"intervalle_tage": [1, 3, 7, 14, 30]})
        self.assertEqual([Q.next_interval(n, steps) for n in range(1, 8)], [1, 3, 7, 14, 30, 30, 30])
        self.assertEqual(Q.intervals({}), Q.DEFAULT_INTERVALS)

    def test_config_file(self):
        cfg = Q.config()
        self.assertEqual(Q.intervals(cfg), [1, 3, 7, 14, 30])
        self.assertGreater(cfg["leads"]["budget_je_lauf"], 0)
        self.assertEqual(cfg["leads"]["maerkte"][:3], ["S2/US", "S2/UK", "S2/FR"])

    def test_sort_key_checked_first(self):
        rows = [{"id": "a"}, {"id": "b", "qualitaet_score": 40}, {"id": "c", "qualitaet_score": 85}, {"id": "d"}]
        self.assertEqual([r["id"] for r in sorted(rows, key=Q.sort_key)], ["c", "b", "a", "d"])

    def test_persist_feeds_quality_and_never_releases(self):
        db = FakeDB({"leads": [{"id": "l1", "status": "new"}, {"id": "l2", "status": "new"}]})
        vs = [G.Verdict("l1", True, status="new"), G.Verdict("l2", False, 2, ["s2:kein_mx"], status="new")]
        G.persist(db, vs, "dauerpruefung", log=lambda *_: None)
        calls = [a for f, a in db.rpcs if f == "lead_quality_apply"]
        self.assertEqual(calls[0]["p_rows"], [{"id": "l1", "ok": True}, {"id": "l2", "ok": False}])
        self.assertEqual(calls[0]["p_intervals"], [1, 3, 7, 14, 30])
        st = {r["id"]: r["status"] for r in db.rows("leads")}
        self.assertEqual(st, {"l1": "new", "l2": "held"})   # durchgefallen = held, nichts gelöscht
        self.assertEqual({r["lead_id"]: r["result"] for r in db.rows("lead_checks")}, {"l1": "released", "l2": "failed"})

    def test_quality_error_never_breaks_gate(self):
        db = FakeDB({"leads": [{"id": "l1", "status": "new"}]})

        def boom(*_a, **_k):
            raise RuntimeError("PGRST202")
        db.rpc_handlers["lead_quality_apply"] = boom
        G.persist(db, [G.Verdict("l1", False, 1, ["s1:alt"], status="new")], "x", log=lambda *_: None)
        self.assertEqual(db.rows("leads")[0]["status"], "held")


class LeadPlanTest(unittest.TestCase):
    def test_due_first_then_markets_one_per_firm(self):
        due = [lead(1, "f1", naechste_pruefung="2026-10-03T00:00:00+00:00"),
               lead(2, "f1", naechste_pruefung="2026-10-03T01:00:00+00:00")]   # gleiche Firma: nur einmal
        fresh = [lead(3, "f2"), lead(4, "f3", c="UK"), lead(5, "f4")]
        db = db_with(due + fresh, ["f1", "f2", "f3", "f4"])
        rng = random.Random(1)
        with mock.patch.object(D, "fresh_leads", side_effect=lambda db, s, c, n, r: [x for x in fresh if x["country"] == c][:n]), \
                mock.patch.object(D, "customer_markets", return_value=[("S2", "UK")]):
            got, info = D.plan_leads(db, 3, {"maerkte": ["S2/US", "S2/UK"]}, rng, NOW, log=lambda *_: None)
        ids = [r["id"] for r in got]
        self.assertEqual(ids[0], due[0]["id"])
        self.assertNotIn(due[1]["id"], ids)
        self.assertEqual(info["faellig"], 1)
        self.assertEqual(list(info["neu"]), ["S2/UK", "S2/US"])   # Kunden-Markt zuerst
        self.assertEqual(len(got), 3)

    def test_brake_stop_only_due(self):
        db = db_with([lead(1, "f1", naechste_pruefung="2026-10-01T00:00:00+00:00"), lead(2, "f2")], ["f1", "f2"],
                     werk_plan_log=[{"werk": "lead-werk", "bremse": "stopp", "at": "x"}])
        with mock.patch.object(D, "fresh_leads") as fr:
            got, info = D.plan_leads(db, 10, {"maerkte": ["S2/US"]}, random.Random(1), NOW, log=lambda *_: None)
        fr.assert_not_called()
        self.assertEqual([r["company_id"] for r in got], ["f1"])

    def test_fresh_leads_only_complete_and_unchecked(self):
        class Zero:
            def getrandbits(self, n):
                return 0
        db = db_with([lead(1, "f1"), lead(2, "f2"), lead(3, "f1"), lead(4, "f3", zuletzt_geprueft="2026-10-01")],
                     ["f1", "f3"])
        got = D.fresh_leads(db, "S2", "US", 5, Zero(), tries=2)
        # f2 unvollständig, Lead 3 gleiche Firma wie Lead 1, Lead 4 schon geprüft
        self.assertEqual([r["id"] for r in got], [lead(1, "f1")["id"]])

    def test_customer_markets_skip_test_customers(self):
        db = FakeDB({"subscriptions": [{"customer_id": "c1", "segment_id": "S1", "filters": {"country": "uk"}, "status": "active"},
                                       {"customer_id": "c2", "segment_id": "S2", "filters": {"country": "FR"}, "status": "active"}],
                     "customers": [{"id": "c1", "status": "active"},
                                   {"id": "c2", "status": "trial", "stripe_customer_id": "cus_x"}]})
        self.assertEqual(D.customer_markets(db), [("S1", "UK")])


class LeadRunTest(unittest.TestCase):
    def test_run_holds_failures_and_records_stats(self):
        leads = [lead(1, "f1"), lead(2, "f2")]
        db = db_with(leads, ["f1", "f2"])
        verdicts = [G.Verdict(leads[0]["id"], True, country="US", segment="S2", status="new"),
                    G.Verdict(leads[1]["id"], False, 1, ["s1:befund_nicht_bestaetigt:ok"], country="US", segment="S2",
                              status="new")]
        with mock.patch.object(D, "plan_leads", return_value=(leads, {"faellig": 0, "neu": {}, "bremse": "aus"})), \
                mock.patch.object(G, "check", return_value=verdicts) as chk:
            res = D.run_leads(db, 2, apply=True, live=False, rng=random.Random(1), cfg={}, log=lambda *_: None)
        self.assertEqual(chk.call_args.kwargs["live"], False)
        self.assertEqual((res["geprueft"], res["bestanden"], res["gehalten"]), (2, 1, 1))
        self.assertEqual({r["id"]: r["status"] for r in db.rows("leads")}[leads[1]["id"]], "held")
        stats = db.rows("run_stats")
        self.assertEqual(stats[0]["werk"], "dauerpruefung")
        self.assertEqual(stats[0]["extra"]["art"], "lead")
        self.assertEqual((stats[0]["candidates"], stats[0]["green"], stats[0]["red"]), (2, 1, 1))

    def test_dry_run_writes_nothing(self):
        leads = [lead(1, "f1")]
        db = db_with(leads, ["f1"])
        with mock.patch.object(D, "plan_leads", return_value=(leads, {"faellig": 0, "neu": {}, "bremse": "aus"})), \
                mock.patch.object(G, "check", return_value=[G.Verdict(leads[0]["id"], False, 2, ["s2:x"], status="new")]):
            D.run_leads(db, 1, apply=False, live=False, rng=random.Random(1), cfg={}, log=lambda *_: None)
        self.assertEqual(db.updates, [])
        self.assertEqual(db.rpcs, [])
        self.assertEqual(db.rows("leads")[0]["status"], "new")


def prospect(pid, **kw):
    return {"id": pid, "segment_id": "S2", "company_name": "Acme", "legal_form": "Inc", "country": "US",
            "website": "https://acme.com", "domain": "acme.com", "email": "info@acme.com", "source_url": "https://acme.com/c",
            "size_note": "10 staff", "check_status": "ok", **kw}


class KaeuferTest(unittest.TestCase):
    def verdict(self, p, sup=frozenset(), bounced=(set(), set()), mx=None, site=None):
        with mock.patch("lib.rules.load_countries", return_value=CFG):
            return D.prospect_verdict(p, CFG, set(sup), bounced, mx, site)

    def test_ok(self):
        self.assertEqual(self.verdict(prospect("p1"), mx=lambda d: True, site=lambda u: None)["result"], "ok")

    def test_suppressed_domain_rejects_via_existing_rule(self):
        v = self.verdict(prospect("p1"), sup={"acme.com"})
        self.assertEqual(v["result"], "abgelehnt")
        self.assertEqual(v["update"]["check_status"], "rejected")
        self.assertIn("Sperrliste", v["update"]["check_reason"])

    def test_rejected_with_phone_becomes_call_only(self):
        v = self.verdict(prospect("p1", email="bob@gmail.com", phone="+1 555"))
        self.assertEqual(v["update"]["check_status"], "call_only")
        self.assertTrue(v["update"]["check_reason"].startswith("nur Anruf/Brief – "))

    def test_hints_only_mark(self):
        v = self.verdict(prospect("p1"), bounced=({"p1"}, set()), mx=lambda d: True, site=lambda u: "tot")
        self.assertEqual(v["result"], "hinweis")
        self.assertEqual(v["hinweis"], "bounce_historie,website_nicht_erreichbar")
        self.assertNotIn("update", v)

    def test_intake_rules_reject_stock(self):
        # gleiche Eingangsregeln wie das Kunden-Werk: kein MX, ungültige Adresse, Overture-Mail bei toter Website
        v = self.verdict(prospect("p1"), mx=lambda d: False, site=lambda u: None)
        self.assertEqual((v["result"], v["update"]["check_status"]), ("abgelehnt", "rejected"))
        self.assertIn("ohne MX", v["update"]["check_reason"])
        v = self.verdict(prospect("p2", email="%20service@acme.com", phone="+1 555"), mx=lambda d: True, site=lambda u: None)
        self.assertEqual(v["update"]["check_status"], "call_only")
        ov = prospect("p3", source_url="https://overturemaps.org (Firmeneintrag x)")
        self.assertEqual(self.verdict(ov, mx=lambda d: True, site=lambda u: "tot")["result"], "abgelehnt")
        self.assertEqual(self.verdict(ov, mx=lambda d: True, site=lambda u: None)["result"], "ok")
        # MX nicht prüfbar (None) ist kein Hinweis
        self.assertEqual(self.verdict(prospect("p2"), mx=lambda d: None, site=lambda u: None)["result"], "ok")

    def test_run_kaeufer_tightens_only(self):
        rows = [prospect("p1"), prospect("p2", domain="bad.com", email="info@bad.com", website="https://bad.com")]
        db = FakeDB({"prospects": rows, "suppression": [{"kind": "domain", "value": "bad.com"}],
                     "email_events": [{"type": "bounced", "message_id": "m1"}],
                     "messages": [{"id": "m1", "prospect_id": "p1", "to_email": "info@acme.com"}]})
        with mock.patch.object(D, "plan_prospects", return_value=(rows, 0)), \
                mock.patch("lib.rules.load_countries", return_value=CFG):
            res = D.run_kaeufer(db, 2, apply=True, live=False, rng=random.Random(1), cfg={}, log=lambda *_: None)
        self.assertEqual((res["markiert"], res["abgelehnt"], res["bestanden"]), (1, 1, 0))
        upd = [u for u in db.updates if u[0] == "prospects"]
        self.assertEqual(len(upd), 1)
        self.assertEqual(upd[0][1], {"id": "p2", "check_status": "ok"})   # nur von ok aus, nie zurück auf ok
        self.assertEqual(upd[0][2]["check_status"], "rejected")
        calls = [a for f, a in db.rpcs if f == "prospect_quality_apply"]
        self.assertEqual({r["id"]: r["result"] for r in calls[0]["p_rows"]}, {"p1": "hinweis", "p2": "abgelehnt"})
        st = db.rows("run_stats")[0]
        self.assertEqual((st["werk"], st["extra"]["art"], st["yellow"], st["red"]), ("dauerpruefung", "kaeufer", 1, 1))

    def test_site_state_dns(self):
        import socket
        with mock.patch("socket.getaddrinfo", side_effect=socket.gaierror):
            self.assertEqual(D.site_state("https://gone.example"), "tot")
        from lib.fetch import FetchRefused
        with mock.patch("socket.getaddrinfo", return_value=[1]), \
                mock.patch("lib.fetch.polite_get", side_effect=FetchRefused("robots")):
            self.assertIsNone(D.site_state("https://robots.example"))   # robots.txt = nicht prüfbar, kein Hinweis


class SelectionTest(unittest.TestCase):
    def test_best_first_prefers_checked(self):
        from responder import best_first
        rows = [{"id": "a", "urgency": "high", "event_date": "2026-10-04"},
                {"id": "b", "urgency": "low", "event_date": "2026-09-01", "qualitaet_score": 70},
                {"id": "c", "urgency": "medium", "event_date": "2026-10-01", "qualitaet_score": 40}]
        self.assertEqual([r["id"] for r in best_first(rows)], ["b", "c", "a"])

    def test_with_checked_adds_quality_pool(self):
        from responder import with_checked
        db = FakeDB({"leads": [{"id": "x", "status": "new", "qualitaet_score": 85}, {"id": "y", "status": "new"}]})
        got = with_checked(db, {"status": "eq.new"}, [{"id": "y"}])
        self.assertEqual([r["id"] for r in got], ["y", "x"])

    def test_select_leads_prefers_quality_keeps_rules(self):
        from deliveries import select_leads
        leads = [{"id": "n1", "segment_id": "S2", "country": "US", "company_id": "a", "signal_type": "no_website"},
                 {"id": "q1", "segment_id": "S2", "country": "US", "company_id": "b", "signal_type": "no_website",
                  "qualitaet_score": 85},
                 {"id": "q2", "segment_id": "S2", "country": "UK", "company_id": "c", "signal_type": "no_website",
                  "qualitaet_score": 100},
                 {"id": "q3", "segment_id": "S2", "country": "US", "company_id": "d", "signal_type": "no_website",
                  "qualitaet_score": 99}]
        sub = {"segment_id": "S2", "filters": {"country": "US", "max_per_week": 2}}
        got = select_leads(leads, sub, already={"q3"}, details={})
        self.assertEqual([l["id"] for l in got], ["q1", "n1"])   # Land und „einmal pro Abo“ gelten weiter


class SummaryTest(unittest.TestCase):
    def test_summary_text_short_with_outliers(self):
        kpi = {"tage": [{"tag": "2026-10-04", "art": "lead", "geprueft": 200, "bestanden": 190, "markiert": 0, "gehalten": 10},
                        {"tag": "2026-10-04", "art": "kaeufer", "geprueft": 300, "bestanden": 280, "markiert": 15, "gehalten": 5},
                        {"tag": "2026-10-03", "art": "lead", "geprueft": 99, "bestanden": 0, "markiert": 0, "gehalten": 99}],
               "leads": [{"geprueft": 500, "score_70": 120}],
               "ausreisser": [{"art": "lead", "segment_id": "S2", "country": "FR", "fehlerquote": 0.12, "geprueft": 50}]}
        t = D.summary_text(kpi)
        self.assertIn("Leads: 200 geprüft, 190 bestanden, 10 gehalten (5.0% Abweichung)", t)
        self.assertIn("Käufer: 300 geprüft, 280 bestanden, 15 markiert", t)
        self.assertIn("S2/FR: 12.0% von 50", t)
        self.assertIn("Bestand Leads: 500 mit Wert, 120 ab 70", t)
        self.assertLess(len(t), 800)


class WiringTest(unittest.TestCase):
    def test_workflow_hourly_and_pause(self):
        import yaml
        wf = yaml.safe_load((ROOT / ".github" / "workflows" / "dauerpruefung.yml").read_text())
        cron = (wf.get(True) or wf.get("on"))["schedule"][0]["cron"]
        self.assertEqual(cron.split()[1:], ["*", "*", "*", "*"])
        self.assertNotEqual(cron.split()[0], "0")   # versetzt
        text = (ROOT / ".github" / "workflows" / "dauerpruefung.yml").read_text()
        self.assertIn("scripts/dauerpruefung.py run", text)
        self.assertNotIn("claude", text.lower().replace("claude.md", ""))   # keine Tokens
        from lib import owner_settings, run_stats
        self.assertIn("dauerpruefung", owner_settings.WERKE)
        self.assertIn("dauerpruefung", run_stats.WERKE)
        import wachhund
        self.assertEqual(wachhund.PAUSE_KEY["dauerpruefung.yml"], "dauerpruefung")
        self.assertTrue(any(j["wf"] == "dauerpruefung.yml" for j in wachhund.JOBS))

    def test_paused_exits_clean(self):
        db = FakeDB({"owner_settings": [{"key": "werke_paused", "value": {"dauerpruefung": "2026-10-04T10:00:00Z"}}]})
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(D, "run_leads") as rl:
            self.assertEqual(D.main(["run", "--apply"]), 0)
        rl.assert_not_called()

    def test_migration(self):
        sql = (ROOT / "supabase" / "migrations" / "20261005040000_signalwerk_dauerpruefung.sql").read_text()
        for col in ("pruef_anzahl", "zuletzt_geprueft", "naechste_pruefung", "qualitaet_score", "pruef_hinweis"):
            self.assertIn(f"add column if not exists {col}", sql)
        self.assertNotRegex(sql.lower(), r"\b(drop table|drop column|delete from|truncate)\b")
        self.assertIn("'dauerpruefung'", sql)
        self.assertIn("pruef_stats_daily", sql)


if __name__ == "__main__":
    unittest.main()


class BrokenAddressFirstTest(unittest.TestCase):
    """Qualitäts-Agent 05.10.2026: mail-fähige Käufer mit „%20“/Leerzeichen in der Adresse zuerst prüfen."""

    def _p(self, i, email, **kw):
        return {"id": f"p{i:03d}", "check_status": "ok", "email": email, "segment_id": "S4", "country": "US",
                "zuletzt_geprueft": "2026-10-02T00:00:00+00:00", "naechste_pruefung": "2026-10-20T00:00:00+00:00", **kw}

    def test_broken_first_capped_at_half_budget(self):
        rows = [self._p(i, f"%20info{i}@x{i}.com") for i in range(5)] + [self._p(9, "a b@y.com"),
                                                                         self._p(10, "info@ok.com"),
                                                                         self._p(11, "%20x@z.com", check_status="call_only")]
        db = FakeDB({"prospects": rows})
        got = D.broken_prospects(db, 10)
        self.assertEqual({r["id"] for r in got}, {"p000", "p001", "p002", "p003", "p004", "p009"})
        chosen, _ = D.plan_prospects(db, 4, {"maerkte": []}, random.Random(1), NOW)
        self.assertEqual(len(chosen), 2)  # 4 // 2, nie mehr als das halbe Budget
        self.assertTrue(all("%20" in r["email"] or " " in r["email"] for r in chosen))

    def test_broken_address_is_rejected_by_unchanged_rule(self):
        v = D.prospect_verdict({"id": "p1", "email": "%20service@soapeffect.com", "country": "US", "segment_id": "S2",
                                "website": "https://soapeffect.com", "legal_form": "LLC"}, CFG, set(), (set(), set()))
        self.assertEqual(v["result"], "abgelehnt")


class AltlastTest(unittest.TestCase):
    """Auftrag efbcdb71 (05.10.2026): Overture-Altbestand vor #358/#360 zuerst prüfen, getrennt messen."""

    def _p(self, i, created, src="https://overturemaps.org (Firmeneintrag x)", **kw):
        return {"id": f"p{i:03d}", "check_status": "ok", "email": f"info@x{i}.com", "segment_id": "S2", "country": "US",
                "created_at": created, "source_url": src, **kw}

    def test_altlast_selection(self):
        rows = [self._p(1, "2026-10-02T10:00:00+00:00"), self._p(2, "2026-10-04T18:00:00+00:00"),
                self._p(3, "2026-10-05T10:00:00+00:00"),                                   # nach den Eingangsregeln
                self._p(4, "2026-10-02T10:00:00+00:00", src="https://x4.com/contact"),     # Website-Quelle
                self._p(5, "2026-10-02T10:00:00+00:00", zuletzt_geprueft="2026-10-04T00:00:00+00:00"),
                self._p(6, "2026-10-02T10:00:00+00:00", check_status="call_only"),
                self._p(7, "2026-10-02T10:00:00+00:00", country="UK")]
        db = FakeDB({"prospects": rows})
        got = D.altlast_prospects(db, 10, [("S2", "US"), ("S2", "UK")])
        self.assertEqual({r["id"] for r in got}, {"p001", "p002", "p007"})
        chosen, _ = D.plan_prospects(db, 3, {"maerkte": ["S2/US"]}, random.Random(1), NOW)
        self.assertEqual([r["id"] for r in chosen if r.get("_vorgezogen")], ["p001"])   # höchstens ein Drittel

    def test_vorgezogen_counts_separately(self):
        rows = [{**prospect("p1"), "_vorgezogen": True}, prospect("p2", email="info@acme2.com")]
        db = FakeDB({"prospects": rows})
        with mock.patch.object(D, "plan_prospects", return_value=(rows, 0)), \
                mock.patch("lib.rules.load_countries", return_value=CFG):
            D.run_kaeufer(db, 2, apply=True, live=False, rng=random.Random(1), cfg={}, log=lambda *_: None)
        arts = sorted(r["extra"]["art"] for r in db.rows("run_stats"))
        self.assertEqual(arts, ["kaeufer", "kaeufer_altlast"])
        calls = [a for f, a in db.rpcs if f == "prospect_quality_apply"]
        self.assertTrue(all("_vorgezogen" not in r for r in calls[0]["p_rows"]))
