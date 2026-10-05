"""scripts/strategie.py: Zusammenfassung (Format für app/lib/strategie.ts), Meilensteine, Rückblick – mit FakeDB."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))

import strategie as S  # noqa: E402
from fakedb import FakeDB  # noqa: E402

NOW = dt.datetime(2026, 10, 5, 22, 30, tzinfo=dt.timezone.utc)


class Zusammenfassung(unittest.TestCase):
    def test_format_und_speichern(self):
        db = FakeDB({"brain_knowledge": []})
        S.set_zusammenfassung(db, "Erst Antworten, dann Kunden.", ["Eins.", "Zwei.", "Drei."], 2)
        row = db.tables["brain_knowledge"][0]
        self.assertEqual(row["slug"], "strategie-zusammenfassung")
        self.assertEqual(row["markdown"], "Satz: Erst Antworten, dann Kunden.\nStufe: 2\n- Eins.\n- Zwei.\n- Drei.")
        self.assertIn(("strategie_refresh", {}), db.rpcs)

    def test_grenzen(self):
        with self.assertRaises(S.InputError):
            S.zusammenfassung_md("Satz", ["nur", "zwei"], None)
        with self.assertRaises(S.InputError):
            S.zusammenfassung_md("x" * 161, ["a", "b", "c"], None)
        with self.assertRaises(S.InputError):
            S.zusammenfassung_md("Satz", ["a", "b", "c"], 5)
        md = S.zusammenfassung_md("Satz", ["a", "b", "c", "d", "e"], None)
        self.assertNotIn("Stufe", md)


class Meilensteine(unittest.TestCase):
    def test_neu_und_erreicht(self):
        db = FakeDB({"strategy_milestones": []})
        S.set_meilenstein(db, "erster_kunde", titel="Erster Kunde", ziel="2026-11-06", kennzahl="kunden:1", now=NOW)
        S.set_meilenstein(db, "erster_kunde", status="erreicht", now=NOW)
        row = db.tables["strategy_milestones"][0]
        self.assertEqual(row["status"], "erreicht")
        self.assertEqual(row["erreicht_am"], NOW.isoformat())
        self.assertEqual(row["ziel_datum"], "2026-11-06")
        # erneut „erreicht“: erster Zeitpunkt bleibt
        S.set_meilenstein(db, "erster_kunde", status="erreicht", now=NOW + dt.timedelta(days=3))
        self.assertEqual(db.tables["strategy_milestones"][0]["erreicht_am"], NOW.isoformat())

    def test_fehler(self):
        db = FakeDB({"strategy_milestones": []})
        for kw in ({"status": "fertig"}, {"titel": "x" * 61}, {"ziel": "06.11.2026"}, {"kennzahl": "umsatz"}):
            with self.assertRaises(S.InputError):
                S.set_meilenstein(db, "k1", **({"titel": "T"} | kw))
        with self.assertRaises(S.InputError):
            S.set_meilenstein(db, "neu_ohne_titel", status="geplant")
        with self.assertRaises(S.InputError):
            S.set_meilenstein(db, "Böser Key", titel="T")


class Rueckblick(unittest.TestCase):
    def test_add_tag_in_berliner_zeit(self):
        db = FakeDB({"strategy_rueckblick": []})
        row = S.add_rueckblick(db, "Versand gestartet", "3 Postfächer.", "versand", 420, now=NOW)
        self.assertEqual(row["tag"], "2026-10-06")  # 22:30 UTC = 00:30 Berlin
        self.assertEqual(db.tables["strategy_rueckblick"][0]["zahl"], 420)

    def test_grenzen(self):
        db = FakeDB({"strategy_rueckblick": []})
        with self.assertRaises(S.InputError):
            S.add_rueckblick(db, "x" * 61)
        with self.assertRaises(S.InputError):
            S.add_rueckblick(db, "Titel", art="umsatz")
        with self.assertRaises(S.InputError):
            S.add_rueckblick(db, "Titel", grund="y" * 161)


if __name__ == "__main__":
    unittest.main()
