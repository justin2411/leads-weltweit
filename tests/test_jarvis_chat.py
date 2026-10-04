"""JARVIS-Chat-Werkzeug der Routine: offen, start, antwort, bericht (Inhaber 04.10.2026)."""
import datetime as dt
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import jarvis_chat as J  # noqa: E402
from fakedb import FakeDB  # noqa: E402

T0 = dt.datetime(2026, 10, 4, 10, 0, tzinfo=dt.timezone.utc)  # 12:00 deutsche Zeit
ISO = lambda m: (T0 + dt.timedelta(minutes=m)).isoformat()  # noqa: E731


def db_with():
    return FakeDB({
        "jarvis_sessions": [
            {"id": "s1", "title": "Leads UK", "kind": "chat", "flow_id": None, "archived": False},
            {"id": "s2", "title": "Alt", "kind": "chat", "flow_id": None, "archived": True},
            {"id": "s3", "title": "Baukasten", "kind": "baukasten", "flow_id": "f1", "archived": False},
            {"id": "sb", "title": "Tagesbericht", "kind": "bericht", "flow_id": None, "archived": False},
            {"id": "sg", "title": "Gehirn", "kind": "gehirn", "mode": "gehirn", "flow_id": None, "archived": False},
        ],
        "jarvis_messages": [
            {"id": "m1", "session_id": "s1", "created_at": ISO(-30), "role": "inhaber", "body": "Hol UK Leads", "status": "fertig"},
            {"id": "m2", "session_id": "s1", "created_at": ISO(-29), "role": "jarvis", "body": "Erledigt", "status": None},
            {"id": "m3", "session_id": "s1", "created_at": ISO(-5), "role": "inhaber", "body": "Und FR?", "status": "offen"},
            {"id": "m4", "session_id": "s2", "created_at": ISO(-50), "role": "inhaber", "body": "archiviert", "status": "offen"},
            {"id": "m5", "session_id": "s3", "created_at": ISO(-40), "role": "inhaber", "body": "Filter Telefon", "status": "offen"},
            {"id": "m6", "session_id": "s1", "created_at": ISO(-20), "role": "inhaber", "body": "läuft", "status": "in_arbeit",
             "started_at": ISO(-10)},
        ],
        "flows": [{"id": "f1", "name": "US Test", "kind": "test", "status": "entwurf", "updated_at": ISO(-60)}],
    })


class OffenTest(unittest.TestCase):
    def test_groups_by_session_oldest_first_skips_archived_and_fresh_work(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0):
            out = J.offen(db)
        self.assertEqual([x["session"]["id"] for x in out], ["s3", "s1"])  # älteste offene Nachricht zuerst
        self.assertEqual([m["id"] for m in out[1]["offen"]], ["m3"])  # m6 erst seit 10 min in Arbeit
        self.assertEqual([m["id"] for m in out[1]["verlauf"]], ["m1", "m2", "m6", "m3"])
        self.assertEqual(out[0]["flow"]["name"], "US Test")
        self.assertIn("flow_edit.py", out[0]["hinweis"])

    def test_stale_work_is_open_again(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0 + dt.timedelta(hours=3)):
            out = J.offen(db)
        s1 = next(x for x in out if x["session"]["id"] == "s1")
        self.assertEqual([m["id"] for m in s1["offen"]], ["m6", "m3"])

    def test_nothing_open(self):
        self.assertEqual(J.offen(FakeDB({"jarvis_messages": [], "jarvis_sessions": []})), [])


class StartTest(unittest.TestCase):
    def test_claims_once(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0):
            self.assertTrue(J.start(db, "m3"))
            self.assertFalse(J.start(db, "m3"))  # zweiter Lauf: schon in Arbeit
            self.assertFalse(J.start(db, "m2"))  # JARVIS-Nachrichten nie
        self.assertEqual(db.rows("jarvis_messages")[2]["status"], "in_arbeit")

    def test_takes_over_stale(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0 + dt.timedelta(hours=3)):
            self.assertTrue(J.start(db, "m6"))


class AntwortTest(unittest.TestCase):
    def test_reply_marks_work_done_not_new_messages(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0):
            res = J.antwort(db, "s1", "FR läuft jetzt auch.", [{"label": "Bestand", "url": "/dashboard/bestand"}])
        msgs = {m["id"]: m for m in db.rows("jarvis_messages")}
        self.assertEqual(msgs["m6"]["status"], "fertig")
        self.assertEqual(msgs["m3"]["status"], "offen")  # nicht übernommen → bleibt für den nächsten Lauf
        self.assertEqual(res["fertig"], 1)
        new = db.rows("jarvis_messages")[-1]
        self.assertEqual((new["role"], new["status"], new["links"][0]["url"]), ("jarvis", None, "/dashboard/bestand"))

    def test_reply_without_start_closes_open(self):
        db = db_with()
        db.tables["jarvis_messages"][-1]["status"] = "fertig"  # m6
        with mock.patch.object(J, "now", return_value=T0):
            res = J.antwort(db, "s1", "Antwort", [])
        self.assertEqual(res["fertig"], 1)
        self.assertEqual(next(m for m in db.rows("jarvis_messages") if m["id"] == "m3")["status"], "fertig")

    def test_zwischenstand_keeps_open(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0):
            res = J.antwort(db, "s1", "Zwischenstand: 2 von 5 Quellen geprüft", [], zwischenstand=True)
        self.assertEqual(res["fertig"], 0)
        self.assertEqual(next(m for m in db.rows("jarvis_messages") if m["id"] == "m6")["status"], "in_arbeit")

    def test_unknown_session(self):
        with self.assertRaises(J.InputError):
            J.antwort(db_with(), "nix", "x", [])

    def test_links_checked(self):
        self.assertEqual(J.parse_links(None), [])
        self.assertEqual(J.parse_links('[{"label": "PR", "url": "https://github.com/x/y/pull/1"}]')[0]["label"], "PR")
        for bad in ('{"a": 1}', '[{"label": "", "url": "https://a"}]', '[{"label": "x", "url": "javascript:alert(1)"}]',
                    '[{"label": "x", "url": "//evil.example"}]', "kein json", json.dumps([{"label": "x", "url": "https://a"}] * 11)):
            with self.assertRaises(J.InputError, msg=bad):
                J.parse_links(bad)


class BerichtTest(unittest.TestCase):
    def test_once_per_berlin_day(self):
        db = db_with()
        with mock.patch.object(J, "now", return_value=T0):
            self.assertIsNotNone(J.bericht(db, "Heute: 3 Anpassungen"))
            self.assertIsNone(J.bericht(db, "nochmal"))  # gleicher Tag
        # 23:30 UTC = 01:30 deutsche Zeit am nächsten Tag → neuer Tag
        with mock.patch.object(J, "now", return_value=dt.datetime(2026, 10, 4, 23, 30, tzinfo=dt.timezone.utc)):
            db.tables["jarvis_messages"][-1]["created_at"] = T0.isoformat()
            self.assertIsNotNone(J.bericht(db, "neuer Tag"))
        rows = [m for m in db.rows("jarvis_messages") if m["session_id"] == "sg"]  # Tagesbericht geht in den Gehirn-Chat
        self.assertEqual(len(rows), 2)
        self.assertFalse([m for m in db.rows("jarvis_messages") if m["session_id"] == "sb" and m["role"] == "jarvis"])
        self.assertTrue(all(m["role"] == "jarvis" and m["status"] is None for m in rows))

    def test_reply_in_bericht_session_does_not_block_report(self):
        db = db_with()
        db.tables["jarvis_messages"].append({"id": "q1", "session_id": "sg", "created_at": ISO(-3), "role": "inhaber",
                                             "body": "Warum weniger Proben?", "status": "offen"})
        with mock.patch.object(J, "now", return_value=T0):
            J.antwort(db, "sg", "Weil der Vorrat leer war.", [])
            self.assertIsNotNone(J.bericht(db, "Tagesbericht"))  # Antwort zählt nicht als Bericht
            self.assertIsNone(J.bericht(db, "nochmal"))

    def test_stale_check_parses_times(self):
        # als Zeit verglichen, auch mit „Z“ statt „+00:00“ (Textvergleich wäre hier falsch)
        for started in ("2026-10-04T08:00:00+00:00", "2026-10-04T08:00:00Z", "2026-10-04T10:00:00+02:00"):
            m = {"status": "in_arbeit", "started_at": started}
            self.assertFalse(J._is_open(m, dt.datetime(2026, 10, 4, 9, 59, 59, tzinfo=dt.timezone.utc)), started)
            self.assertTrue(J._is_open(m, dt.datetime(2026, 10, 4, 10, 0, 1, tzinfo=dt.timezone.utc)), started)
        self.assertFalse(J._is_open({"status": "fertig"}, T0))

    def test_creates_session_if_missing(self):
        db = FakeDB({"jarvis_sessions": [], "jarvis_messages": []})
        with mock.patch.object(J, "now", return_value=T0):
            res = J.bericht(db, "Bericht")
        self.assertEqual(db.rows("jarvis_sessions")[0]["kind"], "gehirn")
        self.assertEqual(db.rows("jarvis_sessions")[0]["mode"], "gehirn")
        self.assertEqual(res["session_id"], db.rows("jarvis_sessions")[0]["id"])

    def test_bericht_is_short(self):
        with mock.patch.object(J, "now", return_value=T0), self.assertRaises(J.InputError):
            J.bericht(db_with(), "x" * 1501)

    def test_berlin_day_start(self):
        self.assertEqual(J.berlin_day_start(T0).isoformat(), "2026-10-03T22:00:00+00:00")  # MESZ
        winter = dt.datetime(2026, 12, 1, 12, tzinfo=dt.timezone.utc)
        self.assertEqual(J.berlin_day_start(winter).isoformat(), "2026-11-30T23:00:00+00:00")  # MEZ


class GehirnTest(unittest.TestCase):
    def test_update_short_check(self):
        self.assertEqual(J.check_update("Aufgefallen: FR ohne Antworten\n\nNächster Schritt: Betreff testen"),
                         "Aufgefallen: FR ohne Antworten\nNächster Schritt: Betreff testen")
        for bad in ("", "   ", "a\nb\nc\nd", "x" * 401):
            with self.assertRaises(J.InputError, msg=repr(bad)[:30]):
                J.check_update(bad)
        self.assertEqual(len(J.check_update("x" * 400)), 400)

    def test_update_dedup_6h_and_push_only_with_brauche(self):
        db = db_with()
        pushes = []
        push = lambda *a: pushes.append(a) or True  # noqa: E731
        with mock.patch.object(J, "now", return_value=T0):
            r = J.gehirn_update(db, "Aufgefallen: Proben leer · Nächster Schritt: Vorrat bauen", push=push)
            self.assertEqual(r["session_id"], "sg")
            self.assertFalse(r["push"])
            self.assertIsNone(J.gehirn_update(db, "  aufgefallen: Proben leer ·  Nächster Schritt: Vorrat bauen ", push=push))
            r2 = J.gehirn_update(db, "Aufgefallen: Kosten · Brauche: deine Freigabe für Domain", push=push)
            self.assertTrue(r2["push"])
        self.assertEqual(len(pushes), 1)
        self.assertIn("/dashboard/jarvis/chat?s=sg", pushes[0][2])
        with mock.patch.object(J, "now", return_value=T0 + dt.timedelta(hours=7)):
            self.assertIsNotNone(J.gehirn_update(db, "Aufgefallen: Proben leer · Nächster Schritt: Vorrat bauen", push=push))
        msgs = [m for m in db.rows("jarvis_messages") if m["session_id"] == "sg"]
        self.assertEqual(len(msgs), 3)
        self.assertTrue(all(m["role"] == "jarvis" and m["status"] is None for m in msgs))
        self.assertTrue(J.needs_owner("Aufgefallen: x · Brauche: y"))
        self.assertFalse(J.needs_owner("Aufgefallen: ich brauche nichts"))

    def test_gehirn_session_never_archivable(self):
        self.assertFalse(J.may_archive({"kind": "gehirn"}))
        self.assertFalse(J.may_archive({"kind": "bericht"}))
        self.assertTrue(J.may_archive({"kind": "chat"}))
        db = FakeDB({"jarvis_sessions": [], "jarvis_messages": []})
        a = J.gehirn_session(db)
        self.assertEqual(J.gehirn_session(db)["id"], a["id"])  # genau eine
        self.assertEqual(len(db.rows("jarvis_sessions")), 1)

    def test_offen_marks_gehirn_mode(self):
        db = db_with()
        db.tables["jarvis_messages"].append({"id": "g1", "session_id": "sg", "created_at": ISO(-1), "role": "inhaber",
                                             "body": "Was ist dein Plan?", "status": "offen"})
        with mock.patch.object(J, "now", return_value=T0):
            out = J.offen(db)
        g = next(x for x in out if x["session"]["id"] == "sg")
        self.assertEqual(g["session"]["mode"], "gehirn")
        self.assertIn("brain_knowledge.py", g["hinweis"])
        s1 = next(x for x in out if x["session"]["id"] == "s1")
        self.assertEqual(s1["session"]["mode"], "assistent")

    def test_cli_gehirn_update(self):
        db = db_with()
        with mock.patch.object(J, "DB", return_value=db), mock.patch.object(J, "now", return_value=T0), \
                mock.patch("sys.stdout", new_callable=io.StringIO), \
                mock.patch("sys.stdin", io.StringIO("Aufgefallen: alles ruhig")):
            self.assertEqual(J.main(["gehirn-update", "-"]), 0)
        with mock.patch.object(J, "DB", return_value=db), mock.patch.object(J, "now", return_value=T0), \
                mock.patch("sys.stdout", new_callable=io.StringIO), \
                mock.patch("sys.stdin", io.StringIO("Aufgefallen: alles ruhig")):
            self.assertEqual(J.main(["gehirn-update", "-"]), 3)
        with mock.patch.object(J, "DB", return_value=db), mock.patch("sys.stdout", new_callable=io.StringIO), \
                mock.patch("sys.stdin", io.StringIO("1\n2\n3\n4")):
            self.assertEqual(J.main(["gehirn-update", "-"]), 2)


class MainTest(unittest.TestCase):
    def test_cli_exit_codes(self):
        db = db_with()
        with tempfile.TemporaryDirectory() as d, mock.patch.object(J, "DB", return_value=db), \
                mock.patch.object(J, "now", return_value=T0), mock.patch("sys.stdout", new_callable=io.StringIO) as out:
            p = Path(d) / "a.txt"
            p.write_text("  Erledigt: 120 neue Leads.  ", encoding="utf-8")
            self.assertEqual(J.main(["start", "m3"]), 0)
            self.assertEqual(J.main(["start", "m3"]), 3)
            self.assertEqual(J.main(["antwort", "s1", str(p), "--links", '[{"label": "x", "url": "ftp://a"}]']), 2)
            self.assertEqual(J.main(["antwort", "s1", str(p)]), 0)
            self.assertEqual(J.main(["bericht", str(p)]), 0)
            self.assertEqual(J.main(["bericht", str(p)]), 3)
            (Path(d) / "leer.txt").write_text("   ", encoding="utf-8")
            self.assertEqual(J.main(["bericht", str(Path(d) / "leer.txt")]), 2)
            self.assertEqual(J.main(["offen"]), 0)
            self.assertEqual(J.main([]), 1)
        self.assertIn('"fertig": 2', out.getvalue())  # m3 (gestartet) und m6
        reply = [m for m in db.rows("jarvis_messages") if m["role"] == "jarvis" and m["session_id"] == "s1"][-1]
        self.assertEqual(reply["body"], "Erledigt: 120 neue Leads.")


if __name__ == "__main__":
    unittest.main()
