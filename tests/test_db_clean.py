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


if __name__ == "__main__":
    unittest.main()
