"""US/Connecticut: Neugründungen aus dem offenen Firmenregister des Secretary of the State (data.ct.gov, Socrata,
ohne Schlüssel). Quellen-Scout 01.10.2026.

  n7gp-d28j  Connecticut Business Registry – Business Master: Name, Rechtsform, Gründungsdatum, Geschäftsadresse,
             veröffentlichte Geschäfts-E-Mail (Pflichtangabe bei der Registrierung), NAICS-Branche
  ka36-64k6  Connecticut Business Registry – Principals: Inhaber/Officer mit Vor- und Nachname

Telefon steht nicht im Register; es kommt nur von der eigenen Website der Firma (Anreicherung).
Rund 7.700 Neugründungen je 44 Tage, alle mit E-Mail (davon ~60 % Freemail).
"""
from __future__ import annotations

import datetime as dt
import re

import requests

from extraktor.model import candidate, title_case

BUSINESS = "https://data.ct.gov/resource/n7gp-d28j.json"
PRINCIPALS = "https://data.ct.gov/resource/ka36-64k6.json"
SKIP_TYPE = {"Non-Stock", "Benefit Corporation (Non-Stock)"}  # gemeinnützig/Vereine
SKIP_NAME = re.compile(r"\b(holdings?|properties|property|realty|real estate|investments?|capital|trust|church|"
                       r"ministr(y|ies)|association|foundation)\b", re.I)


def fetch(since: dt.date, log=print, page: int = 50000) -> list[dict]:
    rows, offset = [], 0
    where = f"date_registration >= '{since.isoformat()}' AND status = 'Active'"
    while True:
        part = requests.get(BUSINESS, params={"$where": where, "$limit": page, "$offset": offset,
                                              "$order": "date_registration DESC"}, timeout=180).json()
        rows += part
        if len(part) < page:
            break
        offset += page
    rows = [r for r in rows if r.get("business_type") not in SKIP_TYPE and not SKIP_NAME.search(r.get("name") or "")
            and r.get("billingcountry", "United States") == "United States" and r.get("billingstreet")]
    log(f"CT: {len(rows)} aktive Neugründungen seit {since}")
    return rows


def principals(ids: list[str], log=print) -> dict[str, str]:
    """Erster Inhaber/Officer je Firma (Vor- und Nachname aus dem Register)."""
    out: dict[str, str] = {}
    for i in range(0, len(ids), 150):
        chunk = ",".join(f"'{x}'" for x in ids[i:i + 150])
        for r in requests.get(PRINCIPALS, params={"$where": f"business_id in ({chunk})", "$limit": 5000,
                                                  "$select": "business_id,firstname,lastname"}, timeout=120).json():
            first, last = (r.get("firstname") or "").strip(), (r.get("lastname") or "").strip()
            if first and last and r["business_id"] not in out:
                out[r["business_id"]] = title_case(f"{first} {last}")
    log(f"CT: Inhaber für {len(out)} von {len(ids)} Firmen")
    return out


def naics(r: dict) -> tuple[str, str]:
    raw = r.get("naics_code") or ""
    m = re.search(r"^(.*?)\s*\((\d{2,6})\)\s*$", raw)
    return (m.group(2), m.group(1).strip()) if m else ("", raw.strip())


def to_candidate(r: dict, person: str | None = None) -> dict:
    code, label = naics(r)
    reg = dt.date.fromisoformat(r["date_registration"][:10])
    street = ", ".join(x for x in (r.get("billingstreet"), r.get("billing_unit")) if x)
    return candidate(
        source="ct_registry", source_id=r["accountnumber"], country="US",
        source_url=f"https://service.ct.gov/business/s/onlinebusinesssearch?businessNameEn={requests.utils.quote(r['name'])}",
        source_date=reg, event_date=reg, name=r["name"].strip(), legal_name=r["name"].strip(),
        street=title_case(street) if street.isupper() else street, city=title_case(r.get("billingcity") or ""),
        state=(r.get("billingstate") or "")[:2].upper(), zip=(r.get("billingpostalcode") or "")[:5],
        email=(r.get("business_email_address") or "").strip().lower(),
        person_name=person or "", person_role="Owner/Principal (Connecticut business registry)" if person else "",
        facts={"account_number": r["accountnumber"], "registered_on": reg, "business_type": r.get("business_type"),
               "naics": code, "activity": label},
    )
