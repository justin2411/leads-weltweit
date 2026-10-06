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
        ids = sp.best_ids(FakeDB({"messages": rows}), "e1", 3, mx=lambda _d: None)
        self.assertEqual(len(ids), 3)
        self.assertEqual(ids, ["m2", "m4", "m6"])

    def test_us_provider_order(self):
        sp._PROVIDER_BONUS.clear()
        mx = {"big.com": ["aspmx.l.google.com"], "small.com": ["mail.small.com"],
              "rs.com": ["mx1.emailsrvr.com"]}.get
        rows = [m("rs", "info@rs.com", "1", domain="rs.com"), m("small", "info@small.com", "2", domain="small.com"),
                m("big", "info@big.com", "3", domain="big.com")]
        ids = sp.best_ids(FakeDB({"messages": rows}), "e1", 3, mx=mx)
        self.assertEqual(ids, ["big", "small", "rs"])
        sp._PROVIDER_BONUS.clear()

    def test_provider_only_us(self):
        sp._PROVIDER_BONUS.clear()
        mx = {"big.co.uk": ["aspmx.l.google.com"], "small.co.uk": ["mail.small.co.uk"]}.get
        rows = [m("small", "info@small.co.uk", "1", domain="small.co.uk", country="UK", legal_form="Ltd"),
                m("big", "info@big.co.uk", "2", domain="big.co.uk", country="UK", legal_form="Ltd")]
        self.assertEqual(sp.best_ids(FakeDB({"messages": rows}), "e1", 2, mx=mx), ["small", "big"])
        sp._PROVIDER_BONUS.clear()

    def test_dns_error_neutral(self):
        sp._PROVIDER_BONUS.clear()

        def boom(_d):
            raise OSError("dns")
        rows = [m("a", "info@acme.com", "1"), m("b", "info@acme.com", "2")]
        self.assertEqual(sp.best_ids(FakeDB({"messages": rows}), "e1", 2, mx=boom), ["a", "b"])
        sp._PROVIDER_BONUS.clear()


if __name__ == "__main__":
    unittest.main()
