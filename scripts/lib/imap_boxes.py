"""Alle Postfächer lesen (Nachtschicht 04.10.2026).

Antworten kommen über REPLY_TO ins Hauptpostfach. Unzustellbar-Meldungen, Abwesenheitsnotizen und manche Antworten
gehen aber an den Absender, also an Versand-Postfach 2, 3 … Bisher las nur das Hauptpostfach (IMAP_USER): Rückläufer
der anderen Postfächer sah die Notbremse nicht, Abmeldungen dort blieben liegen.

Postfächer: das Hauptpostfach (IMAP_USER/IMAP_PASSWORD) und jedes Versand-Postfach aus lib/mailboxes.py
(SMTP_USER[_n]/SMTP_PASSWORD[_n], gleiche Anmeldung wie beim Versand). Server IMAP_HOST_n, sonst IMAP_HOST (gleicher
Anbieter). Jede Adresse nur einmal.
Ordner: Posteingang und, falls vorhanden, Spam/Junk – dort aber nur Unzustellbar-Meldungen und Antworten auf unsere
eigenen Mails (Message-ID unserer Domain), nie sonstiger Spam.
Nur lesend (readonly, BODY.PEEK): nichts wird verschoben, gelesen markiert oder gelöscht.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
from email import policy
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Callable, Iterator

from lib.mailboxes import mailboxes

INBOX = "INBOX"
SPAM_FOLDERS = ("Spam", "Junk")
_MSGID = re.compile(r"<[^<>\s]+@([^<>\s]+)>")


def accounts(env=None) -> list[dict]:
    """Zu lesende Postfächer: n=0 Hauptpostfach, sonst die Nummer des Versand-Postfachs."""
    env = os.environ if env is None else env
    out: list[dict] = []
    seen: set[str] = set()

    def add(n: int, user: str | None, pw: str | None, host: str | None) -> None:
        key = parseaddr(user or "")[1].lower() or (user or "").strip().lower()
        if not (key and pw and host) or key in seen:
            return
        seen.add(key)
        out.append({"n": n, "user": (user or "").strip(), "password": pw, "host": host})

    add(0, env.get("IMAP_USER"), env.get("IMAP_PASSWORD"), env.get("IMAP_HOST"))
    for b in mailboxes(env):
        add(b["n"], b["user"], b["password"], env.get(f"IMAP_HOST_{b['n']}") or env.get("IMAP_HOST"))
    return out


def own_domains(env=None) -> set[str]:
    """Domains unserer Absender (MAIL_FROM, REPLY_TO, SMTP_FROM[_n]) – unsere Message-IDs enden auf diese Domain."""
    env = os.environ if env is None else env
    out = set()
    for var in ["MAIL_FROM", "REPLY_TO", "SMTP_FROM", "SMTP_USER"] + [f"SMTP_FROM_{n}" for n in range(2, 11)] \
            + [f"SMTP_USER_{n}" for n in range(2, 11)]:
        addr = parseaddr(env.get(var) or "")[1].lower()
        if "@" in addr:
            out.add(addr.rsplit("@", 1)[1])
    return out


def own_addresses(env=None) -> set[str]:
    """Adressen aller gelesenen Postfächer (Mails zwischen eigenen Postfächern sind keine Anfragen)."""
    return {parseaddr(a["user"])[1].lower() for a in accounts(env) if "@" in a["user"]}


def is_dsn(msg: EmailMessage) -> bool:
    """Unzustellbar-Meldung (wie inbox.is_bounce, hier ohne Abhängigkeit vom Skript)."""
    sender = (msg.get("From") or "").lower()
    return msg.get_content_type() == "multipart/report" or "mailer-daemon" in sender or "postmaster" in sender


def refers_to_us(msg: EmailMessage, domains: set[str]) -> bool:
    """Bezieht sich die Mail auf eine unserer Mails (In-Reply-To/References mit unserer Domain)?"""
    refs = f"{msg.get('In-Reply-To') or ''} {msg.get('References') or ''}"
    return any(d.lower() in domains for d in _MSGID.findall(refs))


def spam_relevant(msg: EmailMessage, domains: set[str]) -> bool:
    """Aus Spam/Junk nur Unzustellbar-Meldungen und Antworten auf unsere Mails – sonstiger Spam bleibt unberührt."""
    return is_dsn(msg) or refers_to_us(msg, domains)


def fallback_id(acct: dict, folder: str, num: str) -> str:
    """Ersatz-ID für Mails ohne Message-ID. Hauptpostfach/Posteingang wie bisher imap-<nr> (keine doppelte
    Bearbeitung alter Mails), sonst mit Postfach und Ordner, damit sich Nummern verschiedener Ordner nie treffen."""
    if acct["n"] == 0 and folder == INBOX:
        return f"imap-{num}"
    return f"imap-{acct['n']}-{folder.lower()}-{num}"


def label(acct: dict) -> str:
    return "Hauptpostfach" if acct["n"] == 0 else f"Postfach {acct['n']}"


def messages(acct: dict, since: str, domains: set[str] | None = None,
             connect: Callable[[str], imaplib.IMAP4] = imaplib.IMAP4_SSL) -> Iterator[tuple[str, str, EmailMessage]]:
    """(Ordner, Nummer, Mail) aller Mails seit `since` (IMAP-Datum, z. B. 01-Oct-2026) aus Posteingang und Spam/Junk.
    Fehlt ein Ordner, wird er übersprungen. Anmeldefehler werfen (der Aufrufer liest die anderen Postfächer weiter)."""
    domains = own_domains() if domains is None else domains
    imap = connect(acct["host"])
    try:
        imap.login(acct["user"], acct["password"])
        for folder in (INBOX, *SPAM_FOLDERS):
            try:
                typ, _ = imap.select(folder, readonly=True)
            except imaplib.IMAP4.error:
                continue
            if typ != "OK":
                continue
            typ, data = imap.search(None, "SINCE", since)
            if typ != "OK" or not data or not data[0]:
                continue
            for raw in data[0].split():
                num = raw.decode()
                typ, fetched = imap.fetch(raw, "(BODY.PEEK[])")
                if typ != "OK" or not fetched or not isinstance(fetched[0], tuple):
                    continue
                msg = email.message_from_bytes(fetched[0][1], policy=policy.default)
                if folder != INBOX and not spam_relevant(msg, domains):
                    continue
                yield folder, num, msg
    finally:
        try:
            imap.logout()
        except Exception:  # noqa: BLE001 - Verbindung schon weg
            pass


def read_all(since: str, handle: Callable[[dict, str, str, EmailMessage], None], env=None,
             connect: Callable[[str], imaplib.IMAP4] = imaplib.IMAP4_SSL) -> dict:
    """Alle Postfächer nacheinander lesen und jede Mail an `handle(acct, folder, num, msg)` geben.
    Ein Postfach, das sich nicht anmelden lässt, hält die anderen nicht auf, eine Mail, deren Bearbeitung scheitert,
    nicht die übrigen. Rückgabe: Mails je Postfach, Postfach-Fehler (errors) und gescheiterte Mails (failed).
    Ohne Hauptpostfach (IMAP_HOST/IMAP_USER fehlen) wird nichts gelesen."""
    env = os.environ if env is None else env
    accts = accounts(env)
    stats: dict = {"boxes": {}, "errors": {}, "failed": 0}
    if not any(a["n"] == 0 for a in accts):
        print("Hauptpostfach (IMAP_HOST/IMAP_USER/IMAP_PASSWORD) nicht eingerichtet – nichts gelesen")
        return stats
    domains = own_domains(env)
    for acct in accts:
        name = label(acct)
        count = 0
        try:
            for folder, num, msg in messages(acct, since, domains, connect):
                count += 1
                try:
                    handle(acct, folder, num, msg)
                except Exception as exc:  # noqa: BLE001 - eine Mail darf den Lauf nicht beenden
                    stats["failed"] += 1
                    print(f"FEHLER {name}/{folder} {(msg.get('Message-ID') or num).strip()}: "
                          f"{exc.__class__.__name__}: {str(exc)[:300]}")
        except (imaplib.IMAP4.error, OSError) as exc:
            stats["errors"][name] = f"{exc.__class__.__name__}: {str(exc)[:160]}"
            print(f"FEHLER {name}: {stats['errors'][name]} – die anderen Postfächer werden weiter gelesen")
        stats["boxes"][name] = count
    print("Postfächer gelesen: " + ", ".join(f"{k} {v}" for k, v in stats["boxes"].items()))
    return stats
