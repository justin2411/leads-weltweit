"""Prüffälle des Gehirns (tests/fixtures/gehirn_faelle.json) und Lernschleife (scripts/brain_learn.py, lib/lernen.py).
Feste Regeln (Notbremse, Länder, Rechtsform, Testbereich, Antworten, Grenzen) müssen jeden Fall richtig entscheiden –
nie eine verbotene Handlung. Lernschleife mit FakeDB: messen, Wissen stärken/schwächen, Rückschau archiviert statt zu
löschen, Pause schreibt nichts."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import brain_eval as E  # noqa: E402
import brain_learn as B  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import gehirn_regeln as G  # noqa: E402
from lib import kurz  # noqa: E402
from lib import lernen as L  # noqa: E402

UTC = dt.timezone.utc
FAELLE = json.loads((ROOT / "tests" / "fixtures" / "gehirn_faelle.json").read_text(encoding="utf-8"))["faelle"]


class FaelleTest(unittest.TestCase):
    def test_mindestens_20_eindeutige_faelle(self):
        self.assertGreaterEqual(len(FAELLE), 20)
        ids = [f["id"] for f in FAELLE]
        self.assertEqual(len(ids), len(set(ids)))
        for f in FAELLE:
            self.assertIn(f["art"], G.ARTEN, f["id"])
            self.assertIn(f["richtig"], G.HANDLUNGEN, f["id"])
            self.assertNotIn(f["richtig"], f.get("verboten") or [], f["id"])
            for v in f.get("verboten") or []:
                self.assertIn(v, G.HANDLUNGEN, f["id"])
            self.assertLessEqual(len(f["titel"]), 60, f["id"])

    def test_regeln_entscheiden_jeden_fall_richtig(self):
        for f in FAELLE:
            with self.subTest(f["id"]):
                a = G.entscheide(f)
                self.assertNotIn(a, f.get("verboten") or [])
                self.assertEqual(a, f["richtig"])

    def test_eval_regeln_100_punkte(self):
        res = E.regeln(FAELLE)
        self.assertEqual((res["score"], res["verboten"]), (100.0, 0))

    def test_bewerten_zaehlt_verbotene_und_fehlende(self):
        antw = {f["id"]: f["richtig"] for f in FAELLE}
        antw["notbremse-eine-beschwerde"] = "versand_weiter"   # verboten
        del antw["test-s4-us"]                                 # fehlt
        res = G.bewerte(FAELLE, antw)
        self.assertEqual(res["richtig"], len(FAELLE) - 2)
        self.assertEqual(res["verboten"], 1)
        self.assertLess(res["score"], 100)

    def test_speichern_meldet_gesunkene_punktzahl(self):
        db = FakeDB({"brain_evals": [{"id": 1, "quelle": "regeln", "score": 100, "created_at": "2026-10-04T05:00:00Z"}]})
        info = E.speichern(db, {"faelle": 30, "richtig": 29, "verboten": 0, "score": 96.7, "details": []}, "regeln")
        self.assertTrue(info["gesunken"])
        self.assertEqual(db.rows("brain_evals")[-1]["score"], 96.7)

    def test_vorlegen_ohne_loesung(self):
        for f in E.vorlegen(FAELLE):
            self.assertNotIn("richtig", f)
            self.assertNotIn("verboten", f)


class LernenTest(unittest.TestCase):
    def test_normal_prueftag_und_fehler(self):
        t = dt.datetime(2026, 10, 5, 8, tzinfo=UTC)
        e, when = L.normal({"kennzahl": "antwortquote", "richtung": "steigt", "tage": 99, "thema": "Betreff US"}, t)
        self.assertEqual(e["tage"], 60)
        self.assertEqual(e["thema"], "betreff-us")
        self.assertEqual(when, (t + dt.timedelta(days=60)).isoformat())
        with self.assertRaises(ValueError):
            L.normal({"kennzahl": "antwortquote", "richtung": "mindestens"})   # zielwert fehlt
        with self.assertRaises(ValueError):
            L.normal({"kennzahl": "Antwort Quote!", "richtung": "steigt"})
        self.assertIsNone(L.normal(None))

    def test_urteil(self):
        e = {"kennzahl": "bounce_quote", "richtung": "hoechstens", "zielwert": 0.03}
        self.assertEqual(L.urteil(e, None, 0.02)[0], "bestaetigt")
        self.assertEqual(L.urteil(e, None, 0.04)[0], "widerlegt")
        self.assertEqual(L.urteil({"kennzahl": "x_y", "richtung": "faellt"}, 5, 5)[0], "unklar")

    def test_live_wert_mindestmengen(self):
        self.assertIsNone(L.live_wert("antwortquote", {"gesendet": 29, "antworten": 3}))
        self.assertEqual(L.live_wert("antwortquote", {"gesendet": 200, "antworten": 3}), 0.015)
        self.assertEqual(L.live_wert("zustellrate", {"gesendet": 100, "bounces": 4}), 0.96)

    def test_widersprueche(self):
        rows = [{"slug": "lehre-a", "thema": "a", "richtung": "wirkt", "vertrauen": 0.8},
                {"slug": "fehler-a", "thema": "a", "richtung": "wirkt_nicht", "vertrauen": 0.6},
                {"slug": "lehre-b", "thema": "b", "richtung": "wirkt", "vertrauen": 0.8}]
        self.assertEqual(L.widersprueche(rows), [{"thema": "a", "wirkt": ["lehre-a"], "wirkt_nicht": ["fehler-a"]}])

    def test_insert_decisions_mit_erwartung(self):
        db = FakeDB()
        kurz.insert_decisions(db, {"type": "note", "subject": "Betreff US kürzer", "reasoning": "Test.",
                                   "erwartung": {"kennzahl": "antwortquote", "richtung": "mindestens",
                                                 "zielwert": 0.01, "land": "us", "tage": 7}})
        row = db.rows("decisions")[0]
        self.assertEqual(row["erwartung"]["land"], "US")
        self.assertTrue(row["pruefen_am"])
        with self.assertRaises(ValueError):
            kurz.insert_decisions(db, {"type": "note", "subject": "x", "erwartung": {"kennzahl": "x"}})


T = dt.datetime(2026, 10, 12, 4, 0, tzinfo=UTC)   # Montag 06:00 deutscher Zeit


def _db(score=None, brain=True):
    db = FakeDB({
        "settings": [{"id": 1, "brain_enabled": brain}],
        "decisions": [
            {"id": 11, "type": "note", "subject": "Kurzer Betreff US", "kurz_titel": "Kurzer Betreff US",
             "created_at": "2026-10-05T04:00:00+00:00", "pruefen_am": "2026-10-12T04:00:00+00:00", "ergebnis": None,
             "erwartung": {"kennzahl": "antwortquote", "richtung": "mindestens", "zielwert": 0.01, "land": "US",
                           "thema": "betreff-us", "lehre": "Kurzer Betreff hebt Antworten"}},
            {"id": 12, "type": "note", "subject": "Seite FR neu", "created_at": "2026-10-05T04:00:00+00:00",
             "pruefen_am": "2026-10-30T04:00:00+00:00", "ergebnis": None,
             "erwartung": {"kennzahl": "antwortquote", "richtung": "mindestens", "zielwert": 0.01}},
        ],
        "brain_knowledge": [
            {"id": "k1", "slug": "fehler-betreff-us", "titel": "Wirkt nicht", "markdown": "x", "quelle": "routine",
             "vertrauen": 0.6, "thema": "betreff-us", "richtung": "wirkt_nicht", "status": "aktiv", "belege": []},
            {"id": "k2", "slug": "alt-schwach", "titel": "Alt", "markdown": "x", "quelle": "routine", "vertrauen": 0.2,
             "status": "aktiv", "zuletzt_bestaetigt": "2026-08-01T00:00:00+00:00"},
            {"id": "k3", "slug": "inhaber-alt", "titel": "Alt", "markdown": "x", "quelle": "inhaber", "vertrauen": 0.1,
             "status": "aktiv", "zuletzt_bestaetigt": "2026-08-01T00:00:00+00:00"},
        ],
    })
    db.rpc_handlers["gehirn_score_teile"] = lambda a, p: [score] if score else []
    return db


class LernschleifeTest(unittest.TestCase):
    def test_pruefen_bestaetigt_staerkt_lehre(self):
        db = _db({"gesendet": 200, "antworten": 4, "bounces": 2})
        res = B.pruefen(db, T, apply=True)
        self.assertEqual((res["faellig"], res["bestaetigt"]), (1, 1))
        d = next(r for r in db.rows("decisions") if r["id"] == 11)
        self.assertEqual((d["ergebnis"], d["messwert"]), ("bestaetigt", 0.02))
        kb = {r["slug"]: r for r in db.rows("brain_knowledge")}
        self.assertEqual(kb["lehre-betreff-us"]["richtung"], "wirkt")
        self.assertEqual(kb["lehre-betreff-us"]["vertrauen"], L.V_START_WIRKT)
        self.assertEqual(kb["lehre-betreff-us"]["belege"][0]["decision_id"], 11)
        self.assertLess(kb["fehler-betreff-us"]["vertrauen"], 0.6)          # Gegenteil verliert Vertrauen
        self.assertIsNone(next(r for r in db.rows("decisions") if r["id"] == 12)["ergebnis"])  # noch nicht fällig

    def test_pruefen_ohne_daten_unklar_ohne_wissen(self):
        db = _db(None)
        res = B.pruefen(db, T, apply=True)
        self.assertEqual(res["unklar"], 1)
        self.assertFalse(any(r["slug"].startswith("lehre-") for r in db.rows("brain_knowledge")))

    def test_pause_schreibt_nichts(self):
        db = _db({"gesendet": 200, "antworten": 4, "bounces": 2}, brain=False)
        res = B.pruefen(db, T, apply=True)
        self.assertFalse(res["angewandt"])
        self.assertEqual(db.updates, [])
        self.assertEqual(B.rueckschau(db, T, apply=True)["angewandt"], False)
        self.assertEqual(db.inserts, [])

    def test_rueckschau_archiviert_nie_loeschen_und_einmal_je_woche(self):
        db = _db({"gesendet": 200, "antworten": 4, "bounces": 2})
        B.pruefen(db, T, apply=True)
        res = B.rueckschau(db, T, apply=True)
        self.assertEqual(res["archiviert"], ["alt-schwach"])
        kb = {r["slug"]: r for r in db.rows("brain_knowledge")}
        self.assertEqual(kb["alt-schwach"]["status"], "archiviert")
        self.assertEqual(kb["inhaber-alt"]["status"], "aktiv")
        self.assertEqual(len(db.rows("brain_knowledge")), 4)            # nichts gelöscht, eine Lehre neu
        self.assertEqual(res["woche"], "2026-10-05")
        self.assertTrue(res["lehren"])
        dec = db.rows("decisions")[-1]
        self.assertLessEqual(len(dec["kurz_titel"]), 60)
        self.assertLessEqual(len(dec["kurz_grund"]), 160)
        self.assertEqual(len(db.rows("brain_rueckschau")), 1)
        self.assertEqual(B.rueckschau(db, T, apply=True).get("uebersprungen"), "schon erledigt")

    def test_nur_montag(self):
        self.assertTrue(B.ist_montag_frueh(T))
        self.assertFalse(B.ist_montag_frueh(T + dt.timedelta(days=1)))


if __name__ == "__main__":
    unittest.main()
