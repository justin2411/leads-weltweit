"""Kundenlieferung: Vorbereiten und Senden mit Attrappen-Datenbank (Audit 28.09.2026)."""
import datetime as dt
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import deliveries  # noqa: E402
from fakedb import FakeDB  # noqa: E402

TODAY = dt.date.today().isoformat()


def lead(i, company="c1", seg="S1", status="new"):
    return {"id": f"l{i}", "segment_id": seg, "country": "UK", "signal_type": "job_open_30d", "company_id": f"{company}{i}",
            "event_summary": "Hiring", "event_date": TODAY, "source_name": "site", "source_url": "https://x",
            "source_date": TODAY, "urgency": "high", "urgency_reason": "r", "opener": "o", "observation_ids": [],
            "created_at": TODAY, "status": status,
            "watch_companies": {"name": f"Acme {i} Ltd", "address": "1 High St", "city": "Leeds", "region": "",
                                "website": "acme.co.uk", "legal_form": "Ltd"}}


def delivery(did, sub, cust, leads):
    return {"id": did, "status": "approved", "period_start": deliveries.week_start().isoformat(), "lead_ids": leads,
            "subscriptions": {"segment_id": "S1", "filters": {"country": "UK"}, "status": "active",
                              "customers": {"company_name": cust, "country": "UK", "billing_email": f"ops@{cust}.co.uk",
                                            "status": "active"}}}


class SpyDB(FakeDB):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.params = []

    def select(self, table, params=None):
        self.params.append((table, dict(params or {})))
        return super().select(table, params)

    select_all = select


class SendTest(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"OWNER_EMAIL": "owner@example.com", "MAIL_FROM": "a@b.c",
                                                "RESEND_API_KEY": "x"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_send_selects_address_like_prepare(self):
        # Fix 1: ohne watch_companies.address verwarf complete_only jede Zeile -> Mail ohne Anhang
        db = SpyDB({"leads": [lead(1)], "deliveries": [delivery("d1", "s1", "acme", ["l1"])]})
        with mock.patch.object(deliveries, "_resend") as send, \
                mock.patch("lib.leadreport.attachments", return_value=[("leads.csv", b"x")]):
            deliveries.send_delivery(db, db.rows("deliveries")[0], live=True)
        sel = next(p["select"] for t, p in db.params if t == "leads")
        self.assertEqual(sel, deliveries.LEAD_SELECT)
        self.assertIn("address", sel)
        self.assertEqual(send.call_args[0][0], ["ops@acme.co.uk"])

    def test_leads_without_attachment_are_not_sent(self):
        # Fix 1: Leads vorhanden, aber nach der Vollständigkeitsprüfung kein Anhang -> nicht senden, Inhaber melden
        db = FakeDB({"leads": [lead(1)], "deliveries": [delivery("d1", "s1", "acme", ["l1"])]})
        with mock.patch.object(deliveries, "_resend") as send:
            out = deliveries.send_delivery(db, db.rows("deliveries")[0], live=True)
        self.assertEqual(out, "no_files")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args[0][0], ["owner@example.com"])
        self.assertEqual(db.rows("deliveries")[0]["status"], "approved")
        self.assertEqual(db.rows("leads")[0]["status"], "new")

    def test_sent_marks_leads_delivered(self):
        # Fix 4: gelieferte Leads -> status delivered (Proben/Landingpages zeigen nur new/sample)
        db = FakeDB({"leads": [lead(1), lead(2)], "deliveries": [delivery("d1", "s1", "acme", ["l1", "l2"])]})
        with mock.patch.object(deliveries, "_resend"), \
                mock.patch("lib.leadreport.attachments", return_value=[("leads.csv", b"x")]):
            self.assertEqual(deliveries.send_delivery(db, db.rows("deliveries")[0], live=True), "sent")
        self.assertEqual(db.rows("deliveries")[0]["status"], "sent")
        self.assertEqual({l["status"] for l in db.rows("leads")}, {"delivered"})

    def test_one_failing_delivery_does_not_stop_others(self):
        # Fix 16: Fehler je Lieferung abfangen, Inhaber melden, weitermachen
        db = FakeDB({"leads": [lead(1), lead(2)],
                     "deliveries": [delivery("d1", "s1", "broken", ["l1"]), delivery("d2", "s2", "fine", ["l2"])]})

        def fake_resend(to, *a, **kw):
            if to == ["ops@broken.co.uk"]:
                raise RuntimeError("Resend 500")
            return "id"
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(deliveries, "_resend", side_effect=fake_resend) as send, \
                mock.patch("lib.leadreport.attachments", return_value=[("leads.csv", b"x")]):
            deliveries.cmd_send(SimpleNamespace(live=True))
        st = {d["id"]: d["status"] for d in db.rows("deliveries")}
        self.assertEqual(st, {"d1": "approved", "d2": "sent"})
        self.assertIn(["owner@example.com"], [c[0][0] for c in send.call_args_list])

    def test_stripe_test_customer_is_skipped_on_send(self):
        d = delivery("d1", "s1", "acme", ["l1"])
        d["subscriptions"]["customers"].update(status="trial", stripe_customer_id="cus_test")
        db = FakeDB({"leads": [lead(1)], "deliveries": [d]})
        with mock.patch.object(deliveries, "_resend") as send:
            self.assertEqual(deliveries.send_delivery(db, db.rows("deliveries")[0], live=True), "skipped")
        send.assert_not_called()


class PrepareTest(unittest.TestCase):
    def db(self):
        period = deliveries.week_start()
        old = (period - dt.timedelta(days=7)).isoformat()
        return FakeDB({
            "subscriptions": [
                {"id": "s_test", "customer_id": "k_test", "segment_id": "S1", "status": "active",
                 "first_delivery_approved": True, "filters": {"country": "UK"},
                 "customers": {"company_name": "Stripe Test", "country": "UK", "billing_email": "t@t.co.uk",
                               "status": "trial", "stripe_customer_id": "cus_1", "notes": "Stripe-Testmodus (kein echter Kunde)"}},
                {"id": "s_real", "customer_id": "k_real", "segment_id": "S1", "status": "active",
                 "first_delivery_approved": True, "filters": {"country": "UK"},
                 "customers": {"company_name": "Real Ltd", "country": "UK", "billing_email": "r@r.co.uk",
                               "status": "active", "stripe_customer_id": "cus_2", "notes": None}},
            ],
            # alte, nie freigegebene Vorschau (l1) blockiert nichts mehr; gesendete (l2) schon
            "deliveries": [{"id": "old1", "subscription_id": "s_real", "period_start": old, "status": "prepared",
                            "lead_ids": ["l1"]},
                           {"id": "old2", "subscription_id": "s_real", "period_start": "2026-01-05", "status": "sent",
                            "lead_ids": ["l2"]}],
            "leads": [lead(1), lead(2), lead(3)],
        })

    def test_tags_fresh_leads_skips_test_buyers_and_counts_only_real_deliveries(self):
        db = self.db()
        with mock.patch("lib.db.DB", return_value=db), mock.patch.object(deliveries, "REQUIRE_CONTACT", False), \
                mock.patch.object(deliveries, "enrich"):
            deliveries.cmd_prepare(SimpleNamespace(notify=False))
        # Fix 2: lead_tags wurden vor der Auswahl geschrieben
        self.assertEqual({t["lead_id"] for t in db.rows("lead_tags")}, {"l1", "l2", "l3"})
        new = [d for d in db.rows("deliveries") if d["id"] not in ("old1", "old2")]
        # Fix 3: Stripe-Testkauf bekommt keine Lieferung
        self.assertEqual([d["subscription_id"] for d in new], ["s_real"])
        # Fix 3: l1 (nie freigegebene alte Vorschau) wieder frei, l2 (gesendet) nicht
        self.assertEqual(sorted(new[0]["lead_ids"]), ["l1", "l3"])

    def test_already_delivered_counts_open_preview_of_this_week(self):
        period = dt.date(2026, 9, 28)
        got = deliveries.already_delivered([
            {"status": "prepared", "period_start": "2026-09-28", "lead_ids": ["a"]},
            {"status": "prepared", "period_start": "2026-09-21", "lead_ids": ["b"]},
            {"status": "approved", "period_start": "2026-09-21", "lead_ids": ["c"]},
            {"status": "sent", "period_start": "2026-09-14", "lead_ids": ["d"]},
        ], period)
        self.assertEqual(got, {"a", "c", "d"})

    def test_test_customer_detection(self):
        self.assertTrue(deliveries.is_test_customer({"status": "trial", "stripe_customer_id": "cus_1"}))
        self.assertFalse(deliveries.is_test_customer({"status": "trial", "stripe_customer_id": None}))
        self.assertFalse(deliveries.is_test_customer({"status": "active", "stripe_customer_id": "cus_1"}))


class CompleteRowsTest(unittest.TestCase):
    def test_address_decides_whether_row_survives(self):
        # Ursache von Fix 1: complete_only verlangt die Adresse aus watch_companies
        from lib.leadreport import group_rows, complete_only
        full = {**lead(1), "_phone": "+44 113 000", "_email": "info@acme.co.uk", "_website": "acme.co.uk",
                "_person": "Jane Roe", "_person_role": "Director"}
        self.assertTrue(group_rows(complete_only(deliveries.to_csv([full]))))
        no_addr = {**full, "watch_companies": {k: v for k, v in full["watch_companies"].items() if k != "address"}}
        self.assertFalse(group_rows(complete_only(deliveries.to_csv([no_addr]))))


class DeliveryTextTest(unittest.TestCase):
    def test_country_wide_without_towns(self):
        # Fix 13: keine Städte; Gebiete nur, wenn der Kunde selbst welche gewählt hat
        _, body = deliveries.delivery_text("en", 12, dt.date(2026, 9, 28), [], "UK")
        self.assertIn("from across the UK", body)
        self.assertNotIn("town", body.lower())
        _, body = deliveries.delivery_text("en", 12, dt.date(2026, 9, 28), ["Greater Manchester"], "UK")
        self.assertIn("your chosen areas (Greater Manchester)", body)
        _, body = deliveries.delivery_text("fr", 12, dt.date(2026, 9, 28), [], "FR")
        self.assertIn("partout en France", body)
        self.assertNotIn("villes", body)


if __name__ == "__main__":
    unittest.main()
