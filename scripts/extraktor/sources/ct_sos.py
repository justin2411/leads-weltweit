"""Connecticut Business Registry (Secretary of the State, Open Data, kostenlos, ohne Schlüssel).

Neu eingetragene Unternehmen mit Firmenname, Adresse, geschäftlicher E-Mail-Adresse und NAICS-Branche. Täglich
~170 Neueintragungen. Datensatz: https://data.ct.gov/resource/n7gp-d28j (Socrata, offene Lizenz). Kein Scraping.

Nicht enthalten: Telefon und Person – beides kommt nur von der eigenen Website (Anreicherung).
"""
from __future__ import annotations

import datetime as dt
import re

import requests

from extraktor.model import candidate, title_case

URL = "https://data.ct.gov/resource/n7gp-d28j.json"
PAGE = 50000
SELECT = ("id,name,business_type,status,accountnumber,billingstreet,billing_unit,billingcity,billingpostalcode,"
          "billingstate,business_email_address,date_registration,naics_code,citizenship")

NAICS = re.compile(r"^(?P<label>.*?)\s*\((?P<code>\d{6})\)\s*$")


def fetch(since: dt.date, session: requests.Session | None = None, limit: int | None = None) -> list[dict]:
    """Alle aktiven Neueintragungen ab `since`, neueste zuerst."""
    s = session or requests.Session()
    where = f"date_registration>='{since.isoformat()}' AND status='Active' AND billingstate='CT'"
    rows, offset = [], 0
    while True:
        n = min(PAGE, (limit - len(rows)) if limit else PAGE)
        r = s.get(URL, params={"$select": SELECT, "$where": where, "$order": "date_registration DESC, id",
                               "$limit": n, "$offset": offset}, timeout=120)
        r.raise_for_status()
        page = r.json()
        rows += page
        offset += len(page)
        if len(page) < n or (limit and len(rows) >= limit):
            return rows


def _date(v: str | None) -> dt.date | None:
    try:
        return dt.date.fromisoformat((v or "")[:10])
    except ValueError:
        return None


def to_candidate(r: dict) -> dict:
    m = NAICS.match((r.get("naics_code") or "").strip())
    label, code = (m.group("label").strip(), m.group("code")) if m else ("", "")
    street = " ".join(x for x in ((r.get("billingstreet") or "").strip(), (r.get("billing_unit") or "").strip()) if x)
    day = _date(r.get("date_registration"))
    org = {"LLC": "limited liability company", "Stock": "corporation", "LLP": "limited liability partnership",
           "B Corp": "benefit corporation"}.get(r.get("business_type") or "", "company")
    return candidate(
        source="ct_sos", source_id=str(r.get("accountnumber") or r.get("id") or ""),
        source_url="https://service.ct.gov/business/s/onlinebusinesssearch",
        source_date=day, event_date=day, name=title_case(r.get("name") or ""), legal_name=title_case(r.get("name") or ""),
        street=title_case(street), city=title_case(r.get("billingcity") or ""), state="CT",
        zip=(r.get("billingpostalcode") or "")[:5], email=(r.get("business_email_address") or "").strip().lower(),
        facts={"registered_on": day, "org": org, "naics_code": code, "naics_label": label,
               "account_number": r.get("accountnumber")},
    )
