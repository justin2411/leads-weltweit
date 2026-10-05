"""Gehirn-Weckruf (Inhaber 05.10.2026): Ereignis-Erkennung (Filter) und CLI offen/erledigt."""
import datetime as dt
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import gehirn_weckruf as gw  # noqa: E402
from fakedb import FakeDB  # noqa: E402

NOW = dt.datetime.now(dt.timezone.utc)  # die CLI rechnet mit der echten Uhr
NEU = (NOW - dt.timedelta(hours=2)).isoformat()
ALT = (NOW - dt.timedelta(hours=72)).isoformat()  # älter als 48 h


def welt() -> FakeDB:
    return FakeDB({
        "inbound_replies": [
            {"id": "r1", "received_at": NEU, "from_email": "a@agency.com", "intent": "sample", "summary_de": "will Probe"},
            {"id": "r2", "received_at": NEU, "from_email": "b@agency.com", "intent": "out_of_office"},
            {"id": "r3", "received_at": ALT, "from_email": "c@agency.com", "intent": "buy"},
            {"id": "r4", "received_at": NEU, "from_email": "chef@example.org", "intent": "other"},
        ],
        "sample_requests": [
            {"id": "s1", "created_at": NEU, "is_test": False, "email": "x@web.fr", "company_name": "Web FR",
             "country": "FR", "segment_id": "S2", "status": "sent"},
            {"id": "s2", "created_at": NEU, "is_test": True, "email": "x@web.fr", "company_name": "Vorschau"},
            {"id": "s3", "created_at": NEU, "is_test": False, "email": "chef@example.org", "company_name": "Inhaber"},
            {"id": "s4", "created_at": ALT, "is_test": False, "email": "y@web.fr", "company_name": "Alt"},
        ],
        "page_events_echt": [
            {"id": 7, "created_at": NEU, "type": "checkout_started", "variant_id": "v1"},
            {"id": 8, "created_at": NEU, "type": "view", "variant_id": "v1"},
            {"id": 9, "created_at": ALT, "type": "checkout_started", "variant_id": "v1"},
        ],
        "customers": [
            {"id": "c1", "created_at": NEU, "company_name": "Echt Ltd", "status": "active", "country": "UK",
             "stripe_customer_id": "cus_1"},
            {"id": "c2", "created_at": NEU, "company_name": "Test", "status": "trial", "stripe_customer_id": "cus_2",
             "notes": "Stripe-Testmodus (kein echter Kunde)"},
            {"id": "c3", "created_at": ALT, "company_name": "Altkunde", "status": "active", "stripe_customer_id": "cus_3"},
        ],
        "subscriptions": [
            {"id": "u1", "created_at": NEU, "customer_id": "c1", "status": "active", "package": "pro", "segment_id": "S2"},
            {"id": "u2", "created_at": NEU, "customer_id": "c2", "status": "active", "package": "starter"},
            {"id": "u3", "created_at": NEU, "customer_id": "c3", "status": "active", "package": "starter"},
            {"id": "u4", "created_at": NEU, "customer_id": "c1", "status": "cancelled", "package": "starter"},
        ],
        "email_events": [
            {"id": "e1", "created_at": NEU, "type": "complained", "note": "Beschwerde"},
            {"id": "e2", "created_at": NEU, "type": "bounced"},
        ],
    })


class ErkennenTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict("os.environ", {"OWNER_EMAIL": "Chef@example.org"})
        p.start()
        self.addCleanup(p.stop)
        n = mock.patch.object(gw, "notbremse_grund", return_value=None)
        n.start()
        self.addCleanup(n.stop)

    def refs(self, db=None):
        return {(r["kind"], r["ref"]) for r in gw.erkennen(db or welt(), NOW)}

    def test_filter(self):
        self.assertEqual(self.refs(), {
            ("antwort", "r1"), ("probe", "s1"), ("checkout", "7"),
            ("kunde", "customer:c1"), ("kunde", "subscription:u1"), ("kunde", "subscription:u3"),
            ("notbremse", "complaint:e1"),
        })

    def test_kurz_hoechstens_120(self):
        db = welt()
        db.tables["inbound_replies"][0]["summary_de"] = "x" * 500
        for r in gw.erkennen(db, NOW):
            self.assertLessEqual(len(r["kurz"]), 120)

    def test_notbremse_einmal_je_tag(self):
        with mock.patch.object(gw, "notbremse_grund", return_value="Bounce-Quote 6 %"):
            self.assertIn(("notbremse", f"stopp:{NOW.date().isoformat()}"), self.refs())

    def test_kaputte_quelle_stoppt_andere_nicht(self):
        db = welt()
        orig = db.select

        def sel(table, params=None):
            if table == "page_events_echt":
                raise RuntimeError("weg")
            return orig(table, params)
        db.select = sel
        r = self.refs(db)
        self.assertNotIn(("checkout", "7"), r)
        self.assertIn(("antwort", "r1"), r)

    def test_sammeln_idempotent(self):
        db = welt()
        self.assertEqual(gw.sammeln(db, NOW), 7)
        self.assertEqual(gw.sammeln(db, NOW), 0)
        self.assertEqual(len(db.rows("gehirn_weckruf")), 7)


class CliTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict("os.environ", {"OWNER_EMAIL": "chef@example.org"})
        p.start()
        self.addCleanup(p.stop)
        n = mock.patch.object(gw, "notbremse_grund", return_value=None)
        n.start()
        self.addCleanup(n.stop)

    def run_cli(self, db, *argv):
        buf = io.StringIO()
        with redirect_stdout(buf), mock.patch.object(gw, "notbremse_grund", return_value=None), \
                mock.patch.dict("os.environ", {"OWNER_EMAIL": "chef@example.org"}):
            self.assertEqual(gw.main(list(argv), db=db), 0)
        return json.loads(buf.getvalue())

    def test_offen_und_erledigt(self):
        db = welt()
        rows = self.run_cli(db, "offen")
        self.assertEqual(len(rows), 7)
        self.assertTrue({"id", "kind", "ref", "kurz"} <= set(rows[0]))
        # Ereignis-Sitzung hat eben etwas abgehakt -> 20 min Ruhe
        db.tables["gehirn_weckruf"][0]["id"] = 1
        self.assertEqual(self.run_cli(db, "erledigt", "1"), {"erledigt": 1})
        self.assertEqual(self.run_cli(db, "offen"), [])

    def test_ruhe_nach_20_min_vorbei(self):
        db = welt()
        gw.sammeln(db, NOW)
        alt = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=30)).isoformat()
        db.tables["gehirn_weckruf"][0]["handled_at"] = alt
        self.assertEqual(len(self.run_cli(db, "offen")), 6)

    def test_erledigt_alle(self):
        db = welt()
        gw.sammeln(db, NOW)
        self.assertEqual(self.run_cli(db, "erledigt", "alle"), {"erledigt": 7})
        self.assertTrue(all(r["handled_at"] for r in db.rows("gehirn_weckruf")))

    def test_erledigt_ungueltig(self):
        with self.assertRaises(SystemExit), redirect_stdout(io.StringIO()), \
                mock.patch("sys.stderr", io.StringIO()):
            gw.main(["erledigt", "x"], db=welt())


class WachhundTest(unittest.TestCase):
    def test_sammeln_fehler_bricht_wachhund_nicht(self):
        import wachhund
        db = FakeDB({})
        with mock.patch.dict("os.environ", {"GITHUB_REPOSITORY": "o/r", "GITHUB_TOKEN": "t"}), \
                mock.patch.object(wachhund, "open_db", return_value=db), \
                mock.patch.object(wachhund, "load_settings", return_value=None), \
                mock.patch.object(wachhund, "JOBS", []), \
                mock.patch.object(gw, "sammeln", side_effect=RuntimeError("kaputt")) as s, \
                redirect_stdout(io.StringIO()) as out:
            self.assertEqual(wachhund.main(["--apply"]), 0)
        s.assert_called_once()
        self.assertIn("Gehirn-Weckruf nicht gesammelt", out.getvalue())


if __name__ == "__main__":
    unittest.main()
