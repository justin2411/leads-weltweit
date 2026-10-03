#!/usr/bin/env python3
"""Postfach auswerten (für Versand per SMTP, z. B. Zoho): Bounces und Antworten.

  python scripts/inbox.py --days 7            # Probelauf: zeigt, was erkannt würde
  python scripts/inbox.py --days 7 --apply    # schreibt email_events und setzt Sperren

- Unzustellbar-Meldungen (DSN) -> Ereignis 'bounced' + dauerhafte Sperre von Adresse und Domain
- Antworten auf unsere Mails -> Ereignis 'reply'; Abmeldewunsch in der Antwort -> Sperre 'reply_optout'
- Ob eine Antwort positiv ist, entscheidet der Inhaber (Dashboard: "Antwort erfassen").

Liest alle Postfächer (Hauptpostfach + Versand-Postfächer 2 … aus SMTP_USER_n, je Posteingang und Spam/Junk, siehe
lib/imap_boxes.py), nur lesend: verschiebt oder löscht keine Mails.
Umgebung: IMAP_HOST (z. B. imap.strato.de), IMAP_USER, IMAP_PASSWORD, SMTP_USER[_n]/SMTP_PASSWORD[_n],
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import datetime as dt
import email
import re
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.rules import suppress  # noqa: E402

OPTOUT = re.compile(
    r"\b(unsubscribe|remove (me|us)|take (me|us) off|stop (emailing|contacting|sending)|do not (contact|email)|"
    r"don'?t (contact|email)|opt[- ]?out|désinscri\w*|ne plus (me|nous) (contacter|écrire)|retirez)\b",
    re.IGNORECASE,
)
MSGID = re.compile(r"<[^<>\s]+@[^<>\s]+>")


def _text(msg: EmailMessage) -> str:
    part = msg.get_body(preferencelist=("plain",)) if msg.is_multipart() else msg
    try:
        return part.get_content() if part else ""
    except (LookupError, KeyError):
        return ""


def parse_bounce(msg: EmailMessage) -> list[str]:
    """Empfänger mit endgültigem Fehler aus einer DSN (RFC 3464)."""
    failed = []
    if msg.get_content_type() == "multipart/report":
        for part in msg.walk():
            if part.get_content_type() == "message/delivery-status":
                payload = part.get_payload()
                blocks = payload if isinstance(payload, list) else [part]
                for block in blocks:
                    raw = block.as_string() if hasattr(block, "as_string") else str(block)
                    for chunk in re.split(r"\n\s*\n", raw):
                        rcpt = re.search(r"^Final-Recipient:\s*[^;]+;\s*(\S+)", chunk, re.I | re.M)
                        action = re.search(r"^Action:\s*(\S+)", chunk, re.I | re.M)
                        if rcpt and action and action.group(1).lower() == "failed":
                            failed.append(rcpt.group(1).strip("<>").lower())
    return failed


_ADDR = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+")


def bounce_details(msg: EmailMessage) -> dict[str, dict]:
    """Grund je endgültig gescheitertem Empfänger aus der DSN (Nachtschicht 04.10.2026): Status (z. B. 5.1.1 =
    Adresse unbekannt, 5.7.1 = abgelehnt/blockiert) und gekürzter Diagnose-Text ohne Mailadressen. Damit lässt sich
    unterscheiden, ob Adressen schlecht sind (Käuferbestand) oder der Absender abgelehnt wird (Ruf/Postfach)."""
    out: dict[str, dict] = {}
    if msg.get_content_type() != "multipart/report":
        return out
    for part in msg.walk():
        if part.get_content_type() != "message/delivery-status":
            continue
        payload = part.get_payload()
        blocks = payload if isinstance(payload, list) else [part]
        for block in blocks:
            raw = block.as_string() if hasattr(block, "as_string") else str(block)
            for chunk in re.split(r"\n\s*\n", raw):
                rcpt = re.search(r"^Final-Recipient:\s*[^;]+;\s*(\S+)", chunk, re.I | re.M)
                action = re.search(r"^Action:\s*(\S+)", chunk, re.I | re.M)
                if not (rcpt and action and action.group(1).lower() == "failed"):
                    continue
                status = re.search(r"^Status:\s*([245]\.\d{1,3}\.\d{1,3})", chunk, re.I | re.M)
                diag = re.search(r"^Diagnostic-Code:\s*[^;]*;\s*(.+(?:\n[ \t].+)*)", chunk, re.I | re.M)
                text = _ADDR.sub("<adr>", " ".join((diag.group(1) if diag else "").split()))[:200]
                code = status.group(1) if status else ""
                # Action: failed = endgültig gescheitert -> immer hart für die Notbremse (nie lockern), Status nur zur Info
                out[rcpt.group(1).strip("<>").lower()] = {"type": "Permanent", "status": code, "diagnostic": text}
    return out


def is_bounce(msg: EmailMessage) -> bool:
    frm = (msg.get("From") or "").lower()
    return msg.get_content_type() == "multipart/report" or "mailer-daemon" in frm or "postmaster" in frm


def referenced_ids(msg: EmailMessage) -> list[str]:
    return MSGID.findall(" ".join(filter(None, [msg.get("In-Reply-To"), msg.get("References")])))


def received_at(msg: EmailMessage, now: dt.datetime | None = None) -> str | None:
    """Eingangszeit aus der Date-Kopfzeile (ISO, UTC). Unplausible Werte (mehr als 1 h in der Zukunft oder älter als
    60 Tage) zählen nicht – dann None und die Datenbank nimmt die Verarbeitungszeit."""
    from email.utils import parsedate_to_datetime
    try:
        when = parsedate_to_datetime(msg.get("Date"))
    except (TypeError, ValueError, IndexError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    now = now or dt.datetime.now(dt.timezone.utc)
    if when > now + dt.timedelta(hours=1) or when < now - dt.timedelta(days=60):
        return None
    return when.astimezone(dt.timezone.utc).isoformat()


def subject_is_optout(subject: str | None) -> bool:
    """Abmeldung im Betreff, z. B. List-Unsubscribe per mailto (Betreff „unsubscribe“, meist ohne In-Reply-To)."""
    subj = re.sub(r"^((re|aw|fwd?|wg|tr)\s*:\s*)+", "", (subject or "").strip(), flags=re.I).strip()
    return subj.lower() == "unsubscribe" or bool(OPTOUT.search(subj))


def handle_reply(db, msg: EmailMessage, dedupe: str, apply: bool) -> str | None:
    """Antwort auf unsere Mail als Ereignis 'reply' erfassen; Abmeldewunsch sperrt. Abmeldung per Betreff sperrt den
    Absender auch ohne Bezug auf eine unserer Mails. Rückgabe: 'reply', 'optout' oder None (nicht unsere Mail)."""
    refs = referenced_ids(msg)
    ours = []
    for ref in refs:
        ours = db.select("messages", {"smtp_message_id": f"eq.{ref}", "select": "id,to_email"})
        if ours:
            break
    sender = email.utils.parseaddr(msg.get("From") or "")[1].lower()
    subject = msg.get("Subject") or ""
    if not ours:
        if "@" not in sender or not subject_is_optout(subject):
            return None
        # z. B. Klick auf „Abmelden“ im Mailprogramm: mailto an REPLY_TO mit Betreff „unsubscribe“
        last = db.select("messages", {"to_email": f"eq.{sender}", "status": "eq.sent", "select": "id",
                                      "order": "sent_at.desc", "limit": "1"})
        print(f"ABMELDUNG per Betreff von {sender}: {subject}")
        if apply:
            suppress(db, sender, "reply_optout", "imap-subject")
            db.insert("email_events", {"message_id": last[0]["id"] if last else None, "type": "unsubscribed",
                                       "dedupe_key": dedupe, "note": f"Abmeldung per Betreff: {subject[:150]}"},
                      upsert_on="dedupe_key", ignore_duplicates=True)
        return "optout"
    body = _text(msg)
    optout = bool(OPTOUT.search(body.split("\n>")[0][:2000]) or subject_is_optout(subject))
    # Abwesenheitsnotizen und andere Autoresponder sind keine Antwort (Inhaber 03.10.2026: „Automatic reply“ zählte
    # im Dashboard als „Geantwortet“) – gleiche Erkennung wie der Antwort-Assistent (Kopfzeilen + Betreff)
    from responder import is_auto_reply
    auto = not optout and is_auto_reply(msg)
    kind = "auto_reply" if auto else "reply"
    print(f"{'AUTOMATISCHE ANTWORT' if auto else 'ANTWORT'} von {sender} auf {ours[0]['to_email']}{' (Abmeldewunsch)' if optout else ''}: {subject}")
    if apply:
        event = {"message_id": ours[0]["id"], "type": kind, "dedupe_key": dedupe,
                 "note": ("Abmeldewunsch. " if optout else "Automatische Antwort: " if auto else "") + subject}
        when = received_at(msg)
        if when:  # echte Eingangszeit statt Verarbeitungszeit (Antwortzeiten im Dashboard)
            event["occurred_at"] = when
        db.insert("email_events", event)
        if optout:
            for addr in {sender, ours[0]["to_email"]} - {""}:
                suppress(db, addr, "reply_optout", "imap-reply")
    return "optout" if optout else kind


def handle_bounce(db, msg: EmailMessage, dedupe: str, apply: bool, known_only: bool = False) -> list[str]:
    """Unzustellbar-Meldung: Ereignis 'bounced' + dauerhafte Sperre je endgültig gescheitertem Empfänger.
    known_only (Spam-Ordner und weitere Postfächer): nur Empfänger, an die wir wirklich gesendet haben – Rückläufer
    fremder, gefälschter Mails mit unserer Domain (Backscatter) zählen nicht in die Bounce-Quote."""
    recipients = parse_bounce(msg)
    refs = referenced_ids(msg) + MSGID.findall(_text(msg))
    details = bounce_details(msg)
    out = []
    for rcpt in recipients:
        sent = db.select("messages", {"to_email": f"eq.{rcpt}", "status": "eq.sent", "select": "id",
                                      "order": "sent_at.desc", "limit": "1"})
        if known_only and not sent:
            print(f"Rückläufer ohne eigene Mail an {rcpt} übersprungen (Backscatter)")
            continue
        why = details.get(rcpt) or {}
        print(f"BOUNCE {rcpt}" + (f" ({why['status']})" if why.get("status") else ""))
        out.append(rcpt)
        if apply:
            db.insert("email_events", {"message_id": sent[0]["id"] if sent else None, "type": "bounced",
                                       "dedupe_key": f"{dedupe}:{rcpt}", "note": "DSN aus Postfach",
                                       "payload": {"refs": refs[:5], **({"bounce": why} if why else {})}},
                      upsert_on="dedupe_key", ignore_duplicates=True)  # Meldung liegt 14 Tage im Postfach
            suppress(db, rcpt, "bounce", "imap-dsn")
    if not recipients:
        print(f"Unklare Unzustellbar-Meldung, bitte ansehen: {msg.get('Subject')}")
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    from lib.db import DB
    from lib.imap_boxes import fallback_id, read_all, INBOX
    db = DB()
    since = (dt.date.today() - dt.timedelta(days=args.days)).strftime("%d-%b-%Y")

    def handle(acct: dict, folder: str, num: str, msg: EmailMessage) -> None:
        # Alle Postfächer (Nachtschicht 04.10.2026): Rückläufer gehen an das sendende Postfach 2, 3 …
        mid = (msg.get("Message-ID") or fallback_id(acct, folder, num)).strip()
        dedupe = f"imap:{mid}"
        if db.select("email_events", {"dedupe_key": f"eq.{dedupe}", "select": "id"}):
            return
        if is_bounce(msg):
            handle_bounce(db, msg, dedupe, args.apply, known_only=not (acct["n"] == 0 and folder == INBOX))
            return
        handle_reply(db, msg, dedupe, args.apply)

    stats = read_all(since, handle)
    if not args.apply:
        print("\nProbelauf. Mit --apply speichern und sperren.")
    # Rot im Lauf, wenn ein Postfach nicht lesbar war oder eine Mail scheiterte (Tagescheck sieht es)
    return 1 if stats["errors"] or stats["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
