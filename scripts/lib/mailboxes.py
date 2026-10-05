"""Mehrere Versand-Postfächer (Inhaber 01.10.2026: „wir sollten die Möglichkeit haben auch hochzuskalieren,
Hauptdomain passt“).

Postfach 1 ist das bisherige: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, Absender MAIL_FROM.
Weitere Postfächer (2 bis 10) kommen nur über Umgebungsvariablen dazu, ohne Codeänderung:
  SMTP_USER_2, SMTP_PASSWORD_2      Pflicht
  SMTP_FROM_2                       Absender (Standard: SMTP_USER_2)
  SMTP_HOST_2, SMTP_PORT_2          Standard: wie Postfach 1 (gleicher Anbieter, gleiche Domain)
Alle Postfächer senden mit demselben Anzeigenamen wie das Hauptpostfach (display_name()).
Antworten und Abmeldungen gehen bei allen Postfächern über REPLY_TO an das Hauptpostfach.

Jedes neue Postfach fährt mit eigener Aufwärmphase hoch (ab der ersten Mail aus diesem Postfach) bis
`postfach_tageslimit` aus config/versand.yaml. Postfach 1 behält seine bisherige Tagesmenge (warmup_cap).
Notbremse, Spam-Stopp, Länder-Tageslimits und Gesamtgrenze gelten unverändert für alle Postfächer zusammen.

Viele Domains und Postfächer (Inhaber 05.10.2026: „wie können wir es schaffen, möglichst viele zu schicken“):
  SMTP_BOXES   ein GitHub-Secret mit einer JSON-Liste beliebig vieler weiterer Postfächer, ohne Workflow-Änderung:
               [{"user": "anna@beispiel-leads.com", "password": "…", "from": "anna@beispiel-leads.com",
                 "host": "smtp.anbieter.de", "port": 465, "imap_host": "imap.anbieter.de",
                 "start": 20, "schritt": 5, "limit": 40}]
               Pflicht: user, password. start/schritt/limit: eigene Aufwärmkurve je Postfach (nie über
               postfach_tageslimit). Ungültiges JSON = keine Zusatz-Postfächer (nichts wird gesendet, was unklar ist).
Jedes Postfach kennt seine Domain. Postfächer auf der Hauptdomain (Domain von MAIL_FROM, heute nextgen-profit.de)
senden wie bisher. Postfächer auf jeder anderen Domain senden erst, wenn postfach-test (scripts/mailbox_test.py) für
genau diese Adresse DNS, Anmeldung und DKIM grün in signalwerk.mailbox_checks eingetragen hat (active_boxes).
"""
from __future__ import annotations

import datetime as dt
import json
import os
from email.utils import formataddr, parseaddr

from lib.deliverability import HARD_MAX_PER_DAY, _cfg, warmup_cap

MAX_BOXES = 10
# Neues Postfach: Start und tägliche Steigerung bis postfach_tageslimit (Inhaber 03.10.2026: „starte bei dem neuen
# postfach auch mit 60 und geh jeden tag höher bis auf 150“); Werte in config/versand.yaml
NEW_BOX_START = 60
NEW_BOX_STEP = 15


def display_name(env=None) -> str:
    """Einheitlicher Anzeigename aller Versand-Postfächer: der des Hauptpostfachs (MAIL_FROM „Name <adresse>“),
    sonst die Marke (SENDER_COMPANY, Standard NextGen Profit). Prüfung 04.10.2026: Postfach 2/3 gingen ohne Namen raus."""
    env = os.environ if env is None else env
    name = parseaddr(env.get("MAIL_FROM") or "")[0].strip()
    return name or (env.get("SENDER_COMPANY") or "NextGen Profit").strip()


def with_name(sender: str, name: str) -> str:
    """„Name <adresse>“; ein schon gesetzter Anzeigename bleibt unverändert."""
    s = (sender or "").strip()
    shown, addr = parseaddr(s)
    if shown or not addr or not name:
        return s
    return formataddr((name, addr))


JSON_FIRST = MAX_BOXES + 1  # Postfächer aus SMTP_BOXES bekommen die Nummern 11, 12, …


def _json_boxes(env) -> list[dict]:
    raw = (env.get("SMTP_BOXES") or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        print("WARNUNG: SMTP_BOXES ist kein gültiges JSON – Zusatz-Postfächer werden nicht benutzt")
        return []
    return [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []


def mailboxes(env=None) -> list[dict]:
    env = os.environ if env is None else env
    boxes = []
    name = display_name(env)
    if env.get("SMTP_USER"):
        boxes.append({"n": 1, "host": env.get("SMTP_HOST"), "port": int(env.get("SMTP_PORT") or 465),
                      "user": env["SMTP_USER"], "password": env.get("SMTP_PASSWORD"),
                      "from": with_name(env.get("MAIL_FROM") or env["SMTP_USER"], name)})
    for n in range(2, MAX_BOXES + 1):
        user, pw = env.get(f"SMTP_USER_{n}"), env.get(f"SMTP_PASSWORD_{n}")
        if not (user and pw):
            continue
        boxes.append({"n": n, "host": env.get(f"SMTP_HOST_{n}") or env.get("SMTP_HOST"),
                      "port": int(env.get(f"SMTP_PORT_{n}") or env.get("SMTP_PORT") or 465),
                      "user": user, "password": pw, "from": with_name(env.get(f"SMTP_FROM_{n}") or user, name)})
    seen = {address(b["from"]) for b in boxes}
    for i, d in enumerate(_json_boxes(env)):
        user, pw = str(d.get("user") or "").strip(), d.get("password")
        sender = with_name(str(d.get("from") or user), name)
        if not (user and pw) or address(sender) in seen:
            continue
        seen.add(address(sender))
        box = {"n": JSON_FIRST + i, "host": d.get("host") or env.get("SMTP_HOST"),
               "port": int(d.get("port") or env.get("SMTP_PORT") or 465), "user": user, "password": str(pw),
               "from": sender}
        if d.get("imap_host"):
            box["imap_host"] = str(d["imap_host"])
        for key in ("start", "schritt", "limit"):
            if str(d.get(key) or "").strip().isdigit():
                box[key] = int(d[key])
        boxes.append(box)
    for b in boxes:
        b["domain"] = domain_of(b["from"])
    return boxes


def domain_of(sender: str | None) -> str:
    """Domain einer Absenderadresse („Name <a@b.de>“ -> b.de), klein geschrieben; leer, wenn keine Adresse."""
    a = address(sender or "")
    return a.rsplit("@", 1)[1] if "@" in a else ""


def main_domain(env=None) -> str:
    """Hauptdomain: Domain des Hauptpostfachs (MAIL_FROM, sonst SMTP_USER), Standard nextgen-profit.de.
    Postfächer dort senden wie bisher ohne zusätzliche Freischaltung (Auftrag 05.10.2026, Punkt 3)."""
    env = os.environ if env is None else env
    return domain_of(env.get("MAIL_FROM") or env.get("SMTP_USER")) or "nextgen-profit.de"


def active_boxes(boxes: list[dict], checks: dict[str, dict], main: str) -> tuple[list[dict], dict[int, str]]:
    """(aktive Postfächer, {Nummer: Grund} für gesperrte). Hauptdomain: immer aktiv wie heute. Jede andere Domain:
    nur mit grüner letzter Prüfung dieser Adresse (DNS + Anmeldung + DKIM-Testmail, scripts/mailbox_test.py)."""
    active, off = [], {}
    for b in boxes:
        dom = b.get("domain") or domain_of(b.get("from"))
        if not dom or dom == main:
            active.append(b)
            continue
        c = checks.get(address(b["from"]))
        if c and c.get("ok"):
            active.append(b)
        elif c:
            off[b["n"]] = f"{address(b['from'])}: letzte Prüfung rot ({c.get('detail') or 'postfach-test'})"
        else:
            off[b["n"]] = f"{address(b['from'])}: noch nicht freigeschaltet (postfach-test fehlt)"
    return active, off


def load_checks(db) -> dict[str, dict]:
    """Neueste Prüfung je Adresse aus signalwerk.mailbox_checks; Fehler (z. B. Tabelle fehlt) = keine Prüfung,
    dann bleiben nur Hauptdomain-Postfächer aktiv."""
    try:
        rows = db.select("mailbox_checks", {"select": "address,ok,detail,checked_at", "order": "checked_at.desc",
                                            "limit": "1000"})
    except Exception as exc:  # noqa: BLE001
        print(f"Postfach-Prüfungen nicht lesbar ({type(exc).__name__}) – nur Hauptdomain-Postfächer aktiv")
        return {}
    out: dict[str, dict] = {}
    for r in rows:
        out.setdefault((r.get("address") or "").lower(), r)
    return out


def address(sender: str) -> str:
    """Reine Adresse aus „Name <adresse>“, klein geschrieben."""
    s = (sender or "").strip()
    if "<" in s:
        s = s.split("<", 1)[1].split(">", 1)[0]
    return s.strip().lower()


def box_limit() -> int:
    return int(_cfg("postfach_tageslimit") or _cfg("tagesziel") or 100)


def box_cap(box: dict, first_sent: dt.date | None, today: dt.date) -> int:
    """Tagesmenge eines Postfachs. Eigene Kurve je Postfach (start/schritt/limit aus SMTP_BOXES) darf nur
    strenger sein: nie über postfach_tageslimit aus config/versand.yaml."""
    if box["n"] == 1:
        return warmup_cap(first_sent, today)
    day = 0 if first_sent is None else max(0, (today - first_sent).days)
    start = int(box.get("start") or _cfg("postfach_start") or NEW_BOX_START)
    step = int(box.get("schritt") or _cfg("postfach_schritt") or NEW_BOX_STEP)
    top = min(int(box["limit"]), box_limit()) if box.get("limit") else box_limit()
    return max(0, min(start + step * day, top, HARD_MAX_PER_DAY))


def pick(boxes: list[dict], caps: dict[int, int], sent: dict[int, int]) -> dict | None:
    """Gleichmäßig über alle Postfächer: das mit dem kleinsten Anteil seiner Tagesmenge (bei Gleichstand das mit dem
    meisten Rest, dann die kleinere Nummer); None, wenn alle voll sind. So füllen sich ein Postfach mit 40 und eines
    mit 150 im gleichen Takt, statt dass das große zuerst allein sendet."""
    free = [b for b in boxes if caps.get(b["n"], 0) - sent.get(b["n"], 0) > 0]
    if not free:
        return None
    return min(free, key=lambda b: (sent.get(b["n"], 0) / caps[b["n"]], -(caps[b["n"]] - sent.get(b["n"], 0)), b["n"]))


def pick_for(boxes: list[dict], caps: dict[int, int], sent: dict[int, int], prefer_from: str | None) -> dict | None:
    """Wie pick(), aber zuerst das Postfach der Erstmail (Nachfassmail vom selben Absender wie die Erstmail, Gehirn
    05.10.2026). Nur wenn es noch Platz hat (Tagesmenge, Postfach-Notbremse setzt caps auf 0) – sonst pick()."""
    a = address(prefer_from or "")
    for b in boxes:
        if a and a == address(b["from"]) and caps.get(b["n"], 0) - sent.get(b["n"], 0) > 0:
            return b
    return pick(boxes, caps, sent)


def box_of(sent_from: str | None, boxes: list[dict]) -> int:
    """Nummer des Postfachs zu einer gesendeten Mail (ältere Mails ohne sent_from: Postfach 1)."""
    a = address(sent_from or "")
    for b in boxes:
        if a and a == address(b["from"]):
            return b["n"]
    return 1
