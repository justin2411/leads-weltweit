#!/usr/bin/env python3
"""Postfach auswerten (für Versand per SMTP, z. B. Zoho): Bounces und Antworten.

  python scripts/inbox.py --days 7            # Probelauf: zeigt, was erkannt würde
  python scripts/inbox.py --days 7 --apply    # schreibt email_events und setzt Sperren

- Unzustellbar-Meldungen (DSN) -> Ereignis 'bounced' + dauerhafte Sperre von Adresse und Domain
- Antworten auf unsere Mails -> Ereignis 'reply'; Abmeldewunsch in der Antwort -> Sperre 'reply_optout'
- Ob eine Antwort positiv ist, entscheidet der Inhaber (Dashboard: "Antwort erfassen").

Liest nur, verschiebt oder löscht keine Mails.
Umgebung: IMAP_HOST (z. B. imap.zoho.eu), IMAP_USER, IMAP_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import datetime as dt
import email
import imaplib
import os
import re
import sys
from email import policy
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


def is_bounce(msg: EmailMessage) -> bool:
    frm = (msg.get("From") or "").lower()
    return msg.get_content_type() == "multipart/report" or "mailer-daemon" in frm or "postmaster" in frm


def referenced_ids(msg: EmailMessage) -> list[str]:
    return MSGID.findall(" ".join(filter(None, [msg.get("In-Reply-To"), msg.get("References")])))


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
    print(f"ANTWORT von {sender} auf {ours[0]['to_email']}{' (Abmeldewunsch)' if optout else ''}: {subject}")
    if apply:
        db.insert("email_events", {"message_id": ours[0]["id"], "type": "reply", "dedupe_key": dedupe,
                                   "note": ("Abmeldewunsch. " if optout else "") + subject})
        if optout:
            for addr in {sender, ours[0]["to_email"]} - {""}:
                suppress(db, addr, "reply_optout", "imap-reply")
    return "optout" if optout else "reply"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    from lib.db import DB
    db = DB()
    since = (dt.date.today() - dt.timedelta(days=args.days)).strftime("%d-%b-%Y")
    imap = imaplib.IMAP4_SSL(os.environ["IMAP_HOST"])
    imap.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
    imap.select("INBOX", readonly=True)
    _, data = imap.search(None, "SINCE", since)
    for num in data[0].split():
        _, fetched = imap.fetch(num, "(BODY.PEEK[])")
        msg: EmailMessage = email.message_from_bytes(fetched[0][1], policy=policy.default)
        mid = (msg.get("Message-ID") or f"imap-{num.decode()}").strip()
        dedupe = f"imap:{mid}"
        if db.select("email_events", {"dedupe_key": f"eq.{dedupe}", "select": "id"}):
            continue

        if is_bounce(msg):
            recipients = parse_bounce(msg)
            refs = referenced_ids(msg) + MSGID.findall(_text(msg))
            for rcpt in recipients:
                sent = db.select("messages", {"to_email": f"eq.{rcpt}", "status": "eq.sent", "select": "id",
                                              "order": "sent_at.desc", "limit": "1"})
                print(f"BOUNCE {rcpt}")
                if args.apply:
                    db.insert("email_events", {"message_id": sent[0]["id"] if sent else None, "type": "bounced",
                                               "dedupe_key": f"{dedupe}:{rcpt}", "note": "DSN aus Postfach",
                                               "payload": {"refs": refs[:5]}},
                              upsert_on="dedupe_key", ignore_duplicates=True)  # Meldung liegt 14 Tage im Postfach
                    suppress(db, rcpt, "bounce", "imap-dsn")
            if not recipients:
                print(f"Unklare Unzustellbar-Meldung, bitte ansehen: {msg.get('Subject')}")
            continue

        handle_reply(db, msg, dedupe, args.apply)
    imap.logout()
    if not args.apply:
        print("\nProbelauf. Mit --apply speichern und sperren.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
