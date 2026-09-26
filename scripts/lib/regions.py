"""Zuordnung Käufer-Region (aus osm.py) -> Lead-Region (Postleitbereich, County, Département).

Ein Käufer bekommt Probe-Leads nur aus seiner eigenen Region (CLAUDE.md: Leads aus dem eigenen Markt).
"""
from __future__ import annotations

import re

UK = {"Greater Manchester": {"M", "SK", "BL", "OL", "WN", "WA"}, "West Yorkshire": {"LS", "BD", "HX", "HD", "WF"},
      "West Midlands": {"B", "WS", "WV", "DY"}, "Merseyside": {"L", "CH"},
      "London": {"E", "EC", "N", "NW", "SE", "SW", "W", "WC"}, "Bristol": {"BS"}, "Glasgow": {"G"},
      "Edinburgh": {"EH"}, "Cardiff": {"CF"}, "Newcastle": {"NE"}, "Sheffield": {"S"}, "Nottingham": {"NG"},
      "Leicester": {"LE"}, "Southampton": {"SO"}}
US = {"New York City": {"New York", "Kings", "Queens", "Bronx", "Richmond"}, "Long Island": {"Nassau", "Suffolk"},
      "Westchester": {"Westchester"}}
FR = {"Lyon": {"69"}, "Paris": {"75"}, "Lille": {"59"}, "Hauts-de-Seine": {"92"}}


def area_of(region: str | None) -> str | None:
    """'Stockport, Greater Manchester' -> 'Greater Manchester'."""
    if not region:
        return None
    return region.split(",")[-1].strip()


def lead_matches(country: str, buyer_area: str | None, company: dict, details: dict | None = None) -> bool:
    if not buyer_area:
        return False
    if country == "UK":
        pc = (company.get("address") or "").upper()
        m = re.match(r"[A-Z]+", pc)
        return bool(m) and m.group(0) in UK.get(buyer_area, set())
    if country == "US":
        county = (details or {}).get("county") or ""
        return county in US.get(buyer_area, set())
    if country == "FR":
        return (company.get("region") or "") in FR.get(buyer_area, set())
    return False
