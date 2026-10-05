"""Selbstoptimierung (scripts/selbstopt.py, Inhaber 04.10.2026): Stellschrauben nur mit genug Daten, nur in die
erlaubte Richtung, Bewertung nach N Tagen, Rücknahme ohne Wirkung, alles in decisions mit Kurzfassung."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import selbstopt as O  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import quality as Q  # noqa: E402
from lib import selbstopt_state as S  # noqa: E402

UTC = dt.timezone.utc
T = dt.datetime(2026, 10, 20, 10, 0, tzinfo=UTC)


def make_db(**extra):
    db = FakeDB({"selbstopt_state": [], "selbstopt_changes": [], "decisions": [], "ab_tests": [], **extra})
    db.rpc_handlers["selbstopt_kategorien"] = lambda a, p: []
    return db


class Patch:
    """mess_* ersetzen (FakeDB kennt keine eingebetteten Filter)."""

    def __init__(self, versand=(None, 0), pruefung=(None, 0)):
        self.v, self.p = versand, pruefung

    def __enter__(self):
        self.old = O.mess_versand, O.mess_pruefung
        O.mess_versand = lambda db, a, b: self.v
        O.mess_pruefung = lambda db, a, b: self.p
        return self

    def __exit__(self, *a):
        O.mess_versand, O.mess_pruefung = self.old


class Regeln(unittest.TestCase):
    def test_versand_nur_mit_basis_und_nie_ueber_ziel(self):
        self.assertIsNone(O.versand_schritt(1.0, 0.10, 49))           # zu wenig Mails
        self.assertEqual(O.versand_schritt(1.0, 0.04, 80), (0.9, "schutz"))
        self.assertIsNone(O.versand_schritt(0.5, 0.04, 80))           # Boden 0,5
        self.assertEqual(O.versand_schritt(0.7, 0.01, 80), (0.8, "lockern"))
        self.assertIsNone(O.versand_schritt(1.0, 0.0, 500))           # nie über 1,0 = config/versand.yaml
        self.assertIsNone(O.versand_schritt(0.8, 0.02, 80))           # dazwischen: nichts

    def test_pruefung(self):
        self.assertIsNone(O.pruef_schritt(1, 1, 0.2, 299))
        self.assertEqual(O.pruef_schritt(1, 1, 0.06, 400), ({"budget_faktor": 1.5, "intervall_faktor": 0.5}, "schutz"))
        self.assertIsNone(O.pruef_schritt(2, 0.5, 0.2, 400))          # schon am Anschlag
        self.assertEqual(O.pruef_schritt(1.5, 0.5, 0.005, 400), ({"budget_faktor": 1.0, "intervall_faktor": 1.0}, "lockern"))
        self.assertIsNone(O.pruef_schritt(1, 1, 0.0, 400))            # Standard: nie lockerer als config

    def test_kategorien(self):
        rows = [{"kategorie": "web designer", "n": 800, "ok": 400}, {"kategorie": "e commerce service", "n": 300, "ok": 30},
                {"kategorie": "media agency", "n": 100, "ok": 1}]
        avg, n, weak = O.kategorien_schwach(rows, set(), set())
        self.assertEqual(n, 1200)
        self.assertEqual([w["kategorie"] for w in weak], ["e_commerce_service"])   # media agency: zu wenig Daten
        self.assertEqual(O.kategorien_schwach(rows, {"e_commerce_service"}, set())[2], [])
        self.assertEqual(O.kategorien_schwach(rows[:1], set(), set())[2], [])      # gesamt < 1000

    def test_bewerten(self):
        lock = {"schraube": "versand_menge", "art": "lockern", "basis": 0.01}
        self.assertIsNone(O.bewerten(lock, 0.05, 10))
        self.assertEqual(O.bewerten(lock, 0.05, 100), "zurueck")
        self.assertEqual(O.bewerten(lock, 0.02, 100), "wirkt")
        schutz = {"schraube": "versand_menge", "art": "schutz", "basis": 0.04}
        self.assertEqual(O.bewerten(schutz, 0.05, 100), "neutral")      # Schutz geht nie zurück
        kat = {"schraube": "kaeufer_kategorien", "art": "lockern", "basis": 0.40}
        self.assertEqual(O.bewerten(kat, 0.41, 600), "wirkt")
        self.assertEqual(O.bewerten(kat, 0.405, 600), "zurueck")

    def test_leser_klemmen(self):
        self.assertEqual(S.versand_faktor(wert={"faktor": 3}), 1.0)
        self.assertEqual(S.versand_faktor(wert={"faktor": 0.1}), 0.5)
        self.assertEqual(S.pruef_faktoren(wert={"budget_faktor": 9, "intervall_faktor": 2}), (2.0, 1.0))
        self.assertEqual(S.kategorien_hinten(wert={"hinten": ["Media Agency"]}), {"media_agency"})
        self.assertEqual(S.get(None, "x"), {})                         # ohne DB: Standard

    def test_pruefabstaende_nur_kuerzer(self):
        try:
            self.assertEqual(Q.set_interval_factor(3), 1.0)
            self.assertEqual(Q.intervals({"intervalle_tage": [1, 3, 7]}), [1, 3, 7])
            Q.set_interval_factor(0.5)
            self.assertEqual(Q.intervals({"intervalle_tage": [1, 3, 7, 14, 30]}), [1, 2, 4, 7, 15])
        finally:
            Q.set_interval_factor(1)


class Lauf(unittest.TestCase):
    def test_ohne_daten_nichts(self):
        db = make_db()
        with Patch():
            res = O.lauf(db, T, apply=True)
        self.assertEqual(res["geaendert"], [])
        self.assertEqual(db.rows("decisions"), [])

    def test_versand_senken_mit_decision_und_einmal_je_tag(self):
        db = make_db()
        with Patch(versand=(0.045, 120)):
            res = O.lauf(db, T, apply=True)
            self.assertEqual([c["schraube"] for c in res["geaendert"]], ["versand_menge"])
            self.assertEqual(S.versand_faktor(db), 0.9)
            d = db.rows("decisions")[0]
            self.assertTrue(d["subject"].startswith("Selbstopt: "))
            self.assertLessEqual(len(d["kurz_titel"]), 60)
            self.assertLessEqual(len(d["kurz_grund"]), 160)
            ch = db.rows("selbstopt_changes")[0]
            self.assertEqual((ch["art"], ch["status"], ch["vorher"], ch["nachher"]), ("schutz", "offen", {"faktor": 1.0}, {"faktor": 0.9}))
            O.lauf(db, T + dt.timedelta(hours=2), apply=True)     # gleicher Tag: keine zweite Stufe
            self.assertEqual(S.versand_faktor(db), 0.9)

    def test_protokoll_fehlt_trotzdem_einmal_je_tag(self):
        # 04.10.2026: decisions.id (Zahl) im uuid-Feld -> Protokoll scheiterte, fünf Stufen in drei Stunden
        self.assertIsNone(O._uuid_or_none(98))
        self.assertEqual(O._uuid_or_none("0b8f2a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"), "0b8f2a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")
        db = make_db()
        boom = {"n": 0}
        orig = db.insert

        def insert(table, rows, **kw):
            if table == "selbstopt_changes":
                boom["n"] += 1
                raise RuntimeError("400")
            return orig(table, rows, **kw)
        db.insert = insert
        with Patch(versand=(0.045, 120)):
            with self.assertRaises(RuntimeError):
                O.lauf(db, T, apply=True)
            self.assertEqual(S.versand_faktor(db), 0.9)
            for h in (1, 2, 5):
                try:
                    O.lauf(db, T + dt.timedelta(hours=h), apply=True)
                except RuntimeError:
                    pass
            self.assertEqual(S.versand_faktor(db), 0.9)            # keine zweite Stufe am selben Tag
            self.assertEqual(boom["n"], 1)

    def test_lockerung_ohne_wirkung_wird_zurueckgenommen(self):
        db = make_db(selbstopt_state=[{"schraube": "versand_menge", "wert": {"faktor": 0.7}}])
        with Patch(versand=(0.01, 120)):
            O.lauf(db, T, apply=True)
        self.assertEqual(S.versand_faktor(db), 0.8)
        later = T + dt.timedelta(days=O.V_TAGE, hours=1)
        with Patch(versand=(0.06, 150)):
            res = O.lauf(db, later, apply=True)
        self.assertEqual(res["bewertet"][0]["urteil"], "zurueck")
        # zurück auf 0,7, dann (hohe Quote, neuer Tag) Schutz-Stufe auf 0,6
        self.assertEqual(S.versand_faktor(db), 0.6)
        titles = [d["kurz_titel"] for d in db.rows("decisions")]
        self.assertTrue(any(t.startswith("Zurück: ") for t in titles))

    def test_neue_stufe_ersetzt_offene(self):
        db = make_db(selbstopt_state=[{"schraube": "versand_menge", "wert": {"faktor": 0.7}}])
        with Patch(versand=(0.01, 120)):
            O.lauf(db, T, apply=True)                              # 0,8 lockern (offen)
        with Patch(versand=(0.05, 120)):
            O.lauf(db, T + dt.timedelta(days=1), apply=True)       # Schutz 0,7 schließt die offene Lockerung
        st = [c["status"] for c in db.rows("selbstopt_changes")]
        self.assertEqual(st, ["neutral", "offen"])
        with Patch(versand=(0.05, 120)):
            O.lauf(db, T + dt.timedelta(days=5), apply=True)       # alte Lockerung holt nie 0,8 zurück
        self.assertLessEqual(S.versand_faktor(db), 0.7)

    def test_kategorie_hinten_und_zurueck_mit_pause(self):
        db = make_db()
        rows = [{"kategorie": "web designer", "n": 900, "ok": 450}, {"kategorie": "e commerce service", "n": 300, "ok": 30}]
        db.rpc_handlers["selbstopt_kategorien"] = lambda a, p: rows
        with Patch():
            O.lauf(db, T, apply=True)
            self.assertEqual(S.kategorien_hinten(db), {"e_commerce_service"})
            ch = db.rows("selbstopt_changes")[0]
            self.assertEqual((ch["ziel"], ch["basis"]), ("e_commerce_service", 0.4))
            rows[:] = [{"kategorie": "web designer", "n": 600, "ok": 240}]            # 40 % – keine Wirkung
            O.lauf(db, T + dt.timedelta(days=O.K_TAGE, hours=1), apply=True)
        self.assertEqual(S.kategorien_hinten(db), set())
        self.assertIn("e_commerce_service", S.get(db, "kaeufer_kategorien")["pause"])
        self.assertEqual(db.rows("selbstopt_changes")[0]["status"], "zurueck")

    def test_ab_entwurf_nur_in_freigabe_und_wenn_frei(self):
        db = make_db(ab_tests=[
            {"id": "a1", "status": "entwurf", "step": "mail_betreff", "country": "DE", "segment_id": "S2", "element": "betreff", "created_at": "1"},
            {"id": "a2", "status": "laeuft", "step": "mail_betreff", "country": "US", "segment_id": "S2", "element": "betreff", "created_at": "1"},
            {"id": "a3", "status": "entwurf", "step": "mail_betreff", "country": "US", "segment_id": "S2", "element": "betreff", "created_at": "2"},
            {"id": "a4", "status": "entwurf", "step": "mail_zeit", "country": "UK", "segment_id": "S2", "element": "fenster", "created_at": "3"},
            {"id": "a5", "status": "entwurf", "step": "mail_betreff", "country": "UK", "segment_id": "S2", "element": "betreff", "created_at": "4"},
        ])
        started = []
        import ab as ab_cli
        old = ab_cli.starten
        ab_cli.starten = lambda d, i: started.append(i) or {}
        try:
            with Patch():
                res = O.lauf(db, T, apply=True)
        finally:
            ab_cli.starten = old
        self.assertEqual(started, ["a5"])            # DE: keine Test-Freigabe, US: belegt, mail_zeit: pausiert
        self.assertEqual(res["geaendert"][-1]["schraube"], "ab_naechster")
        ch = next(c for c in db.rows("selbstopt_changes") if c["schraube"] == "ab_naechster")
        db.tables["ab_tests"][4].update(status="gewonnen", gewinner="B")
        with Patch():
            O.lauf(db, T + dt.timedelta(days=1), apply=True)
        self.assertEqual(next(c for c in db.rows("selbstopt_changes") if c["id"] == ch["id"])["status"], "wirkt")


if __name__ == "__main__":
    unittest.main()
