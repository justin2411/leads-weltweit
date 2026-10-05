"""Dashboard-Einstellungen des Inhabers (03.10.2026): Mails pro Tag je Land und Proben-Soll je Seite.
Harte Grenzen bleiben: nie über countries.yaml daily_limit, Proben-Soll 0–100."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib.owner_settings import DEFAULTS, MAX_SAMPLE_TARGET, country_limit, followup_days, load, max_age_hours, sample_target  # noqa: E402
import sample_stock  # noqa: E402
from test_outreach_send import msg, run_send  # noqa: E402


class LimitLogicTest(unittest.TestCase):
    def test_country_limit_never_above_yaml(self):
        self.assertEqual(country_limit(100, {}, "UK"), 100)
        self.assertEqual(country_limit(100, {"UK": 40}, "UK"), 40)
        self.assertEqual(country_limit(100, {"UK": 400}, "UK"), 100)
        self.assertEqual(country_limit(100, {"UK": -5}, "UK"), 0)
        self.assertEqual(country_limit(100, {"UK": "kaputt"}, "UK"), 100)
        self.assertEqual(country_limit(60, {"UK": 10}, "FR"), 60)
        # abgeschaltetes Land: 0, auch wenn ein Limit gesetzt ist
        self.assertEqual(country_limit(100, {"UK": 40}, "UK", ["UK"]), 0)

    def test_age_and_followup_ranges(self):
        self.assertEqual(max_age_hours(48, None), 48)
        self.assertEqual(max_age_hours(48, 12), 24)
        self.assertEqual(max_age_hours(48, 200), 96)
        self.assertEqual(max_age_hours(48, 72), 72)
        self.assertEqual(followup_days(4, None), 4)
        self.assertEqual(followup_days(4, 1), 3)
        self.assertEqual(followup_days(4, 30), 10)

    def test_sample_target_bounds(self):
        self.assertEqual(sample_target(6, {}, "S2", "US"), 6)
        self.assertEqual(sample_target(6, {"S2/US": 20}, "S2", "US"), 20)
        self.assertEqual(sample_target(6, {"S2/US": 5000}, "S2", "US"), MAX_SAMPLE_TARGET)
        self.assertEqual(sample_target(3, {"S2/US": 20}, "S2", "UK"), 3)

    def test_load(self):
        self.assertEqual(load(FakeDB({})), DEFAULTS)
        db = FakeDB({"owner_settings": [{"key": "send_paused", "value": True}, {"key": "unbekannt", "value": 1},
                                        {"key": "sample_targets", "value": {"S2/US": 20}}]})
        got = load(db)
        self.assertTrue(got["send_paused"])
        self.assertEqual(got["sample_targets"], {"S2/US": 20})
        self.assertNotIn("unbekannt", got)

        class Broken:
            def select(self, *a, **k):
                raise RuntimeError("Tabelle fehlt")
        self.assertEqual(load(Broken()), DEFAULTS)

    def test_targets_use_dashboard_values(self):
        pages = [{"segment_id": "S2", "country": "US"}, {"segment_id": "S1", "country": "UK"}]
        cfg = {"fokus_je_seite": 6, "andere_je_seite": 3}
        # nur aktive Märkte (Fokus) bekommen ein Soll (Inhaber 05.10.2026); ohne Fokus-Liste alle
        self.assertEqual(sample_stock.targets(pages, cfg, [("S2", "US")]), {("S2", "US"): 6})
        self.assertEqual(sample_stock.targets(pages, cfg, [("S2", "US")], {"S2/US": 20}), {("S2", "US"): 20})
        self.assertEqual(sample_stock.targets(pages, cfg, [], {"S1/UK": 4}), {("S2", "US"): 3, ("S1", "UK"): 4})


class SendUsesCountryLimitTest(unittest.TestCase):
    def _db(self, limits, **extra):
        rows = [{"key": "send_country_limits", "value": limits}] + [{"key": k, "value": v} for k, v in extra.items()]
        return FakeDB({"owner_settings": rows,
                       "messages": [msg("a1", "initial", "approved", to="info@x.co.uk"),
                                    msg("a2", "initial", "approved", to="hello@y.co.uk"),
                                    msg("a3", "initial", "approved", to="contact@z.co.uk")]})

    def test_dashboard_limit_applies(self):
        out = run_send(self._db({"UK": 1}))
        self.assertEqual(out.count("würde senden an"), 1)
        self.assertIn("Tageslimit UK (1) erreicht", out)

    def test_dashboard_limit_cannot_exceed_countries_yaml(self):
        out = run_send(self._db({"UK": 100000}))
        self.assertEqual(out.count("würde senden an"), 3)
        self.assertNotIn("Tageslimit UK (100000)", out)

    def test_country_switched_off(self):
        out = run_send(self._db({}, send_countries_off=["UK"]))
        self.assertEqual(out.count("würde senden an"), 0)
        self.assertIn("Tageslimit UK (0) erreicht", out)

    def test_pause_stops_everything(self):
        out = run_send(self._db({}, send_paused=True))
        self.assertIn("PAUSE", out)
        self.assertEqual(out.count("würde senden an"), 0)


class FollowupSettingsTest(unittest.TestCase):
    def test_followups_off_and_days(self):
        import contextlib
        import io
        from unittest import mock
        import followups
        from test_outreach_send import RECENT
        sent = msg("s1", "initial", "sent", to="info@x.co.uk")
        for enabled, days, expect in [(True, None, 1), (False, None, 0), (True, 8, 0)]:
            rows = [{"key": "followup_enabled", "value": enabled}] + ([{"key": "followup_days", "value": days}] if days else [])
            db = FakeDB({"owner_settings": rows, "messages": [dict(sent, sent_at=RECENT)], "email_events": []})
            out = io.StringIO()
            with mock.patch("lib.db.DB", return_value=db), mock.patch.object(db, "rpc", return_value=False), \
                    contextlib.redirect_stdout(out):
                followups.main([])
            self.assertEqual(out.getvalue().count("FOLLOWUP "), expect, (enabled, days, out.getvalue()))

    def test_no_followup_after_reply_in_cockpit(self):
        # Nachtschicht 04.10.2026: Antwort von einer anderen Adresse / während der Pause steht nur im Cockpit
        import contextlib
        import io
        from unittest import mock
        import followups
        from test_outreach_send import RECENT
        sent = msg("s1", "initial", "sent", to="info@x.co.uk")
        pid = sent["prospects"]["id"]
        for replies, expect in [([], 1), ([{"id": "r1", "prospect_id": pid, "received_at": RECENT}], 0)]:
            db = FakeDB({"owner_settings": [{"key": "followup_enabled", "value": True}],
                         "messages": [dict(sent, sent_at=RECENT)], "email_events": [], "inbound_replies": replies})
            out = io.StringIO()
            with mock.patch("lib.db.DB", return_value=db), mock.patch.object(db, "rpc", return_value=False), \
                    contextlib.redirect_stdout(out):
                followups.main([])
            self.assertEqual(out.getvalue().count("FOLLOWUP "), expect, out.getvalue())
