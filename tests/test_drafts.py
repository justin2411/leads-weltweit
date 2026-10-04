import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import drafts  # noqa: E402


class FakeDB:
    def __init__(self, rows):
        self.rows, self.updates = rows, []

    def select_all(self, table, params):
        return self.rows

    def update(self, table, match, values):
        self.updates.append((table, match, values))
        return []


class RefreshTest(unittest.TestCase):
    def test_update_passes_plain_id(self):
        # db.update setzt "eq." selbst – ein zweites Präfix ergab "eq.eq.<uuid>" und brach den Versand ab.
        db = FakeDB([{"id": "0204b147-cdab-4280-9091-39ea5bd21aa5", "status": "approved",
                      "subject": "alt", "body": "alt", "prospects": {"id": "p1"}}])
        with mock.patch.object(drafts, "build", return_value=("neu", "neu", "en")), \
                mock.patch.object(drafts, "lint_draft", return_value=mock.Mock(ok=True, errors=[])):
            drafts.refresh(db)
        self.assertEqual(db.updates[0][1], {"id": "0204b147-cdab-4280-9091-39ea5bd21aa5"})


class RefreshOnlyInitialTest(unittest.TestCase):
    def test_refresh_leaves_followups_alone(self):
        seen = {}

        class DB(FakeDB):
            def select_all(self, table, params):
                seen.update(params)
                return []
        drafts.refresh(DB([]))
        self.assertEqual(seen.get("kind"), "eq.initial")


class NoDuplicateDraftTest(unittest.TestCase):
    """Prüfung 04.10.2026: derselbe Käufer zweimal in der Liste (Blättern ohne eindeutige Sortierung) oder schon mit
    Erstmail in der Datenbank brach den Lauf mit 409 Duplicate Key ab."""

    def test_same_prospect_twice_gets_one_draft(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB as RealFake
        p1 = {"id": "p1", "check_status": "ok", "segment_id": "S2", "country": "US", "email": "info@a.com",
              "created_at": "2026-10-01"}
        p2 = dict(p1, id="p2", email="info@b.com")
        db = RealFake({"experiments": [{"id": "e1", "variant": "v1", "segment_id": "S2", "country": "US",
                                        "planned_count": 50}],
                       "leads": [{"id": f"l{i}", "status": "sample", "segment_id": "S2", "country": "US"}
                                 for i in range(10)],
                       "messages": [], "prospects": [p1, p1, p2]})
        seen = {}
        orig = db.select

        def select(table, params=None):
            if table == "prospects":
                seen.update(params or {})
            return orig(table, params)
        db.select = db.select_all = select
        with mock.patch("lib.db.DB", return_value=db), mock.patch("lib.fokus.focus_only", return_value=False), \
                mock.patch.object(drafts, "build", return_value=("Betreff", "Text", "en")), \
                mock.patch.object(drafts, "lint_draft", return_value=mock.Mock(ok=True, errors=[], summary=lambda: "ok")):
            drafts.main(["--approve", "Test"])
        msgs = db.rows("messages")
        self.assertEqual(sorted(m["prospect_id"] for m in msgs), ["p1", "p2"])
        self.assertTrue(all(m["kind"] == "initial" for m in msgs))
        self.assertEqual(seen.get("order"), "created_at,id")


class FollowupTextTest(unittest.TestCase):
    def test_country_wide(self):
        import followups
        p = {"company_name": "Acme Recruitment Ltd", "segment_id": "S1", "country": "UK", "region": "Leeds, West Yorkshire"}
        body, _ = followups.followup_text(p, "en")
        self.assertIn("across the UK", body)
        self.assertNotIn("Leeds", body)
        self.assertNotIn("Leeds", followups.sample_followup_text(p, "en"))
        self.assertIn("partout en France", followups.followup_text({**p, "country": "FR"}, "fr")[0])


if __name__ == "__main__":
    unittest.main()
