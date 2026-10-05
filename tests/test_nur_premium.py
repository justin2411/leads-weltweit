"""Nur Premium / Mischung im Lead-Werk (Inhaber 05.10.2026: „ab sofort brauchen wir nur noch premium leads“,
„möchte auch beim lead werk einstellen wv normale leads und premium leads gemacht werden“)."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests"))

from fakedb import FakeDB  # noqa: E402
from lib import premium  # noqa: E402


class MixTests(unittest.TestCase):
    def test_default_and_bounds(self):
        self.assertEqual(premium.mix_pct(None), 100)
        self.assertTrue(premium.only_premium(None))
        db = FakeDB({"owner_settings": [{"key": "lead_mix", "value": {"premium_pct": 40}}]})
        self.assertEqual(premium.mix_pct(db), 40)
        self.assertFalse(premium.only_premium(db))
        for bad, want in (({"premium_pct": "x"}, 100), ({"premium_pct": -5}, 0), ({"premium_pct": 300}, 100), (None, 100)):
            self.assertEqual(premium.mix_value(bad), want)

    def test_db_error_is_strict(self):
        class Broken:
            def select(self, *a, **k):
                raise RuntimeError("weg")
        self.assertTrue(premium.only_premium(Broken()))


class Guard:
    def __init__(self):
        self.known = set()


def _row(i, ampel="green", date=None):
    return {"source": "agence_bio", "source_id": str(i), "company": f"Ferme {i}", "ampel": ampel, "segment": "S2",
            "signal_date": date or dt.date.today().isoformat(), "source_url": "https://annuaire.agencebio.org/x",
            "contact_name": "Jean Dupont", "phone": "+33 1 23 45 67 89", "email": "a@b.fr", "signal_type": "",
            "signal_evidence": '{"dated_event": {"kind": "bio", "date": "%s"}}' % (date or dt.date.today().isoformat())}


class StoreTests(unittest.TestCase):
    def test_premium_only_drops_standard_and_raw(self):
        from extraktor import store
        old = (dt.date.today() - dt.timedelta(days=40)).isoformat()
        rows = [_row(1), _row(2, date=old), _row(3, ampel="yellow")]
        got = {}
        with mock.patch.object(store, "store_many", side_effect=lambda db, r: got.setdefault("new", r) and len(r)), \
                mock.patch.object(store, "store_raw", side_effect=lambda db, r: got.setdefault("raw", r) and len(r)):
            out = store.store_new(None, Guard(), rows, raw=True, premium_only=True)
        self.assertEqual([r["source_id"] for r in got["new"]], ["1"])
        self.assertNotIn("raw", got)
        self.assertEqual(out["verworfen_standard"], 1)
        self.assertEqual(out["verworfen_unvollstaendig"], 1)
        self.assertEqual(out["rohbestand"], 0)

    def test_mix_below_100_keeps_old_behaviour(self):
        from extraktor import store
        old = (dt.date.today() - dt.timedelta(days=40)).isoformat()
        rows = [_row(1), _row(2, date=old), _row(3, ampel="yellow")]
        got = {}
        with mock.patch.object(store, "store_many", side_effect=lambda db, r: got.setdefault("new", r) and len(r)), \
                mock.patch.object(store, "store_raw", side_effect=lambda db, r: got.setdefault("raw", r) and len(r)):
            out = store.store_new(None, Guard(), rows, raw=True, premium_only=False)
        self.assertEqual(len(got["new"]), 2)
        self.assertEqual(len(got["raw"]), 1)
        self.assertNotIn("verworfen_standard", out)


class DeliveryTests(unittest.TestCase):
    def test_premium_only_never_fills_with_standard(self):
        from deliveries import select_leads
        today = dt.date.today().isoformat()
        leads = [{"id": f"l{i}", "company_id": f"c{i}", "segment_id": "S2", "country": "UK", "signal_type": "no_website",
                  "event_date": today, "premium_score": 80 if i < 2 else 40,
                  "premium": {"tier": "premium" if i < 2 else "standard"}, "watch_companies": {}} for i in range(5)]
        sub = {"segment_id": "S2", "filters": {"country": "UK", "max_per_week": 10}}
        got = select_leads(leads, sub, set(), {}, match=lambda *a: True, premium_only=True)
        self.assertEqual({l["id"] for l in got}, {"l0", "l1"})
        self.assertEqual(len(select_leads(leads, sub, set(), {}, match=lambda *a: True)), 5)


class RadarTests(unittest.TestCase):
    def test_radar_drops_standard_event_but_keeps_state(self):
        from lib import radar
        db = FakeDB()
        row = {"company_id": "c1", "country": "UK", "website": "x.co.uk"}
        ev = {"signal_type": "website_broken", "event_date": dt.date.today(), "key": "broken", "findings": []}
        out = {"event": ev, "res": {}, "error": None, "cert": None}
        with mock.patch.object(radar, "candidates", side_effect=[[row], []]), \
                mock.patch.object(radar, "_check_rows", return_value=([{"company_id": "c1", "kind": "website_audit",
                                                                         "key": "radar"}], [(row, out)], 1)), \
                mock.patch.object(radar, "lead_row", return_value=({}, {"premium": {"tier": "standard"}})), \
                mock.patch.object(radar, "save_event") as save:
            rep = radar.run(db, ["UK"], 10, None, log=lambda *a: None, premium_only=True)
        save.assert_not_called()
        self.assertEqual(rep["UK"]["verworfen_standard"], 1)
        self.assertTrue(any(t == "observations" for t, _ in db.inserts) or db.tables.get("observations"))


if __name__ == "__main__":
    unittest.main()
