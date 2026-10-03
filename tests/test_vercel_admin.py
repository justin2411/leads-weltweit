"""vercel_admin.py env-add-vapid: legt Web-Push-Schlüssel nur an, wenn sie fehlen; nie überschreiben, nie Werte
ausgeben; bestehende Befehle unverändert."""
import base64
import contextlib
import io
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import vercel_admin as va  # noqa: E402


def b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class _Resp:
    def __init__(self, status=200, text="{}"):
        self.status_code, self.text = status, text


class EnvAddVapidTest(unittest.TestCase):
    def run_cmd(self, existing, post_status=200):
        posts, calls = [], []

        def fake_post(url, **kw):
            posts.append(kw["json"])
            return _Resp(post_status, '{"error":{"message":"exists"}}')

        def fake_call(method, path, **kw):
            calls.append((method, path, kw.get("json")))
            if method == "GET" and path.endswith("/env"):
                return {"envs": existing}
            return {}

        out = io.StringIO()
        env = {"VERCEL_TOKEN": "t", "OWNER_EMAIL": "owner@example.org", "GITHUB_ACTIONS": "true"}
        with mock.patch.dict(os.environ, env), mock.patch.object(va.requests, "post", fake_post), \
                mock.patch.object(va, "call", fake_call), mock.patch.object(va, "redeploy") as rd, \
                contextlib.redirect_stdout(out):
            va.main(["env-add-vapid"])
        return posts, calls, rd, out.getvalue()

    def test_creates_all_when_missing_and_never_prints_values(self):
        posts, calls, rd, out = self.run_cmd([{"key": "SITE_URL", "id": "e1", "target": ["production"]}])
        self.assertEqual([p["key"] for p in posts], ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])
        types = {p["key"]: p["type"] for p in posts}
        self.assertEqual(types["VAPID_PRIVATE_KEY"], "sensitive")
        for p in posts:
            self.assertEqual(sorted(p["target"]), ["preview", "production"])
            if p["key"] != "VAPID_PRIVATE_KEY":
                self.assertNotIn(p["value"], out)
        priv = next(p["value"] for p in posts if p["key"] == "VAPID_PRIVATE_KEY")
        # einzig erlaubte Erwähnung: die Maskierungs-Anweisung für GitHub (wird im Log nie angezeigt)
        self.assertEqual([ln for ln in out.splitlines() if priv in ln], [f"::add-mask::{priv}"])
        self.assertEqual(next(p["value"] for p in posts if p["key"] == "VAPID_SUBJECT"), "mailto:owner@example.org")
        rd.assert_called_once_with("main")
        self.assertFalse([c for c in calls if c[0] in ("PATCH", "DELETE")])

    def test_existing_complete_does_nothing(self):
        existing = [{"key": k, "id": k, "target": ["preview", "production"], "value": "geheim-verschluesselt"}
                    for k in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT")]
        posts, calls, rd, out = self.run_cmd(existing)
        self.assertEqual(posts, [])
        self.assertFalse([c for c in calls if c[0] != "GET"])
        rd.assert_not_called()
        self.assertNotIn("geheim", out)

    def test_existing_production_only_gets_preview_without_value(self):
        existing = [{"key": k, "id": k, "target": ["production"]} for k in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY")]
        posts, calls, rd, _ = self.run_cmd(existing)
        patches = [c for c in calls if c[0] == "PATCH"]
        self.assertEqual(len(patches), 2)
        for _, _, body in patches:
            self.assertEqual(body, {"target": ["preview", "production"]})
        self.assertEqual([p["key"] for p in posts], ["VAPID_SUBJECT"])
        rd.assert_called_once()

    def test_half_pair_refuses(self):
        with self.assertRaises(SystemExit):
            self.run_cmd([{"key": "VAPID_PUBLIC_KEY", "id": "x", "target": ["production"]}])

    def test_vercel_error_is_redacted(self):
        with mock.patch.object(va.requests, "post", return_value=_Resp(400, "bad value SECRETVALUE")), \
                mock.patch.dict(os.environ, {"VERCEL_TOKEN": "t"}):
            with self.assertRaises(SystemExit) as cm:
                va.create_env("VAPID_PRIVATE_KEY", "SECRETVALUE", "sensitive")
        self.assertNotIn("SECRETVALUE", str(cm.exception))

    def test_keypair_format(self):
        pub, priv = va.vapid_keypair()
        p, d = b64d(pub), b64d(priv)
        self.assertEqual((len(p), p[0], len(d)), (65, 4, 32))
        self.assertNotIn("=", pub + priv)
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        k = ec.derive_private_key(int.from_bytes(d, "big"), ec.SECP256R1())
        self.assertEqual(k.public_key().public_bytes(serialization.Encoding.X962,
                                                     serialization.PublicFormat.UncompressedPoint), p)

    def test_subject_fallback(self):
        with mock.patch.dict(os.environ, {"OWNER_EMAIL": ""}):
            self.assertEqual(va.vapid_subject(), "mailto:info@nextgen-profit.de")
        with mock.patch.dict(os.environ, {"OWNER_EMAIL": "a b@x"}):
            self.assertEqual(va.vapid_subject(), "mailto:info@nextgen-profit.de")

    def test_old_commands_still_accepted(self):
        for cmd, fn in (("status", "status"), ("redeploy", "redeploy"), ("site-setup", "site_setup"),
                        ("preview-add", "preview_add")):
            with self.subTest(cmd), mock.patch.object(va, fn) as f:
                va.main([cmd, "x"] if cmd != "status" else [cmd])
                f.assert_called_once()


if __name__ == "__main__":
    unittest.main()
