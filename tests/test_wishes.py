"""Probe-Formular: Wunsch „Welche Leads?“ lesen und bei der Probe bevorzugen (Inhaber 28.09.2026)."""
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import wishes  # noqa: E402


def lead(i, signal, summary="", company=None, **co):
    return {"id": f"l{i}", "company_id": company or f"c{i}", "signal_type": signal, "event_summary": summary,
            "event_date": f"2026-09-{30 - i:02d}", "observation_ids": [f"o{i}"], "status": "new",
            "segment_id": "S5", "country": "UK", "watch_companies": {"name": f"Firm {i}", **co}}


class ParseTest(unittest.TestCase):
    def test_parse_and_split(self):
        note = "Adresse/Domain gesperrt – keine Mail; wunsch:signals=new_incorporation,finance_roles;text=only cafés; 10+ staff"
        self.assertEqual(wishes.parse(note), (["new_incorporation", "finance_roles"], "only cafés; 10+ staff"))
        self.assertEqual(wishes.split_note(note)[0], "Adresse/Domain gesperrt – keine Mail")
        self.assertEqual(wishes.parse(None), ([], ""))
        self.assertEqual(wishes.parse("TEST (Inhaber-Vorschau)"), ([], ""))
        # unbekannte Schlüssel werden ignoriert, höchstens 3
        self.assertEqual(wishes.parse("wunsch:signals=x,job_open_30d,jobs_3plus,growth,expansion")[0],
                         ["job_open_30d", "jobs_3plus", "growth"])
        self.assertEqual(wishes.parse("wunsch:signals=;text=hotels"), ([], "hotels"))

    def test_with_note_keeps_wish(self):
        old = "wunsch:signals=no_website;text=shops"
        self.assertEqual(wishes.with_note(old, "gesperrt"), "gesperrt; wunsch:signals=no_website;text=shops")
        self.assertEqual(wishes.with_note("alt; " + old, "neu"), "neu; " + old)
        self.assertEqual(wishes.with_note(None, "neu"), "neu")

    def test_keys_match_page(self):
        """Gleiche Schlüssel wie im Formular der Landingpage (app/content/sample-wishes.ts)."""
        ts = (ROOT / "app" / "content" / "sample-wishes.ts").read_text(encoding="utf-8")
        keys = set(re.findall(r'key: "([a-z0-9_]+)"', ts))
        self.assertTrue(keys)
        self.assertEqual(keys - wishes.KEYS, set())


class MatchTest(unittest.TestCase):
    def test_matches(self):
        m = wishes.matches
        self.assertTrue(m("job_open_30d", lead(1, "job_open_30d")))
        self.assertFalse(m("job_open_30d", lead(1, "jobs_3plus")))
        self.assertTrue(m("growth", lead(1, "jobs_3plus")))
        self.assertTrue(m("new_director", lead(1, "new_incorporation")))
        self.assertTrue(m("finance_roles", lead(1, "job_open_30d", "Role “Payroll Officer” open for 40 days")))
        self.assertFalse(m("finance_roles", lead(1, "job_open_30d", "Role “Chef” open for 40 days")))
        self.assertTrue(m("no_website", lead(1, "new_incorporation", website=None, website_checked_at="2026-09-27")))
        self.assertTrue(m("no_website", lead(1, "new_incorporation", "X LTD registered (no website found)")))
        self.assertFalse(m("no_website", lead(1, "new_incorporation", website="https://x.co.uk")))
        self.assertFalse(m("no_website", lead(1, "new_incorporation")))  # nicht geprüft = nicht behauptet
        self.assertTrue(m("fleet_warehouse", lead(1, "new_incorporation"), "49410 - Freight transport by road"))
        self.assertTrue(m("fleet_warehouse", lead(1, "new_incorporation", "ACME LOGISTICS LTD registered on 1 Sep")))
        self.assertFalse(m("fleet_warehouse", lead(1, "new_incorporation"), "56102 - Unlicensed restaurants"))
        self.assertTrue(m("expansion", lead(1, "new_location")))

    def test_prefer_keeps_order_and_fills(self):
        rows = [lead(1, "new_incorporation"), lead(2, "job_open_30d", "Role “Bookkeeper” open"), lead(3, "jobs_3plus")]
        self.assertEqual([l["id"] for l in wishes.prefer(rows, ["finance_roles", "growth"])], ["l2", "l3", "l1"])
        self.assertEqual([l["id"] for l in wishes.prefer(rows, [])], ["l1", "l2", "l3"])


class RegionalSampleWishTest(unittest.TestCase):
    """regional_sample: gewünschte vollständige Leads zuerst, aufgefüllt, nie unvollständige, immer 10."""

    def run_sample(self, rows, known, wish):
        import responder
        captured = {}

        def to_csv(picked, *a, **k):
            captured["ids"] = [l["id"] for l in picked]
            return b"csv"
        db = FakeDB({"leads": rows})
        with mock.patch("deliveries.contact_companies", return_value={c: {} for c in known}), \
                mock.patch("deliveries.enrich"), mock.patch("deliveries.to_csv", side_effect=to_csv), \
                mock.patch("lib.leadreport.attachments", return_value=[("sample-leads.csv", b"csv")]), \
                mock.patch.object(responder, "sample_extras", return_value={}):
            files, ok = responder.regional_sample(db, "S5", "UK", None, wish=wish)
        return files, ok, captured.get("ids")

    def test_prefers_wished_and_fills_up(self):
        rows = [lead(i, "new_incorporation") for i in range(1, 11)]
        rows += [lead(i, "job_open_30d", "Role “Accounts Assistant” open for 45 days") for i in range(11, 14)]
        rows += [lead(14, "job_open_30d", "Role “Payroll Clerk” open for 50 days")]  # unvollständig
        known = [f"c{i}" for i in range(1, 14)]
        files, ok, ids = self.run_sample(rows, known, ["finance_roles"])
        self.assertTrue(ok)
        self.assertEqual(len(ids), 10)
        self.assertEqual(ids[:3], ["l11", "l12", "l13"])  # Wunsch zuerst
        self.assertNotIn("l14", ids)  # nie unvollständig
        self.assertEqual(len(set(ids)), 10)

    def test_not_enough_complete_leads(self):
        rows = [lead(i, "job_open_30d", "Role “Payroll” open") for i in range(1, 12)]
        files, ok, ids = self.run_sample(rows, [f"c{i}" for i in range(1, 6)], ["finance_roles"])
        self.assertEqual((files, ok), ([], False))

    def test_without_wish_unchanged(self):
        rows = [lead(i, "new_incorporation") for i in range(1, 13)]
        files, ok, ids = self.run_sample(rows, [f"c{i}" for i in range(1, 13)], [])
        self.assertEqual(ids, [f"l{i}" for i in range(1, 11)])


class WebSamplesWishTest(unittest.TestCase):
    def test_note_updates_keep_wish(self):
        import responder
        import web_samples as w
        note = "wunsch:signals=growth;text=TEST firms only"
        db = FakeDB({"sample_requests": [{"id": "r1", "email": "info@adv.co.uk", "company_name": "Adv",
                                          "segment_id": "S9", "country": "UK", "status": "new", "note": note,
                                          "created_at": "2026-09-28T10:00:00"}]})
        with mock.patch("lib.db.DB", return_value=db), \
                mock.patch.object(responder, "regional_sample", return_value=([], False)), \
                mock.patch.object(responder, "notify_owner") as notify:
            w.main(["--apply"])
            w.main(["--apply"])  # zweiter Lauf: Inhaber nicht noch einmal benachrichtigen
        r = db.rows("sample_requests")[0]
        # Freitext "TEST" ist keine Inhaber-Vorschau: Anfrage bleibt offen
        self.assertEqual(r["status"], "new")
        self.assertEqual(r["note"], f"{w.NOTIFIED}; {note}")
        self.assertEqual(notify.call_count, 1)

    def test_sent_with_text_notifies_owner(self):
        import responder
        import web_samples as w
        db = FakeDB({"sample_requests": [{"id": "r1", "email": "info@acc.co.uk", "company_name": "Acc",
                                          "segment_id": "S5", "country": "UK", "status": "new",
                                          "note": "wunsch:signals=new_incorporation;text=hotels",
                                          "created_at": "2026-09-28T10:00:00"}]})
        with mock.patch("lib.db.DB", return_value=db), \
                mock.patch.object(responder, "regional_sample", return_value=([("a.csv", b"x")], True)) as rs, \
                mock.patch.object(responder, "send_reply") as send, \
                mock.patch.object(responder, "notify_owner") as notify, \
                mock.patch.dict("os.environ", {"RESEND_API_KEY": "x", "MAIL_FROM": "a@b.c"}):
            w.main(["--apply"])
        self.assertEqual(rs.call_args.kwargs["wish"], ["new_incorporation"])
        send.assert_called_once()
        self.assertEqual(db.rows("sample_requests")[0]["status"], "sent")
        self.assertIn("hotels", notify.call_args[0][1])


if __name__ == "__main__":
    unittest.main()
