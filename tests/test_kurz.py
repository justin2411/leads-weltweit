"""Wenig Text überall (Inhaber 04.10.2026): Kurzfassung für Entscheidungen, Rückfall ohne neue Spalten."""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.kurz import GRUND_MAX, TITEL_MAX, insert_decisions, kuerzen, kurz_grund, kurz_titel, mit_kurz  # noqa: E402

FX = json.loads((Path(__file__).parent / "fixtures" / "kurz_cases.json").read_text(encoding="utf-8"))


class KurzTest(unittest.TestCase):
    def test_gemeinsame_faelle(self):  # gleiche Fälle wie app/lib/kurz-schreiben.test.ts
        for ein, aus in FX["titel"]:
            self.assertEqual(kurz_titel(ein), aus, ein)
        for ein, aus in FX["grund"]:
            self.assertEqual(kurz_grund(ein), aus, ein)

    def test_praefixe_und_zeiten_weg(self):
        t = kurz_titel("Sitzung 27.09. 16:30 UTC: Not-Aus geprueft (ok), Probe-Anfrage jetzt 4h+ unbeantwortet, mehr")
        self.assertFalse(t.startswith("Sitzung"))
        self.assertNotIn("UTC", t)
        self.assertEqual(kurz_titel("Vorschlag: Versand nur werktags"), "Versand nur werktags")
        self.assertNotIn("12:24", kurz_grund("Anfrage liegt seit ~12:24 UTC offen. Rest."))

    def test_erster_satz_ohne_zahlenkaskade(self):
        g = kurz_grund("Bounces normal (4/90=4,4% unter 5%, roh 5/90). Danach viel mehr Text.")
        self.assertEqual(g, "Bounces normal.")
        self.assertEqual(kurz_grund("Stand 27.09. ist gut. Zweiter Satz."), "Stand 27.09. ist gut.")
        self.assertEqual(kurz_grund("Quelle z. B. Overture ist frei. Zweiter."), "Quelle z. B. Overture ist frei.")

    def test_grenzen(self):
        lang = "Wortwortwort " * 50
        self.assertLessEqual(len(kurz_titel(lang)), TITEL_MAX)
        self.assertLessEqual(len(kurz_grund(lang)), GRUND_MAX)
        self.assertEqual(kuerzen("kurz", 60), "kurz")
        self.assertTrue(kuerzen("a " * 100, 60).endswith("…"))
        r = mit_kurz({"subject": "s", "reasoning": "r", "kurz_titel": "x" * 99})
        self.assertLessEqual(len(r["kurz_titel"]), TITEL_MAX)
        self.assertEqual(r["kurz_grund"], "r")

    def test_insert_mit_kurz(self):
        db = mock.Mock()
        insert_decisions(db, [{"type": "note", "subject": "Vorschlag: A", "reasoning": "Grund eins. Zwei."}])
        row = db.insert.call_args.args[1][0]
        self.assertEqual((row["kurz_titel"], row["kurz_grund"]), ("A", "Grund eins."))

    def test_insert_ohne_spalten(self):
        db = mock.Mock()
        db.insert.side_effect = [RuntimeError("Supabase POST x: 400 {\"code\":\"PGRST204\",\"message\":\"Could not find "
                                              "the 'kurz_grund' column of 'decisions' in the schema cache\"}"), [{"id": 1}]]
        self.assertEqual(insert_decisions(db, {"type": "note", "subject": "a", "reasoning": "b"}), [{"id": 1}])
        self.assertNotIn("kurz_titel", db.insert.call_args_list[1].args[1])

    def test_anderer_fehler_bleibt(self):
        db = mock.Mock()
        db.insert.side_effect = RuntimeError("Supabase POST x: 409 conflict")
        with self.assertRaises(RuntimeError):
            insert_decisions(db, {"type": "note", "subject": "a", "reasoning": "b"})
        self.assertEqual(db.insert.call_count, 1)

    def test_leere_liste(self):
        db = mock.Mock()
        self.assertEqual(insert_decisions(db, []), [])
        db.insert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
