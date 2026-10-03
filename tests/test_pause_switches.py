"""Werke per Klick an/aus (Inhaber 03.10.2026): pausierte Skripte beenden sich sauber, der Wachhund startet sie nicht
nach, Abmeldungen per Antwort werden trotz pausiertem Antwort-Assistenten gesperrt."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import owner_settings as O  # noqa: E402

PAUSED = {"owner_settings": [{"key": "werke_paused", "value": {"lead-werk": "2026-10-03T18:00:00Z",
                                                                "kunden-werk": "2026-10-03T18:00:00Z",
                                                                "proben-vorrat": "2026-10-03T18:00:00Z",
                                                                "kundenlieferung": "2026-10-03T18:00:00Z",
                                                                "tagescheck": "2026-10-03T18:00:00Z",
                                                                "antworten": "2026-10-03T18:00:00Z"}}]}


class PauseTest(unittest.TestCase):
    def test_paused_and_not_paused(self):
        self.assertEqual(O.paused(FakeDB(PAUSED), "lead-werk"), "2026-10-03T18:00:00Z")
        self.assertIsNone(O.paused(FakeDB(), "lead-werk"))
        self.assertIsNone(O.paused(FakeDB({"owner_settings": [{"key": "werke_paused", "value": "kaputt"}]}), "lead-werk"))
        self.assertTrue(O.stop_if_paused(FakeDB(PAUSED), "kunden-werk", log=lambda *a: None))
        self.assertFalse(O.stop_if_paused(FakeDB(), "kunden-werk", log=lambda *a: None))

    def test_sample_stock_does_nothing_when_paused(self):
        import sample_stock
        db = FakeDB(PAUSED)
        res = sample_stock.run(db, apply=True, log=lambda *a: None)
        self.assertTrue(res.get("paused"))
        self.assertEqual(db.rpcs, [])  # kein Verfall, kein Bau

    def test_wachhund_skips_paused(self):
        import wachhund
        s = O.load(FakeDB(PAUSED))
        self.assertIn("pausiert durch Inhaber", wachhund.owner_paused({"wf": "lead-werk.yml"}, s))
        self.assertIsNone(wachhund.owner_paused({"wf": "antworten.yml"}, s))  # Abmeldungen laufen immer
        self.assertEqual(wachhund.owner_paused({"wf": "send.yml"}, {"send_paused": True}), "Versand im Dashboard pausiert")
        self.assertIsNone(wachhund.owner_paused({"wf": "lead-werk.yml"}, None))

    def test_responder_pause_keeps_unsubscribe(self):
        import responder
        responder._PAUSED.clear()
        db = FakeDB(PAUSED)
        self.assertTrue(responder.auto_replies_paused(db))
        responder._PAUSED.clear()
        self.assertFalse(responder.auto_replies_paused(FakeDB()))


if __name__ == "__main__":
    unittest.main()
