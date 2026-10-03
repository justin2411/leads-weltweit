"""Sofort-Alarm aufs Handy des Inhabers (Web-Push über die App, kostenlos; Nachtschicht 03./04.10.2026).

    from lib.push import notify
    notify("Kaufinteresse: Acme Ltd", "Will die Pro-Liste", "https://www.nextgen-profit.de/dashboard/antworten/<id>", "buy")

POST ${SITE_URL}/api/push mit {title, body, url, kind, ts}; Kopfzeile X-Signature = HMAC-SHA256 über den rohen Body
mit SUPABASE_SERVICE_ROLE_KEY (Gegenstück: app/lib/push-core.ts). Die App sendet an alle Geräte, die im Antworten-
Cockpit „Alarm aufs Handy“ eingeschaltet haben (höchstens 30 Alarme pro Stunde).

notify() wirft nie (Zeitlimit 10 s) und gibt True nur zurück, wenn mindestens ein Gerät den Alarm bekam.
Genutzt vom Antwort-Assistenten (Kaufinteresse, Frage, Unklar), später auch Tagescheck und Notbremse.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

KINDS = {"buy", "question", "unclear", "sample", "checkout", "tagescheck", "notbremse", "test", "other"}
TIMEOUT_S = 10


def _site() -> str:
    return (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").strip().rstrip("/")


def _path(url: str) -> str:
    """Nur der Pfad (die App nimmt keine fremden Adressen an; ein anderer Host in SITE_URL schadet so nicht)."""
    try:
        u = urlsplit(str(url or "").strip())
    except ValueError:
        return "/dashboard/antworten"
    path = (u.path or "") + (f"?{u.query}" if u.query else "")
    return path if path.startswith("/") and not path.startswith("//") else "/dashboard/antworten"


def build(title: str, body: str, url: str, kind: str, key: str, now: float | None = None) -> tuple[bytes, str]:
    """Body (kompaktes JSON) und Signatur (Hex). Ausgelagert für Tests."""
    payload = {
        "title": str(title or "")[:80],
        "body": str(body or "")[:240],
        "url": _path(url),
        "kind": kind if kind in KINDS else "other",
        "ts": int(now if now is not None else time.time()),
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return raw, hmac.new(key.encode("utf-8"), raw, hashlib.sha256).hexdigest()


def notify(title: str, body: str, url: str = "", kind: str = "other") -> bool:
    """Alarm senden. Wirft nie; False bei fehlendem Schlüssel, Netzfehler, Ablehnung oder ohne erreichtes Gerät."""
    try:
        key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        if not key or not str(title or "").strip():
            print("  Hinweis: Push übersprungen (Schlüssel oder Titel fehlt)")
            return False
        raw, sig = build(title, body, url, kind, key)
        req = urllib.request.Request(f"{_site()}/api/push", data=raw, method="POST", headers={
            "Content-Type": "application/json", "X-Signature": sig, "User-Agent": "signalwerk-push/1"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 - feste https-Adresse aus SITE_URL
            data = json.loads(resp.read(4000).decode("utf-8") or "{}")
        sent = int(data.get("sent") or 0)
        if not sent:
            print(f"  Hinweis: Push ohne Empfänger ({data.get('skipped') or 'kein Gerät erreicht'})")
        return bool(data.get("ok")) and sent > 0
    except urllib.error.HTTPError as exc:
        print(f"  Hinweis: Push abgelehnt (HTTP {exc.code})")
        return False
    except Exception as exc:  # noqa: BLE001 - Alarm ist optional, der Lauf geht immer weiter
        print(f"  Hinweis: Push fehlgeschlagen ({exc.__class__.__name__})")
        return False
