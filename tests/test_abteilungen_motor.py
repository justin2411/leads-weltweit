"""Abteilungs-Motor (scripts/abteilungen_motor.py): Lücke je Abteilung, Gewichtung, Aufträge ohne Doppel, Grenzen."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import abteilungen_motor as M  # noqa: E402
from fakedb import FakeDB  # noqa: E402

T = dt.datetime(2026, 10, 4, 21, 30, tzinfo=dt.timezone.utc)
SCOPE = (["S2"], ["US", "UK", "FR"])
LAGE = {"mrr": 0, "kunden": 0, "gruen_7d": 93615, "spam_30d": 0, "proben_7d": 2, "heiss_offen": 0,
        "bestanden": 0.9697, "bestanden_n": 363,
        "laender": {"US": {"erstmails": 26, "antworten": 0}, "UK": {"erstmails": 4, "antworten": 0}, "FR": {"erstmails": 0, "antworten": 0}}}
DEPS = [
    {"slug": "vertrieb", "name": "Vertrieb", "ziel_key": "antwortquote", "ziel_soll": None, "ziel_richtung": "hoch", "leitung_rolle": "trichter", "sort": 10},
    {"slug": "marketing", "name": "Marketing", "ziel_key": "proben_7d", "ziel_soll": 5, "ziel_richtung": "hoch", "leitung_rolle": "test", "sort": 20},
    {"slug": "produktion", "name": "Produktion", "ziel_key": "gruen_7d", "ziel_soll": 3000, "ziel_richtung": "hoch", "leitung_rolle": "quellen", "sort": 30},
    {"slug": "qualitaet", "name": "Qualität", "ziel_key": "lead_fehler", "ziel_soll": None, "ziel_richtung": "runter", "leitung_rolle": "qualitaet", "sort": 40},
    {"slug": "kundenservice", "name": "Kundenservice", "ziel_key": "heiss_offen", "ziel_soll": 0, "ziel_richtung": "runter", "leitung_rolle": None, "sort": 50},
    {"slug": "finanzen", "name": "Finanzen", "ziel_key": "mrr", "ziel_soll": None, "ziel_richtung": "hoch", "leitung_rolle": None, "sort": 60},
    {"slug": "recht", "name": "Recht", "ziel_key": "spam_30d", "ziel_soll": 0, "ziel_richtung": "runter", "leitung_rolle": None, "sort": 70},
    {"slug": "strategie", "name": "Strategie", "ziel_key": "kunden", "ziel_soll": None, "ziel_richtung": "hoch", "leitung_rolle": None, "sort": 80},
]
GOALS = [{"key": "mrr", "soll": 1290, "richtung": "hoch"}, {"key": "kunden", "soll": 10, "richtung": "hoch"},
         {"key": "antwortquote", "soll": 3, "richtung": "hoch"}, {"key": "lead_fehler", "soll": 2, "richtung": "runter"}]
ROLES = [{"slug": s, "department": d, "aktiv": True, "sort": i} for i, (s, d) in enumerate([
    ("test", "marketing"), ("trichter", "vertrieb"), ("zustellung", "vertrieb"), ("quellen", "produktion"),
    ("qualitaet", "qualitaet"), ("kundenservice", "kundenservice"), ("finanzen", "finanzen"), ("recht", "recht"),
    ("strategie", "strategie")])]


def db(**extra):
    t = {"departments": [dict(d, aktiv=True) for d in DEPS], "company_goals": GOALS, "agent_roles": ROLES,
         "settings": [{"id": 1, "brain_enabled": True}], "owner_settings": [], "agent_tasks": [], "department_gaps": []}
    t.update(extra)
    return FakeDB(t)


class LueckeTest(unittest.TestCase):
    def test_luecke(self):
        self.assertEqual(M.luecke(0, 3, "hoch"), 1.0)
        self.assertEqual(M.luecke(2, 5, "hoch"), 0.6)
        self.assertEqual(M.luecke(93615, 3000, "hoch"), 0.0)
        self.assertEqual(M.luecke(0, 0, "runter"), 0.0)
        self.assertEqual(M.luecke(2, 0, "runter"), 1.0)
        self.assertAlmostEqual(M.luecke(3.03, 2, "runter"), 0.3399, places=3)
        self.assertIsNone(M.luecke(None, 3, "hoch"))
        self.assertIsNone(M.luecke(1, None, "hoch"))

    def test_ist_ehrlich(self):
        self.assertEqual(M.ist_wert("antwortquote", LAGE), 0.0)  # 30 Erstmails = Mindestmenge
        self.assertIsNone(M.ist_wert("antwortquote", {"laender": {"US": {"erstmails": 10, "antworten": 0}}}))
        self.assertEqual(M.ist_wert("lead_fehler", LAGE), 3.03)
        self.assertIsNone(M.ist_wert("mrr", {}))

    def test_reihenfolge_umsatznah_zuerst(self):
        rows = M.bewerten(DEPS, LAGE, GOALS)
        self.assertEqual([r["slug"] for r in rows[:3]], ["vertrieb", "marketing", "finanzen"])
        self.assertEqual(rows[0]["luecke"], 1.0)
        self.assertEqual({r["slug"] for r in rows if r["luecke"] == 0}, {"produktion", "kundenservice", "recht"})


class LaufTest(unittest.TestCase):
    def test_auftraege_kurz_sicher_fokus(self):
        d = db()
        res = M.lauf(d, T, True, LAGE, SCOPE)
        self.assertEqual(res["modus"], "auftrag")
        self.assertEqual([n["abteilung"] for n in res["neu"]], ["vertrieb", "marketing", "finanzen"])
        tasks = d.rows("agent_tasks")
        self.assertEqual(len(tasks), 3)
        self.assertEqual({t["rolle"] for t in tasks}, {"trichter", "test", "finanzen"})
        for t in tasks:
            self.assertEqual(t["created_by"], M.BY)
            self.assertLessEqual(len(t["brief"]), 1000)
            self.assertLessEqual(len(t["grund"]), 160)
            self.assertIn("US/UK/FR", t["brief"])
            self.assertIn("Sperrliste", t["brief"])
            self.assertIn("Erfolgskennzahl", t["brief"])
            self.assertIn(t["agent"], range(1, 9))
        gaps = {g["slug"]: g for g in d.rows("department_gaps")}
        self.assertEqual(len(gaps), 8)
        self.assertLessEqual(len(gaps["vertrieb"]["titel"]), 60)
        self.assertTrue(gaps["vertrieb"]["task_id"])
        self.assertIsNone(gaps["produktion"]["titel"])  # Ziel erreicht – kein Auftrag

    def test_nie_doppelt_und_takt(self):
        d = db()
        M.lauf(d, T, True, LAGE, SCOPE)
        # 30 min später: Takt (2 h) – nichts Neues
        self.assertEqual(M.lauf(d, T + dt.timedelta(minutes=30), True, LAGE, SCOPE)["modus"], "warten")
        # 3 h später: Aufträge noch offen – kein zweiter
        res = M.lauf(d, T + dt.timedelta(hours=3), True, LAGE, SCOPE)
        self.assertEqual(res["neu"], [])
        self.assertEqual(len(d.rows("agent_tasks")), 3)
        # fertig, aber < 24 h – Wirkung abwarten
        for t in d.rows("agent_tasks"):
            t["status"] = "fertig"
        self.assertEqual(M.lauf(d, T + dt.timedelta(hours=6), True, LAGE, SCOPE)["neu"], [])
        # nach 24 h wieder
        self.assertEqual(len(M.lauf(d, T + dt.timedelta(hours=25), True, LAGE, SCOPE)["neu"]), 3)

    def test_hoechstens_sechs_offen_und_einer_frei(self):
        alt = [{"id": f"a{i}", "agent": i, "status": "offen", "created_by": M.BY, "brief": f"Motor X{i}: alt",
                "created_at": T.isoformat()} for i in range(1, 7)]
        d = db(agent_tasks=alt)
        self.assertEqual(M.lauf(d, T, True, LAGE, SCOPE)["neu"], [])
        busy = [{"id": f"b{i}", "agent": i, "status": "laeuft", "created_by": "Inhaber Dashboard", "brief": "x",
                 "created_at": T.isoformat()} for i in range(1, 8)]
        d = db(agent_tasks=busy)
        self.assertEqual(M.lauf(d, T, True, LAGE, SCOPE)["neu"], [])  # nur A8 frei – bleibt für den Inhaber

    def test_rolle_beschaeftigt(self):
        d = db(agent_tasks=[{"id": "u1", "agent": 1, "status": "offen", "rolle": "trichter", "created_by": "Übergabe",
                             "brief": "x", "created_at": T.isoformat()}])
        res = M.lauf(d, T, True, LAGE, SCOPE)
        self.assertNotIn("vertrieb", [n["abteilung"] for n in res["neu"]])

    def test_gehirn_aus_nur_anzeigen(self):
        d = db(settings=[{"id": 1, "brain_enabled": False}])
        res = M.lauf(d, T, True, LAGE, SCOPE)
        self.assertEqual(res["modus"], "anzeigen")
        self.assertEqual(d.rows("agent_tasks"), [])
        self.assertEqual(len(d.rows("department_gaps")), 8)  # anzeigen ja
        self.assertTrue(all(g["modus"] == "anzeigen" for g in d.rows("department_gaps")))

    def test_agenten_pausiert(self):
        d = db(owner_settings=[{"key": "werke_paused", "value": {"agenten": "2026-10-04"}}])
        self.assertEqual(M.lauf(d, T, True, LAGE, SCOPE)["neu"], [])

    def test_ohne_apply_schreibt_nichts(self):
        d = db()
        res = M.lauf(d, T, False, LAGE, SCOPE)
        self.assertEqual(len(res["neu"]), 3)
        self.assertEqual(d.rows("agent_tasks"), [])
        self.assertEqual(d.rows("department_gaps"), [])

    def test_ausserhalb_fokus_kein_auftrag(self):
        d = db()
        self.assertEqual(M.lauf(d, T, True, LAGE, (["S4"], ["US"]))["neu"], [])


class GrenzenTest(unittest.TestCase):
    def test_vorlagen_sicher(self):
        for slug, (kind, titel, aufgabe, kennzahl) in M.VORLAGEN.items():
            self.assertTrue(M.sicher(aufgabe), slug)
            self.assertIn(kind, ("leads", "kaeufer", "quelle", "pruefen", "frage", "kunde", "website", "gehirn"))

    def test_verboten_erkannt(self):
        for t in ("Versand einschalten", "Tageslimit erhöhen", "Sperrliste ändern", "Notbremse lösen", "Leads löschen",
                  "countries.yaml anpassen", "Freigabe lockern", "Prüfregeln ändern", "Upgrade buchen"):
            self.assertFalse(M.sicher(t), t)


class ZuordnungTest(unittest.TestCase):
    """Jede Dashboard-Bereichsseite gehört zu einer Abteilung, jede Abteilung hat mindestens einen Agenten."""
    ROOT = Path(__file__).resolve().parents[1]

    def _sql(self) -> str:
        return "\n".join(p.read_text(encoding="utf-8") for p in sorted((self.ROOT / "supabase/migrations").glob("*.sql")))

    def test_seiten_zugeordnet(self):
        import re
        sql = self._sql()
        # alle Einträge aus allen Migrationen (neue Seiten kommen mit eigener, additiver Migration dazu)
        seiten: dict[str, str] = {}
        for part in sql.split("insert into signalwerk.dashboard_bereiche")[1:]:
            block = part[:part.index("on conflict")]
            seiten.update(re.findall(r"\('([a-z0-9-]+)', '([a-z_]+)'\)", block))
        deps = set(re.findall(r"^\s*\('([a-z_]+)', '[^']+', '[^']+', '", sql[sql.index("insert into signalwerk.departments"):], re.M))
        pages = [p.parent.name for p in (self.ROOT / "app/app/dashboard").glob("*/page.tsx")]
        for page in pages:
            self.assertIn(page, seiten, f"Dashboard-Seite {page} ohne Abteilung")
        for page, dep in seiten.items():
            self.assertIn(dep, deps | {"premium_labor"}, page)

    def test_jede_abteilung_hat_agent(self):
        import re
        sql = self._sql()
        roles = set(re.findall(r"^\s*(?:\(|select )'([a-z_]+)', '[^']+', '(?:testing|qualitaet)'.*$", sql, re.M))
        deps_mit_agent = set(re.findall(r"^\s*\d+, '([a-z_]+)'\)?,?$", sql, re.M))
        deps_mit_agent |= set(re.findall(r"when '[a-z_]+' then '([a-z_]+)'", sql))
        for slug in ("vertrieb", "marketing", "produktion", "qualitaet", "kundenservice", "finanzen", "recht", "strategie"):
            self.assertIn(slug, deps_mit_agent, slug)
        self.assertTrue({"kundenservice", "finanzen", "recht", "strategie"} <= roles)


if __name__ == "__main__":
    unittest.main()
