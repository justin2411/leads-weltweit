"""Frischeprüfung der Empfängeradresse direkt vor dem Versand (Inhaber 03.10.2026: Bounce-Quote senken).

Von den ersten 140 Kaltmails kamen 7 als unzustellbar zurück, fast alle info@/contact@ kleiner Firmen, deren Domain
Mails annimmt, das Postfach aber nicht mehr existiert. Deshalb geht eine Kaltmail nur noch raus, wenn
1. die Adresse auf der eigenen Website der Firma steht (nicht nur in einem Fremddatensatz wie Overture) und
2. dieser Fund höchstens FRESH_DAYS Tage alt ist – sonst wird die Website einmal neu abgerufen (robots.txt,
   1 Abruf/s je Domain über enrich.Fetcher, höchstens einmal je Versandlauf).
"""
from __future__ import annotations

import datetime as dt

FRESH_DAYS = 30
FOREIGN_SOURCES = ("https://overturemaps.org",)  # Adresse nur aus Fremddaten, nicht von der Website bestätigt


def needs_rescan(prospect: dict, now: dt.datetime | None = None) -> bool:
    """Muss die Website vor dem Versand neu geprüft werden?"""
    now = now or dt.datetime.now(dt.timezone.utc)
    src = (prospect.get("source_url") or "").lower()
    if not src or src.startswith(FOREIGN_SOURCES):
        return True
    checked = prospect.get("checked_at")
    if not checked:
        return True
    when = dt.datetime.fromisoformat(str(checked).replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    return now - when > dt.timedelta(days=FRESH_DAYS)


def confirm_on_website(email: str, website: str, fetcher, scan=None) -> tuple[bool, str | None]:
    """Steht `email` heute auf der Website? Gibt (gefunden, Fundseite) zurück; Website nicht erreichbar = nein."""
    if not website:
        return False, None
    if scan is None:
        from kundenwerk import site_scan as scan
    res = scan(website, fetcher)
    url = (res.get("emails") or {}).get(email.lower().strip())
    return bool(url), url


M365_FRESH_DAYS = 7  # Microsoft-365-Empfänger: Fund auf der eigenen Website höchstens 7 Tage alt (Bounce-Analyse 05.10.2026)
M365_REASON = "Zurückgestellt: Microsoft-365-Empfänger ohne frischen Beleg auf eigener Website (5.4.1)"
SYNTAX_REASON = "Zurückgestellt: Adresse verletzt RFC-Syntax (5.1.3)"
HOLD_PREFIX = "Zurückgestellt:"


def host_of(url: str) -> str:
    from urllib.parse import urlparse
    u = url or ""
    h = (urlparse(u if "//" in u else f"//{u}").hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def own_domain_address(email: str, prospect: dict) -> bool:
    """Adresse liegt auf der Domain der Firma (Website oder prospects.domain), nicht auf Freemail/fremder Domain."""
    dom = (email or "").rsplit("@", 1)[-1].strip().lower()
    own = {host_of(prospect.get("website") or ""), host_of(prospect.get("domain") or "")} - {""}
    return bool(dom) and dom in own


def m365_proof_ok(email: str, prospect: dict, now: dt.datetime | None = None) -> bool:
    """Strengere Regel für Microsoft-365-Empfänger: Adresse auf der eigenen Firmendomain, wörtlich auf der eigenen
    Website gefunden (Fundseite auf der Firmendomain, nicht Overture/Fremddaten) und Fund höchstens 7 Tage alt."""
    if not own_domain_address(email, prospect):
        return False
    src = prospect.get("source_url") or ""
    if not src or src.lower().startswith(FOREIGN_SOURCES) or host_of(src) != email.rsplit("@", 1)[-1].strip().lower():
        return False
    checked = prospect.get("checked_at")
    if not checked:
        return False
    try:
        when = dt.datetime.fromisoformat(str(checked).replace("Z", "+00:00"))
    except ValueError:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    return (now or dt.datetime.now(dt.timezone.utc)) - when <= dt.timedelta(days=M365_FRESH_DAYS)


def keep_holds(old: list[str] | None, new: list[str] | None) -> list[str]:
    """Neue Prüffehler; Zurückstell-Gründe bleiben erhalten (Neuschreiben eines Entwurfs löscht sie nicht)."""
    new = list(new or [])
    return new + [x for x in (old or []) if str(x).startswith(HOLD_PREFIX) and x not in new]
