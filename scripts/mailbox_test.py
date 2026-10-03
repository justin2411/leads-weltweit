#!/usr/bin/env python3
"""Prüft das eigene Postfach (Strato) von Anfang bis Ende. Gibt nie Passwörter aus.

1. DNS: MX/SPF/DMARC von nextgen-profit.de (scripts/dns_check.py)
2. SMTP: Anmeldung und Testmail vom Postfach an OWNER_EMAIL (Versand)
3. Empfang: Testmail von außen (Resend) an das Postfach, danach per IMAP suchen (prüft den MX-Eintrag)
4. DKIM: Testmail vom Postfach an sich selbst, per IMAP holen und die Signatur (d=Domain) mit dkimpy prüfen
5. Weitere Versand-Postfächer (SMTP_USER_2 …, lib/mailboxes.py): Anmeldung, Testmail an OWNER_EMAIL und
   DKIM-Prüfung über das eigene IMAP-Postfach (gleiche Zugangsdaten), Inhaber 03.10.2026: „teste jedes postfach“
"""
from __future__ import annotations

import imaplib
import os
import smtplib
import sys
import time
import uuid
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def smtp_send(to: str, subject: str, body: str, box: dict | None = None) -> None:
    box = box or {"host": os.environ["SMTP_HOST"], "port": int(os.environ.get("SMTP_PORT") or "465"),
                  "user": os.environ["SMTP_USER"], "password": os.environ["SMTP_PASSWORD"],
                  "from": os.environ["SMTP_FROM"]}
    port = int(box["port"])
    cls = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
    msg = EmailMessage()
    sender = box["from"]
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg["Message-ID"] = make_msgid(domain=sender.split("@")[-1].strip(">"))
    msg.set_content(body)
    with cls(box["host"], port, timeout=30) as s:
        if port != 465:
            s.starttls()
        s.login(box["user"], box["password"])
        s.send_message(msg)


def resend_send(to: str, subject: str, body: str) -> None:
    import requests
    r = requests.post("https://api.resend.com/emails", timeout=30,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                      json={"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "text": body})
    r.raise_for_status()


def imap_fetch(token: str, wait: int = 180, user: str | None = None, password: str | None = None) -> bytes | None:
    """Rohe Mail mit dem Token im Betreff aus dem Postfach holen (Posteingang oder Spam)."""
    end = time.time() + wait
    while time.time() < end:
        with imaplib.IMAP4_SSL(os.environ["IMAP_HOST"]) as m:
            m.login(user or os.environ["IMAP_USER"], password or os.environ["IMAP_PASSWORD"])
            for box in ("INBOX", "Spam", "Junk"):
                if m.select(box, readonly=True)[0] == "OK":
                    typ, data = m.search(None, "SUBJECT", token)
                    if typ == "OK" and data[0].split():
                        typ, msg = m.fetch(data[0].split()[-1], "(BODY.PEEK[])")
                        if typ == "OK":
                            return msg[0][1]
        time.sleep(15)
    return None


def dkim_check(raw: bytes, domain: str) -> bool:
    import re
    sigs = re.findall(rb"(?im)^DKIM-Signature:.*?(?=^\S)", raw, flags=re.S) if raw else []
    ds = [m.decode() for s in sigs for m in re.findall(rb"\bd=([^;\s]+)", s)]
    print(f"   DKIM-Signaturen: {ds or 'keine'}")
    if domain not in ds:
        return False
    try:
        import dkim
        ok = bool(dkim.verify(raw))
    except Exception as exc:  # noqa: BLE001
        print(f"   Prüfung nicht möglich: {type(exc).__name__}: {exc}")
        return False
    print(f"   Signatur gültig: {ok}")
    return ok


def imap_find(token: str, wait: int = 180) -> bool:
    end = time.time() + wait
    while time.time() < end:
        with imaplib.IMAP4_SSL(os.environ["IMAP_HOST"]) as m:
            m.login(os.environ["IMAP_USER"], os.environ["IMAP_PASSWORD"])
            for box in ("INBOX", "Spam", "Junk"):
                if m.select(box, readonly=True)[0] == "OK":
                    typ, data = m.search(None, "SUBJECT", token)
                    if typ == "OK" and data[0].split():
                        print(f"   gefunden in {box}")
                        return True
        time.sleep(15)
    return False


def main() -> int:
    ok = True
    import dns_check
    print("1. DNS")
    ok &= dns_check.main([os.environ.get("DOMAIN", "nextgen-profit.de")]) == 0

    token = uuid.uuid4().hex[:10]
    print("2. SMTP-Versand")
    if not os.environ.get("SMTP_HOST"):
        print("FEHLT  SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM als GitHub-Secrets")
        ok = False
    else:
        try:
            smtp_send(os.environ["OWNER_EMAIL"], f"[TEST] Postfach sendet {token}",
                      "Testmail aus dem eigenen Postfach. Bitte prüfen: Posteingang oder Spam?")
            print(f"OK     Anmeldung und Versand an den Inhaber (Betreff enthält {token})")
        except Exception as exc:  # noqa: BLE001
            print(f"FEHLER SMTP: {type(exc).__name__}: {exc}")
            ok = False

    print("3. Empfang an das Postfach")
    if not (os.environ.get("IMAP_HOST") and os.environ.get("RESEND_API_KEY") and os.environ.get("SMTP_FROM")):
        print("FEHLT  IMAP_HOST/IMAP_USER/IMAP_PASSWORD (und RESEND_API_KEY) für den Empfangstest")
        return 1
    try:
        addr = os.environ["SMTP_FROM"].split("<")[-1].strip("> ")
        resend_send(addr, f"[TEST] Empfang {token}", "Empfangstest: kommt Post von außen an?")
        found = imap_find(token)
        print(f"{'OK    ' if found else 'FEHLT '} Mail von außen an {addr} {'angekommen' if found else 'nach 3 Minuten nicht da'}")
        ok &= found
    except Exception as exc:  # noqa: BLE001
        print(f"FEHLER Empfang: {type(exc).__name__}: {exc}")
        ok = False

    print("4. DKIM")
    domain = os.environ.get("DOMAIN", "nextgen-profit.de")
    try:
        addr = os.environ["SMTP_FROM"].split("<")[-1].strip("> ")
        smtp_send(addr, f"[TEST] DKIM {token}", "DKIM-Test: Signatur der eigenen Domain?")
        good = dkim_check(imap_fetch(f"DKIM {token}"), domain)
        print(f"{'OK    ' if good else 'FEHLT '} DKIM-Signatur für {domain} {'gültig' if good else 'fehlt oder ungültig'}")
        ok &= good
    except Exception as exc:  # noqa: BLE001
        print(f"FEHLER DKIM: {type(exc).__name__}: {exc}")
        ok = False

    print("5. Weitere Versand-Postfächer")
    from lib.mailboxes import address, mailboxes
    extra = [b for b in mailboxes() if b["n"] > 1]
    if not extra:
        print("       keine (SMTP_USER_2 … nicht gesetzt)")
    for b in extra:
        addr = address(b["from"])
        try:
            smtp_send(os.environ["OWNER_EMAIL"], f"[TEST] Postfach {b['n']} sendet {token}",
                      f"Testmail aus Versand-Postfach {b['n']} ({addr}). Bitte prüfen: Posteingang oder Spam?", box=b)
            print(f"OK     Postfach {b['n']} ({addr}): Anmeldung und Versand an den Inhaber")
        except Exception as exc:  # noqa: BLE001
            print(f"FEHLER Postfach {b['n']} ({addr}) SMTP: {type(exc).__name__}: {exc}")
            ok = False
            continue
        try:
            smtp_send(addr, f"[TEST] DKIM {b['n']} {token}", "DKIM-Test für dieses Postfach", box=b)
            good = dkim_check(imap_fetch(f"DKIM {b['n']} {token}", user=b["user"], password=b["password"]), domain)
            print(f"{'OK    ' if good else 'FEHLT '} Postfach {b['n']}: DKIM für {domain} {'gültig' if good else 'fehlt oder ungültig'}")
            ok &= good
        except Exception as exc:  # noqa: BLE001
            print(f"FEHLER Postfach {b['n']} DKIM/IMAP: {type(exc).__name__}: {exc}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
