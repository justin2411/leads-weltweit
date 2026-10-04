"""Nullzeichen vor dem Speichern entfernen (Kunden-Werk 03.10.2026: ein \\u0000 ließ das ganze Paket scheitern)."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import db as dbmod  # noqa: E402


class CleanTests(unittest.TestCase):
    def test_insert_update_rpc_send_without_nul(self):
        d = dbmod.DB(url="https://x.supabase.co", key="k")
        sent = []
        resp = mock.Mock(status_code=201, text="[]")
        resp.json.return_value = []
        with mock.patch.object(d, "_send", side_effect=lambda *a, **kw: (sent.append(kw.get("json")), resp)[1]):
            d.insert("prospects", [{"company_name": "Acme\x00 Ltd", "extra": {"t": ["a\x00b"]}, "n": 1}])
            d.update("prospects", {"id": "1"}, {"note": "\x00x"})
            d.rpc("f", {"p": "y\x00"})
        self.assertEqual(sent[0], [{"company_name": "Acme Ltd", "extra": {"t": ["ab"]}, "n": 1}])
        self.assertEqual(sent[1], {"note": "x"})
        self.assertEqual(sent[2], {"p": "y"})


class StableOrderTests(unittest.TestCase):
    """Blättern mit eindeutiger Sortierung (Prüfung 04.10.2026: drafts.py brach mit 409 Duplicate Key ab, weil bei
    gleichem created_at ein Käufer auf zwei Seiten erschien)."""

    def test_stable_order(self):
        self.assertEqual(dbmod.stable_order("created_at"), "created_at,id")
        self.assertEqual(dbmod.stable_order("sent_at.asc"), "sent_at.asc,id")
        self.assertEqual(dbmod.stable_order("event_date.desc,id"), "event_date.desc,id")
        self.assertEqual(dbmod.stable_order("id"), "id")
        self.assertEqual(dbmod.stable_order("id.desc"), "id.desc")
        self.assertIsNone(dbmod.stable_order(None))

    def test_select_all_pages_with_id_tiebreak(self):
        d = dbmod.DB(url="https://x.supabase.co", key="k")
        seen = []
        with mock.patch.object(d, "select", side_effect=lambda t, p: (seen.append(p), [])[1]):
            d.select_all("prospects", {"order": "created_at", "limit": "5"})
            d.select_all("prospects", {"select": "id"})
        self.assertEqual(seen[0]["order"], "created_at,id")
        self.assertNotIn("order", seen[1])  # ohne Sortierung bleibt es wie bisher


if __name__ == "__main__":
    unittest.main()
