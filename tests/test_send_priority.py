"""Versand-Reihenfolge: beste Erstmails je Experiment zuerst, Menge unverändert (Agentenauftrag 04.10.2026)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import send_priority as sp  # noqa: E402


def m(mid, to, approved, **p):
    base = {"country": "US", "domain": "acme.com", "source_url": "https://acme.com/contact", "legal_form": "LLC"}
    return {"id": mid, "to_email": to, "approved_at": approved, "status": "approved", "kind": "initial",
            "experiment_id": "e1", "prospects": {**base, **p}}


class SendPriorityTest(unittest.TestCase):
    def test_own_domain_beats_freemail(self):
        self.assertGreater(sp.score(m("a", "info@acme.com", "1")), sp.score(m("b", "acme@gmail.com", "1")))

    def test_overture_and_form(self):
        best = m("a", "info@acme.com", "1")
        self.assertGreater(sp.score(best), sp.score(m("b", "info@acme.com", "1", source_url="overture:123")))
        self.assertGreater(sp.score(best), sp.score(m("c", "info@acme.com", "1", legal_form=None)))

    def test_rank_ties_keep_oldest_first(self):
        rows = [m("new", "info@acme.com", "2026-10-03"), m("old", "info@acme.com", "2026-10-01"),
                m("free", "x@gmail.com", "2026-09-01")]
        self.assertEqual([r["id"] for r in sp.rank(rows)], ["old", "new", "free"])

    def test_best_ids_limits_count(self):
        rows = [m(f"m{i}", "x@gmail.com" if i % 2 else "info@acme.com", f"2026-10-0{i}") for i in range(1, 7)]
        ids = sp.best_ids(FakeDB({"messages": rows}), "e1", 3)
        self.assertEqual(len(ids), 3)
        self.assertEqual(ids, ["m2", "m4", "m6"])


if __name__ == "__main__":
    unittest.main()
