#!/usr/bin/env python3
"""Käufer-Kandidaten aus OpenStreetMap (Overpass-API, kostenlos, offene Daten).

  python scripts/osm.py --segment S1 --out candidates/osm-S1.csv
  python scripts/osm.py --segment all --out-dir candidates/osm

Quelle: © OpenStreetMap-Mitwirkende, ODbL. Liste nur intern nutzen, nicht veröffentlichen.
Filter: nur Einträge mit eigener Website; Ketten (brand-Tag) werden ausgeschlossen.
Die Firmenadresse wird danach auf der Website geprüft (scripts/prospects.py).
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fetch import USER_AGENT, host_blocked  # noqa: E402
from lib.rules import normalize_domain  # noqa: E402

OVERPASS = "https://overpass-api.de/api/interpreter"

# (Land, Regionsname, Süd, West, Nord, Ost)
AREAS = {
    "UK": [("Greater Manchester", 53.34, -2.73, 53.69, -1.91), ("West Yorkshire", 53.52, -2.17, 53.97, -1.20),
           ("West Midlands", 52.35, -2.20, 52.66, -1.42), ("Merseyside", 53.30, -3.10, 53.57, -2.75),
           ("London", 51.28, -0.51, 51.69, 0.33), ("Bristol", 51.38, -2.73, 51.55, -2.47)],
    "US": [("New York City", 40.49, -74.26, 40.92, -73.70), ("Long Island", 40.55, -73.75, 41.10, -71.85),
           ("Westchester", 40.88, -73.98, 41.37, -73.48)],
    "FR": [("Lyon", 45.60, 4.70, 45.92, 5.10), ("Paris", 48.80, 2.22, 48.92, 2.47),
           ("Lille", 50.55, 2.90, 50.72, 3.20)],
}

# Segment -> OSM-Filter und optional ein Namens-/Website-Muster zur Eingrenzung
SEGMENTS = {
    "S1": {"filters": ['["office"="employment_agency"]'], "pattern": None,
           "specialization": "recruitment"},
    "S9": {"filters": ['["office"="financial_advisor"]', '["office"="financial"]'],
           "pattern": re.compile(r"financ|wealth|pension|planning|advis|ifa|patrimoine|conseil|invest", re.I),
           "specialization": "financial advice"},
    "S2": {"filters": ['["office"="it"]', '["office"="advertising_agency"]', '["office"="company"]',
                       '["craft"="graphic_design"]', '["office"="graphic_design"]'],
           "pattern": re.compile(r"web|digital|design|studio|site|agence|creative|pixel|media", re.I),
           "specialization": "web design"},
}
SEGMENT_COUNTRIES = {"S1": ["UK", "US", "FR"], "S2": ["UK", "US", "FR"], "S9": ["UK", "US", "FR"]}


def query(filters: list[str], bbox: tuple[float, float, float, float]) -> list[dict]:
    s, w, n, e = bbox
    parts = "".join(f'nwr{f}["website"]({s},{w},{n},{e});nwr{f}["contact:website"]({s},{w},{n},{e});'
                    for f in filters)
    q = f"[out:json][timeout:120];({parts});out tags center;"
    for attempt in range(3):
        r = requests.post(OVERPASS, data={"data": q}, timeout=180, headers={"User-Agent": USER_AGENT})
        if r.status_code == 200:
            return r.json().get("elements", [])
        time.sleep(30 * (attempt + 1))  # Overpass-Nutzungsregeln: bei 429/504 warten
    r.raise_for_status()
    return []


def candidates(segment: str, country: str) -> list[dict]:
    cfg = SEGMENTS[segment]
    rows, seen = [], set()
    for name, s, w, n, e in AREAS[country]:
        for el in query(cfg["filters"], (s, w, n, e)):
            t = el.get("tags", {})
            if t.get("brand") or t.get("brand:wikidata") or t.get("operator:wikidata"):
                continue  # Ketten und Konzerne
            site = t.get("website") or t.get("contact:website") or ""
            dom = normalize_domain(site)
            if not dom or dom in seen or host_blocked(site) or re.search(r"facebook|linkedin|instagram|wix\w*\.com|"
                                                                         r"sites\.google|business\.site", site, re.I):
                continue
            label = t.get("name", "")
            if cfg["pattern"] and not cfg["pattern"].search(f"{label} {site} {t.get('description', '')}"):
                continue
            seen.add(dom)
            town = t.get("addr:city") or name
            rows.append({
                "segment": segment, "country": country, "company_name": label or dom,
                "website": site if site.startswith("http") else "https://" + site,
                "region": f"{town}, {name}" if town != name else name,
                "specialization": cfg["specialization"],
                "size_note": "OSM: kein Ketten-Eintrag (brand) – Größe auf Website prüfen",
                "found_via": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
            })
        time.sleep(5)  # Overpass schonen
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--segment", default="all")
    ap.add_argument("--country", default="all")
    ap.add_argument("--out-dir", default="candidates/osm")
    args = ap.parse_args(argv)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    segs = list(SEGMENTS) if args.segment == "all" else [args.segment]
    for seg in segs:
        for c in SEGMENT_COUNTRIES[seg]:
            if args.country not in ("all", c):
                continue
            rows = candidates(seg, c)
            path = out / f"{seg}-{c}.csv"
            with open(path, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=["segment", "country", "company_name", "website", "region",
                                                   "specialization", "size_note", "found_via"])
                w.writeheader()
                w.writerows(rows)
            print(f"{seg} {c}: {len(rows)} Kandidaten -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
