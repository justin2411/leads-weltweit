"""Bounce-Gründe (04.10.2026): Status, Diagnose, Remote-MTA und Klasse je gescheitertem Empfänger.

Quellen: multipart/report (RFC 3464: Final-Recipient, Action, Status, Diagnostic-Code, Remote-MTA) und – wenn dort
Felder fehlen oder die Meldung nur Text ist – der lesbare Text der Unzustellbar-Meldung (Strato/Postfix, Exim,
Gmail, Outlook/Exchange).

Klassen (nur zur Auswertung, die Notbremse zählt weiter jede endgültige Meldung voll – nie lockern):
  hart       Adresse unbekannt, Domain fehlt          -> Adresse/Quelle schlecht
  weich      Postfach voll, Timeout, abgelaufen        -> Empfänger-Server vorübergehend
  richtlinie Spam, Blockliste, Absender abgelehnt      -> Ruf/Absender-Postfach
  unbekannt  kein Code, kein erkennbarer Grund

Gleiche Regeln in SQL: signalwerk.bounce_klasse (Migration 20261005010000_signalwerk_bounce_klassen.sql).
"""
from __future__ import annotations

import re
from email.message import EmailMessage

KLASSEN = ("hart", "weich", "richtlinie", "unbekannt")

STATUS = re.compile(r"(?<![\d.])([245]\.\d{1,3}\.\d{1,3})(?![\d.])")
ADDR = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")

DOMAIN_FEHLT = re.compile(r"host or domain name not found|name service error|domain (name )?not found|nxdomain|"
                          r"no mx (record|host)|unrouteable (mail )?domain|domain does not exist", re.I)
RICHTLINIE = re.compile(r"spam|block ?list|black ?list|blocked|spamhaus|barracuda|spamcop|reputation|policy|dnsbl|"
                        r"\brbl\b|not authori[sz]ed|sender (address )?rejected|dmarc|\bspf\b|dkim|"
                        r"message rejected|content rejected|denied by", re.I)
HART = re.compile(r"user unknown|unknown user|no such (user|recipient|mailbox)|does not exist|doesn'?t exist|"
                  r"address (couldn'?t be |could not be |not )found|recipient not found|recipientnotfound|"
                  r"unknown recipient|invalid (recipient|mailbox|address)|mailbox unavailable|"
                  r"mailbox not found|no mailbox|account (has been )?disabled|recipient address rejected|"
                  r"address rejected|not our customer|unrouteable", re.I)
WEICH = re.compile(r"mailbox (is )?full|quota|insufficient (system )?storage|timeout|timed out|try again|"
                   r"temporar|expired|deferred|connection (refused|reset|lost)|failed to establish|"
                   r"unable to deliver in|too many (connections|messages)|rate limit|greylist", re.I)

HARD_STATUS = re.compile(r"^5\.(1\.\d+|4\.1|4\.4|4\.310|2\.1)$")
WEICH_STATUS = re.compile(r"^(4\.\d+\.\d+|5\.2\.2|5\.4\.7|5\.3\.\d+)$")


def status_from(text: str) -> str:
    m = STATUS.search(text or "")
    return m.group(1) if m else ""


def klasse(status: str | None, diagnostic: str | None) -> str:
    """Klasse aus erweitertem Status (z. B. 5.1.1) und Diagnose-Text. Reihenfolge wie signalwerk.bounce_klasse."""
    diag = diagnostic or ""
    st = (status or "").strip() or status_from(diag)
    if not st and not diag.strip():
        return "unbekannt"
    if DOMAIN_FEHLT.search(diag):
        return "hart"
    if HARD_STATUS.match(st):
        return "hart"
    if re.match(r"^[45]\.7\.", st):
        return "richtlinie"
    if WEICH_STATUS.match(st):
        return "richtlinie" if RICHTLINIE.search(diag) else "weich"
    if RICHTLINIE.search(diag):
        return "richtlinie"
    if HART.search(diag):
        return "hart"
    if WEICH.search(diag):
        return "weich"
    return "unbekannt"


def _clean(text: str, n: int = 200) -> str:
    """Diagnose ohne Mailadressen (Datensparsamkeit), eine Zeile, gekürzt."""
    text = re.sub(r"^.{0,200}?\bsaid:\s*", "", " ".join((text or "").split()))  # Postfix: „<adr>: host … said:“
    return ADDR.sub("<adr>", text)[:n]


def _text_parts(msg: EmailMessage) -> str:
    """Lesbarer Text der Meldung (text/plain, sonst text/html ohne Tags) ohne die zurückgeschickte Originalmail."""
    out: list[str] = []
    for part in msg.walk():
        ctype = part.get_content_type()
        if ctype in ("message/rfc822", "text/rfc822-headers"):
            break
        if ctype not in ("text/plain", "text/html") or part.get_content_disposition() == "attachment":
            continue
        try:
            body = part.get_content()
        except (LookupError, KeyError, AttributeError):
            continue
        if ctype == "text/html":
            body = re.sub(r"<[^>]+>", " ", body)
        out.append(str(body))
    return "\n".join(out)


def _dsn_chunks(msg: EmailMessage) -> list[str]:
    chunks: list[str] = []
    for part in msg.walk():
        if part.get_content_type() != "message/delivery-status":
            continue
        payload = part.get_payload()
        blocks = payload if isinstance(payload, list) else [part]
        for block in blocks:
            raw = block.as_string() if hasattr(block, "as_string") else str(block)
            chunks += re.split(r"\n\s*\n", raw)
    return chunks


def _remote_mta(text: str) -> str:
    for pat in (r"host\s+([A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*\[", r"Remote[- ]?(?:Server|MTA)\s*(?:returned)?[:=]?\s*(?:dns;\s*)?"
                r"([A-Za-z0-9.-]+\.[A-Za-z]{2,})", r"(?:mail server|server)\s+([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\.[A-Za-z]{2,})"):
        m = re.search(pat, text or "", re.I)
        if m and "@" not in m.group(1):
            return m.group(1).lower()[:120]
    return ""


def _around(text: str, rcpt: str) -> str:
    """Textstück zum Empfänger: ab seiner ersten Nennung bis zur nächsten Leerzeile+Adresse, sonst ganzer Text."""
    low = text.lower()
    i = low.find(rcpt)
    if i < 0:
        return text
    return text[i:i + 1200]


def _diag_line(text: str) -> str:
    """Zeile mit SMTP-Antwort (5xx/4xx) oder typischer Begründung, samt eingerückter Folgezeilen."""
    lines = text.splitlines()

    def with_cont(i: int) -> str:
        out = [lines[i]]
        for nxt in lines[i + 1:i + 4]:
            if not nxt[:1].isspace() or not nxt.strip():
                break
            out.append(nxt)
        return " ".join(out)
    for i, line in enumerate(lines):
        if re.search(r"\b[45]\d\d[ -][245]\.\d", line) or re.search(r"\b[45]\d\d\b.*(rejected|unknown|not|denied|full|"
                                                                     r"timeout|blocked|spam)", line, re.I):
            return with_cont(i)
    for pat in (DOMAIN_FEHLT, HART, RICHTLINIE, WEICH):
        for i, line in enumerate(lines):
            if pat.search(line):
                return with_cont(i)
    return ""


def from_dsn(msg: EmailMessage) -> dict[str, dict]:
    """Endgültig gescheiterte Empfänger (Action: failed) aus multipart/report mit Status, Diagnose, Remote-MTA."""
    out: dict[str, dict] = {}
    if msg.get_content_type() != "multipart/report":
        return out
    reporting = ""
    for chunk in _dsn_chunks(msg):
        rep = re.search(r"^Reporting-MTA:\s*[^;]*;\s*(\S+)", chunk, re.I | re.M)
        if rep:
            reporting = rep.group(1).lower()
        rcpt = re.search(r"^Final-Recipient:\s*[^;]+;\s*(\S+)", chunk, re.I | re.M)
        action = re.search(r"^Action:\s*(\S+)", chunk, re.I | re.M)
        if not (rcpt and action and action.group(1).lower() == "failed"):
            continue
        status = re.search(r"^Status:\s*([245]\.\d{1,3}\.\d{1,3})", chunk, re.I | re.M)
        diag = re.search(r"^Diagnostic-Code:\s*[^;]*;\s*(.+(?:\n[ \t].+)*)", chunk, re.I | re.M)
        remote = re.search(r"^Remote-MTA:\s*[^;]*;\s*(\S+)", chunk, re.I | re.M)
        out[rcpt.group(1).strip("<>").lower()] = {
            "status": status.group(1) if status else "",
            "diagnostic": " ".join((diag.group(1) if diag else "").split()),
            "remote_mta": (remote.group(1).strip("[]").lower() if remote else ""),
            "reporting_mta": reporting,
        }
    return out


FAILED_TEXT = re.compile(r"could not be delivered|couldn'?t be delivered|wasn'?t delivered|was not delivered|"
                         r"delivery (has )?failed|failed permanently|permanent (error|failure|fatal)|undeliverable|"
                         r"unzustellbar|returned to sender|delivery status notification \(failure\)|"
                         r"address(es)? failed|non remis|n'a pas pu être remis|\b5\d\d[ -]5\.\d", re.I)
DELAY_TEXT = re.compile(r"\bdelay(ed)?\b|will (be )?retr|still trying|has not yet been delivered|"
                        r"temporarily deferred|warning: message", re.I)


def from_text(msg: EmailMessage, own: set[str] | None = None) -> dict[str, dict]:
    """Empfänger aus einer Text-Unzustellbar-Meldung (ohne verwertbaren delivery-status). Kandidaten:
    X-Failed-Recipients und alle Adressen im lesbaren Text außer eigenen/Mailer-Adressen. Der Aufrufer zählt nur
    Adressen, an die wir wirklich gesendet haben. Verzögerungs-Hinweise ohne 5.x.x zählen nie."""
    text = _text_parts(msg)
    subject = msg.get("Subject") or ""
    hay = f"{subject}\n{text}"
    has_perm = bool(re.search(r"(?<![\d.])5\.\d{1,3}\.\d{1,3}", text)) or bool(re.search(r"\b5\d\d\b", text))
    if not FAILED_TEXT.search(hay) or (DELAY_TEXT.search(subject + "\n" + text[:600]) and not has_perm):
        return {}
    own = {d.lower() for d in (own or set())}
    cands: list[str] = []
    for h in msg.get_all("X-Failed-Recipients") or []:
        cands += [a.lower() for a in ADDR.findall(str(h))]
    for a in ADDR.findall(text):
        a = a.lower().strip(".")
        dom = a.rsplit("@", 1)[1]
        if dom in own or a.split("@")[0] in ("mailer-daemon", "postmaster") or a in cands:
            continue
        cands.append(a)
    out: dict[str, dict] = {}
    for rcpt in cands:
        part = _around(text, rcpt)
        line = _diag_line(part) or _diag_line(text)
        out[rcpt] = {"status": status_from(line) or status_from(part[:600]),
                     "diagnostic": " ".join(line.split()), "remote_mta": _remote_mta(part) or _remote_mta(text),
                     "reporting_mta": ""}
    return out


def details(msg: EmailMessage, own: set[str] | None = None) -> dict[str, dict]:
    """Je gescheitertem Empfänger: type (immer Permanent – Notbremse zählt voll, nie lockern), status, diagnostic
    (ohne Adressen), remote_mta, klasse, quelle (dsn/text). DSN-Felder zuerst, fehlende aus dem lesbaren Text."""
    dsn = from_dsn(msg)
    text = from_text(msg, own) if (not dsn or any(not v["status"] or not v["diagnostic"] for v in dsn.values())) \
        else {}
    plain = _text_parts(msg) if dsn else ""
    out: dict[str, dict] = {}
    for rcpt, d in (dsn or text).items():
        t = text.get(rcpt) or {}
        if dsn and not t and plain:
            line = _diag_line(_around(plain, rcpt))
            t = {"status": status_from(line), "diagnostic": " ".join(line.split()), "remote_mta": _remote_mta(plain)}
        status = d.get("status") or t.get("status") or ""
        diag = d.get("diagnostic") or t.get("diagnostic") or ""
        out[rcpt] = {"type": "Permanent", "status": status, "diagnostic": _clean(diag),
                     "remote_mta": d.get("remote_mta") or t.get("remote_mta") or "",
                     "klasse": klasse(status, diag), "quelle": "dsn" if dsn else "text"}
    return out
