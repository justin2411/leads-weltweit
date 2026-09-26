"""Zuordnung Käufer-Region (aus osm.py) -> Lead-Region (Postleitbereich, County, Département).

Ein Käufer bekommt Probe-Leads nur aus seiner eigenen Region (CLAUDE.md: Leads aus dem eigenen Markt).
"""
from __future__ import annotations

import re

UK = {"Greater Manchester": {"M", "SK", "BL", "OL", "WN", "WA"}, "West Yorkshire": {"LS", "BD", "HX", "HD", "WF"},
      "West Midlands": {"B", "WS", "WV", "DY"}, "Merseyside": {"L", "CH"},
      "London": {"E", "EC", "N", "NW", "SE", "SW", "W", "WC"}, "Bristol": {"BS"}, "Glasgow": {"G"},
      "Edinburgh": {"EH"}, "Cardiff": {"CF"}, "Newcastle": {"NE"}, "Sheffield": {"S"}, "Nottingham": {"NG"},
      "Leicester": {"LE"}, "Southampton": {"SO"},
      "Brighton": {"BN"},
      "Reading": {"RG"},
      "Oxford": {"OX"},
      "Cambridge": {"CB"},
      "Milton Keynes": {"MK"},
      "Hull": {"HU"},
      "Derby": {"DE"},
      "Stoke-on-Trent": {"ST"},
      "Plymouth": {"PL"},
      "Exeter": {"EX"},
      "Norwich": {"NR"},
      "Bournemouth": {"BH"},
      "Portsmouth": {"PO"},
      "Aberdeen": {"AB"},
      "Belfast": {"BT"},
      "York": {"YO"},
      "Preston": {"PR"},
      "Northampton": {"NN"},
      "Luton": {"LU"},
      "Swansea": {"SA"},
      "Middlesbrough": {"TS"},
      "Sunderland": {"SR"}}
# Fallback ohne Postleitzahl (z. B. Arbeitgeber von Karriereseiten): Ortsnamen je Region
UK_TOWNS = {"Greater Manchester": ["manchester", "salford", "stockport", "bolton", "bury", "oldham", "rochdale",
                                   "trafford", "altrincham", "sale", "wigan", "tameside", "ashton", "hyde", "cheadle"],
            "West Yorkshire": ["leeds", "bradford", "halifax", "huddersfield", "wakefield"],
            "West Midlands": ["birmingham", "wolverhampton", "walsall", "dudley", "solihull", "coventry"],
            "Merseyside": ["liverpool", "birkenhead", "st helens", "southport"], "London": ["london"],
            "Bristol": ["bristol"], "Glasgow": ["glasgow"], "Edinburgh": ["edinburgh"], "Cardiff": ["cardiff"],
            "Newcastle": ["newcastle", "gateshead"], "Sheffield": ["sheffield"], "Nottingham": ["nottingham"],
            "Leicester": ["leicester"], "Southampton": ["southampton"],
            "Brighton": ["brighton", "hove"],
            "Reading": ["reading"],
            "Oxford": ["oxford"],
            "Cambridge": ["cambridge"],
            "Milton Keynes": ["milton keynes"],
            "Hull": ["hull"],
            "Derby": ["derby"],
            "Stoke-on-Trent": ["stoke"],
            "Plymouth": ["plymouth"],
            "Exeter": ["exeter"],
            "Norwich": ["norwich"],
            "Bournemouth": ["bournemouth", "poole"],
            "Portsmouth": ["portsmouth"],
            "Aberdeen": ["aberdeen"],
            "Belfast": ["belfast"],
            "York": ["york"],
            "Preston": ["preston"],
            "Northampton": ["northampton"],
            "Luton": ["luton"],
            "Swansea": ["swansea"],
            "Middlesbrough": ["middlesbrough"],
            "Sunderland": ["sunderland"]}
US = {"New York City": {"New York", "Kings", "Queens", "Bronx", "Richmond"}, "Long Island": {"Nassau", "Suffolk"},
      "Westchester": {"Westchester"},
      "Buffalo": {"Erie"},
      "Rochester": {"Monroe"},
      "Syracuse": {"Onondaga"},
      "Albany": {"Albany", "Rensselaer", "Schenectady"},
      "Hudson Valley": {"Dutchess", "Orange", "Putnam", "Rockland", "Ulster"}}
# Ortsnamen je US-Gebiet, damit auch Angaben wie "Brooklyn, NY" dem richtigen Gebiet zugeordnet werden
US_TOWNS = {"New York City": ["new york city", "brooklyn", "manhattan", "queens", "bronx", "staten island", "new york, ny"],
            "Long Island": ["long island", "hicksville", "roslyn", "nassau", "suffolk", "garden city", "huntington", "melville", "hauppauge"],
            "Westchester": ["westchester", "yonkers", "white plains", "new rochelle", "mount vernon", "scarsdale"],
            "Buffalo": ["buffalo"],
            "Rochester": ["rochester"],
            "Syracuse": ["syracuse"],
            "Albany": ["albany", "schenectady", "troy"],
            "Hudson Valley": ["hudson valley", "poughkeepsie", "newburgh", "nyack", "new city", "middletown", "kingston"]}
FR = {"Lyon": {"69"}, "Paris": {"75"}, "Lille": {"59"}, "Hauts-de-Seine": {"92"}}


def area_of(region: str | None) -> str | None:
    """'Stockport, Greater Manchester' -> 'Greater Manchester'; 'Brooklyn, NY' -> 'New York City'."""
    if not region:
        return None
    parts = [x.strip() for x in region.split(",") if x.strip()]
    known = set(UK) | set(US) | set(FR)
    for part in reversed(parts):
        if part in known:
            return part
    low = region.lower()
    for towns in (US_TOWNS, UK_TOWNS):
        for area, names in towns.items():
            if any(n in low for n in names):
                return area
    return parts[-1] if parts else None


def lead_matches(country: str, buyer_area: str | None, company: dict, details: dict | None = None) -> bool:
    if not buyer_area:
        return False
    if country == "UK":
        pc = (company.get("address") or "").upper()
        m = re.match(r"[A-Z]+\d", pc)
        if m:
            return re.match(r"[A-Z]+", pc).group(0) in UK.get(buyer_area, set())
        place = f"{company.get('city') or ''} {company.get('region') or ''}".lower()
        return any(t in place for t in UK_TOWNS.get(buyer_area, []))
    if country == "US":
        county = (details or {}).get("county") or ""
        return county in US.get(buyer_area, set())
    if country == "FR":
        return (company.get("region") or "") in FR.get(buyer_area, set())
    return False
