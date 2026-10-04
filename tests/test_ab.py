"""A/B je Schritt (Inhaber 04.10.2026): Zuweisung fest je Einheit, Statistik (Bayes), Regeln (nur S2 US/UK/FR, ein
Element, Texte ohne Garantien/Preise/Zahlen), Mail-Varianten nur mit bestandenen Schreibregeln, Werkzeug ab.py
(anlegen, starten, höchstens ein laufender Test je Schritt und Land, auswerten, Gewinner übernehmen, Meldungen)."""
import datetime as dt
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ab as cli  # noqa: E402
import drafts  # noqa: E402
import followups  # noqa: E402
import outreach  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import ab  # noqa: E402
from lib.rules import lint_draft  # noqa: E402

UTC = dt.timezone.utc
CASES = json.loads((ROOT / "tests" / "fixtures" / "ab_cases.json").read_text(encoding="utf-8"))
SCOPE = (["S2"], ["US", "UK", "FR"])


def P(**x):
    return {"id": "4f0c3a8e-1b2d-4c5e-9f00-112233445566", "segment_id": "S2", "country": "US",
            "company_name": "Pixel Studio LLC", "specialization": "", "region": "", **x}


def T(**x):
    return {"id": "t1", "step": "mail_betreff", "segment_id": "S2", "country": "US", "element": "betreff",
            "status": "laeuft", "salt": "", "min_n": 100, "gestartet": "2026-10-04T00:00:00+00:00",
            "varianten": [{"key": "A"}, {"key": "B", "betreff": "No website yet: local businesses across the US"}], **x}


class SharedCasesTest(unittest.TestCase):
    """Gleiche Fälle wie app/lib/ab.test.ts."""

    def test_assign(self):
        for c in CASES["assign"]:
            self.assertEqual(ab.assign(c["salt"], c["unit"]), c["v"], c)

    def test_p_b(self):
        for c in CASES["p_b"]:
            self.assertAlmostEqual(ab.p_b_better(c["nA"], c["kA"], c["nB"], c["kB"]), c["p"], places=4)

    def test_check(self):
        for c in CASES["check"]:
            self.assertEqual(not ab.check_value(c["step"], c["element"], c["value"]), c["ok"], c)

    def test_evaluate(self):
        now = dt.datetime(2026, 10, 20, 12, tzinfo=UTC)
        for c in CASES["evaluate"]:
            t = {"step": "mail_betreff", "min_n": c["min_n"], "gestartet": (now - dt.timedelta(days=c["days"])).isoformat()}
            e = ab.evaluate(t, c["rows"], now)
            self.assertEqual((e["status"], e["gewinner"]), (c["status"], c["gewinner"]), c)
            self.assertAlmostEqual(e["sicherheit"], c["sicherheit"], places=4)


class TieTest(unittest.TestCase):
    def test_no_leader_without_difference(self):
        e = ab.evaluate({"step": "mail_betreff", "min_n": 100, "gestartet": None}, [])
        self.assertIsNone(e["leader"])
        self.assertIsNone(ab.evaluate({"step": "tarif", "min_n": 100}, [{"variant": "A", "n": 50, "k": 5},
                                                                         {"variant": "B", "n": 50, "k": 5}])["leader"])


class AssignTest(unittest.TestCase):
    def test_legacy_subject_assignment_unchanged(self):
        """Betreff-A/B vom 04.10.2026: leeres Salz = drafts.subject_variant (gleiche Käufer, gleiche Variante)."""
        for i in range(40):
            p = P(id=f"pid-{i}")
            self.assertEqual(ab.assign("", p["id"]), drafts.subject_variant(p))

    def test_balanced_and_salted(self):
        units = [f"u{i}" for i in range(2000)]
        share = sum(ab.assign("s1", u) == "B" for u in units) / len(units)
        self.assertTrue(0.45 < share < 0.55, share)
        self.assertNotEqual([ab.assign("s1", u) for u in units[:50]], [ab.assign("s2", u) for u in units[:50]])


class RegistryTest(unittest.TestCase):
    def test_steps_match_migration(self):
        sql = (ROOT / "supabase" / "migrations" / "20261004233000_signalwerk_ab_tests.sql").read_text(encoding="utf-8")
        block = re.search(r"ab_tests_step_check check \(step in \((.*?)\)\);", sql, re.S).group(1)
        self.assertEqual(sorted(re.findall(r"'(\w+)'", block)), sorted(s["key"] for s in ab.registry()["schritte"]))
        stations = {s["key"] for s in ab.registry()["stationen"]}
        self.assertTrue(all(s["station"] in stations for s in ab.registry()["schritte"]))
        for st in stations:
            self.assertIn(f"'{st}'", sql, st)  # jede Station kommt aus ab_funnel

    def test_never_rules_or_prices_as_element(self):
        """Nie Teil eines Tests: Freigabe, Sperrliste, Abmeldung/Fußzeile, Notbremse, Länder, Prüfregeln, Preise."""
        bad = re.compile(r"freigabe|sperr|abmeld|unsub|fusszeile|footer|notbremse|land|countr|pruef|regel|preis|price|"
                         r"pricing|amount|limit", re.I)
        for s in ab.registry()["schritte"]:
            for el in s["elemente"]:
                self.assertFalse(bad.search(el), f"{s['key']}.{el}")


class RulesTest(unittest.TestCase):
    def test_scope_only_s2_us_uk_fr(self):
        ok = dict(step_key="mail_betreff", element="betreff", b="No website yet: local businesses across the UK",
                  hypothese="B nennt das Signal zuerst", scope=SCOPE)
        self.assertEqual(ab.check_test(segment="S2", country="UK", **ok), [])
        self.assertTrue(ab.check_test(segment="S1", country="UK", **ok))
        self.assertTrue(ab.check_test(segment="S2", country="DE", **ok))

    def test_one_thing_and_hypothesis(self):
        self.assertTrue(ab.check_test("mail_betreff", "S2", "US", "einstieg", "x", hypothese="Test", scope=SCOPE))
        same = "No website yet: local businesses across the US"
        errs = ab.check_test("mail_betreff", "S2", "US", "betreff", same, same, "Gleich ist kein Test", scope=SCOPE)
        self.assertIn("A und B sind gleich", errs)
        self.assertTrue(ab.check_test("mail_betreff", "S2", "US", "betreff", same, hypothese="x" * 161, scope=SCOPE))


class MailTest(unittest.TestCase):
    def setUp(self):
        self.p = P()
        subject, body, lang = drafts.build(self.p)
        self.m = {"id": "m1", "subject": subject, "body": body, "language": lang}
        self.lint = lambda s, b: lint_draft(s, b, lang).ok

    def test_frage_keeps_offer(self):
        body = ab.replace_element(self.m["body"], "frage", "Would a free sample of 10 leads help?")
        self.assertIn("free sample of 10 current leads from across the US. Would a free sample of 10 leads help?", body)
        self.assertTrue(body.endswith(self.m["body"][self.m["body"].index("Best regards"):]))

    def test_einstieg_replaces_first_paragraph(self):
        body = ab.replace_element(self.m["body"], "einstieg", "We track new local businesses without a website.")
        ps = body.split("\n\n")
        self.assertEqual(ps[0], "Hi Pixel Studio team,")
        self.assertEqual(ps[1], "We track new local businesses without a website.")
        self.assertIsNone(ab.replace_element("Kein Aufbau", "einstieg", "x"))

    def test_prepare_applies_assigned_variant(self):
        ctx = ab.Ctx(tests=[T()])
        s, b, marks = ctx.prepare_message(self.m, self.p, "S2", "initial", self.lint)
        v = ab.assign("", self.p["id"])
        self.assertEqual(marks, {"t1": v})
        self.assertEqual(s, "No website yet: local businesses across the US" if v == "B" else self.m["subject"])
        self.assertEqual(b, self.m["body"])

    def test_prepare_skips_when_variant_breaks_rules(self):
        bad = T(varianten=[{"key": "A"}, {"key": "B", "betreff": "x" * 70}])
        s, b, marks = ab.Ctx(tests=[bad]).prepare_message(self.m, self.p, "S2", "initial", self.lint)
        self.assertEqual((s, b, marks), (self.m["subject"], self.m["body"], {}))

    def test_prepare_out_of_scope_untouched(self):
        ctx = ab.Ctx(tests=[T(country="DE")])
        self.assertEqual(ctx.prepare_message(self.m, P(country="DE"), "S2", "initial", self.lint)[2], {})
        self.assertEqual(ab.Ctx(tests=[T(segment_id="S1")]).prepare_message(self.m, self.p, "S1", "initial", self.lint)[2], {})

    def test_winner_applies_to_everyone(self):
        won = T(status="gewonnen", gewinner="B", beendet="2026-10-10T00:00:00+00:00")
        s, _, marks = ab.Ctx(tests=[won]).prepare_message(self.m, self.p, "S2", "initial", self.lint)
        self.assertEqual((s, marks), ("No website yet: local businesses across the US", {}))

    def test_firma_placeholder(self):
        t = T(element="einstieg", step="mail_einstieg",
              varianten=[{"key": "A"}, {"key": "B", "einstieg": "I looked at {firma} and businesses across the US "
                                                               "that still have no website, a clear reason to call a web agency."}])
        ctx = ab.Ctx(tests=[t])
        unit = next(f"p{i}" for i in range(50) if ab.assign("", f"p{i}") == "B")
        _, b, marks = ctx.prepare_message(self.m, P(id=unit), "S2", "initial", self.lint)
        self.assertEqual(marks, {"t1": "B"})
        self.assertIn("I looked at Pixel Studio and", b)

    def test_send_window_order(self):
        ctx = ab.Ctx(tests=[T(step="mail_zeit", element="fenster", salt="z",
                              varianten=[{"key": "A", "fenster": "frueh"}, {"key": "B", "fenster": "spaet"}])])
        rows = [{"id": f"m{i}", "kind": "initial", "prospects": {"id": f"p{i}", "country": "US"},
                 "experiments": {"segment_id": "S2"}} for i in range(12)]
        start = dt.datetime(2026, 10, 6, 12, 40, tzinfo=UTC)
        until = dt.datetime(2026, 10, 6, 17, 0, tzinfo=UTC)
        out, zeit, mid = outreach.ab_send_order(ctx, rows, until, start)
        self.assertEqual(mid, dt.datetime(2026, 10, 6, 14, 50, tzinfo=UTC))
        kinds = [zeit[m["id"]][0] for m in out]
        self.assertEqual(kinds, sorted(kinds, key=lambda k: k == "spaet"))
        self.assertEqual(outreach.ab_send_order(ctx, rows, None), (rows, {}, None))


class FollowupDaysTest(unittest.TestCase):
    def test_days_variant(self):
        t = T(step="nachfass", element="tage", salt="n", varianten=[{"key": "A"}, {"key": "B", "tage": 7}])
        ctx = ab.Ctx(tests=[t])
        self.assertEqual(ctx.min_days("nachfass", 4), 4)
        now = dt.datetime(2026, 10, 20, tzinfo=UTC)
        sent = (now - dt.timedelta(days=5)).isoformat()
        a = next(f"p{i}" for i in range(50) if ab.assign("n", f"p{i}") == "A")
        b = next(f"p{i}" for i in range(50) if ab.assign("n", f"p{i}") == "B")
        self.assertEqual(followups.due_after(ctx, "nachfass", P(id=a), sent, 4, now), (True, {"t1": "A"}))
        self.assertEqual(followups.due_after(ctx, "nachfass", P(id=b), sent, 4, now), (False, {"t1": "B"}))


class CliTest(unittest.TestCase):
    def db(self, **tables):
        return FakeDB({"ab_tests": [], "decisions": [], "jarvis_sessions": [], "jarvis_messages": [], **tables})

    def test_create_start_one_running(self):
        db = self.db()
        t = cli.anlegen(db, "mail_einstieg", "uk", "frage", "Would a free sample help?", "Kürzere Frage, mehr Antworten")
        self.assertEqual((t["status"], t["country"], t["messung"]), ("entwurf", "UK", "antwort"))
        self.assertEqual(t["varianten"], [{"key": "A"}, {"key": "B", "frage": "Would a free sample help?"}])
        cli.starten(db, t["id"])
        self.assertEqual(db.rows("ab_tests")[0]["status"], "laeuft")
        d = db.rows("decisions")[-1]
        self.assertTrue(d["kurz_titel"].startswith("Test gestartet"))
        self.assertLessEqual(len(d["kurz_titel"]), 60)
        self.assertLessEqual(len(d["kurz_grund"]), 160)
        self.assertTrue(db.rows("jarvis_messages"))  # Meldung im Gehirn-Chat
        t2 = cli.anlegen(db, "mail_einstieg", "UK", "einstieg", "We track new local businesses without a website.",
                         "Neuer Einstieg bringt mehr Antworten")
        with self.assertRaises(cli.AbError):
            cli.starten(db, t2["id"])

    def test_rejects_out_of_scope_and_bad_text(self):
        db = self.db()
        with self.assertRaises(cli.AbError):
            cli.anlegen(db, "mail_betreff", "DE", "betreff", "Neue Firmen ohne Website", "Test in Deutschland")
        with self.assertRaises(cli.AbError):
            cli.anlegen(db, "tarif", "US", "titel", "Guaranteed results", "Garantie zieht")
        with self.assertRaises(cli.AbError):
            cli.anlegen(db, "checkout", "US", "preis", "x", "Preis pro Besucher")

    def test_evaluate_and_adopt_winner(self):
        t = T(gestartet=(dt.datetime.now(UTC) - dt.timedelta(days=4)).isoformat())
        db = self.db(ab_tests=[t], ab_results=[{"test_id": "t1", "variant": "A", "n": 200, "k": 4},
                                               {"test_id": "t1", "variant": "B", "n": 200, "k": 16}])
        res = cli.auswerten(db, apply=True)
        self.assertEqual((res[0]["status"], res[0]["gewinner"]), ("gewonnen", "B"))
        row = db.rows("ab_tests")[0]
        self.assertEqual((row["status"], row["gewinner"]), ("gewonnen", "B"))
        self.assertTrue(db.rows("decisions")[-1]["kurz_titel"].startswith("B gewinnt"))
        # danach gilt B für alle (übernommen)
        self.assertEqual(ab.Ctx(db).overrides("mail_betreff", "S2", "US"), {"betreff": "No website yet: local businesses across the US"})

    def test_too_little_data_keeps_running(self):
        db = self.db(ab_tests=[T()], ab_results=[{"test_id": "t1", "variant": "A", "n": 20, "k": 0},
                                                 {"test_id": "t1", "variant": "B", "n": 20, "k": 5}])
        self.assertEqual(cli.auswerten(db, apply=True)[0]["status"], "laeuft")
        self.assertEqual(db.rows("ab_tests")[0]["status"], "laeuft")

    def test_landing_creates_variant_and_retires_loser(self):
        db = self.db(settings=[{"auto_publish_pages": True, "legal_ready": True}],
                     landing_pages=[{"id": "lp1", "segment_id": "S2", "country": "US", "status": "live", "slug": "us/web-agencies"}],
                     page_variants=[{"id": "va", "page_id": "lp1", "variant_key": "A", "status": "live", "traffic_share": 100,
                                     "headline": "Alt", "cta_label": "Get sample"}])
        t = cli.anlegen(db, "landing", "US", "headline", "Local businesses without a website, every Monday",
                        "Klarere Überschrift bringt mehr Probe-Anfragen")
        t = cli.starten(db, t["id"])
        new = [v for v in db.rows("page_variants") if v["variant_key"] == "B"][0]
        self.assertEqual((new["status"], new["traffic_share"], new["changed_element"], new["cta_label"]), ("live", 50, "headline", "Get sample"))
        self.assertEqual(db.rows("page_variants")[0]["traffic_share"], 50)
        cli.beenden(db, t["id"], "A bleibt, B schwächer", "gewonnen", "A")
        self.assertEqual(new["id"], [v for v in db.rows("page_variants") if v["status"] == "retired"][0]["id"])
        self.assertEqual(db.rows("page_variants")[0]["traffic_share"], 100)

    def test_landing_needs_auto_publish(self):
        db = self.db(settings=[{"auto_publish_pages": False, "legal_ready": True}])
        t = cli.anlegen(db, "landing", "US", "headline", "Local businesses without a website", "Klarere Überschrift hilft")
        with self.assertRaises(cli.AbError):
            cli.starten(db, t["id"])

    def test_engpass_against_richtwert(self):
        rows = [{"station": "mail", "n": 214, "k": 2}, {"station": "landing", "n": 197, "k": 1},
                {"station": "checkout", "n": 12, "k": 0}]
        e = ab.engpass(rows)
        self.assertEqual(e["station"], "landing")  # 0,5 % bei Richtwert 5 % ist der größte Abfall; checkout zu wenig Daten


if __name__ == "__main__":
    unittest.main()
