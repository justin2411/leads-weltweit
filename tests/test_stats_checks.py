"""Kennzahlen, Bericht, Tagescheck, Web-Proben, Gehirn-Probe (Audit 28.09.2026)."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib.stats import count_by_type, delivered, distinct_replies  # noqa: E402


def stat(**kw):
    base = {"segment_id": "S1", "country": "UK", "sent": 0, "delivered": 0, "bounced": 0, "complained": 0,
            "replies": 0, "positive": 0, "samples": 0, "customers": 0}
    return {**base, **kw}


class DeliveredTest(unittest.TestCase):
    """Fix 9: SMTP kennt kein 'delivered' -> gesendet minus Bounces."""

    def test_fallback(self):
        self.assertEqual(delivered(stat(sent=60, bounced=4)), 56)
        self.assertEqual(delivered(stat(sent=60, delivered=50, bounced=4)), 50)  # Resend-Zahlen bleiben
        self.assertEqual(delivered(stat()), 0)

    def test_report_uses_fallback_and_real_threshold(self):
        import report
        d = {"stats": [stat(sent=100, bounced=3, replies=1)], "sent_24": 0, "ev_24": [], "first_day": None,
             "cap_today": 100, "approved": 500, "blocked_24": [], "prospects_ok": 0, "customers": []}
        _, text = report.build(d)
        self.assertIn("97 zugestellt", text)
        self.assertIn("gesendet minus Bounces", text)
        self.assertIn("stoppen", text)                  # 0 positive bei 97 zugestellten -> Regel greift
        self.assertIn("über 5 %, bewertet ab 100", text)  # Fix 21: Text passt zur Notbremse
        self.assertNotIn("3 %", text)


class DistinctRepliesTest(unittest.TestCase):
    """Fix 17: inbox.py 'reply' + responder.py Typ zur selben Mail zählen einmal."""

    def test_same_mail_counted_once(self):
        ev = [{"id": 1, "type": "reply", "dedupe_key": "imap:<a@x>", "message_id": "m1"},
              {"id": 2, "type": "sample_requested", "dedupe_key": "reply:<a@x>", "message_id": "m1"},
              {"id": 3, "type": "reply", "dedupe_key": "imap:<b@x>", "message_id": "m2"},
              {"id": 4, "type": "reply_negative", "dedupe_key": "reply:<b@x>", "message_id": "m2"},
              {"id": 5, "type": "reply", "dedupe_key": "imap:<c@x>", "message_id": "m3"},
              {"id": 6, "type": "auto_reply", "dedupe_key": "reply:<c@x>", "message_id": "m3"},
              {"id": 7, "type": "reply", "dedupe_key": "unknown:<d@x>", "message_id": None},
              {"id": 8, "type": "bounced", "dedupe_key": "imap:<e@x>:x@y", "message_id": "m4"}]
        self.assertEqual(count_by_type(distinct_replies(ev)),
                         {"sample_requested": 1, "reply_negative": 1, "auto_reply": 1, "reply": 1})

    def test_report_counts(self):
        import report
        ev = [{"id": 1, "type": "reply", "dedupe_key": "imap:<a@x>", "message_id": "m1"},
              {"id": 2, "type": "reply_positive", "dedupe_key": "reply:<a@x>", "message_id": "m1",
               "messages": {"to_email": "info@acme.co.uk"}, "note": "will kaufen"}]
        d = {"stats": [], "sent_24": 0, "ev_24": ev, "first_day": None, "cap_today": 100, "approved": 0,
             "blocked_24": [], "prospects_ok": 0, "customers": []}
        subject, text = report.build(d)
        self.assertIn("1 Antworten", subject)
        self.assertIn("1 KAUFINTERESSE", subject)

    def test_tagescheck_counts(self):
        import tagescheck as t
        db = FakeDB({"email_events": [
            {"id": 1, "type": "reply", "dedupe_key": "imap:<a@x>", "message_id": "m1", "created_at": "2999-01-01"},
            {"id": 2, "type": "sample_requested", "dedupe_key": "reply:<a@x>", "message_id": "m1", "created_at": "2999-01-01"}]})
        c = t.Check()
        t.check_replies(c, db)
        self.assertIn("Antworten in 26 h: 1", c.rows[0][2])


class TagescheckCustomersTest(unittest.TestCase):
    """Fix 18: Stripe-Testkäufe nicht zählen, hängende und leere Lieferungen melden."""

    def test_customers(self):
        import tagescheck as t
        old = (t.NOW - dt.timedelta(days=2)).isoformat()
        db = FakeDB({
            "subscriptions": [
                {"id": "s1", "customer_id": "k1", "status": "active", "first_delivery_approved": True,
                 "customers": {"company_name": "Real Ltd", "status": "active"}},
                {"id": "s2", "customer_id": "k2", "status": "active", "first_delivery_approved": True,
                 "customers": {"company_name": "Test", "status": "trial", "stripe_customer_id": "cus_x",
                               "notes": "Stripe-Testmodus (kein echter Kunde)"}}],
            "deliveries": [{"id": "d1", "subscription_id": "s1", "status": "approved", "approved_at": old,
                            "period_start": "2026-09-28", "lead_ids": []}],
            "customer_filters": [{"customer_id": "k1", "signals": ["x"]}],
        })
        c = t.Check()
        t.check_customers(c, db)
        titles = {r[2]: r for r in c.rows}
        self.assertIn("1 freigegebene Lieferung(en) seit über einem Tag nicht gesendet", titles)
        self.assertEqual(titles["1 freigegebene Lieferung(en) seit über einem Tag nicht gesendet"][1], t.FAIL)
        self.assertEqual(titles["1 Kunde(n) bekamen zuletzt 0 Leads"][1], t.WARN)
        self.assertTrue(titles["Abos"][3].startswith("1 aktiv"))
        self.assertIn("Stripe-Testkauf", titles["Abos"][3])


class WebSamplesTest(unittest.TestCase):
    """Fix 14/15: doppelte Proben und TEST-Anfragen überspringen."""

    def test_skip_reasons(self):
        import web_samples as w
        r = {"id": "r2", "email": "info@acme.co.uk", "note": None}
        self.assertIsNone(w.skip_reason(FakeDB(), r, None))
        self.assertIn("TEST", w.skip_reason(FakeDB(), {**r, "note": "TEST (Inhaber-Vorschau)"}, None))
        db = FakeDB({"sample_requests": [{"id": "r1", "email": "info@acme.co.uk", "status": "sent"}]})
        self.assertIn("doppelt", w.skip_reason(db, r, None))
        db = FakeDB({"email_events": [{"message_id": "m1", "type": "sample_requested"}]})
        self.assertIn("doppelt", w.skip_reason(db, r, {"id": "m1"}))


class BrainSampleTest(unittest.TestCase):
    """Fix 13: Probe-Mail des Gehirns ohne Region im Betreff."""

    def test_subject_country_wide(self):
        import brain
        import responder
        db = FakeDB({"sample_requests": [{"id": "r1", "email": "info@acme.co.uk", "segment_id": "S1", "country": "UK",
                                          "region": "Leeds, West Yorkshire", "status": "new"}]})
        with mock.patch.object(responder, "regional_sample", return_value=([("a.csv", b"x")], True)), \
                mock.patch.object(responder, "send_reply") as send, \
                mock.patch.dict("os.environ", {"RESEND_API_KEY": "x", "MAIL_FROM": "a@b.c"}):
            brain._send_sample(db, db.rows("sample_requests")[0])
        self.assertEqual(send.call_args[0][1], "Your 10 free leads from across the UK")  # landesweit, ohne Region
        self.assertNotIn("Leeds", send.call_args[0][2])


class MatchTagTest(unittest.TestCase):
    """Fix 2: tag_leads schreibt lead_tags (von deliveries.py prepare aufgerufen)."""

    def test_tag_leads(self):
        import match
        today = dt.date.today().isoformat()
        db = FakeDB({"leads": [{"id": "l1", "company_id": "c1", "segment_id": "S1", "country": "UK",
                                "signal_type": "job_open_30d", "event_date": today, "source_url": "u", "status": "new",
                                "created_at": today, "observation_ids": [],
                                "watch_companies": {"name": "A", "address": "x", "city": "Leeds", "website": "a.co.uk"}}]})
        rows = match.tag_leads(db, apply=True)
        self.assertEqual(rows[0]["quality"], 100)
        self.assertEqual(db.rows("lead_tags")[0]["lead_id"], "l1")
        self.assertEqual(match.tag_leads(FakeDB({"leads": db.rows("leads")}), apply=False)[0]["lead_id"], "l1")


if __name__ == "__main__":
    unittest.main()
