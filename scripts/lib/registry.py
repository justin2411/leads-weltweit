"""Vollständige Firmenadresse aus amtlichen, kostenlosen Registern (nur Firmendaten).

  UK: Companies House API, Registered office address (COMPANIES_HOUSE_API_KEY, kostenlos)
  FR: recherche-entreprises.api.gouv.fr (ohne Schlüssel), Adresse des Sitzes
Websites stehen in keinem dieser Register (geprüft 27.09.2026) – die kommen aus lib.websites.
"""
from __future__ import annotations

import requests


def uk_address(number: str, key: str, session: requests.Session) -> str | None:
    r = session.get(f"https://api.company-information.service.gov.uk/company/{number}", auth=(key, ""), timeout=30)
    if r.status_code != 200:
        return None
    a = r.json().get("registered_office_address") or {}
    parts = [a.get("premises"), a.get("address_line_1"), a.get("address_line_2"), a.get("locality"), a.get("postal_code")]
    text = ", ".join(p.strip() for p in parts if p and p.strip())
    return text or None


def fr_company(siren: str, session: requests.Session) -> dict | None:
    """{'address': …, 'name': …} laut Registre national / SIRENE."""
    r = session.get("https://recherche-entreprises.api.gouv.fr/search", params={"q": siren, "per_page": 1}, timeout=30)
    if r.status_code != 200:
        return None
    res = r.json().get("results") or []
    if not res or res[0].get("siren") != siren:
        return None
    siege = res[0].get("siege") or {}
    return {"address": (siege.get("adresse") or "").strip() or None, "name": res[0].get("nom_complet")}


def is_postcode_only(address: str | None) -> bool:
    """Adresse besteht nur aus einer Postleitzahl (so kommen UK-Abzug und BODACC bei uns an)."""
    a = (address or "").strip()
    return bool(a) and len(a) <= 9 and not any(ch == "," for ch in a) and sum(c.isdigit() for c in a) >= 2
