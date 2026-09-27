"""Hat eine frisch eingetragene Firma schon eine Website? Seit 27.09.2026 nur noch GEPRÜFTE Treffer.

Früher reichte ein Wort des Firmennamens auf der Seite – das brachte falsche Treffer (fremde Firmen gleichen
Namens, Nummern aus Massachusetts oder Dubai). Jetzt entscheidet dieselbe Prüfung wie in scripts/enrich.py
(lib.websites.score_match: Registernummer, PLZ, voller Name, passende Vorwahl).
"""
from __future__ import annotations

import requests

from lib.websites import domain_candidates as _candidates


def candidates(name: str, country: str) -> list[str]:
    return _candidates(name, country)


def find_website(name: str, country: str, session: requests.Session | None = None,
                 company: dict | None = None) -> tuple[str | None, list[str]]:
    """(geprüfte Website oder None, geprüfte Domains). `company` mit Adresse/Registernummer macht die Prüfung schärfer."""
    from enrich import Fetcher, find_website as _find
    fetcher = Fetcher()
    if session is not None:
        fetcher.session = session
    found = _find({**(company or {}), "name": name, "country": country, "website": None}, fetcher)
    site = found["site"]
    return (site["url"] if site and site["verified"] else None), found["checked"]
