"""„Angewandt“-Quittung (Inhaber 03.10.2026: „immer mit einem button, dass die änderungen auch übernommen werden“):
Werke schreiben nach dem Lesen einer Einstellung eine Zeile in settings_ack; eine fehlgeschlagene Quittung hält nie
ein Werk an, und je Prozess wird jedes (Werk, Schlüssel) höchstens einmal quittiert."""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import owner_settings as O  # noqa: E402

PAUSED = {"owner_settings": [{"key": "werke_paused", "value": {"tagescheck": "2026-10-03T18:00:00Z",
                                                                "kundenlieferung": "2026-10-03T18:00:00Z"}}]}


def acks(db, werk=None) -> dict[str, dict]:
    return {r["key"]: r for r in db.rows("settings_ack") if werk is None or r["werk"] == werk}


class Stop(Exception):
    pass


class AckTest(unittest.TestCase):
    def setUp(self):
        O._ACKED.clear()

    def test_writes_one_row_per_key(self):
        db = FakeDB({"owner_settings": [{"key": "sample_targets", "value": {"S2/US": 50}}]})
        with mock.patch.dict("os.environ", {"GITHUB_RUN_ID": "4711"}):
            self.assertEqual(O.ack(db, "proben-vorrat", ["sample_targets", "sample_max_age_hours"]), 2)
        got = acks(db, "proben-vorrat")
        self.assertEqual(got["sample_targets"]["value"], {"S2/US": 50})
        self.assertIsNone(got["sample_max_age_hours"]["value"])  # Standardwert
        self.assertEqual(got["sample_targets"]["run_id"], "4711")
        self.assertTrue(got["sample_targets"]["seen_at"])

    def test_uses_given_settings_and_single_key(self):
        db = FakeDB()
        O.ack(db, "versand", "send_paused", {"send_paused": True})
        self.assertIs(acks(db, "versand")["send_paused"]["value"], True)

    def test_once_per_process(self):
        db = FakeDB()
        self.assertEqual(O.ack(db, "nachfass", ["followup_enabled"], {}), 1)
        self.assertEqual(O.ack(db, "nachfass", ["followup_enabled", "followup_days"], {}), 1)  # nur der neue
        self.assertEqual(O.ack(db, "nachfass", ["followup_enabled", "followup_days"], {}), 0)
        self.assertEqual(len(db.rows("settings_ack")), 2)
        self.assertEqual(O.ack(db, "versand", ["followup_enabled"], {}), 1)  # anderes Werk: eigene Quittung

    def test_upsert_keeps_one_row_per_werk_and_key(self):
        db = FakeDB({"settings_ack": [{"werk": "kunden-werk", "key": "buyer_countries_off", "value": [],
                                       "seen_at": "2026-10-01T00:00:00+00:00"}]})
        O.ack(db, "kunden-werk", ["buyer_countries_off"], {"buyer_countries_off": ["FR"]})
        rows = db.rows("settings_ack")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["value"], ["FR"])
        self.assertGreater(rows[0]["seen_at"], "2026-10-01T00:00:00+00:00")

    def test_never_raises(self):
        class Broken(FakeDB):
            def insert(self, *a, **k):
                raise RuntimeError("Tabelle fehlt")

        class Exits(FakeDB):
            def insert(self, *a, **k):
                raise SystemExit("PostgREST 404")
        self.assertEqual(O.ack(Broken(), "lead-werk", ["werke_paused"], {}), 0)
        self.assertEqual(O.ack(Exits(), "kunden-werk", ["werke_paused"], {}), 0)
        self.assertEqual(O.ack(FakeDB(), "x", ["k"], None), 1)  # lädt selbst
        self.assertEqual(O.ack(object(), "y", ["k"], None), 0)  # ohne insert/select: still 0
        # ein Werk läuft trotz kaputter Quittung weiter
        self.assertFalse(O.stop_if_paused(Broken(), "tagescheck", log=lambda *a: None))

    def test_paused_and_stop_if_paused_ack(self):
        db = FakeDB(PAUSED)
        self.assertTrue(O.stop_if_paused(db, "tagescheck", log=lambda *a: None))
        self.assertEqual(acks(db, "tagescheck")["werke_paused"]["value"], PAUSED["owner_settings"][0]["value"])
        db2 = FakeDB()
        self.assertIsNone(O.paused(db2, "lead-werk"))
        self.assertIn("werke_paused", acks(db2, "lead-werk"))
        with mock.patch.object(db2, "select", side_effect=AssertionError("nicht neu laden")):
            O.paused(db2, "kunden-werk", {"werke_paused": {}})  # gegebene Einstellungen werden weiterverwendet
        self.assertIn("werke_paused", acks(db2, "kunden-werk"))


class ConsumersAckTest(unittest.TestCase):
    def setUp(self):
        O._ACKED.clear()

    def test_werk_plan_acks_slot_plan_for_its_werk(self):
        import werk_plan
        db = FakeDB({"owner_settings": [{"key": "slot_plan", "value": {"web-us": 3}}]})
        with mock.patch("lib.db.DB", return_value=db):
            self.assertEqual(werk_plan.read_plan("lead-werk"), {"web-us": 3})
            self.assertEqual(werk_plan.read_plan(), {"web-us": 3})  # ohne Werk: keine Quittung
        self.assertEqual(acks(db, "lead-werk")["slot_plan"]["value"], {"web-us": 3})
        self.assertEqual(acks(db, "kunden-werk"), {})
        db2 = FakeDB()
        with mock.patch("lib.db.DB", return_value=db2):
            self.assertIsNone(werk_plan.read_plan("kunden-werk"))
        self.assertEqual(acks(db2, "kunden-werk")["slot_plan"]["value"], {})

    def test_werk_plan_main_passes_werk(self):
        import werk_plan
        with mock.patch.object(werk_plan, "read_plan", return_value=None) as rp, \
                mock.patch.dict("os.environ", {"SUPABASE_URL": "x", "GITHUB_OUTPUT": "", "GITHUB_STEP_SUMMARY": ""}), \
                contextlib.redirect_stdout(io.StringIO()):
            werk_plan.main(["kunden-werk", "--dry"])
            werk_plan.main(["kunden-werk"])
        self.assertEqual([c.args for c in rp.call_args_list], [(None,), ("kunden-werk",)])  # --dry quittiert nicht

    def test_sample_stock_acks_targets_and_age(self):
        import sample_stock
        db = FakeDB({"owner_settings": [{"key": "sample_targets", "value": {"S2/US": 50}}]})
        with mock.patch.object(db, "rpc", side_effect=Stop):
            with self.assertRaises(Stop):
                sample_stock.run(db, apply=True, log=lambda *a: None)
        got = acks(db, "proben-vorrat")
        self.assertEqual(set(got), {"werke_paused", "sample_targets", "sample_max_age_hours"})
        self.assertEqual(got["sample_targets"]["value"], {"S2/US": 50})

    def test_kundenwerk_acks_buyer_countries(self):
        import kundenwerk
        seen = []

        def fake_ack(db, werk, keys, settings=None):
            seen.append((werk, tuple(keys)))
            if "buyer_countries_off" in keys:
                raise Stop
        db = FakeDB({"segments": [{"id": "S2", "email_countries": ["US"]}]})
        with tempfile.TemporaryDirectory() as tmp, mock.patch("lib.db.DB", return_value=db), \
                mock.patch("lib.owner_settings.ack", side_effect=fake_ack), \
                mock.patch.object(kundenwerk, "KNOWN", Path(tmp) / "fehlt.json"), \
                mock.patch.object(kundenwerk, "count_ok", return_value=0), \
                mock.patch.object(kundenwerk, "candidates", return_value=[]), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(Stop):
                kundenwerk.main(["run", "--segments", "S2"])
        self.assertEqual(seen, [("kunden-werk", ("werke_paused",)), ("kunden-werk", ("buyer_countries_off",))])

    def test_outreach_acks_send_settings(self):
        from test_outreach_send import run_send
        db = FakeDB({"owner_settings": [{"key": "send_paused", "value": True}]})
        run_send(db)
        got = acks(db, "versand")
        self.assertEqual(set(got), {"send_paused", "send_countries_off", "send_country_limits"})
        self.assertIs(got["send_paused"]["value"], True)

    def test_followups_ack_only_when_applied(self):
        import followups
        for argv, expect in [([], set()), (["--apply"], {"followup_enabled", "followup_days"})]:
            O._ACKED.clear()
            db = FakeDB({"owner_settings": [{"key": "followup_days", "value": 6}], "messages": [], "email_events": []})
            with mock.patch("lib.db.DB", return_value=db), contextlib.redirect_stdout(io.StringIO()):
                followups.main(argv)
            self.assertEqual(set(acks(db, "nachfass")), expect, argv)
            if expect:
                self.assertEqual(acks(db, "nachfass")["followup_days"]["value"], 6)

    def test_responder_acks_pause_switch(self):
        import responder
        responder._PAUSED.clear()
        db = FakeDB()
        self.assertFalse(responder.auto_replies_paused(db))
        self.assertIn("werke_paused", acks(db, "antworten"))
        responder._PAUSED.clear()

    def test_tagescheck_and_deliveries_ack_via_stop_if_paused(self):
        import deliveries
        import tagescheck
        db = FakeDB(PAUSED)
        with mock.patch("lib.db.DB", return_value=db), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(tagescheck.main([]), 0)
            self.assertEqual(deliveries.cmd_send(None), 0)
        self.assertIn("werke_paused", acks(db, "tagescheck"))
        self.assertIn("werke_paused", acks(db, "kundenlieferung"))


if __name__ == "__main__":
    unittest.main()
