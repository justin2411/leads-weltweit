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

OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter",
                    "https://overpass.private.coffee/api/interpreter",
                    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

# (Land, Regionsname, Süd, West, Nord, Ost)
AREAS = {
    "UK": [("Greater Manchester", 53.34, -2.73, 53.69, -1.91), ("West Yorkshire", 53.52, -2.17, 53.97, -1.20),
           ("West Midlands", 52.35, -2.20, 52.66, -1.42), ("Merseyside", 53.30, -3.10, 53.57, -2.75),
           ("London", 51.28, -0.51, 51.69, 0.33), ("Bristol", 51.38, -2.73, 51.55, -2.47),
           ("Glasgow", 55.78, -4.45, 55.95, -4.05), ("Edinburgh", 55.88, -3.35, 55.99, -3.08),
           ("Cardiff", 51.43, -3.28, 51.55, -3.10), ("Newcastle", 54.93, -1.75, 55.05, -1.50),
           ("Sheffield", 53.32, -1.58, 53.45, -1.35), ("Nottingham", 52.90, -1.25, 53.02, -1.05),
           ("Leicester", 52.58, -1.20, 52.69, -1.05), ("Southampton", 50.87, -1.48, 50.96, -1.33),
           ("Brighton", 50.8, -0.25, 50.89, -0.05),
           ("Reading", 51.4, -1.05, 51.49, -0.9),
           ("Oxford", 51.7, -1.32, 51.8, -1.18),
           ("Cambridge", 52.16, 0.05, 52.25, 0.2),
           ("Milton Keynes", 51.98, -0.85, 52.1, -0.68),
           ("Hull", 53.71, -0.45, 53.8, -0.25),
           ("Derby", 52.87, -1.55, 52.96, -1.4),
           ("Stoke-on-Trent", 52.95, -2.25, 53.08, -2.1),
           ("Plymouth", 50.35, -4.2, 50.43, -4.05),
           ("Exeter", 50.69, -3.57, 50.75, -3.47),
           ("Norwich", 52.6, 1.22, 52.67, 1.35),
           ("Bournemouth", 50.7, -2.0, 50.78, -1.75),
           ("Portsmouth", 50.77, -1.12, 50.85, -1.02),
           ("Aberdeen", 57.1, -2.2, 57.2, -2.05),
           ("Belfast", 54.55, -6.02, 54.65, -5.85),
           ("York", 53.93, -1.15, 53.99, -1.03),
           ("Preston", 53.73, -2.77, 53.8, -2.65),
           ("Northampton", 52.2, -0.95, 52.28, -0.83),
           ("Luton", 51.86, -0.5, 51.92, -0.38),
           ("Swansea", 51.6, -4.0, 51.67, -3.88),
           ("Middlesbrough", 54.52, -1.3, 54.6, -1.17),
           ("Sunderland", 54.87, -1.45, 54.93, -1.35)],
    "US": [("New York City", 40.49, -74.26, 40.92, -73.70), ("Long Island", 40.55, -73.75, 41.10, -71.85),
           ("Westchester", 40.88, -73.98, 41.37, -73.48),
           ("Buffalo", 42.8, -78.95, 43.0, -78.7),
           ("Rochester", 43.1, -77.7, 43.25, -77.5),
           ("Syracuse", 42.98, -76.22, 43.1, -76.08),
           ("Albany", 42.6, -73.85, 42.72, -73.7),
           ("Hudson Valley", 41.0, -74.4, 41.9, -73.7)],
    "FR": [("Lyon", 45.60, 4.70, 45.92, 5.10), ("Paris", 48.80, 2.22, 48.92, 2.47),
           ("Lille", 50.55, 2.90, 50.72, 3.20), ("Hauts-de-Seine", 48.78, 2.15, 48.95, 2.32)],
}

# Segment -> OSM-Filter und optional ein Namens-/Website-Muster zur Eingrenzung
SEGMENTS = {
    "S1": {"filters": ['["office"="employment_agency"]'], "pattern": None,
           "specialization": "recruitment"},
    "S9": {"filters": ['["office"="financial_advisor"]', '["office"="financial"]'],
           "pattern": re.compile(r"financ|wealth|pension|planning|advis|ifa|patrimoine|conseil|invest", re.I),
           "specialization": "financial advice"},
    "S2": {"filters": ['["office"="it"]', '["office"="advertising_agency"]', '["craft"="graphic_design"]',
                       '["office"="graphic_design"]'],
           "pattern": re.compile(r"web|digital|design|studio|site|agence|creative|pixel|media", re.I),
           "specialization": "web design"},
    "S3": {"filters": ['["office"="it"]', '["shop"="computer"]["repair"]', '["craft"="computer"]'],
           "pattern": re.compile(r"\bit\b|tech|comput|network|support|managed|cyber|system|cloud|solutions", re.I),
           "specialization": "IT support"},
    "S4": {"filters": ['["office"="insurance"]'],
           "pattern": re.compile(r"broker|insurance|risk|assur", re.I),
           "specialization": "commercial insurance"},
    "S5": {"filters": ['["office"="accountant"]', '["office"="tax_advisor"]'],
           "pattern": None,
           "specialization": "accounting"},
}
SEGMENT_COUNTRIES = {"S1": ["UK", "US", "FR"], "S2": ["UK", "US", "FR"], "S9": ["UK", "US", "FR"],
                     "S3": ["UK", "US"], "S4": ["UK", "US"], "S5": ["UK", "US"]}
EXCLUDE_NAME = re.compile(r"\b(hsbc|barclays|lloyds|natwest|santander|aviva|axa|allianz|state farm|allstate|"
                          r"geico|farmers|nationwide|liberty mutual|progressive|h&r block|jackson hewitt|"
                          r"pwc|deloitte|kpmg|ernst|grant thornton|bdo|rsm|currys|best buy|apple)\b", re.I)


def _run(q: str) -> list[dict] | None:
    for attempt in range(4):
        url = OVERPASS_MIRRORS[attempt % len(OVERPASS_MIRRORS)]
        try:
            r = requests.post(url, data={"data": q}, timeout=200, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                return r.json().get("elements", [])
        except (requests.RequestException, ValueError):
            pass
        time.sleep(20 * (attempt + 1))  # Overpass-Nutzungsregeln: bei 429/504 warten
    return None


def query(filters: list[str], bbox: tuple[float, float, float, float]) -> list[dict]:
    """Je Filter eine kleine Abfrage; bei Zeitüberschreitung Gebiet vierteln. Fehler brechen nichts ab."""
    s, w, n, e = bbox
    out = []
    for f in filters:
        q = (f'[out:json][timeout:150];(nwr{f}["website"]({s},{w},{n},{e});'
             f'nwr{f}["contact:website"]({s},{w},{n},{e}););out tags center;')
        res = _run(q)
        if res is None and (n - s) > 0.12:
            mid_lat, mid_lon = (s + n) / 2, (w + e) / 2
            res = []
            for bb in ((s, w, mid_lat, mid_lon), (s, mid_lon, mid_lat, e), (mid_lat, w, n, mid_lon),
                       (mid_lat, mid_lon, n, e)):
                res += query([f], bb)
        elif res is None:
            print(f"  Hinweis: Overpass nicht erreichbar für {f} {bbox}, übersprungen")
            res = []
        out += res
        time.sleep(3)
    return out


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
            if EXCLUDE_NAME.search(label):
                continue
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
