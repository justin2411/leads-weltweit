import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tagescheck as t  # noqa: E402
from fakedb import FakeDB  # noqa: E402


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

    def test_kpi_line_counts_funnel_of_one_test(self):
        db = FakeDB({
            "experiments": [{"id": "e1", "segment_id": "S4", "country": "US"},
                            {"id": "e2", "segment_id": "S5", "country": "US"}],
            "messages": [{"id": "m1", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m2", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m3", "experiment_id": "e2", "status": "sent", "kind": "initial"},
                         {"id": "m4", "experiment_id": "e1", "status": "approved", "kind": "initial"}],
            "email_events": [{"id": "a", "type": "reply", "dedupe_key": "imap:<x1>", "message_id": "m1"},
                             {"id": "b", "type": "sample_requested", "dedupe_key": "reply:<x1>", "message_id": "m1"},
                             {"id": "c", "type": "auto_reply", "dedupe_key": "imap:<x2>", "message_id": "m2"},
                             {"id": "d", "type": "reply_negative", "dedupe_key": "imap:<x3>", "message_id": "m3"}],
            "sample_requests": [{"id": "s1", "segment_id": "S4", "country": "US"}],
            "subscriptions": [
                {"id": "u1", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "active"}},
                {"id": "u2", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "trial", "stripe_customer_id": "cus_test"}}],
        })
        k = t.kpi_line(db, "S4", "US")
        self.assertEqual((k["sent"], k["replies"], k["positive"], k["samples"], k["customers"]), (2, 1, 1, 1, 1))
        self.assertEqual((k["revenue"], k["currency"]), (129, "$"))


if __name__ == "__main__":
    unittest.main()
