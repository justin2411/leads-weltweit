"""Ansprechperson (Name und Rolle) aus öffentlichen Registern – Inhaber/Geschäftsführer, keine anderen Mitarbeitenden.

Inhaber 27.09.2026: Ansprechpersonen dürfen in den Leads stehen (CLAUDE.md 8a). Nur Name und Rolle,
keine privaten Kontaktdaten.
  UK: Companies House, Officers der Firma (COMPANIES_HOUSE_API_KEY, kostenlos)
  FR: recherche-entreprises.api.gouv.fr (amtliches Verzeichnis, kostenlos, ohne Schlüssel)
  US/NY: NY Department of State (data.ny.gov), Empfänger für Zustellungen, nur wenn es eine Person ist
"""
from __future__ import annotations

import re

import requests

ORG = re.compile(r"\b(inc|llc|l\.l\.c|corp|corporation|company|co|ltd|limited|llp|lp|pllc|pc|p\.c|group|services?|"
                 r"agents?|registered|associates|partners|law|legal|firm|holdings?|trust|bank|the)\b\.?", re.I)


def _title(s: str) -> str:
    return " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in s.split())


def uk_officer(number: str, key: str, session: requests.Session) -> dict | None:
    """Aktiver Director (sonst andere aktive natürliche Person) laut Companies House."""
    r = session.get(f"https://api.company-information.service.gov.uk/company/{number}/officers",
                    params={"items_per_page": 20}, auth=(key, ""), timeout=30)
    if r.status_code != 200:
        return None
    items = [o for o in r.json().get("items", []) if not o.get("resigned_on") and "corporate" not in (o.get("officer_role") or "")]
    items.sort(key=lambda o: 0 if o.get("officer_role") == "director" else 1)
    if not items:
        return None
    name = items[0].get("name", "")
    if "," in name:
        last, first = name.split(",", 1)
        name = f"{first.strip()} {last.strip()}"
    role = {"director": "Director", "llp-designated-member": "Designated member", "llp-member": "Member"}.get(
        items[0].get("officer_role"), "Director")
    return {"name": _title(name), "role": role, "source": "Companies House"}


def fr_dirigeant(siren: str, session: requests.Session) -> dict | None:
    r = session.get("https://recherche-entreprises.api.gouv.fr/search", params={"q": siren, "per_page": 1}, timeout=30)
    if r.status_code != 200:
        return None
    res = r.json().get("results") or []
    if not res or res[0].get("siren") != siren:
        return None
    for d in res[0].get("dirigeants") or []:
        if d.get("type_dirigeant") == "personne physique" and d.get("nom"):
            first = (d.get("prenoms") or "").split()[0] if d.get("prenoms") else ""
            return {"name": _title(f"{first} {d['nom']}".strip()), "role": d.get("qualite") or "Dirigeant",
                    "source": "Registre national des entreprises"}
    return None


def ny_contact(dos_id: str, company: str, session: requests.Session) -> dict | None:
    """Zustellungsempfänger laut NY DOS – nur, wenn es erkennbar eine Person ist (kein Firmen- oder Agentenname)."""
    r = session.get("https://data.ny.gov/resource/n9v6-gdp6.json", params={"dos_id": dos_id}, timeout=30)
    if r.status_code != 200 or not r.json():
        return None
    name = (r.json()[0].get("dos_process_name") or "").strip()
    words = name.replace(",", " ").split()
    if not (2 <= len(words) <= 4) or ORG.search(name) or name.upper() == (company or "").upper() or any(ch.isdigit() for ch in name):
        return None
    return {"name": _title(name), "role": "Registered contact", "source": "NY Department of State"}
