"""Mehrere Versand-Postfächer (Inhaber 01.10.2026: „wir sollten die Möglichkeit haben auch hochzuskalieren,
Hauptdomain passt“).

Postfach 1 ist das bisherige: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, Absender MAIL_FROM.
Weitere Postfächer (2 bis 10) kommen nur über Umgebungsvariablen dazu, ohne Codeänderung:
  SMTP_USER_2, SMTP_PASSWORD_2      Pflicht
  SMTP_FROM_2                       Absender (Standard: SMTP_USER_2)
  SMTP_HOST_2, SMTP_PORT_2          Standard: wie Postfach 1 (gleicher Anbieter, gleiche Domain)
Antworten und Abmeldungen gehen bei allen Postfächern über REPLY_TO an das Hauptpostfach.

Jedes neue Postfach fährt mit eigener Aufwärmphase hoch (ab der ersten Mail aus diesem Postfach) bis
`postfach_tageslimit` aus config/versand.yaml. Postfach 1 behält seine bisherige Tagesmenge (warmup_cap).
Notbremse, Spam-Stopp, Länder-Tageslimits und Gesamtgrenze gelten unverändert für alle Postfächer zusammen.
"""
from __future__ import annotations

import datetime as dt
import os

from lib.deliverability import HARD_MAX_PER_DAY, _cfg, warmup_cap

MAX_BOXES = 10
# Tage seit der ersten Mail aus dem Postfach -> Mails pro Tag (Obergrenze postfach_tageslimit)
NEW_BOX_WARMUP = [(0, 20), (3, 40), (7, 70), (14, 100), (21, 150)]


def mailboxes(env=None) -> list[dict]:
    env = os.environ if env is None else env
    boxes = []
    if env.get("SMTP_USER"):
        boxes.append({"n": 1, "host": env.get("SMTP_HOST"), "port": int(env.get("SMTP_PORT") or 465),
                      "user": env["SMTP_USER"], "password": env.get("SMTP_PASSWORD"),
                      "from": env.get("MAIL_FROM") or env["SMTP_USER"]})
    for n in range(2, MAX_BOXES + 1):
        user, pw = env.get(f"SMTP_USER_{n}"), env.get(f"SMTP_PASSWORD_{n}")
        if not (user and pw):
            continue
        boxes.append({"n": n, "host": env.get(f"SMTP_HOST_{n}") or env.get("SMTP_HOST"),
                      "port": int(env.get(f"SMTP_PORT_{n}") or env.get("SMTP_PORT") or 465),
                      "user": user, "password": pw, "from": env.get(f"SMTP_FROM_{n}") or user})
    return boxes


def address(sender: str) -> str:
    """Reine Adresse aus „Name <adresse>“, klein geschrieben."""
    s = (sender or "").strip()
    if "<" in s:
        s = s.split("<", 1)[1].split(">", 1)[0]
    return s.strip().lower()


def box_limit() -> int:
    return int(_cfg("postfach_tageslimit") or _cfg("tagesziel") or 100)


def box_cap(box: dict, first_sent: dt.date | None, today: dt.date) -> int:
    """Tagesmenge eines Postfachs."""
    if box["n"] == 1:
        return warmup_cap(first_sent, today)
    day = 0 if first_sent is None else (today - first_sent).days
    cap = NEW_BOX_WARMUP[0][1]
    for start, limit in NEW_BOX_WARMUP:
        if day >= start:
            cap = limit
    return max(0, min(cap, box_limit(), HARD_MAX_PER_DAY))


def pick(boxes: list[dict], caps: dict[int, int], sent: dict[int, int]) -> dict | None:
    """Postfach mit dem meisten Rest für heute (verteilt gleichmäßig); None, wenn alle voll sind."""
    free = [(caps.get(b["n"], 0) - sent.get(b["n"], 0), -b["n"], b) for b in boxes]
    free = [f for f in free if f[0] > 0]
    return max(free, key=lambda f: (f[0], f[1]))[2] if free else None


def box_of(sent_from: str | None, boxes: list[dict]) -> int:
    """Nummer des Postfachs zu einer gesendeten Mail (ältere Mails ohne sent_from: Postfach 1)."""
    a = address(sent_from or "")
    for b in boxes:
        if a and a == address(b["from"]):
            return b["n"]
    return 1
