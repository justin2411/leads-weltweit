#!/usr/bin/env python3
"""Arbeitgeber mit eigener Karriereseite finden und in die Beobachtung aufnehmen (Grundlage für S1-Leads).

  python scripts/employers.py --country UK --area "Greater Manchester" --limit 300

Weg: OpenStreetMap (Firmen mit Website, keine Ketten) -> Startseite -> Karriere-Link ->
offizielles Bewerbungssystem (Lever, Greenhouse, Workable, Recruitee, Breezy, Pinpoint) oder
strukturierte Stellendaten (JSON-LD). Keine Jobbörsen, robots.txt wird beachtet.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fetch import FetchRefused, ats_endpoint, extract_job_postings, host_blocked, polite_get  # noqa: E402
from lib.rules import normalize_domain  # noqa: E402
from osm import AREAS, EXCLUDE_NAME, query  # noqa: E402

EMPLOYER_FILTERS = ['["office"="company"]', '["office"="it"]', '["office"="logistics"]', '["industrial"]',
                    '["craft"="electrician"]', '["craft"="plumber"]', '["office"="engineer"]',
                    '["amenity"="nursing_home"]', '["amenity"="childcare"]', '["office"="construction_company"]']
CAREER_HREF = re.compile(r'href=["\']([^"\']*(career|jobs|vacanc|join-us|join_us|work-with-us|recrut|emploi|'
                         r'lavora|work-for-us|opportunit)[^"\']*)["\']', re.I)
ATS_URL = re.compile(r"https?://(?:jobs\.(?:eu\.)?lever\.co/[\w-]+|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/[\w-]+|"
                     r"apply\.workable\.com/[\w-]+|[\w-]+\.recruitee\.com|[\w-]+\.breezy\.hr|[\w-]+\.pinpointhq\.com)", re.I)


def find_careers(site: str, session: requests.Session) -> str | None:
    base = site if site.startswith("http") else "https://" + site
    try:
        r = polite_get(base, last_fetched=None, session=session)
    except (FetchRefused, requests.RequestException):
        return None
    if r.status_code >= 400:
        return None
    m = ATS_URL.search(r.text)
    if m:
        return m.group(0)
    link = CAREER_HREF.search(r.text)
    if not link:
        return None
    url = urljoin(r.url, link.group(1))
    if host_blocked(url):
        return None
    try:
        c = polite_get(url, last_fetched=None, session=session)
    except (FetchRefused, requests.RequestException):
        return None
    if c.status_code >= 400:
        return None
    m = ATS_URL.search(c.text)
    if m:
        return m.group(0)
    return url if extract_job_postings(c.text, c.url) else None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--country", required=True)
    ap.add_argument("--area", required=True)
    ap.add_argument("--limit", type=int, default=300, help="höchstens so viele Websites prüfen")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    box = next(a for a in AREAS[args.country] if a[0] == args.area)
    elements = query(EMPLOYER_FILTERS, box[1:])
    session = requests.Session()
    seen, checked, added = set(), 0, 0
    for el in elements:
        t = el.get("tags", {})
        if t.get("brand") or t.get("brand:wikidata") or EXCLUDE_NAME.search(t.get("name", "")):
            continue
        site = t.get("website") or t.get("contact:website") or ""
        dom = normalize_domain(site)
        if not dom or dom in seen or host_blocked(site):
            continue
        seen.add(dom)
        if db.select("watch_companies", {"domain": f"eq.{dom}", "select": "id"}):
            continue
        checked += 1
        careers = find_careers(site, session)
        if careers:
            db.insert("watch_companies", {
                "name": t.get("name") or dom, "country": args.country, "region": args.area,
                "city": t.get("addr:city") or args.area, "address": t.get("addr:postcode"),
                "website": site, "domain": dom, "careers_url": careers,
                "industry": t.get("office") or t.get("industrial") or t.get("craft") or t.get("amenity"),
                "notes": f"OSM {el['type']}/{el['id']}; Karriereseite {'über Bewerbungssystem' if ats_endpoint(careers) else 'mit Stellendaten'}",
            })
            added += 1
            print(f"+ {t.get('name') or dom}: {careers}")
        if checked >= args.limit:
            break
    print(f"\n{checked} Websites geprüft, {added} Arbeitgeber mit auswertbarer Karriereseite aufgenommen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
