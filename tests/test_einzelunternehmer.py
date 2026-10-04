"""Einzelunternehmer (Inhaber 04.10.2026 nach Anwaltsberatung, Verantwortung Inhaber): in FR und US erlaubt,
UK/IE/NL/SE/BE weiter nur Kapitalgesellschaften; Einzelunternehmer bekommen keine automatische Nachfassmail,
nur nach eigener Antwort. Nur Probeläufe, nichts wird gesendet."""
import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import followups  # noqa: E402
import kundenwerk  # noqa: E402
import outreach  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib.rules import check_prospect, is_legal_person, load_countries  # noqa: E402
from test_outreach_send import RECENT, msg  # noqa: E402

CFG = load_countries()


def chk(country, legal_form, email="contact@atelier-lumiere.fr", website="atelier-lumiere.fr"):
    return check_prospect(email=email, country=country, website=website, legal_form=legal_form,
                          source_url=f"https://{website}/contact", size_note="x", cfg=CFG)


class CountryRulesTest(unittest.TestCase):
    def test_fr_and_us_allow_sole_traders(self):
        self.assertTrue(chk("FR", None).ok, chk("FR", None).summary())
        self.assertTrue(chk("US", None, "info@acme-web.com", "acme-web.com").ok)

    def test_other_countries_unchanged(self):
        for co in ("UK", "IE", "NL", "SE", "BE"):
            self.assertTrue(CFG["countries"][co]["company_forms_only"], co)
            self.assertFalse(chk(co, None, "info@acme.example", "acme.example").ok, co)

    def test_other_rules_still_apply_in_fr(self):
        self.assertFalse(chk("FR", None, "atelier.lumiere@orange.fr").ok)  # Freemail
        r = check_prospect(email="contact@atelier-lumiere.fr", country="FR", website="atelier-lumiere.fr",
                           legal_form=None, source_url=None, size_note="x", suppressed=True, cfg=CFG)
        self.assertFalse(r.ok)
        self.assertEqual(len(r.errors), 2)

    def test_legal_person(self):
        for co, form in [("FR", "SAS"), ("FR", "SARL"), ("UK", "Ltd"), ("US", "LLC"), ("US", "Inc"), ("US", "Corp")]:
            self.assertTrue(is_legal_person(co, form), (co, form))
        for co, form in [("FR", None), ("FR", "EI"), ("US", None), ("US", "LP"), ("US", "LLP"), ("US", "Co"), ("UK", "")]:
            self.assertFalse(is_legal_person(co, form), (co, form))


def run_followups(db):
    out = io.StringIO()
    with mock.patch("lib.db.DB", return_value=db), mock.patch.object(db, "rpc", return_value=False), \
            contextlib.redirect_stdout(out):
        followups.main([])
    return out.getvalue()


class FollowupTest(unittest.TestCase):
    def sent(self, prospect):
        m = msg("s1", "initial", "sent", to="contact@x.example")
        return dict(m, sent_at=RECENT, prospects={**m["prospects"], **prospect})

    def test_no_auto_followup_for_sole_traders(self):
        for prospect, expect in [({"country": "UK", "legal_form": "Ltd"}, 1), ({"country": "US", "legal_form": "LLC"}, 1),
                                 ({"country": "FR", "legal_form": None}, 0), ({"country": "US", "legal_form": None}, 0),
                                 ({"country": "US", "legal_form": "LP"}, 0)]:
            db = FakeDB({"owner_settings": [{"key": "followup_enabled", "value": True}],
                         "messages": [self.sent(prospect)], "email_events": []})
            out = run_followups(db)
            self.assertEqual(out.count("FOLLOWUP "), expect, (prospect, out))
            if not expect:
                self.assertIn("nur nach eigener Antwort", out)

    def test_sample_followup_after_reply_for_sole_traders(self):
        # Probe angefordert = eigene Antwort: Nachfrage zur Probe auch bei Einzelunternehmern
        m = self.sent({"country": "FR", "legal_form": None, "segment_id": "S2"})
        db = FakeDB({"owner_settings": [{"key": "followup_enabled", "value": True}], "messages": [m],
                     "email_events": [{"message_id": "s1", "type": "sample_requested", "created_at": "2026-09-01T10:00",
                                       "messages": m}]})
        with mock.patch("responder.booking_url", return_value=None):
            out = run_followups(db)
        self.assertIn("PROBE-NACHFASS", out)
        self.assertNotIn("FOLLOWUP ", out)

    def test_send_blocks_open_followup_for_sole_traders(self):
        f = msg("f1", "followup", "approved", parent_id="s1")
        f["prospects"] = {**f["prospects"], "country": "FR", "legal_form": None}
        self.assertIn("Einzelunternehmer", outreach.followup_block_reason(FakeDB(), f))
        f.pop("prospects")
        db = FakeDB({"prospects": [{"id": "p1", "country": "US", "legal_form": None}]})
        self.assertIn("Einzelunternehmer", outreach.followup_block_reason(db, f))
        # juristische Person: unverändert
        self.assertIsNone(outreach.followup_block_reason(FakeDB(), msg("f1", "followup", "approved", parent_id="s1")))

    def test_sample_followup_not_blocked_for_sole_traders(self):
        f = msg("f2", "sample_followup", "approved", parent_id="s1")
        f["prospects"] = {**f["prospects"], "country": "FR", "legal_form": None}
        ev = [{"message_id": "s1", "type": "sample_requested", "created_at": "2026-09-21T10:00"}]
        self.assertIsNone(outreach.followup_block_reason(FakeDB({"email_events": ev}), f))


class RulesRecheckTest(unittest.TestCase):
    REASON = "nur Anruf/Brief – FEHLER: Rechtsform '?' ist keine Kapitalgesellschaft in FR; Hinweis: keine Größenangabe"

    def row(self, i, **kw):
        # S5: S2/FR wartet seit 04.10.2026 zusätzlich auf die Webdesign-Prüfung (tests/test_fr_webfit.py)
        base = {"id": i, "segment_id": "S5", "country": "FR", "email": f"contact@firma{i}.fr", "website": f"firma{i}.fr",
                "domain": f"firma{i}.fr", "legal_form": None, "source_url": f"https://firma{i}.fr/contact",
                "size_note": None, "check_status": "call_only", "check_reason": self.REASON}
        return {**base, **kw}

    def test_recheck(self):
        rows = [self.row(1), self.row(2), self.row(3, check_status="rejected", check_reason=self.REASON[18:]),
                self.row(4, email="firma4@orange.fr"),  # Freemail bleibt verboten
                self.row(5),  # gesperrt
                self.row(6, country="UK", email="info@firma6.co.uk", website="firma6.co.uk", domain="firma6.co.uk",
                         check_reason=self.REASON.replace("FR", "UK")),  # UK unverändert
                self.row(7, check_reason="nur Anruf/Brief – FEHLER: Freemail-Adresse"),  # anderer Grund
                self.row(8, email=None)]
        db = FakeDB({"prospects": rows, "suppression": [{"value": "firma5.fr"}]})
        with contextlib.redirect_stdout(io.StringIO()):
            stats = kundenwerk.rules_recheck(db, CFG)
        st = {r["id"]: r for r in db.rows("prospects")}
        self.assertEqual([st[i]["check_status"] for i in range(1, 9)],
                         ["ok", "ok", "ok", "call_only", "call_only", "call_only", "call_only", "call_only"])
        self.assertEqual(stats["S5/FR:ok"], 3)
        self.assertEqual(stats["S5/FR:bleibt"], 2)
        self.assertIn("Freemail", st[4]["check_reason"])
        self.assertTrue(st[4]["check_reason"].startswith("nur Anruf/Brief"))
        self.assertIn("Sperrliste", st[5]["check_reason"])
        self.assertEqual(st[6]["check_reason"], rows[5]["check_reason"])
        # idempotent: zweiter Lauf findet nichts mehr
        self.assertEqual(kundenwerk.rules_recheck_rows(db, CFG), [])

    def test_dry_run_saves_nothing(self):
        db = FakeDB({"prospects": [self.row(1)], "suppression": []})
        with contextlib.redirect_stdout(io.StringIO()):
            kundenwerk.rules_recheck(db, CFG, dry_run=True)
        self.assertEqual(db.updates, [])

    def test_registry_recheck_skips_fr(self):
        db = FakeDB({"prospects": [self.row(1, check_reason=self.REASON)]})
        self.assertEqual(kundenwerk.recheck_rows(db, [("S2", "FR")], 100, CFG), [])


if __name__ == "__main__":
    unittest.main()
