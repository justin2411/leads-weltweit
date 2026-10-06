import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import werk_takt as T  # noqa: E402


class WerkTaktTest(unittest.TestCase):
    def test_unter_30_nachfueller(self):
        self.assertEqual(T.round_actions(16, False, 5, min_belegt=30), ["werk-nachfuellen.yml"])

    def test_ab_30_nichts(self):
        self.assertEqual(T.round_actions(30, False, 5, min_belegt=30), [])

    def test_nachfueller_aktiv_kein_zweiter(self):
        self.assertEqual(T.round_actions(10, True, 5, min_belegt=30), [])

    def test_wachhund_ueberfaellig(self):
        self.assertEqual(T.round_actions(31, False, 45, min_belegt=30), ["wachhund.yml"])
        self.assertIn("wachhund.yml", T.round_actions(31, False, None, min_belegt=30))

    def test_selbst_dispatch_hoechstens_einmal(self):
        self.assertTrue(T.should_redispatch(True, True, False))
        self.assertFalse(T.should_redispatch(True, True, True))
        self.assertFalse(T.should_redispatch(True, False, False))
        self.assertFalse(T.should_redispatch(False, True, False))

    def test_schalter(self):
        self.assertTrue(T.switches_on("lead_suche: false\nkunden_suche: true\n"))
        self.assertFalse(T.switches_on("lead_suche: false\nkunden_suche: false\n"))

    def test_workflow_ohne_versand(self):
        wf = (Path(__file__).resolve().parents[1] / ".github/workflows/werk-takt.yml").read_text(encoding="utf-8")
        self.assertIn("group: takt", wf)          # Drossel 06.10.2026
        self.assertNotIn("schedule", wf)          # kein Zeitplan, kein Selbst-Neustart
        self.assertEqual(T.main(["--apply"]), 0)  # beendet sich sofort (drossel.DISPATCH_ERLAUBT = False)
        self.assertNotIn("send.yml", wf)
        src = (Path(__file__).resolve().parents[1] / "scripts/werk_takt.py").read_text(encoding="utf-8")
        self.assertNotIn('"send.yml"', src)


if __name__ == "__main__":
    unittest.main()
