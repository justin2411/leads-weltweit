import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import tagescheck as t  # noqa: E402


class TagescheckTest(unittest.TestCase):
    def test_subject_reflects_worst(self):
        c = t.Check()
        c.add("Versand", t.OK, "läuft")
        self.assertIn("alles läuft", t.mail(c)[0])
        c.add("Proben", t.WARN, "Hinweis")
        self.assertIn("1 Hinweis", t.mail(c)[0])
        c.add("Website", t.FAIL, "kaputt", "/ → 500")
        subject, body = t.mail(c)
        self.assertIn("1 Problem", subject)
        self.assertLess(body.index("PROBLEME"), body.index("HINWEISE"))
        self.assertEqual(c.worst, t.FAIL)

    def test_broken_check_is_reported_not_raised(self):
        c = t.Check()
        c.guard("Kunden", lambda: 1 / 0)
        self.assertEqual(c.rows[0][1], t.FAIL)


if __name__ == "__main__":
    unittest.main()
