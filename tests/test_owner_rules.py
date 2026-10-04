"""Stufe 4 der Freigabe – Inhaber-Regeln aus dem Baukasten (lib/owner_rules.py, Inhaber 03.10.2026).
Alle Zeilen sind erfunden (keine echten Lead-Daten)."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import owner_rules as R  # noqa: E402
from lib import release_gate as G  # noqa: E402
from test_release_gate import TODAY, mx_ok, web_lead  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "flow_cases.json"
FLOW_ID = "1A2B3C4D-0000-4000-8000-000000000001"


def row(**kw):
    base = {"id": "r1", "cid": "c1", "land": "US", "segment": "S2", "signal": "no_website", "dringlichkeit": "high",
            "status": "new", "quelle": "Overture Maps", "alter_tage": 3, "erfasst_tage": 1, "firma": "Café Élan",
            "rechtsform": "LLC", "ort": "Springfield", "region": "IL", "branche": "cafe", "text": "Café Élan has no website",
            "hat_website": False, "hat_telefon": True, "telefon_art": "mobile", "hat_email": True,
            "email_art": "freemail", "hat_person": False, "rolle": "Owner", "vollstaendig": True, "geprueft": None}
    return {**base, **kw}


def c(f, op, v=None):
    return {"f": f, "op": op, **({} if v is None else {"v": v})}


def flow(nodes, edges, seg="S2", countries=("US",)):
    q = {"id": "q", "kind": "quelle", "x": 0, "y": 0, "source": "leads", "segment": seg, "countries": list(countries),
         "status": ["new"], "size": 1000}
    return {"v": 1, "nodes": [q] + nodes, "edges": [{"id": f"e{i}", "from": a, "port": p, "to": b}
                                                       for i, (a, p, b) in enumerate(edges)]}


def phone_rule():
    """Quelle (S2/US) -> Filter Telefon vorhanden -> Pipeline."""
    return flow([{"id": "f", "kind": "filter", "x": 0, "y": 0, "mode": "alle", "conds": [c("hat_telefon", "ja")]},
                 {"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "Haupt"}],
                [("q", "out", "f"), ("f", "out", "p")])


class CondTest(unittest.TestCase):
    def test_norm_strips_accents_case_space(self):
        self.assertEqual(R.norm("  Café ÉLAN "), "cafe elan")

    def test_enum(self):
        r = row()
        self.assertTrue(R.eval_cond(c("land", "ist", "US"), r))
        self.assertFalse(R.eval_cond(c("land", "ist", "us"), r))  # exakt
        self.assertTrue(R.eval_cond(c("land", "ist_nicht", "UK"), r))
        self.assertTrue(R.eval_cond(c("telefon_art", "ist_nicht", "mobile"), row(telefon_art=None)))  # fehlt -> wahr
        self.assertFalse(R.eval_cond(c("telefon_art", "ist", "mobile"), row(telefon_art="  ")))
        self.assertTrue(R.eval_cond(c("signal", "in", ["no_website", "no_https"]), r))
        self.assertFalse(R.eval_cond(c("signal", "in", ["no_https"]), r))
        self.assertFalse(R.eval_cond(c("signal", "in", ["no_website"]), row(signal=None)))
        self.assertTrue(R.eval_cond(c("signal", "nicht_in", ["no_https"]), r))
        self.assertTrue(R.eval_cond(c("signal", "nicht_in", ["no_https"]), row(signal="")))
        self.assertFalse(R.eval_cond(c("signal", "in", "no_website"), r))  # keine Liste

    def test_text(self):
        r = row()
        self.assertTrue(R.eval_cond(c("firma", "enthaelt", "elan"), r))
        self.assertTrue(R.eval_cond(c("firma", "enthaelt", "CAFE"), r))
        self.assertTrue(R.eval_cond(c("firma", "enthaelt", ""), r))
        self.assertFalse(R.eval_cond(c("firma", "enthaelt", ""), row(firma=None)))
        self.assertTrue(R.eval_cond(c("firma", "enthaelt_nicht", "x"), row(firma=None)))
        self.assertFalse(R.eval_cond(c("firma", "enthaelt_nicht", "élan"), r))
        self.assertTrue(R.eval_cond(c("firma", "ist", " cafe elan "), r))
        self.assertFalse(R.eval_cond(c("firma", "ist", ""), row(firma=" ")))
        self.assertTrue(R.eval_cond(c("firma", "ist_nicht", "x"), row(firma=None)))
        self.assertTrue(R.eval_cond(c("firma", "beginnt", "Cafe"), r))
        self.assertFalse(R.eval_cond(c("firma", "beginnt", "Elan"), r))
        self.assertFalse(R.eval_cond(c("firma", "beginnt", ""), row(firma=None)))
        self.assertTrue(R.eval_cond(c("rechtsform", "vorhanden"), r))
        self.assertTrue(R.eval_cond(c("rechtsform", "fehlt"), row(rechtsform="  ")))
        self.assertFalse(R.eval_cond(c("rechtsform", "fehlt"), r))

    def test_num(self):
        r = row(alter_tage=30)
        self.assertTrue(R.eval_cond(c("alter_tage", "lte", 30), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "lt", 30), r))
        self.assertTrue(R.eval_cond(c("alter_tage", "gte", "30"), r))  # Number("30")
        self.assertFalse(R.eval_cond(c("alter_tage", "gt", 30), r))
        self.assertTrue(R.eval_cond(c("alter_tage", "ist", 30.0), r))
        self.assertTrue(R.eval_cond(c("alter_tage", "zwischen", [30, 40]), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "zwischen", [31, 40]), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "zwischen", [1]), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "gt", "abc"), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "gt", "Infinity"), r))
        self.assertFalse(R.eval_cond(c("alter_tage", "lt", 99), row(alter_tage=None)))
        self.assertFalse(R.eval_cond(c("punkte", "gte", 0), r))  # ohne Punkte-Baustein fehlt der Wert

    def test_bool(self):
        self.assertTrue(R.eval_cond(c("hat_telefon", "ja"), row()))
        self.assertFalse(R.eval_cond(c("hat_telefon", "ja"), row(hat_telefon=1)))  # nur echtes true
        self.assertTrue(R.eval_cond(c("hat_person", "nein"), row()))
        self.assertTrue(R.eval_cond(c("hat_person", "nein"), row(hat_person=None)))

    def test_unknown_field_op_or_wrong_type_is_false(self):
        self.assertFalse(R.eval_cond(c("geheim", "ist", "x"), row()))
        self.assertFalse(R.eval_cond(c("land", "enthaelt", "U"), row()))  # Operator nicht für enum
        self.assertFalse(R.eval_cond(c("hat_telefon", "ist", "true"), row()))
        self.assertFalse(R.eval_cond(c("land", "loeschen", "US"), row()))
        self.assertFalse(R.eval_cond(None, row()))


class GraphTest(unittest.TestCase):
    def test_simple_rule(self):
        f = phone_rule()
        self.assertTrue(R.pipeline_check(f, row()))
        self.assertFalse(R.pipeline_check(f, row(hat_telefon=False)))

    def test_scope(self):
        f = phone_rule()
        self.assertTrue(R.in_scope(f, row()))
        self.assertFalse(R.in_scope(f, row(land="UK")))
        self.assertFalse(R.in_scope(f, row(segment="S4")))
        self.assertTrue(R.pipeline_check(f, row(land="UK", hat_telefon=False)))  # außerhalb: Regel greift nicht
        f["nodes"][0].update(segment=None, countries=[], status=["held"])  # Status zählt nicht für den Bereich
        self.assertTrue(R.in_scope(f, row(land="SE", segment="S9", status="new")))
        f["nodes"][0]["source"] = "kaeufer"
        self.assertFalse(R.in_scope(f, row()))

    def test_weiche_ja_nein(self):
        f = flow([{"id": "w", "kind": "weiche", "x": 0, "y": 0, "cond": c("land", "ist", "US")},
                  {"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "P"},
                  {"id": "x", "kind": "export", "x": 0, "y": 0}],
                 [("q", "out", "w"), ("w", "ja", "p"), ("w", "nein", "x")], countries=())
        self.assertTrue(R.reaches(f, row(), "p"))
        self.assertFalse(R.reaches(f, row(), "x"))
        self.assertTrue(R.reaches(f, row(land="UK"), "x"))
        self.assertFalse(R.pipeline_check(f, row(land="UK")))
        f["nodes"][1]["cond"] = None  # ohne Bedingung -> alles „ja“
        self.assertTrue(R.reaches(f, row(land="UK"), "p"))
        f["edges"][1]["port"] = "out"  # falscher Port trägt nichts
        self.assertFalse(R.reaches(f, row(), "p"))

    def test_punkte_min_and_merge_max(self):
        # q -> a (+5 Telefon) -> p ; q -> b (+1 immer) -> p ; p -> m (min 5) -> pipe: Zusammenführung behält das Maximum
        always = c("land", "ist", "US")
        f = flow([{"id": "a", "kind": "punkte", "x": 0, "y": 0, "rules": [{"cond": c("hat_telefon", "ja"), "pts": 5}], "min": None},
                  {"id": "b", "kind": "punkte", "x": 0, "y": 0, "rules": [{"cond": always, "pts": 1}], "min": None},
                  {"id": "s", "kind": "statistik", "x": 0, "y": 0, "by": "signal"},
                  {"id": "m", "kind": "punkte", "x": 0, "y": 0, "rules": [], "min": 5},
                  {"id": "pipe", "kind": "pipeline", "x": 0, "y": 0, "name": "P"}],
                 [("q", "out", "a"), ("q", "out", "b"), ("a", "out", "s"), ("b", "out", "s"), ("s", "out", "m"),
                  ("m", "out", "pipe")])
        self.assertTrue(R.pipeline_check(f, row()))  # max(5, 1) = 5 >= 5
        self.assertFalse(R.pipeline_check(f, row(hat_telefon=False)))  # max(0, 1) = 1
        f["nodes"][4]["rules"] = [{"cond": always, "pts": -1}]
        self.assertFalse(R.pipeline_check(f, row()))  # 5 - 1 = 4
        self.assertTrue(R.reaches(f, row(), "s"))

    def test_filter_modes(self):
        conds = [c("hat_email", "ja"), c("hat_person", "ja")]
        f = flow([{"id": "f", "kind": "filter", "x": 0, "y": 0, "mode": "alle", "conds": conds},
                  {"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "P"}], [("q", "out", "f"), ("f", "out", "p")])
        self.assertFalse(R.pipeline_check(f, row()))
        f["nodes"][1]["mode"] = "eine"
        self.assertTrue(R.pipeline_check(f, row()))
        f["nodes"][1]["conds"] = []
        self.assertTrue(R.pipeline_check(f, row(hat_email=False)))

    def test_bad_graphs_never_pass(self):
        f = phone_rule()
        f["edges"].append({"id": "loop", "from": "f", "port": "out", "to": "f"})
        self.assertFalse(R.pipeline_check(f, row()))  # Zyklus
        g = phone_rule()
        g["nodes"].append({**g["nodes"][0], "id": "q2"})
        self.assertFalse(R.in_scope(g, row()))  # zwei Quellen -> nicht auswertbar
        h = phone_rule()
        h["nodes"][1]["kind"] = "zauber"
        self.assertFalse(R.pipeline_check(h, row()))

    def test_unconnected_pipeline_holds_scope(self):
        f = flow([{"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "P"}], [])
        self.assertFalse(R.pipeline_check(f, row()))
        self.assertTrue(R.pipeline_check(f, row(land="UK")))

    def test_rule_tag(self):
        self.assertEqual(R.rule_tag(FLOW_ID), "s4:regel:1a2b3c4d")


class FlatRowTest(unittest.TestCase):
    def test_fields_from_gate_item(self):
        it = web_lead(created_at="2026-10-01T23:30:00+00:00", event_date="2026-09-30", legal_form=None,
                      company={"legal_form": "Ltd", "region": "North Yorkshire"},
                      contact_raw={"phone": "", "phone_type": "landline", "email": "hello@x.example", "email_type": "company_domain"},
                      person_raw={"name": "", "role": "Owner"}, quality_raw={"complete": True})
        r = R.flat_row(it, TODAY, {"result": "released"})
        self.assertEqual((r["id"], r["cid"], r["land"], r["segment"], r["signal"], r["dringlichkeit"], r["status"]),
                         ("l1", "c1", "UK", "S2", "website_outdated", "medium", "new"))
        self.assertEqual((r["alter_tage"], r["erfasst_tage"]), (3, 2))
        self.assertEqual((r["firma"], r["rechtsform"], r["ort"], r["region"], r["branche"]),
                         ("Harbour Bakes", "Ltd", "Whitby", "North Yorkshire", "bakery"))
        self.assertTrue(r["hat_website"])
        self.assertTrue(r["hat_telefon"])  # phone_main reicht
        self.assertEqual((r["telefon_art"], r["email_art"], r["rolle"]), ("landline", "company_domain", "Owner"))
        self.assertTrue(r["hat_email"])
        self.assertFalse(r["hat_person"])
        self.assertTrue(r["vollstaendig"])
        self.assertEqual(r["geprueft"], "released")
        self.assertIsNone(r.get("punkte"))

    def test_fallbacks(self):
        it = web_lead(event_date=None, source_date="2026-09-28", created_at="2026-09-20T08:00:00Z",
                      company={"website": "  ", "phone_main": None}, contact={"phone": " ", "email": ""},
                      quality_raw={"complete": "TRUE"})
        r = R.flat_row(it, TODAY)
        self.assertEqual((r["alter_tage"], r["erfasst_tage"]), (5, 13))
        self.assertFalse(r["hat_website"])
        self.assertFalse(r["hat_telefon"])
        self.assertFalse(r["hat_email"])
        self.assertTrue(r["vollstaendig"])
        self.assertIsNone(r["geprueft"])
        r = R.flat_row(web_lead(event_date=None, source_date=None, created_at="2026-10-02T01:00:00Z"), TODAY)
        self.assertEqual(r["alter_tage"], 1)
        self.assertFalse(r["vollstaendig"])  # ohne quality


class LoadRulesTest(unittest.TestCase):
    def test_only_active_lead_rules_with_pipeline(self):
        kauf = phone_rule()
        kauf["nodes"][0]["source"] = "kaeufer"
        no_pipe = flow([], [])
        db = FakeDB({"flows": [
            {"id": FLOW_ID, "name": "Telefon", "status": "aktiv", "def": phone_rule()},
            {"id": "22222222-0000", "name": "Entwurf", "status": "entwurf", "def": phone_rule()},
            {"id": "33333333-0000", "name": "Käufer", "status": "aktiv", "def": kauf},
            {"id": "44444444-0000", "name": "ohne", "status": "aktiv", "def": no_pipe},
            {"id": "55555555-0000", "name": "Text", "status": "aktiv", "def": json.dumps(phone_rule())},
        ]})
        rules = R.load_rules(db, log=lambda *a: None)
        self.assertEqual([r["id"] for r in rules], [FLOW_ID, "55555555-0000"])
        self.assertTrue(all(r["broken"] is None for r in rules))

    def test_missing_table_means_no_rules_other_errors_raise(self):
        class Missing:
            def select(self, *a, **k):
                raise RuntimeError('Supabase GET …/flows: 404 {"code":"PGRST205","message":"Could not find the table"}')

        class Down:
            def select(self, *a, **k):
                raise RuntimeError("Supabase GET …/flows: 500 boom")
        self.assertEqual(R.load_rules(Missing()), [])
        with self.assertRaises(RuntimeError):
            R.load_rules(Down())
        self.assertEqual(R.load_rules(FakeDB({})), [])

    def test_broken_rules_hold_their_scope(self):
        for mutate in (lambda f: f["nodes"][1]["conds"].append(c("status", "ist", "new")),     # nicht für die Pipeline
                       lambda f: f["nodes"][1]["conds"].append(c("pruefung", "ist", "ok")),    # Käufer-Feld
                       lambda f: f["nodes"][1]["conds"].append(c("geheim", "ist", "x")),       # unbekannt
                       lambda f: f["nodes"][1]["conds"].append(c("land", "loeschen", "x")),    # Operator unbekannt
                       lambda f: f["nodes"][1].update(kind="top", n=10),                       # Mengen-Baustein
                       lambda f: f["nodes"][1].update(mode="vielleicht")):
            f = phone_rule()
            mutate(f)
            self.assertIsNotNone(R.broken_reason(f), f)
            rule = {"id": FLOW_ID, "flow": f, "broken": R.broken_reason(f)}
            self.assertEqual(R.check([rule], web_lead(country="US", company={"country": "US"}), TODAY), ["regel:1a2b3c4d"])
            self.assertEqual(R.check([rule], web_lead(), TODAY), [])  # UK: außerhalb des Bereichs

    def test_status_on_side_branch_is_fine(self):
        f = phone_rule()
        f["nodes"].append({"id": "w", "kind": "weiche", "x": 0, "y": 0, "cond": c("status", "ist", "held")})
        f["nodes"].append({"id": "x", "kind": "export", "x": 0, "y": 0})
        f["edges"] += [{"id": "e8", "from": "q", "port": "out", "to": "w"}, {"id": "e9", "from": "w", "port": "ja", "to": "x"}]
        self.assertIsNone(R.broken_reason(f))


class Stage4Test(unittest.TestCase):
    def db(self, flows):
        it = web_lead()
        lead = {k: v for k, v in it.items() if k not in ("company", "contact", "person", "quality_blocking")}
        lead["created_at"] = "2026-10-02T10:00:00+00:00"
        return FakeDB({
            "leads": [lead],
            "watch_companies": [it["company"]],
            "observations": [
                {"company_id": "c1", "kind": "other", "key": "contact", "details": {**it["contact"], "phone_type": "landline"}},
                {"company_id": "c1", "kind": "other", "key": "person", "details": {"role": "Owner"}},
                {"company_id": "c1", "kind": "other", "key": "quality", "details": {"complete": "true", "blocking": False}},
            ],
            "deliveries": [], "sample_stock": [], "suppression": [], "lead_checks": [], "flows": flows})

    def rule(self, cond, countries=("UK",), fid=FLOW_ID, status="aktiv"):
        f = flow([{"id": "f", "kind": "filter", "x": 0, "y": 0, "mode": "alle", "conds": [cond]},
                  {"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "Haupt"}],
                 [("q", "out", "f"), ("f", "out", "p")], countries=countries)
        return {"id": fid, "name": "Regel", "status": status, "def": f}

    def test_load_items_keeps_raw_details(self):
        it = G.load_items(self.db([]), ["l1"])[0]
        self.assertEqual(it["contact_raw"]["phone_type"], "landline")
        self.assertEqual(it["quality_raw"]["complete"], "true")
        self.assertEqual(it["created_at"], "2026-10-02T10:00:00+00:00")
        self.assertEqual(it["contact"]["email"], "hello@harbourbakes.example.co.uk")  # bisherige Felder unverändert

    def test_passing_rule_releases(self):
        vs = G.check(self.db([self.rule(c("telefon_art", "ist", "landline"))]), ["l1"], live=False, mx=mx_ok, today=TODAY)
        self.assertTrue(vs[0].ok, vs[0].reasons)

    def test_failing_rule_holds_and_persists(self):
        db = self.db([self.rule(c("hat_person", "ja")),
                      self.rule(c("vollstaendig", "ja"), fid="99999999-aaaa"),
                      self.rule(c("hat_person", "ja"), fid="88888888-bbbb", status="aus")])
        vs = G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)
        v = vs[0]
        self.assertFalse(v.ok)
        self.assertEqual(v.stage, 4)
        self.assertEqual(v.reasons, ["s4:regel:1a2b3c4d"])
        self.assertEqual(G.STAGES[4], "Inhaber-Regeln")
        G.persist(db, vs, "test", log=lambda *a: None)
        self.assertEqual(db.rows("leads")[0]["status"], "held")
        chk = db.rows("lead_checks")[0]
        self.assertEqual((chk["result"], chk["failed_stage"], chk["reasons"]), ("failed", 4, ["s4:regel:1a2b3c4d"]))
        s = G.summary(vs)
        self.assertEqual(s["durchgefallen"], {"1": 0, "2": 0, "3": 0, "4": 1})
        self.assertEqual(s["gruende"], {"s4:regel": 1})
        self.assertEqual(G.stats_rows(vs)[0]["extra"]["durchgefallen"]["4"], 1)

    def test_owner_rules_off_and_out_of_scope(self):
        db = self.db([self.rule(c("hat_person", "ja"))])
        self.assertTrue(G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY, owner_rules=False)[0].ok)
        db = self.db([self.rule(c("hat_person", "ja"), countries=("US",))])
        self.assertTrue(G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)[0].ok)

    def test_stage4_never_releases_earlier_failures(self):
        db = self.db([self.rule(c("hat_person", "ja"))])
        db.tables["leads"][0]["opener"] = "Hi {x}"
        v = G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)[0]
        self.assertFalse(v.ok)
        self.assertEqual(v.stage, 2)
        self.assertIn("s4:regel:1a2b3c4d", v.reasons)
        db = self.db([self.rule(c("telefon_art", "ist", "landline"))])  # Regel besteht, Stufe 2 nicht
        db.tables["leads"][0]["opener"] = "Hi {x}"
        v = G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)[0]
        self.assertFalse(v.ok)
        self.assertEqual(v.stage, 2)

    def test_rule_switched_off_during_live_recheck_not_applied(self):
        """Regeln erst nach der (langen) Live-Nachprüfung laden: eine währenddessen gelöste Regel zählt nicht mehr."""
        from unittest import mock
        db = self.db([self.rule(c("hat_person", "ja"))])

        def recheck(it, fetcher, today):
            db.tables["flows"][0]["status"] = "aus"  # Inhaber löst die Regel, während geprüft wird
            return [], True
        with mock.patch.object(G, "live_recheck", recheck):
            v = G.check(db, ["l1"], live=True, fetcher=object(), mx=mx_ok, today=TODAY, workers=1)[0]
        self.assertTrue(v.ok, v.reasons)

    def test_checked_at_is_verdict_time(self):
        """checked_at = Zeitpunkt des Urteils (flow_release_stale_held vergleicht ihn mit flows.updated_at)."""
        db = self.db([self.rule(c("hat_person", "ja"))])
        v = G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)[0]
        v.at = "2026-10-03T10:00:00+00:00"
        G.persist(db, [v], "test", log=lambda *a: None)
        self.assertEqual(db.rows("lead_checks")[0]["checked_at"], "2026-10-03T10:00:00+00:00")

    def test_sweep_migration_matches_rule_tag(self):
        sql = (Path(__file__).resolve().parents[1] / "supabase" / "migrations"
               / "20261004030300_signalwerk_flow_release_sweep.sql").read_text(encoding="utf-8")
        self.assertIn("substr(t.r, 10)", sql)  # 's4:regel:' = 9 Zeichen
        self.assertEqual(len("s4:regel:"), 9)
        self.assertTrue(R.rule_tag(FLOW_ID).startswith("s4:regel:"))
        self.assertIn("f.updated_at <= c.checked_at", sql)

    def test_rules_loaded_once_per_call(self):
        db = self.db([self.rule(c("hat_telefon", "ja"))])
        calls = []
        orig = db.select

        def spy(table, params=None):
            calls.append(table)
            return orig(table, params)
        db.select = spy
        db.select_all = spy
        G.check(db, ["l1"], live=False, mx=mx_ok, today=TODAY)
        self.assertEqual(calls.count("flows"), 1)


@unittest.skipUnless(FIXTURES.exists(), "tests/fixtures/flow_cases.json fehlt (schreibt app/lib/flow.test.ts)")
class ParityTest(unittest.TestCase):
    """Gleiche Fälle wie app/lib/flow.ts: Python und TypeScript müssen identisch entscheiden."""

    def test_cases(self):
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
        if isinstance(data, list):  # auch als flache Liste: {cond,row,expect} bzw. {flow,row,…}
            data = {"conds": [x for x in data if "cond" in x],
                    "flows": [{**x, "rows": x.get("rows") or [x]} for x in data if "flow" in x]}
        n = 0
        for i, case in enumerate(data.get("conds") or []):
            with self.subTest(kind="cond", i=i, case=case):
                self.assertEqual(R.eval_cond(case["cond"], case["row"]), case["expect"])
                n += 1
        for i, case in enumerate(data.get("flows") or []):
            f = case["flow"]
            for j, rc in enumerate(case.get("rows") or []):
                if "row" not in rc:  # Format von flow.test.ts: rows = Zeilen, pipeline = {id: pipelineCheck}
                    rc = {"row": rc, **({"pipeline_check": case["pipeline"][rc["id"]]}
                                        if rc.get("id") in (case.get("pipeline") or {}) else {})}
                r = rc["row"]
                with self.subTest(kind="flow", i=i, j=j, name=case.get("name")):
                    if "in_scope" in rc:
                        self.assertEqual(R.in_scope(f, r), rc["in_scope"])
                    if "pipeline_check" in rc:
                        self.assertEqual(R.pipeline_check(f, r), rc["pipeline_check"])
                    for target, exp in (rc.get("reaches") or {}).items():
                        self.assertEqual(R.reaches(f, r, target), exp, target)
                    n += 1
        self.assertGreater(n, 0)

    def test_runs(self):
        """Ablauf über eine Menge (runs): run_flow_rows/sink_rows wie runFlowRows/sinkRows in flow.ts."""
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
        runs = (data.get("runs") or []) if isinstance(data, dict) else []
        self.assertGreaterEqual(len(runs), 3)
        ids = lambda rs: [x["id"] for x in rs or []]  # noqa: E731
        for case in runs:
            res = R.run_flow_rows(case["flow"], case["rows"])
            self.assertEqual(sorted(res), sorted(case["expect"]), case["name"])
            for nid, e in case["expect"].items():
                r = res[nid]
                with self.subTest(run=case["name"], node=nid):
                    self.assertEqual(r["connected"], e["connected"])
                    self.assertEqual(ids(r["in"]), e["in"])
                    self.assertEqual(ids(r["out"]), e["out"])
                    if "ja" in e:
                        self.assertEqual((ids(r["ja"]), ids(r["nein"])), (e["ja"], e["nein"]))
                    else:
                        self.assertIsNone(r["ja"])
                    self.assertEqual({x["id"]: x["punkte"] for x in r["out"] if "punkte" in x}, e.get("punkte", {}))
                    self.assertEqual(r.get("stats"), e.get("stats"))
            for kind, exp in case["sinks"].items():
                got = R.sink_rows(case["flow"], case["rows"], kind)
                self.assertEqual({k: ids(v) for k, v in got.items()}, exp, f"{case['name']} / {kind}")
            self.assertEqual([x.get("punkte") for x in case["rows"]], [None] * len(case["rows"]))  # Eingabe unverändert


class MasterKindsTest(unittest.TestCase):
    """Neue Bausteine der Master-Pipeline: freigabe (Schritt), speicher und melden (Ziele)."""

    def test_ports_and_sinks(self):
        self.assertEqual(R.OUT_PORTS["freigabe"], ("out",))
        self.assertEqual((R.OUT_PORTS["speicher"], R.OUT_PORTS["melden"]), ((), ()))
        self.assertTrue({"speicher", "melden"} <= R.SINKS)
        self.assertNotIn("freigabe", R.SINKS)

    def test_freigabe_on_rule_path_passes_through(self):
        f = flow([{"id": "g", "kind": "freigabe", "x": 0, "y": 0},
                  {"id": "f", "kind": "filter", "x": 0, "y": 0, "mode": "alle", "conds": [c("hat_telefon", "ja")]},
                  {"id": "p", "kind": "pipeline", "x": 0, "y": 0, "name": "Haupt"},
                  {"id": "sp", "kind": "speicher", "x": 0, "y": 0, "pool_id": None, "pool_name": "Gesamtbestand"}],
                 [("q", "out", "g"), ("g", "out", "f"), ("f", "out", "p"), ("f", "out", "sp")])
        self.assertIsNone(R.broken_reason(f))
        self.assertTrue(R.pipeline_check(f, row()))
        self.assertFalse(R.pipeline_check(f, row(hat_telefon=False)))
        # Ziele geben nichts weiter: eine Kante aus dem Speicher trägt nicht
        f["edges"].append({"id": "x", "from": "sp", "port": "out", "to": "p"})
        self.assertFalse(R.pipeline_check(f, row(hat_telefon=False)))
        self.assertEqual(R.sink_rows(f, [row(id="a"), row(id="b", hat_telefon=False)], "speicher"), {"sp": [row(id="a")]})

    def test_set_semantics_edge_cases(self):
        rows = [row(id="a", erfasst_tage=2), row(id="b", erfasst_tage=1)]
        top = lambda **kw: flow([{"id": "t", "kind": "top", "x": 0, "y": 0, **kw}], [("q", "out", "t")])  # noqa: E731
        self.assertEqual([x["id"] for x in R.run_flow_rows(top(sort="neueste", n=1.9), rows)["t"]["out"]], ["b"])
        self.assertEqual(R.run_flow_rows(top(sort="zufall", n=5), rows)["t"]["out"], [])  # unbekannt = nichts
        self.assertEqual(R.run_flow_rows(top(sort="neueste", n=True), rows)["t"]["out"], [])
        self.assertEqual(R.run_flow_rows({"v": 1, "nodes": [], "edges": []}, rows), {})
        self.assertEqual(R.count_by([{"x": True}, {"x": False}, {"x": " "}, {"x": 2}, {"x": 2.0}], "x"),
                         [{"key": "2", "n": 2}, {"key": "ja", "n": 1}, {"key": "nein", "n": 1}, {"key": "–", "n": 1}])


if __name__ == "__main__":
    unittest.main()
