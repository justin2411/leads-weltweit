"""Firma: Übergaben zwischen Bereichen (scripts/uebergaben.py) – Regeln, Idempotenz, freie Agenten, Push, Bericht."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uebergaben as U  # noqa: E402
from fakedb import FakeDB  # noqa: E402

T = dt.datetime(2026, 10, 4, 17, 0, tzinfo=dt.timezone.utc)
C = ["US", "UK", "FR"]
LANES = [{"id": "s2-us", "country": "US"}, {"id": "s2-neu", "country": "FI,SG"}, {"id": "web-north", "country": "IE,NL"}]
LAGE = {
    "mrr": 249, "kunden": 1, "mails_24h": 83, "antworten_7d": 2, "proben_7d": 1,
    "ausreisser": [{"art": "kaeufer", "country": "FR", "segment_id": "S2", "geprueft": 84, "fehlerquote": 0.0714},
                   {"art": "lead", "country": "NL", "segment_id": "S2", "geprueft": 11, "fehlerquote": 0.09}],
    "laender": {"US": {"erstmails": 40, "antworten": 0}, "UK": {"erstmails": 4, "antworten": 0},
                "FR": {"erstmails": 50, "antworten": 1}},
    "heiss": [{"id": "r1", "firma": "Acme Ltd", "land": "UK", "alarm": False},
              {"id": "r2", "firma": "Beta", "land": "US", "alarm": True}],
    "leer": ["s2-us", "s2-neu", "web-north"],
    "vorrat_land": {"US": 46, "UK": 0, "FR": 30},
    "spam_neu": [{"id": 77}],
}


def rules():
    return {i["schluessel"]: i for i in U.regeln(LAGE, C, T, LANES)}


class RegelnTest(unittest.TestCase):
    def test_alle_regeln(self):
        r = rules()
        self.assertEqual(sorted(r), sorted([
            "fehlerquote:kaeufer:FR:2026-10-04", "null_antworten:US:2026-W40", "kauf:r1", "kauf:r2",
            "vorrat_leer:s2-us:2026-10-04", "proben_leer:UK:2026-10-04", "spam:77"]))
        self.assertEqual((r["fehlerquote:kaeufer:FR:2026-10-04"]["von"], r["fehlerquote:kaeufer:FR:2026-10-04"]["an"]),
                         ("qualitaet", "produktion"))
        self.assertEqual(r["fehlerquote:kaeufer:FR:2026-10-04"]["task"]["rolle"], "quellen")
        self.assertEqual(r["null_antworten:US:2026-W40"]["an"], "marketing")
        self.assertEqual(r["null_antworten:US:2026-W40"]["task"]["rolle"], "test")
        self.assertEqual(r["kauf:r1"]["an"], "kundenservice")
        self.assertIsNotNone(r["kauf:r1"]["push"])
        self.assertIsNone(r["kauf:r2"]["push"])  # Antwort-Assistent hat schon alarmiert
        self.assertEqual(r["vorrat_leer:s2-us:2026-10-04"]["an"], "strategie")
        self.assertEqual(r["spam:77"]["task"]["rolle"], "zustellung")

    def test_nur_fokus_und_kurz(self):
        for i in U.regeln(LAGE, C, T, LANES):
            self.assertLessEqual(len(i["titel"]), 60)
            self.assertLessEqual(len(i["grund"]), 160)
            self.assertLessEqual(len(i["task"]["brief"]), 1000)
            self.assertIn("Sperrliste", i["task"]["brief"])
            self.assertNotIn("NL", i["schluessel"])
            self.assertNotIn("s2-neu", i["schluessel"])

    def test_leere_lage(self):
        self.assertEqual(U.regeln({}, C, T, LANES), [])
        self.assertEqual(U.regeln(None, C, T, LANES), [])


class ApplyTest(unittest.TestCase):
    def run_once(self, db, pushes):
        return U.pruefen(db, T, True, lage=LAGE, countries=C, segment="S2", lanes=LANES,
                         notify=lambda *a: pushes.append(a) or True)

    def test_idempotent_und_freie_agenten(self):
        db = FakeDB({"agent_tasks": [{"id": "x", "agent": 1, "status": "offen"}], "handoffs": [], "owner_settings": []})
        pushes = []
        res = self.run_once(db, pushes)
        self.assertEqual(len(res["neu"]), 7)
        self.assertEqual(len(res["auftraege"]), U.MAX_NEW)
        self.assertEqual(len(pushes), 1)  # nur r1 (r2 hatte schon Alarm)
        tasks = [r for r in db.rows("agent_tasks") if r.get("created_by") == U.BY]
        self.assertEqual(len(tasks), 3)
        self.assertNotIn(1, [x["agent"] for x in tasks])
        res2 = self.run_once(db, pushes)
        self.assertEqual(res2["neu"], [])
        self.assertEqual(len(pushes), 1)  # kein zweiter Push
        self.assertEqual(len(res2["auftraege"]), 3)  # nächste wartende
        res3 = self.run_once(db, pushes)
        tasks = [r for r in db.rows("agent_tasks") if r.get("created_by") == U.BY]
        self.assertEqual(len({r["agent"] for r in tasks if r["status"] == "offen"}), len(tasks))
        # A1 belegt + 6 Übergabe-Aufträge → ein Agent bleibt frei
        self.assertEqual(len(tasks), 6)
        self.assertEqual(len(res3["auftraege"]), 0)
        self.assertEqual(len(db.rows("handoffs")), 7)

    def test_pausiert_keine_auftraege(self):
        db = FakeDB({"agent_tasks": [], "handoffs": [],
                     "owner_settings": [{"key": "werke_paused", "value": {"agenten": "2026-10-04T10:00:00Z"}}]})
        res = self.run_once(db, [])
        self.assertEqual(res["auftraege"], [])
        self.assertTrue(all(h["status"] in ("wartet", "gemeldet") for h in db.rows("handoffs")))

    def test_ein_auftrag_je_rolle(self):
        db = FakeDB({"agent_tasks": [{"id": "x", "agent": 2, "status": "laeuft", "rolle": "quellen"}], "handoffs": [],
                     "owner_settings": []})
        self.run_once(db, [])
        roles = [r.get("rolle") for r in db.rows("agent_tasks") if r.get("created_by") == U.BY]
        self.assertNotIn("quellen", roles)

    def test_dry_run_schreibt_nichts(self):
        db = FakeDB({"agent_tasks": [], "handoffs": []})
        res = U.pruefen(db, T, False, lage=LAGE, countries=C, segment="S2", lanes=LANES)
        self.assertEqual(len(res["regeln"]), 7)
        self.assertEqual(db.inserts, [])


class BerichtTest(unittest.TestCase):
    def test_fuenf_zeilen(self):
        b = U.bericht(LAGE)
        self.assertLessEqual(len(b["titel"]), 60)
        self.assertEqual(len(b["zeilen"]), 5)
        self.assertEqual(b["zeilen"][0], "Mails 24 h: 83")
        self.assertEqual(b["zeilen"][-1], "Umsatz/Monat: 249")
        self.assertEqual(len(U.bericht({})["zeilen"]), 5)


if __name__ == "__main__":
    unittest.main()


class TagescheckTest(unittest.TestCase):
    def test_geschaeft_oben_in_der_mail(self):
        import tagescheck as TC
        c = TC.Check()
        db = FakeDB()
        db.rpc_handlers["firma_lage"] = lambda a, p: LAGE
        TC.collect_geschaeft(c, db)
        _, body = TC.mail(c)
        self.assertIn("GESCHÄFT HEUTE: 249 UMSATZ/MONAT", body)
        self.assertIn("  · Mails 24 h: 83", body)
        self.assertLess(body.index("GESCHÄFT"), body.index("Mails 24 h"))

    def test_ohne_zahlen_kein_block(self):
        import tagescheck as TC
        c = TC.Check()
        db = FakeDB()
        db.rpc_handlers["firma_lage"] = lambda a, p: (_ for _ in ()).throw(RuntimeError("weg"))
        TC.collect_geschaeft(c, db)
        self.assertEqual(c.geschaeft, [])
        self.assertNotIn("GESCHÄFT", TC.mail(c)[1])
