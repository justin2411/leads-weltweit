"""Gehirn-Routinen und Gehirn-Wissen (Inhaber 04.10.2026): Fälligkeit in deutscher Zeit (Sommer-/Winterzeit),
Aufträge für freie Agenten, Ergebnisse übernehmen, Wissen als Markdown mit Prüfung."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import brain_knowledge as K  # noqa: E402
import brain_routines as B  # noqa: E402
from fakedb import FakeDB  # noqa: E402

UTC = dt.timezone.utc


def R(**x):
    return {"id": "r1", "name": "Umsatz", "aufgabe": "Umsatz recherchieren", "uhrzeit": "14:00", "tage": "taeglich",
            "wochentage": [], "dauer_min": 15, "aktiv": True, "last_run_at": None, "last_task_id": None,
            "last_result": None, "created_at": "2026-10-01T00:00:00+00:00", **x}


class DueTest(unittest.TestCase):
    def test_summer_and_winter_time(self):
        self.assertEqual(B.berlin_at(dt.date(2026, 10, 4), "14:00"), dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC))
        self.assertEqual(B.berlin_at(dt.date(2026, 11, 4), "14:00"), dt.datetime(2026, 11, 4, 13, 0, tzinfo=UTC))
        # Umstellung März: 02:30 gibt es nicht → 03:30 MESZ (= 01:30 UTC), wie die TS-Fassung
        self.assertEqual(B.berlin_at(dt.date(2027, 3, 28), "02:30"), dt.datetime(2027, 3, 28, 1, 30, tzinfo=UTC))

    def test_due_once_after_time_with_catch_up(self):
        before = dt.datetime(2026, 10, 4, 11, 59, tzinfo=UTC)
        after = dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC)
        self.assertIsNone(B.due_at(R(), before))
        self.assertEqual(B.due_at(R(), after), dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC))
        self.assertIsNone(B.due_at(R(last_run_at="2026-10-04T12:05:00+00:00"), after))
        self.assertIsNotNone(B.due_at(R(last_run_at="2026-10-03T12:05:00Z"), after))
        self.assertIsNone(B.due_at(R(), after, task_open=True))
        self.assertIsNone(B.due_at(R(aktiv=False), after))
        self.assertIsNone(B.due_at(R(), dt.datetime(2026, 10, 4, 18, 30, tzinfo=UTC)))  # > 6 h zu spät
        self.assertIsNone(B.due_at(R(), dt.datetime(2026, 11, 4, 12, 30, tzinfo=UTC)))  # Winter: erst 13:00 UTC
        self.assertIsNotNone(B.due_at(R(), dt.datetime(2026, 11, 4, 13, 1, tzinfo=UTC)))
        # 23:30-Routine kurz nach Mitternacht (deutsche Zeit) noch nachholen
        self.assertEqual(B.due_at(R(uhrzeit="23:30"), dt.datetime(2026, 10, 4, 22, 10, tzinfo=UTC)),
                         dt.datetime(2026, 10, 4, 21, 30, tzinfo=UTC))

    def test_weekdays(self):
        sun = dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC)
        mon = dt.datetime(2026, 10, 5, 12, 10, tzinfo=UTC)
        self.assertIsNone(B.due_at(R(tage="werktags"), sun))
        self.assertIsNotNone(B.due_at(R(tage="werktags"), mon))
        self.assertIsNotNone(B.due_at(R(tage="wochentage", wochentage=[7]), sun))
        self.assertIsNone(B.due_at(R(tage="wochentage", wochentage=[2, 4]), mon))

    def test_takt_like_ts(self):
        """Meta-Review-Takt: gleiche Fälle wie app/lib/brain-routines.test.ts dayTimes."""
        d4, d5 = dt.date(2026, 10, 4), dt.date(2026, 10, 5)
        self.assertEqual(B.day_times(R(takt=2, uhrzeit="21:10"), d4), ["09:10", "21:10"])
        self.assertEqual(B.day_times(R(takt=4, uhrzeit="07:40"), d4), ["01:40", "07:40", "13:40", "19:40"])
        self.assertEqual(B.day_times(R(takt=0.5), d4), [R()["uhrzeit"]])
        self.assertEqual(B.day_times(R(takt=0.5), d5), [])
        self.assertEqual(B.day_times(R(takt=2, tage="werktags"), d4), [])
        self.assertIsNone(B.due_at(R(takt=0.5), dt.datetime(2026, 10, 5, 12, 10, tzinfo=UTC)))
        self.assertIsNotNone(B.due_at(R(takt=0.5), dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC)))
        last = "2026-10-03T12:05:00Z"
        self.assertIsNotNone(B.due_at(R(takt=2, last_run_at=last), dt.datetime(2026, 10, 4, 0, 10, tzinfo=UTC)))
        self.assertIsNone(B.due_at(R(takt=1, last_run_at=last), dt.datetime(2026, 10, 4, 0, 10, tzinfo=UTC)))

    def test_brief_like_ts(self):
        b = B.brief(R(aufgabe="x" * 2000))
        self.assertLessEqual(len(b), 1000)
        self.assertTrue(b.startswith("Gehirn-Routine Umsatz (15 min): "))
        self.assertIn("brain_knowledge.py", b)


class FaelligTest(unittest.TestCase):
    def db(self, **extra):
        return FakeDB({"brain_routines": [R(), R(id="r2", name="Glatt", uhrzeit="11:00", last_task_id="t9",
                                                last_run_at="2026-10-04T09:00:00+00:00"),
                                          R(id="r3", name="Aus", aktiv=False)],
                       "agent_tasks": [{"id": "t9", "agent": 2, "status": "fertig", "result": "Alles grün, 0 Fehler."},
                                       {"id": "t1", "agent": 1, "status": "laeuft", "result": None}], **extra})

    def test_apply_creates_task_for_free_agent_and_copies_result(self):
        db = self.db()
        t = dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC)
        out = B.faellig(db, t, apply=True)
        self.assertEqual([x["routine"] for x in out["neu"]], ["Umsatz"])
        self.assertEqual(out["neu"][0]["an"], "A2")  # A1 belegt (läuft)
        task = [x for x in db.rows("agent_tasks") if x.get("created_by") == "Gehirn-Routine"][0]
        self.assertEqual((task["kind"], task["agent"], task["routine_id"]), ("gehirn", 2, "r1"))
        r1 = next(x for x in db.rows("brain_routines") if x["id"] == "r1")
        self.assertEqual(r1["last_task_id"], task["id"])
        r2 = next(x for x in db.rows("brain_routines") if x["id"] == "r2")
        self.assertEqual(r2["last_result"], "Alles grün, 0 Fehler.")
        # gleicher Lauf nochmal: nichts Neues (Auftrag offen bzw. heute beauftragt)
        self.assertEqual(B.faellig(db, t + dt.timedelta(minutes=15), apply=True)["neu"], [])

    def test_dry_run_changes_nothing(self):
        db = self.db()
        out = B.faellig(db, dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC), apply=False)
        self.assertEqual(len(out["neu"]), 1)
        self.assertFalse(db.inserts)
        self.assertFalse(db.updates)

    def test_no_free_agent_waits(self):
        busy = [{"id": f"b{n}", "agent": n, "status": "offen"} for n in range(1, 9)]
        db = FakeDB({"brain_routines": [R()], "agent_tasks": busy})
        out = B.faellig(db, dt.datetime(2026, 10, 4, 12, 10, tzinfo=UTC), apply=True)
        self.assertEqual(out["wartet"], ["Umsatz"])
        self.assertEqual(len(db.rows("agent_tasks")), 8)


class KnowledgeTest(unittest.TestCase):
    def test_add_replace_append_and_checks(self):
        db = FakeDB({"brain_knowledge": []})
        self.assertTrue(K.add(db, "ziele-grenzen", "Ziele & Grenzen", "# Ziele\n\nUmsatz", "inhaber")["neu"])
        r = K.add(db, "ziele-grenzen", "Ziele & Grenzen", "neu", "routine", anhaengen=True,
                  now=dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC))
        self.assertFalse(r["neu"])
        md = db.rows("brain_knowledge")[0]["markdown"]
        self.assertTrue(md.startswith("## 04.10.2026 14:00\n\nneu"), md)
        self.assertIn("# Ziele", md)
        K.add(db, "ziele-grenzen", "Ziele", "ersetzt")
        self.assertEqual(db.rows("brain_knowledge")[0]["markdown"], "ersetzt")
        self.assertEqual(len(db.rows("brain_knowledge")), 1)
        for bad in (("X Y", "Titel", "t", "agent"), ("ok-slug", "T", "t", "agent"), ("ok-slug", "Titel", "", "agent"),
                    ("ok-slug", "Titel", "t", "fremd"), ("ok-slug", "Titel", "x" * 60001, "agent")):
            with self.assertRaises(K.InputError, msg=bad[0]):
                K.add(db, *bad)
        self.assertEqual(K.liste(db)[0]["slug"], "ziele-grenzen")
        self.assertEqual(K.get(db, "ziele-grenzen")["markdown"], "ersetzt")
        self.assertIsNone(K.get(db, "fehlt"))

    def test_slugify_like_ts(self):
        self.assertEqual(K.slugify("Über Öl & Größe"), "ueber-oel-groesse")
        self.assertEqual(K.slugify("Café Préférence"), "cafe-preference")
        self.assertEqual(K.slugify("!"), "notiz-x")


if __name__ == "__main__":
    unittest.main()


class BrainTaskTest(unittest.TestCase):
    T = dt.datetime(2026, 10, 4, 12, 0, tzinfo=UTC)

    def test_rules(self):
        tasks = [{"id": "a", "agent": 1, "status": "laeuft", "created_by": "Inhaber", "created_at": "2026-10-04T08:00:00+00:00"}]
        row = B.check_brain_task("pruefen", "20 US-Leads prüfen", "Fehlerquote US senken (Ziel Qualität)", "us", None, tasks, self.T)
        self.assertEqual((row["agent"], row["market"], row["created_by"]), (2, "US", "Gehirn"))
        bad = [("versand", "x x x", "Grund ok", None, None), ("pruefen", "x x x", "ok", None, None),
               ("pruefen", "x x x", "g" * 161, None, None), ("pruefen", "x x x", "Grund ok", "DE", None),
               ("pruefen", "Versand einschalten", "mehr Umsatz", None, None), ("quelle", "Sperrliste aufräumen", "Qualität", None, None),
               ("kaeufer", "Tool kaufen", "schneller", None, None), ("pruefen", "x x x", "Grund ok", None, 1),
               ("pruefen", "x x x", "Grund ok", None, 9)]
        for b in bad:
            with self.assertRaises(B.TaskError, msg=str(b)):
                B.check_brain_task(b[0], b[1], b[2], b[3], b[4], tasks, self.T)

    def test_three_per_hour_and_all_busy(self):
        recent = [{"id": f"r{i}", "agent": 5 + i, "status": "fertig", "created_by": "Gehirn",
                   "created_at": (self.T - dt.timedelta(minutes=10 * (i + 1))).isoformat()} for i in range(3)]
        with self.assertRaisesRegex(B.TaskError, "3 je Stunde"):
            B.check_brain_task("frage", "Warum keine Antworten in FR?", "Antwortquote FR heben", "FR", None, recent, self.T)
        old = [dict(x, created_at=(self.T - dt.timedelta(hours=2)).isoformat()) for x in recent]
        self.assertTrue(B.check_brain_task("frage", "Warum keine Antworten in FR?", "Antwortquote FR heben", "FR", None, old, self.T))
        busy = [{"id": f"b{n}", "agent": n, "status": "offen", "created_by": "x", "created_at": "2026-10-04T00:00:00+00:00"} for n in range(1, 9)]
        with self.assertRaisesRegex(B.TaskError, "belegt"):
            B.check_brain_task("frage", "Warum?", "Umsatz-Hebel finden", None, None, busy, self.T)

    def test_auftrag_writes_task_and_gehirn_note_then_results(self):
        db = FakeDB({"agent_tasks": []})
        notes = []
        res = B.auftrag(db, "leads", "Leads UK holen", "Proben-Vorrat UK leer – mehr Leads für Umsatz", "UK", None, self.T, notes.append)
        self.assertEqual(res["agent"], "A1")
        self.assertEqual(notes, ["A1 beauftragt: Proben-Vorrat UK leer – mehr Leads für Umsatz"])
        task = db.rows("agent_tasks")[0]
        self.assertEqual((task["created_by"], task["kind"], task["grund"]), ("Gehirn", "leads", "Proben-Vorrat UK leer – mehr Leads für Umsatz"))
        task.update(status="fertig", result="420 neue Leads", finished_at=self.T.isoformat(), gelernt_at=None)
        db.tables["agent_tasks"].append({"id": "x", "agent": 2, "status": "fertig", "created_by": "Inhaber", "gelernt_at": None})
        self.assertEqual([r["id"] for r in B.ergebnisse(db)], [task["id"]])
        self.assertEqual(B.gelernt(db, [task["id"]], self.T), 1)
        self.assertEqual(B.ergebnisse(db), [])
