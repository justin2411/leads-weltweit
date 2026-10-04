"""Website-Check der eigenen Seite und Website-Agenten (Inhaber 04.10.2026) – ohne Netz, mit Fixtures."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import jarvis_chat as J  # noqa: E402
import website_agents as A  # noqa: E402
import website_check as W  # noqa: E402
from fakedb import FakeDB  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "website"
SITE = "https://www.nextgen-profit.de"


def fx(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


class FakeFetch:
    """Antworten je Pfad: (status, ms, html). Unbekannt = 404. Merkt sich alle Abrufe."""

    def __init__(self, pages: dict):
        self.pages, self.calls = pages, []

    def __call__(self, url: str, method: str = "GET"):
        assert url.startswith(SITE), url
        path = url[len(SITE):] or "/"
        self.calls.append((method, path))
        st, ms, html = self.pages.get(path, (404, 80, "<html><title>Not found</title></html>"))
        return st, ms, len(html.encode()), html if method == "GET" else ""


def site_pages(**over):
    legal = fx("legal.html")
    pages = {"/": (200, 400, fx("start.html")), "/fr": (200, 500, fx("landing.html")), "/de": (200, 500, fx("landing.html")),
             "/uk/web-agencies": (200, 900, fx("landing.html")), "/fr/agences-web": (200, 700, fx("landing.html")),
             "/uk/web-agencies/start": (200, 300, fx("landing.html")),
             W.HEALTH: (200, 120, fx("health.json"))}
    for p in W.LEGAL_PAGES:
        pages[p] = (200, 200, legal)
    pages.update(over)
    return pages


class PageCheckTest(unittest.TestCase):
    def test_clean_landing_has_no_findings(self):
        self.assertEqual(W.check_page("/uk/web-agencies", "landing", 200, 800, 40_000, fx("landing.html")), [])

    def test_landing_problems(self):
        f = W.check_page("/x", "landing", 200, 7000, 3_000_000, fx("landing_ohne_form.html"))
        got = {(x["bereich"], x["stufe"], x["text"].split(" (")[0]) for x in f}
        self.assertIn(("tempo", "rot", "sehr langsam"), got)
        self.assertIn(("tempo", "rot", "sehr groß"), got)
        self.assertIn(("handy", "rot", "kein Handy-Viewport"), got)
        self.assertIn(("formulare", "rot", "Probe-Formular fehlt"), got)
        self.assertIn(("texte", "gelb", "Beschreibung fehlt"), got)
        self.assertIn(("texte", "gelb", "Platzhalter im Text"), got)
        self.assertTrue(any(x["text"].startswith("Überschrift mit Satzzeichen") for x in f))

    def test_start_page_text_rules(self):
        f = W.check_page("/", "start", 200, 300, 10_000, fx("start.html"))
        texts = [x["text"] for x in f]
        self.assertIn("Gedankenstrich im Text (1×)", texts)  # Skript-Inhalt zählt nicht mit
        self.assertTrue(any("checked every day" in t for t in texts))
        self.assertFalse(any(x["bereich"] == "formulare" for x in f))  # Formular nur auf Landingpages Pflicht

    def test_status_codes(self):
        self.assertEqual(W.check_page("/a", "start", None, None, 0, "")[0]["bereich"], "erreichbar")
        self.assertEqual(W.check_page("/a", "start", 503, 10, 0, "")[0]["text"], "Serverfehler 503")
        self.assertEqual(W.check_page("/a", "start", 404, 10, 0, "")[0]["bereich"], "fehler")

    def test_legal_placeholder(self):
        self.assertEqual(W.check_page("/impressum", "legal", 200, 100, 5000, fx("legal.html")), [])
        f = W.check_page("/impressum", "legal", 200, 100, 5000, fx("legal_platzhalter.html"))
        self.assertEqual([(x["bereich"], x["stufe"]) for x in f], [("recht", "rot")])

    def test_health_and_404(self):
        self.assertEqual(W.check_health(200, fx("health.json"))[0]["text"], "Variable fehlt: SITE_URL")
        self.assertEqual(W.check_health(200, '{"variablen": {"GH_DISPATCH_TOKEN": "optional"}}'), [])  # optional fehlt = kein Fund
        self.assertEqual(W.check_health(200, '{"variablen": {"A": "gesetzt"}}'), [])
        self.assertEqual(W.check_health(500, "")[0]["stufe"], "rot")
        self.assertEqual(W.check_missing(404), [])
        self.assertEqual(W.check_missing(200)[0]["bereich"], "fehler")

    def test_internal_links_only_own_host(self):
        links = W.internal_links(W.parse(fx("start.html")), SITE + "/", "www.nextgen-profit.de")
        self.assertEqual(links, ["/uk/web-agencies", "/fr/agences-web", "/impressum", "/kaputt"])


class ScoreTest(unittest.TestCase):
    def test_scores_share_of_clean_pages(self):
        funde = [W.finding("texte", "gelb", "a", "/1"), W.finding("texte", "gelb", "b", "/1"), W.finding("texte", "info", "c", "/2"),
                 W.finding("tempo", "rot", "x", "/3")]
        sc = W.scores(funde, {"texte": 10, "tempo": 10, "handy": 10})
        self.assertEqual(sc["texte"], 96)       # eine Seite gelb (0,35 von 10), info zählt nicht
        self.assertEqual(sc["tempo"], 60)       # rot hält bei höchstens 60
        self.assertEqual(sc["handy"], 100)
        self.assertIsNone(sc["recht"])          # nicht geprüft
        self.assertEqual(W.total({"a": 100, "b": 60, "c": None}), 80)


class RunTest(unittest.TestCase):
    def test_full_run_polite_and_own_domain(self):
        fetch = FakeFetch(site_pages())
        res = W.run(fetch, SITE, ["/uk/web-agencies", "/fr/agences-web"])
        paths = [p for _, p in fetch.calls]
        self.assertEqual(paths[:3], ["/", "/fr", "/de"])
        self.assertIn(W.MISSING, paths)
        self.assertIn(("HEAD", "/kaputt"), fetch.calls)
        self.assertNotIn(("HEAD", "/impressum"), fetch.calls)  # schon geprüft, nicht doppelt
        self.assertFalse(any(p.startswith(("/api/sample", "/dashboard")) for p in paths))
        broken = [f for f in res["funde"] if f["text"].startswith("kaputter Link")]
        self.assertEqual([f["pfad"] for f in broken], ["/kaputt"])
        self.assertEqual(res["funde"][0]["stufe"], "rot")  # rot zuerst
        self.assertEqual(res["scores"]["recht"], 100)
        self.assertEqual(res["scores"]["formulare"], 100)
        self.assertLessEqual(res["scores"]["fehler"], 60)
        self.assertEqual(set(res["scores"]), set(W.AREAS))

    def test_link_limit(self):
        fetch = FakeFetch(site_pages())
        W.run(fetch, SITE, [], max_links=0)
        self.assertFalse(any(m == "HEAD" for m, _ in fetch.calls))

    def test_fetcher_refuses_foreign_hosts_and_pauses(self):
        class S:
            headers: dict = {}

            def request(self, method, url, **kw):
                r = mock.Mock(status_code=200, url=url, text="<html></html>", content=b"<html></html>")
                return r
        sleeps = []
        f = W.Fetcher(S(), pause=1.0, sleep=sleeps.append)
        with self.assertRaises(ValueError):
            f("https://example.com/")
        f(SITE + "/")
        f(SITE + "/fr")
        self.assertEqual(sleeps, [1.0])
        self.assertIn("NextGenProfit-Website-Check", S.headers["User-Agent"])

    def test_site_url_only_own_domain(self):
        with mock.patch.dict("os.environ", {"SITE_URL": "https://www.nextgen-profit.de/"}):
            self.assertEqual(W.site_url(), SITE)
        with mock.patch.dict("os.environ", {"SITE_URL": "https://example.vercel.app"}):
            with self.assertRaises(SystemExit):
                W.site_url()

    def test_landing_paths_from_db(self):
        db = FakeDB({"landing_pages": [{"slug": "uk/web-agencies", "status": "live"}, {"slug": "us/x", "status": "draft"},
                                       {"slug": "../evil", "status": "live"}]})
        self.assertEqual(W.landing_paths(db), ["/uk/web-agencies"])


T0 = dt.datetime(2026, 10, 4, 10, 0, tzinfo=dt.timezone.utc)
H = lambda h: (T0 - dt.timedelta(hours=h)).isoformat()  # noqa: E731


class DueTest(unittest.TestCase):
    def test_rhythms(self):
        self.assertTrue(A.due({"aktiv": True, "rhythmus": "taeglich", "last_run_at": None}, T0))
        self.assertTrue(A.due({"aktiv": True, "rhythmus": "taeglich", "last_run_at": H(23.5)}, T0))
        self.assertFalse(A.due({"aktiv": True, "rhythmus": "taeglich", "last_run_at": H(20)}, T0))
        self.assertFalse(A.due({"aktiv": True, "rhythmus": "woechentlich", "last_run_at": H(24 * 6)}, T0))
        self.assertTrue(A.due({"aktiv": True, "rhythmus": "woechentlich", "last_run_at": H(24 * 7)}, T0))
        self.assertTrue(A.due({"aktiv": True, "rhythmus": "einmal", "last_run_at": None}, T0))
        self.assertFalse(A.due({"aktiv": True, "rhythmus": "einmal", "last_run_at": H(500)}, T0))

    def test_inactive_or_open_never_due(self):
        self.assertFalse(A.due({"aktiv": False, "rhythmus": "taeglich", "last_run_at": None}, T0))
        self.assertFalse(A.due({"aktiv": True, "rhythmus": "taeglich", "last_run_at": H(48)}, T0, "laeuft"))
        self.assertFalse(A.due({"aktiv": True, "rhythmus": "gibtsnicht", "last_run_at": None}, T0))


def agents_db():
    return FakeDB({
        "website_agents": [
            {"id": "w1", "name": "Fehler & Links", "aufgabe": "Kaputte Links finden und reparieren", "rhythmus": "taeglich",
             "aktiv": True, "last_run_at": H(30), "last_task_id": "t1", "last_result": None, "created_at": H(100)},
            {"id": "w2", "name": "Tempo", "aufgabe": "Seiten schneller machen", "rhythmus": "woechentlich", "aktiv": True,
             "last_run_at": None, "last_task_id": None, "last_result": None, "created_at": H(90)},
            {"id": "w3", "name": "Aus", "aufgabe": "nichts tun bitte", "rhythmus": "taeglich", "aktiv": False,
             "last_run_at": None, "last_task_id": None, "last_result": None, "created_at": H(80)},
            {"id": "w4", "name": "Einmal", "aufgabe": "Rechtstexte prüfen", "rhythmus": "einmal", "aktiv": True,
             "last_run_at": H(2), "last_task_id": "t2", "last_result": None, "created_at": H(70)},
        ],
        "agent_tasks": [
            {"id": "t1", "agent": 1, "status": "fertig", "result": "3 Links repariert, PR #300 gemergt."},
            {"id": "t2", "agent": 2, "status": "laeuft", "result": None},
            {"id": "t9", "agent": 3, "status": "offen", "result": None},
        ],
    })


class FaelligTest(unittest.TestCase):
    def test_dry_run_changes_nothing(self):
        db = agents_db()
        res = A.faellig(db, T0, apply=False)
        self.assertEqual([x["agent"] for x in res["neu"]], ["Fehler & Links", "Tempo"])
        self.assertEqual([x["an"] for x in res["neu"]], ["A1", "A4"])  # A2/A3 belegt
        self.assertEqual(db.inserts, [])
        self.assertEqual(db.updates, [])

    def test_apply_creates_tasks_and_copies_results(self):
        db = agents_db()
        A.faellig(db, T0, apply=True)
        new = [r for t, r in db.inserts if t == "agent_tasks"]
        self.assertEqual([(r["agent"], r["kind"], r["created_by"]) for r in new], [(1, "website", "Website-Agent"), (4, "website", "Website-Agent")])
        self.assertEqual(new[0]["brief"], "Website-Agent Fehler & Links: Kaputte Links finden und reparieren")
        w = {r["id"]: r for r in db.rows("website_agents")}
        self.assertEqual(w["w1"]["last_result"], "3 Links repariert, PR #300 gemergt.")
        self.assertEqual(w["w1"]["last_task_id"], new[0]["id"])
        self.assertEqual(w["w1"]["last_run_at"], T0.isoformat())
        self.assertIsNone(w["w3"]["last_run_at"])  # ausgeschaltet
        self.assertIsNone(w["w4"]["last_result"])  # läuft noch
        # zweiter Lauf direkt danach: nichts Neues (Aufträge offen)
        again = A.faellig(db, T0 + dt.timedelta(minutes=15), apply=True)
        self.assertEqual(again["neu"], [])

    def test_no_free_agent_waits(self):
        db = agents_db()
        db.tables["agent_tasks"] += [{"id": f"x{n}", "agent": n, "status": "offen"} for n in range(1, 9)]
        res = A.faellig(db, T0, apply=True)
        self.assertEqual(res["neu"], [])
        self.assertEqual(res["wartet"], ["Fehler & Links", "Tempo"])

    def test_short_result(self):
        self.assertEqual(A.short_result({"status": "fehler", "result": ""}), "Fehler: ohne Angabe")
        self.assertEqual(len(A.short_result({"status": "fertig", "result": "x" * 900})), 300)


class SuggestTest(unittest.TestCase):
    """Lösungsvorschlag je Fund (Inhaber 04.10.2026: „direkt mit lösungsvorschlägen“)."""

    def test_short_title_drops_brand_then_shortens(self):
        self.assertEqual(W.short_title("New companies across the UK that still need an accountant | NextGen Profit"),
                         "New companies across the UK that still need an accountant")
        t = W.short_title("Des entreprises nouvelles et en croissance, partout en France, qui doivent s'assurer | NextGen Profit")
        self.assertLessEqual(len(t), 60)
        self.assertNotIn(",", t)
        self.assertFalse(t.rstrip("…").endswith((" en", " qui", " et")))
        self.assertEqual(W.short_title("Kurz | NextGen Profit"), "Kurz | NextGen Profit")

    def test_heading_without_punctuation(self):
        self.assertEqual(W.fix_heading("Built on public record, checked every day", "en"),
                         "Built on public record and checked every day")
        self.assertEqual(W.fix_heading("Fondé sur des données publiques, vérifié chaque jour", "fr"),
                         "Fondé sur des données publiques et vérifié chaque jour")
        self.assertEqual(W.fix_heading("See it for yourself,", "en"), "See it for yourself")
        self.assertEqual(W.fix_heading("Des dirigeants partout en France, au moment où ils ont besoin de conseil", "fr"),
                         "Des dirigeants partout en France au moment où ils ont besoin de conseil")
        v = W.suggest("texte", "ueberschrift", "gelb", "/de", "Erreichen Sie Unternehmen genau dann, wenn sie Sie brauchen")
        self.assertEqual(v["text"], "Ohne Komma umformulieren (Entwurf)")
        self.assertNotIn(",", v["neu"])

    def test_dash_replaced(self):
        self.assertEqual(W.fix_dash("Reachable – but no website", "en"), "Reachable but no website")
        self.assertEqual(W.fix_dash("Joignables – mais sans site web", "fr"), "Joignables mais sans site web")
        self.assertEqual(W.fix_dash("Leads – jede Woche neu", "de"), "Leads, jede Woche neu")
        self.assertEqual(W.dash_context("a b c d e Reachable – but no website at all here"), "c d e Reachable – but no website at")

    def test_findings_carry_key_and_suggestion(self):
        html = ('<html><head><meta name="viewport" content="width=device-width"><title>' + "Lange Überschrift " * 6
                + '| NextGen Profit</title><meta name="description" content="' + "x" * 80 + '"></head><body>'
                '<h1>Built on public record, checked every day</h1><p>Reachable – but no website</p></body></html>')
        f = {x["key"]: x for x in W.check_page("/", "start", 200, 100, 5000, html)}
        self.assertEqual(sorted(f), ["texte:strich:/", "texte:titel:/", "texte:ueberschrift:/"])
        self.assertEqual(f["texte:strich:/"]["vorschlag"]["neu"], "Reachable but no website")
        self.assertLessEqual(len(f["texte:titel:/"]["vorschlag"]["neu"]), 60)
        self.assertTrue(all(x["vorschlag"]["auto"] for x in f.values()))

    def test_legal_price_infra_only_reported(self):
        self.assertFalse(W.suggest("recht", "platzhalter", "rot", "/impressum")["auto"])
        self.assertFalse(W.suggest("texte", "titel", "gelb", "/agb", "x" * 80)["auto"])
        self.assertFalse(W.suggest("texte", "ueberschrift", "gelb", "/uk/x", "Starter, 129 € per month")["auto"])
        self.assertFalse(W.suggest("erreichbar", "variable", "gelb", "/api/health")["auto"])
        self.assertFalse(W.suggest("texte", "beschreibung", "info", "/")["auto"])
        self.assertTrue(W.suggest("fehler", "link", "rot", "/kaputt")["auto"])
        self.assertEqual(W.check_health(200, fx("health.json"))[0]["key"], "erreichbar:variable:/api/health")


T1 = dt.datetime(2026, 10, 4, 12, 0, tzinfo=dt.timezone.utc)


def fnd(key, stufe="gelb", auto=True, text="Titel zu lang (90 Zeichen)"):
    area, _, path = key.split(":", 2)
    return {"bereich": area, "stufe": stufe, "text": text, "pfad": path or None, "key": key,
            "vorschlag": {"text": "Titel kürzen", "neu": "Kurzer Titel", "auto": auto}}


def fix_db(funde, fixes=(), tasks=(), settings=()):
    return FakeDB({"website_checks": [{"at": (T1 - dt.timedelta(hours=1)).isoformat(), "funde": list(funde)}],
                   "website_fixes": [dict(f) for f in fixes], "agent_tasks": [dict(t) for t in tasks],
                   "owner_settings": [dict(s) for s in settings]})


class AutoFixTest(unittest.TestCase):
    def test_one_bundled_task_per_page(self):
        db = fix_db([fnd("texte:titel:/fr/a"), fnd("texte:strich:/fr/a"), fnd("texte:titel:/uk/b", stufe="rot"),
                     fnd("texte:beschreibung:/uk/b", stufe="info"), fnd("recht:platzhalter:/impressum", "rot", auto=False)])
        res = A.autofix(db, T1, apply=True)
        self.assertEqual([(x["pfad"], x["funde"]) for x in res["neu"]], [("/uk/b", 1), ("/fr/a", 2)])  # rot zuerst
        tasks = [r for t, r in db.inserts if t == "agent_tasks"]
        self.assertEqual([(r["kind"], r["created_by"]) for r in tasks], [("website", "Website-Auto-Fix")] * 2)
        self.assertTrue(tasks[1]["brief"].startswith("Website-Fix /fr/a: Titel zu lang (90 Zeichen) → „Kurzer Titel“; "))
        self.assertIn("Nie Rechtstexte oder Preise", tasks[1]["brief"])
        self.assertLessEqual(max(len(r["brief"]) for r in tasks), 1000)
        fx_rows = db.rows("website_fixes")
        self.assertEqual(sorted(fx_rows[1]["keys"]), ["texte:strich:/fr/a", "texte:titel:/fr/a"])
        self.assertEqual({r["quelle"] for r in fx_rows}, {"auto"})
        # gleich danach: alles schon beauftragt, nichts doppelt
        self.assertEqual(A.autofix(db, T1 + dt.timedelta(minutes=15), apply=True)["neu"], [])

    def test_max_three_per_day_and_switch_off(self):
        funde = [fnd(f"texte:titel:/p{i}") for i in range(5)]
        res = A.autofix(fix_db(funde), T1, apply=True)
        self.assertEqual(len(res["neu"]), 3)
        self.assertEqual(len(res["wartet"]), 2)
        off = fix_db(funde, settings=[{"key": "website_autofix", "value": False}])
        self.assertTrue(A.autofix(off, T1, apply=True)["aus"])
        self.assertEqual(off.inserts, [])

    def test_ignored_and_retry_limit(self):
        until = (T1 + dt.timedelta(days=30)).isoformat()
        old = [{"id": f"f{i}", "created_at": (T1 - dt.timedelta(days=i + 2)).isoformat(), "task_id": f"t{i}",
                "keys": ["texte:titel:/a"], "quelle": "auto", "behoben_at": None} for i in range(2)]
        tasks = [{"id": "t0", "status": "fertig", "agent": 1}, {"id": "t1", "status": "fertig", "agent": 2}]
        db = fix_db([fnd("texte:titel:/a"), fnd("texte:titel:/b")], fixes=old, tasks=tasks,
                    settings=[{"key": "website_ignored", "value": {"texte:titel:/b": until}}])
        res = A.autofix(db, T1, apply=True)
        self.assertEqual(res["neu"], [])
        self.assertEqual(res["gesperrt"], ["texte:titel:/a"])  # zwei Versuche, jetzt nur noch Inhaber

    def test_mark_fixed_after_next_check(self):
        fixes = [{"id": "f1", "created_at": T1.isoformat(), "task_id": "t1", "keys": ["texte:titel:/a"], "quelle": "auto", "behoben_at": None},
                 {"id": "f2", "created_at": T1.isoformat(), "task_id": "t2", "keys": ["texte:titel:/b"], "quelle": "inhaber", "behoben_at": None},
                 {"id": "f3", "created_at": T1.isoformat(), "task_id": "t3", "keys": ["texte:titel:/c"], "quelle": "auto", "behoben_at": None}]
        tasks = [{"id": "t1", "status": "fertig"}, {"id": "t2", "status": "fertig"}, {"id": "t3", "status": "laeuft"}]
        db = fix_db([], fixes=fixes, tasks=tasks)
        n = A.mark_fixed(db, [fnd("texte:titel:/b")], T1 + dt.timedelta(hours=2))
        self.assertEqual(n, 1)
        got = {r["id"]: r["behoben_at"] for r in db.rows("website_fixes")}
        self.assertIsNotNone(got["f1"])
        self.assertIsNone(got["f2"])  # Fund noch da
        self.assertIsNone(got["f3"])  # Auftrag läuft noch


class ChatContextTest(unittest.TestCase):
    def test_website_session_gets_last_check(self):
        t = dt.datetime(2026, 10, 4, 10, 0, tzinfo=dt.timezone.utc)
        db = FakeDB({
            "jarvis_sessions": [{"id": "sw", "title": "Website", "kind": "website", "flow_id": None, "archived": False}],
            "jarvis_messages": [{"id": "m1", "session_id": "sw", "created_at": t.isoformat(), "role": "inhaber",
                                 "body": "Mach den Titel kürzer", "status": "offen"}],
            "website_checks": [{"at": t.isoformat(), "site": SITE, "scores": {"texte": 80}, "seiten": 20,
                                "funde": [{"bereich": "texte", "stufe": "gelb", "text": "Titel zu lang"},
                                          {"bereich": "texte", "stufe": "info", "text": "Beschreibung 200 Zeichen"}]}],
        })
        with mock.patch.object(J, "now", return_value=t):
            out = J.offen(db)
        self.assertEqual(out[0]["session"]["kind"], "website")
        self.assertEqual(out[0]["website_check"]["scores"], {"texte": 80})
        self.assertEqual([f["text"] for f in out[0]["website_check"]["funde"]], ["Titel zu lang"])
        self.assertIn("claude/agenten-website-", out[0]["hinweis"])


if __name__ == "__main__":
    unittest.main()
