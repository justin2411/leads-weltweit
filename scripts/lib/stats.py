"""Kennzahlen, die in Python korrigiert werden müssen (ohne Änderung der Datenbank-Views)."""
from __future__ import annotations

import re

# Antwort-Ereignisse; bei mehreren Ereignissen zu derselben eingehenden Mail zählt das aussagekräftigste
REPLY_PRIORITY = {"reply_positive": 5, "sample_requested": 4, "reply_negative": 3, "unsubscribed": 2,
                  "auto_reply": 1, "reply": 0}
_INBOUND = re.compile(r"^(imap|reply|unknown):(.+)$")


def delivered(s: dict) -> int:
    """Zugestellt laut Resend-Ereignissen. Beim Versand über das eigene Postfach (SMTP) gibt es keine
    'delivered'-Ereignisse – dann gilt gesendet minus Bounces."""
    d = int(s.get("delivered") or 0)
    if d:
        return d
    return max(int(s.get("sent") or 0) - int(s.get("bounced") or 0), 0)


def _key(e: dict) -> tuple:
    m = _INBOUND.match(e.get("dedupe_key") or "")
    if m:  # inbox.py (imap:<Message-ID>) und responder.py (reply:/unknown:<Message-ID>) zur selben Mail
        return ("mail", m.group(2))
    if e.get("message_id"):
        return ("msg", e["message_id"])
    return ("event", e.get("id"))


def distinct_replies(events: list[dict]) -> list[dict]:
    """Je eingehender Mail ein Ereignis (das aussagekräftigste): inbox.py schreibt 'reply', responder.py zur selben
    Mail zusätzlich den genauen Typ – sonst würde jede Antwort doppelt gezählt."""
    best: dict[tuple, dict] = {}
    for e in events:
        if e.get("type") not in REPLY_PRIORITY:
            continue
        k = _key(e)
        if k not in best or REPLY_PRIORITY[e["type"]] > REPLY_PRIORITY[best[k]["type"]]:
            best[k] = e
    return list(best.values())


def count_by_type(events: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in events:
        out[e["type"]] = out.get(e["type"], 0) + 1
    return out
