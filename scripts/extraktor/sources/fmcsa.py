"""FMCSA Company Census (US-Verkehrsministerium, offene Schnittstelle, kostenlos, ohne Schlüssel).

Neue Transport- und Fuhrparkfirmen mit USDOT-Nummer: Telefon, E-Mail, Firmenchef (company_officer_1), Adresse,
Fahrzeuge, Fahrer, Ladung. Datensatz: https://data.transportation.gov/resource/az4n-8mr2

Ein Abruf liefert bis zu 50.000 Zeilen (Socrata). Kein Scraping: amtliche Open-Data-Schnittstelle.
"""
from __future__ import annotations

import datetime as dt

import requests

from extraktor.model import candidate, title_case

URL = "https://data.transportation.gov/resource/az4n-8mr2.json"
PAGE = 50000

CARGO = {
    "crgo_genfreight": "general freight", "crgo_household": "household goods", "crgo_metalsheet": "metal",
    "crgo_motoveh": "motor vehicles", "crgo_drivetow": "driveaway/towaway", "crgo_logpole": "logs and poles",
    "crgo_bldgmat": "building materials", "crgo_mobilehome": "mobile homes", "crgo_machlrg": "large machinery",
    "crgo_produce": "fresh produce", "crgo_liqgas": "liquids/gases", "crgo_intermodal": "intermodal containers",
    "crgo_passengers": "passengers", "crgo_oilfield": "oilfield equipment", "crgo_livestock": "livestock",
    "crgo_grainfeed": "grain and feed", "crgo_coalcoke": "coal/coke", "crgo_meat": "meat", "crgo_garbage": "refuse",
    "crgo_usmail": "US mail", "crgo_chem": "chemicals", "crgo_drybulk": "dry bulk", "crgo_coldfood": "refrigerated food",
    "crgo_beverages": "beverages", "crgo_paperprod": "paper products", "crgo_utility": "utilities",
    "crgo_farmsupp": "farm supplies", "crgo_construct": "construction materials", "crgo_waterwell": "water well",
}
OPERATION = {"A": "interstate", "B": "intrastate (hazmat)", "C": "intrastate"}

SELECT = ",".join([
    "dot_number", "add_date", "status_code", "legal_name", "dba_name", "company_officer_1", "company_officer_2",
    "phone", "cell_phone", "email_address", "phy_street", "phy_city", "phy_state", "phy_zip", "phy_country",
    "power_units", "truck_units", "total_drivers", "total_cdl", "classdef", "carrier_operation", "hm_ind",
    "business_org_desc", "fleetsize", "docket1prefix", "docket1", "crgo_cargoothr_desc", "undeliv_phy",
    "carrier_mailing_und_date", *CARGO,
])
OOS_URL = "https://data.transportation.gov/resource/p2mt-9ige.json"


def fetch(since: dt.date, until: dt.date | None = None, session: requests.Session | None = None,
          limit: int | None = None) -> list[dict]:
    """Alle aktiven Neuzugänge ab `since` (add_date), neueste zuerst."""
    s = session or requests.Session()
    where = f"add_date>='{since:%Y%m%d}' AND status_code='A' AND phy_country='US'"
    if until:
        where += f" AND add_date<='{until:%Y%m%d}'"
    rows, offset = [], 0
    while True:
        n = min(PAGE, (limit - len(rows)) if limit else PAGE)
        r = s.get(URL, params={"$select": SELECT, "$where": where, "$order": "add_date DESC, dot_number",
                               "$limit": n, "$offset": offset}, timeout=120)
        r.raise_for_status()
        page = r.json()
        rows += page
        offset += len(page)
        if len(page) < n or (limit and len(rows) >= limit):
            return rows


def out_of_service(since: dt.date, session: requests.Session | None = None) -> dict[str, str]:
    """DOT-Nummern mit nicht aufgehobener Stilllegung (Out-of-Service-Order) seit `since` -> Grund.
    Viele neue Carrier werden in den ersten Wochen stillgelegt (z. B. 'New Entrant Revoked')."""
    s = session or requests.Session()
    out, offset = {}, 0
    while True:
        r = s.get(OOS_URL, params={"$select": "dot_number,oos_reason", "$where": f"oos_date>='{since}' AND rescind_date IS NULL",
                                   "$limit": PAGE, "$offset": offset}, timeout=120)
        r.raise_for_status()
        page = r.json()
        out.update({str(x.get("dot_number")): x.get("oos_reason") or "out of service" for x in page})
        offset += len(page)
        if len(page) < PAGE:
            return out


def contact_rows(since: dt.date, session: requests.Session | None = None) -> list[dict]:
    """Nur DOT, Telefon, Handy, E-Mail aller Neuzugänge seit `since` (auch inaktive) – um Sammel-Kontakte von
    Anmelde-Dienstleistern über einen langen Zeitraum zu zählen."""
    s = session or requests.Session()
    rows, offset = [], 0
    while True:
        r = s.get(URL, params={"$select": "dot_number,phone,cell_phone,email_address,phy_state",
                               "$where": f"add_date>='{since:%Y%m%d}'", "$limit": PAGE, "$offset": offset}, timeout=120)
        r.raise_for_status()
        page = r.json()
        rows += page
        offset += len(page)
        if len(page) < PAGE:
            return rows


def _int(v) -> int:
    try:
        return int(float(v or 0))
    except (TypeError, ValueError):
        return 0


def _date(v: str | None) -> dt.date | None:
    try:
        return dt.datetime.strptime((v or "")[:8], "%Y%m%d").date()
    except ValueError:
        return None


def to_candidate(r: dict) -> dict:
    """Zeile -> Kandidat. Anzeigename = DBA, wenn die Firma unter einem Personennamen läuft."""
    legal = (r.get("legal_name") or "").strip()
    dba = (r.get("dba_name") or "").strip()
    officer = (r.get("company_officer_1") or "").strip()
    name = dba if dba and (legal.upper() == officer.upper() or not any(
        w in legal.upper() for w in ("LLC", "INC", "CORP", "LTD", "CO", "COMPANY", "TRANSPORT", "TRUCK", "LOGIST"))) else legal
    cargo = [label for key, label in CARGO.items() if (r.get(key) or "").upper() == "X"]
    other = (r.get("crgo_cargoothr_desc") or "").strip()
    if other:
        cargo.append(other.lower())
    classdef = [c.strip() for c in (r.get("classdef") or "").split(";") if c.strip()]
    for_hire = any("FOR HIRE" in c and not c.startswith("EXEMPT") for c in classdef)
    facts = {
        "dot_number": r.get("dot_number"),
        "registered_on": _date(r.get("add_date")),
        "power_units": _int(r.get("power_units")),
        "trucks": _int(r.get("truck_units")),
        "drivers": _int(r.get("total_drivers")),
        "cdl_drivers": _int(r.get("total_cdl")),
        "operation": OPERATION.get(r.get("carrier_operation") or "", ""),
        "interstate": (r.get("carrier_operation") or "") == "A",
        "for_hire": for_hire,
        "private_fleet": any(c.startswith("PRIVATE") for c in classdef),
        "classes": classdef,
        "hazmat": (r.get("hm_ind") or "").upper() == "Y",
        "cargo": cargo[:4],
        "org": (r.get("business_org_desc") or "").title(),
        "mc_docket": f"{r.get('docket1prefix') or ''}{r.get('docket1') or ''}" or None,
        "undeliverable": (r.get("undeliv_phy") or "").upper() == "Y" or bool(r.get("carrier_mailing_und_date")),
        "cell_phone": r.get("cell_phone") or "",
    }
    return candidate(
        source="fmcsa", source_id=str(r.get("dot_number") or ""),
        source_url=f"https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot"
                   f"&query_param=USDOT&query_string={r.get('dot_number')}",
        source_date=facts["registered_on"], event_date=facts["registered_on"],
        name=title_case(name), legal_name=title_case(legal),
        street=title_case(r.get("phy_street") or ""), city=title_case(r.get("phy_city") or ""),
        state=(r.get("phy_state") or "").upper(), zip=(r.get("phy_zip") or "")[:5],
        phone=r.get("phone") or "", phone_alt=r.get("cell_phone") or "",
        email=(r.get("email_address") or "").strip().lower(),
        person_name=officer, person_role="Owner / company officer (USDOT registration)",
        facts=facts,
    )
