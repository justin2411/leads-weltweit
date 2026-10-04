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
        self.assertEqual(W.check_health(200, fx("health.json"))[0]["text"], "Variable fehlt: GH_DISPATCH_TOKEN")
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
