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


class IndividualOpenerTest(unittest.TestCase):
    """Auftrag 04.10.2026: erster Satz zeigt, dass wir die Firma kennen (CLAUDE.md §7), nur aus echten Daten
    (Firmenname, Kategorie), landesweit ohne Ort; FR auf Französisch mit Firmenname."""

    def setUp(self):
        self.env = mock.patch.dict("os.environ", {"SENDER_NAME": "Justin Koch"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_en_uses_name_and_category(self):
        p = {"id": "x1", "segment_id": "S2", "country": "US", "company_name": "Corespark LLC",
             "specialization": "web designer", "region": "Raleigh, NC"}
        subject, body, lang = drafts.build(p)
        self.assertEqual(lang, "en")
        first = body.split("\n\n")[1]
        self.assertTrue(first.startswith("I came across Corespark while looking at web design studios."), first)
        self.assertNotIn("Raleigh", body + subject)
        self.assertTrue(drafts.lint_draft(subject, body, lang).ok)

    def test_fr_in_french_with_name(self):
        p = {"id": "x2", "segment_id": "S2", "country": "FR", "company_name": "Agame SARL",
             "specialization": "advertising agency", "region": "Yvelines"}
        subject, body, lang = drafts.build(p)
        self.assertEqual(lang, "fr")
        self.assertIn("J'ai découvert Agame en cherchant des agences de publicité.", body)
        self.assertNotIn("Yvelines", body + subject)
        self.assertTrue(drafts.lint_draft(subject, body, lang).ok)

    def test_fallback_neutral_with_name(self):
        en = drafts.build({"id": "x3", "segment_id": "S2", "country": "UK", "company_name": "Pixel Works Ltd",
                           "specialization": ""})[1]
        self.assertIn("I'm writing to the team at Pixel Works directly.", en)
        fr = drafts.build({"id": "x4", "segment_id": "S2", "country": "FR", "company_name": "Archimaine",
                           "specialization": None})[1]
        self.assertIn("Je me permets d'écrire directement à Archimaine.", fr)

    def test_no_link_like_names(self):
        _, body, lang = drafts.build({"id": "x5", "segment_id": "S2", "country": "IE", "company_name": "www.webby.ie",
                                      "specialization": "web designer"})
        self.assertNotIn("webby", body)
        self.assertTrue(drafts.lint_draft("Betreff", body, lang).ok)

    def test_different_buyers_different_first_sentence(self):
        a = drafts.build({"id": "y1", "segment_id": "S2", "country": "FR", "company_name": "Agame",
                          "specialization": "graphic designer"})[1]
        b = drafts.build({"id": "y2", "segment_id": "S2", "country": "FR", "company_name": "The Graphiste",
                          "specialization": "web designer"})[1]
        self.assertNotEqual(a.split("\n\n")[1], b.split("\n\n")[1])

    def test_all_combinations_pass_lint(self):
        for country in drafts.LAND:
            lang = "fr" if country == "FR" else "en"
            for seg in ("S1", "S2", "S3", "S4", "S5", "S9", "S7"):
                for spec in list(drafts.SPEC_PLURAL[lang]) + ["", "unknown"]:
                    for name in ("Acme Recruitment Ltd", "A Rather Long Company Name Holdings Group Ltd", ""):
                        p = {"id": name + spec, "segment_id": seg, "country": country, "company_name": name,
                             "specialization": spec}
                        subject, body, lang2 = drafts.build(p)
                        r = drafts.lint_draft(subject, body, lang2)
                        self.assertTrue(r.ok, (country, seg, spec, name, r.errors))
                        if seg == "S2":
                            self.assertIn(drafts.opener(p, lang2), body)


class SubjectABTest(unittest.TestCase):
    def test_deterministic_and_balanced(self):
        ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(2000)]
        v = [drafts.subject_variant({"id": i}) for i in ids]
        self.assertEqual(v, [drafts.subject_variant({"id": i}) for i in ids])
        self.assertEqual(set(v), {"A", "B"})
        self.assertLess(abs(v.count("A") - 1000), 100)

    def test_two_subjects_per_country_within_rules(self):
        from lib.rules import EMOJI, FAKE_REPLY_SUBJECT
        for country in drafts.LAND:
            lang = "fr" if country == "FR" else "en"
            for seg in ("S1", "S2", "S3", "S4", "S5", "S9", "S7"):
                p = {"segment_id": seg, "country": country}
                a, b = drafts.subject_for(p, lang, "A"), drafts.subject_for(p, lang, "B")
                self.assertNotEqual(a, b)
                for s in (a, b):
                    self.assertLessEqual(len(s), 60, s)
                    self.assertFalse(EMOJI.search(s) or FAKE_REPLY_SUBJECT.match(s), s)
                    self.assertIn("France" if lang == "fr" else drafts.LAND[country], s)

    def test_build_uses_buyers_variant(self):
        for i in range(20):
            p = {"id": f"p{i}", "segment_id": "S2", "country": "UK", "company_name": "Acme", "specialization": ""}
            self.assertEqual(drafts.build(p)[0], drafts.subject_for(p, "en", drafts.subject_variant(p)))

    def test_variant_saved_with_draft(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB as RealFake
        p = {"id": "p1", "check_status": "ok", "segment_id": "S2", "country": "US", "email": "info@a.com",
             "company_name": "Acme Web", "specialization": "web designer", "created_at": "2026-10-01"}
        db = RealFake({"experiments": [{"id": "e1", "variant": "v1", "segment_id": "S2", "country": "US",
                                        "planned_count": 50}],
                       "leads": [{"id": f"l{i}", "status": "sample", "segment_id": "S2", "country": "US"}
                                 for i in range(10)],
                       "messages": [], "prospects": [p]})
        with mock.patch("lib.db.DB", return_value=db), mock.patch("lib.fokus.focus_only", return_value=False):
            drafts.main([])
        m = db.rows("messages")[0]
        self.assertEqual(m["subject_variant"], drafts.subject_variant(p))
        self.assertEqual(m["subject"], drafts.subject_for(p, "en", m["subject_variant"]))

    def test_without_column_no_variant_field(self):
        class NoCol:
            def select(self, table, params):
                raise RuntimeError("column messages.subject_variant does not exist")
        self.assertFalse(drafts.has_variant_column(NoCol()))


class FollowupCountryWideTest(unittest.TestCase):
    """Alte Nachfassmails erbten Regionen aus dem Betreff der Erstmail („Greater Manchester“, „Queens“)."""

    P = {"id": "p9", "company_name": "Moore Accountancy Ltd", "segment_id": "S5", "country": "UK",
         "region": "Bolton, Greater Manchester", "specialization": "accountant"}

    def test_regional_parent_subject_replaced(self):
        import followups
        subj, var = followups.followup_subject(self.P, "Newly registered companies in Greater Manchester", "en")
        self.assertNotIn("Manchester", subj)
        self.assertIn("across the UK", subj)
        self.assertEqual(var, drafts.subject_variant(self.P))

    def test_country_wide_parent_subject_kept(self):
        import followups
        s = "Local businesses across the UK without a website"
        self.assertEqual(followups.followup_subject(self.P, s, "en"), (s, None))
        fr = "Entreprises en France sans site web"
        self.assertEqual(followups.followup_subject({**self.P, "country": "FR"}, fr, "fr"), (fr, None))

    def test_refresh_open_rewrites_without_deleting(self):
        import followups
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB as RealFake
        rows = [{"id": "m1", "kind": "followup", "status": "approved", "sent_at": None, "language": "en",
                 "subject": "Newly registered companies in Greater Manchester",
                 "body": "Hello Moore team,\n\nJust a short nudge ...", "prospects": self.P},
                {"id": "m2", "kind": "sample_followup", "status": "approved", "sent_at": None, "language": "en",
                 "subject": "New and growing companies in Greater Manchester",
                 "body": "Choose your plan: https://www.nextgen-profit.de/uk/x/start", "prospects": self.P},
                {"id": "m3", "kind": "followup", "status": "sent", "sent_at": "2026-10-01", "language": "en",
                 "subject": "Hiring signals from Greater Manchester employers", "body": "alt", "prospects": self.P}]
        db = RealFake({"messages": rows})
        followups.refresh_open(db)
        by = {r["id"]: r for r in db.rows("messages")}
        self.assertEqual(len(by), 3)
        self.assertNotIn("Manchester", by["m1"]["subject"] + by["m1"]["body"])
        self.assertEqual(by["m1"]["status"], "approved")
        self.assertIn("across the UK", by["m1"]["body"])
        self.assertNotIn("Manchester", by["m2"]["subject"])
        self.assertEqual(by["m2"]["body"], rows[1]["body"])
        self.assertEqual(by["m3"]["subject"], rows[2]["subject"])  # gesendet: unverändert


if __name__ == "__main__":
    unittest.main()
