"""Aufräumen nach festen Regeln (Inhaber 05.10.2026: „lösche auch Daten, die wir nicht brauchen“)."""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import aufraeumen as A  # noqa: E402

MIG = ROOT / "supabase" / "migrations" / "20261005090000_signalwerk_aufraeumen.sql"


class FakeDB:
    def __init__(self, due):
        self.due = dict(due)
        self.calls = []
        self.inserted = []

    def rpc(self, fn, args, params=None):
        self.calls.append((fn, dict(args)))
        if fn == "aufraeumen_groessen":
            return {"db": sum(self.due.values()) * 1000 + 5 * A.GB, "tables": {"observations": 3 * A.GB}}
        if fn == "aufraeumen":
            k = args["p_kind"]
            if args["p_dry"]:
                return self.due.get(k, 0)
            n = min(self.due.get(k, 0), args["p_limit"])
            self.due[k] = self.due.get(k, 0) - n
            return n
        raise AssertionError(fn)

    def insert(self, table, rows, **kw):
        self.inserted.append((table, rows))
        return [rows]


class AufraeumenTests(unittest.TestCase):
    def test_dry_run_deletes_nothing(self):
        db = FakeDB({"rohbestand": 5000, "run_stats": 10})
        res = A.run(db, apply=False, log=lambda *_: None)
        self.assertEqual(res["plan"]["rohbestand"], 5000)
        self.assertFalse(any(not c[1].get("p_dry", True) for c in db.calls if c[0] == "aufraeumen"))
        self.assertEqual(res["geloescht"], {})

    def test_apply_deletes_in_batches(self):
        db = FakeDB({"rohbestand": 4500, "heartbeat": 3})
        res = A.run(db, apply=True, batch=2000, log=lambda *_: None)
        self.assertEqual(res["geloescht"]["rohbestand"], 4500)
        self.assertEqual(res["geloescht"]["heartbeat"], 3)
        batches = [c for c in db.calls if c[0] == "aufraeumen" and not c[1]["p_dry"] and c[1]["p_kind"] == "rohbestand"]
        self.assertEqual(len(batches), 3)  # 2000 + 2000 + 500
        self.assertTrue(all(c[1]["p_limit"] == 2000 for c in batches))
        # leere Kategorien werden gar nicht erst gelöscht
        self.assertFalse([c for c in db.calls if c[1].get("p_kind") == "plan_log" and not c[1]["p_dry"]])
        note = [r for t, r in db.inserted if t == "decisions"][0]
        self.assertEqual(note["type"], "note")
        self.assertLessEqual(len(note["kurz_titel"]), 60)
        self.assertLessEqual(len(note["kurz_grund"]), 160)

    def test_no_note_on_empty_days_unless_forced(self):
        db = FakeDB({})
        A.run(db, apply=True, log=lambda *_: None)
        self.assertEqual(db.inserted, [])
        A.run(db, apply=True, log=lambda *_: None, force_note=True)
        self.assertEqual(len(db.inserted), 1)

    def test_migration_only_touches_allowed_tables(self):
        sql = MIG.read_text(encoding="utf-8")
        body = sql.split("create or replace function signalwerk.aufraeumen(")[1].split("$$;")[0]
        deleted = set(re.findall(r"delete from signalwerk\.(\w+)", body))
        self.assertEqual(deleted, {"raw_candidates", "observations", "watch_companies", "run_stats", "werk_heartbeat",
                                   "werk_plan_log", "sample_stock"})
        for t in A.NIE:
            self.assertNotIn(t, deleted)
        # Mindestalter fest in der Funktion
        self.assertEqual(body.count("interval '30 days'"), 3)
        self.assertGreaterEqual(body.count("interval '14 days'"), 8)
        # Rohbestand als Firma nur ohne Lead und nicht in einer Probe; Proben nur ohne Datei, nie 'sent'
        self.assertIn("not exists (select 1 from signalwerk.leads l where l.company_id = w.id)", body)
        self.assertIn("any(s.company_ids)", body)
        self.assertIn("files_removed_at is not null", body)
        self.assertNotIn("'sent'", body)
        self.assertIn("revoke all on function signalwerk.aufraeumen(text, boolean, int) from public", sql)
        self.assertEqual(set(A.KATEGORIEN), set(re.findall(r"p_kind = '(\w+)'", body)))


class MissingFunctionTests(unittest.TestCase):
    def test_missing_function_is_not_an_error(self):
        class DB(FakeDB):
            def rpc(self, fn, args, params=None):
                if fn == "aufraeumen":
                    raise RuntimeError('404 {"code":"PGRST202","message":"Could not find the function signalwerk.aufraeumen"}')
                return super().rpc(fn, args, params)
        res = A.run(DB({}), apply=True, log=lambda *_: None)
        self.assertTrue(res.get("fehlt"))
        self.assertEqual(res["geloescht"], {})


if __name__ == "__main__":
    unittest.main()
