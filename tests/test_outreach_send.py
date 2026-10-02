"""Kaltmail-Versand: Gesamtgrenze und erneute Prüfung von Nachfassmails (Audit 28.09.2026). Nur Probelauf."""
import contextlib
import io
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import outreach  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from followups import followup_text  # noqa: E402

P = {"id": "p1", "company_name": "Acme Recruitment Ltd", "segment_id": "S1", "country": "UK", "region": None}
E = {"id": "e1", "segment_id": "S1", "variant": "A"}


import datetime as _dt  # noqa: E402

RECENT = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=5)).isoformat()


def msg(mid, kind, status, to="info@acme.co.uk", **kw):
    body, _ = followup_text(P, "en")
    return {"id": mid, "kind": kind, "status": status, "to_email": to, "prospect_id": "p1", "experiment_id": "e1",
            "subject": "Leads for recruiters across the UK", "body": body, "language": "en", "unsubscribe_token": "tok12345",
            "approved_at": "2026-09-27", "sent_at": RECENT if status == "sent" else None,
            "prospects": P, "experiments": E, **kw}


def run_send(db, limit=None):
    out = io.StringIO()
    with mock.patch("lib.db.DB", return_value=db), mock.patch.object(outreach, "total_limit", return_value=limit), \
            mock.patch("lib.deliverability.domain_accepts_mail", return_value=True), \
            mock.patch("lib.fokus.focus_only", return_value=False), \
            mock.patch.object(outreach, "lint_draft", return_value=mock.Mock(errors=[])), \
            mock.patch.dict(os.environ, {}, clear=False), contextlib.redirect_stdout(out):
        outreach.cmd_send(SimpleNamespace(live=False, owner_ok=None, limit=400, pause=0))
    return out.getvalue()


class TotalLimitTest(unittest.TestCase):
    """Fix 8: config/versand.yaml gesamtgrenze gilt für Erstmails; Nachfassmails laufen weiter."""

    def test_limit_stops_initial_but_not_followups(self):
        db = FakeDB({"messages": [msg("s1", "initial", "sent", to="a@x.co.uk"), msg("s2", "initial", "sent", to="b@y.co.uk"),
                                  msg("a1", "initial", "approved", to="c@z.co.uk"),
                                  msg("f1", "followup", "approved", parent_id="s1", to="a@x.co.uk")]})
        out = run_send(db, limit=2)
        self.assertIn("würde senden an a@x.co.uk", out)
        self.assertNotIn("würde senden an c@z.co.uk", out)
        self.assertIn("Gesamtgrenze erreicht", out)

    def test_late_followup_blocked(self):
        # Nachfassmail mehr als 11 Tage nach der Erstmail: nicht mehr senden (Audit 02.10.2026)
        old = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=20)).isoformat()
        db = FakeDB({"messages": [msg("s1", "initial", "sent", to="a@x.co.uk", sent_at=old),
                                  msg("f1", "followup", "approved", parent_id="s1", to="a@x.co.uk")]})
        out = run_send(db, limit=1000)
        self.assertIn("Nachfassmail zu spät", out)
        self.assertNotIn("würde senden an a@x.co.uk", out)

    def test_role_address_blocked(self):
        # Funktionsadressen ohne Vertriebsbezug nicht anschreiben (Audit 02.10.2026)
        self.assertTrue(outreach.role_address("privacy@example.com"))
        self.assertTrue(outreach.role_address("Support@example.com"))
        self.assertFalse(outreach.role_address("info@example.com"))
        db = FakeDB({"messages": [msg("a1", "initial", "approved", to="privacy@z.co.uk")]})
        out = run_send(db, limit=1000)
        self.assertIn("BLOCKIERT privacy@z.co.uk", out)

    def test_below_limit_sends(self):
        db = FakeDB({"messages": [msg("a1", "initial", "approved", to="c@z.co.uk")]})
        self.assertIn("würde senden an c@z.co.uk", run_send(db, limit=1000))

    def test_config_value(self):
        self.assertEqual(outreach.total_limit(), 1000)


class FollowupRecheckTest(unittest.TestCase):
    """Fix 11: Nachfassmails beim Versand erneut prüfen."""

    def test_reply_after_creation_blocks(self):
        db = FakeDB({"email_events": [{"message_id": "s1", "type": "reply", "created_at": "2026-09-27"}]})
        why = outreach.followup_block_reason(db, msg("f1", "followup", "approved", parent_id="s1"))
        self.assertIn("reply", why)

    def test_sample_request_blocks(self):
        db = FakeDB({"sample_requests": [{"email": "info@acme.co.uk", "status": "sent"}]})
        self.assertIn("Landingpage", outreach.followup_block_reason(db, msg("f1", "followup", "approved", parent_id="s1")))

    def test_parent_found_without_parent_id(self):
        db = FakeDB({"messages": [msg("s1", "initial", "sent")],
                     "email_events": [{"message_id": "s1", "type": "bounced", "created_at": "2026-09-27"}]})
        self.assertIn("bounced", outreach.followup_block_reason(db, msg("f1", "followup", "approved")))

    def test_sample_followup_rules(self):
        base = [{"message_id": "s1", "type": "reply", "created_at": "2026-09-21T09:00"},
                {"message_id": "s1", "type": "sample_requested", "created_at": "2026-09-21T10:00"}]
        m = msg("f2", "sample_followup", "approved", parent_id="s1")
        self.assertIsNone(outreach.followup_block_reason(FakeDB({"email_events": base}), m))
        later = base + [{"message_id": "s1", "type": "reply_negative", "created_at": "2026-09-23T10:00"}]
        self.assertIn("reply_negative", outreach.followup_block_reason(FakeDB({"email_events": later}), m))

    def test_initial_never_rechecked(self):
        self.assertIsNone(outreach.followup_block_reason(FakeDB(), msg("a1", "initial", "approved")))

    def test_blocked_in_send_loop(self):
        db = FakeDB({"messages": [msg("s1", "initial", "sent", to="a@x.co.uk"),
                                  msg("f1", "followup", "approved", parent_id="s1", to="a@x.co.uk")],
                     "email_events": [{"message_id": "s1", "type": "reply_positive", "created_at": "2026-09-27"}]})
        out = run_send(db)
        self.assertIn("BLOCKIERT a@x.co.uk", out)
        self.assertNotIn("würde senden an a@x.co.uk", out)


class CountryWideButtonTest(unittest.TestCase):
    def test_country_area(self):
        # Fix 13: Probe-Knopf landesweit statt Region
        self.assertEqual(outreach._country_area("UK"), "the UK")
        self.assertEqual(outreach._country_area("FR"), "toute la France")


if __name__ == "__main__":
    unittest.main()
