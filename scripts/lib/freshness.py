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
