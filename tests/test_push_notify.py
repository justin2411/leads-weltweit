"""Sofort-Alarm (scripts/lib/push.py): Signatur wie app/lib/push-core.ts, nur Pfade, wirft nie."""
import hashlib
import hmac
import io
import json
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import push  # noqa: E402


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


ENV = {"SUPABASE_SERVICE_ROLE_KEY": "test-key", "SITE_URL": "https://www.nextgen-profit.de"}


class PushNotifyTest(unittest.TestCase):
    def test_build_signature_and_shape(self):
        raw, sig = push.build("Kaufinteresse: Acme", "x" * 500, "https://www.nextgen-profit.de/dashboard/antworten/abc",
                              "buy", "test-key", now=1_790_000_000)
        self.assertEqual(sig, hmac.new(b"test-key", raw, hashlib.sha256).hexdigest())
        data = json.loads(raw)
        self.assertEqual(sorted(data), ["body", "kind", "title", "ts", "url"])
        self.assertEqual(data["url"], "/dashboard/antworten/abc")
        self.assertEqual(len(data["body"]), 240)
        self.assertEqual(data["ts"], 1_790_000_000)
        self.assertEqual(json.loads(push.build("t", "", "", "hack", "k")[0])["kind"], "other")

    def test_only_paths(self):
        self.assertEqual(push._path("https://evil.example/x?a=1"), "/x?a=1")  # Host fällt weg, die App prüft den Pfad
        self.assertEqual(push._path("//evil.example/x"), "/x")  # nur der Pfad bleibt, nie ein fremder Host
        self.assertEqual(push._path("javascript:alert(1)"), "/dashboard/antworten")
        self.assertEqual(push._path(""), "/dashboard/antworten")

    def test_success_posts_signed_body(self):
        seen = {}

        def fake_urlopen(req, timeout):
            seen.update(url=req.full_url, data=req.data, sig=req.get_header("X-signature"), timeout=timeout,
                        method=req.get_method())
            return _Resp(b'{"ok":true,"sent":1,"failed":0}')

        with mock.patch.dict(os.environ, ENV), mock.patch("urllib.request.urlopen", fake_urlopen):
            self.assertTrue(push.notify("Frage: Acme", "Wie oft?", "/dashboard/antworten/1", "question"))
        self.assertEqual(seen["url"], "https://www.nextgen-profit.de/api/push")
        self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["timeout"], 10)
        self.assertEqual(seen["sig"], hmac.new(b"test-key", seen["data"], hashlib.sha256).hexdigest())

    def test_no_device_is_false(self):
        with mock.patch.dict(os.environ, ENV), \
                mock.patch("urllib.request.urlopen", return_value=_Resp(b'{"ok":true,"sent":0,"skipped":"empty"}')):
            self.assertFalse(push.notify("t", "b", "/x", "buy"))

    def test_never_raises(self):
        errors = [
            urllib.error.HTTPError("https://x/api/push", 404, "nf", {}, None),
            urllib.error.URLError("dns"),
            TimeoutError(),
            ValueError("kaputt"),
        ]
        for exc in errors:
            with self.subTest(exc=exc.__class__.__name__), mock.patch.dict(os.environ, ENV), \
                    mock.patch("urllib.request.urlopen", side_effect=exc):
                self.assertFalse(push.notify("t", "b", "/x", "buy"))
        with mock.patch.dict(os.environ, ENV), mock.patch("urllib.request.urlopen", return_value=_Resp(b"<html>")):
            self.assertFalse(push.notify("t", "b", "/x", "buy"))
        with mock.patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": ""}), \
                mock.patch("urllib.request.urlopen") as op:
            self.assertFalse(push.notify("t", "b", "/x", "buy"))
            op.assert_not_called()
        with mock.patch.dict(os.environ, ENV), mock.patch("urllib.request.urlopen") as op:
            self.assertFalse(push.notify("", "b", "/x", "buy"))
            op.assert_not_called()


if __name__ == "__main__":
    unittest.main()
