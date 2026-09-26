"""Höflicher Abruf von Firmenwebsites und Karriereseiten.

- beachtet robots.txt
- höchstens ein Abruf pro Seite und Tag (Zeitstempel liegt in der Datenbank)
- verweigert Plattformen, deren Bedingungen Scraping verbieten
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.robotparser
from urllib.parse import urlparse

import requests

USER_AGENT = "SignalwerkBot/0.1 (+company-signal research; respects robots.txt; max 1 request/page/day)"

# CLAUDE.md Abschnitt 2: kein Scraping dieser Plattformen (auch nicht über Subdomains).
BLOCKED_HOSTS = (
    "linkedin.com", "indeed.", "stepstone.", "glassdoor.", "xing.com", "google.", "maps.app.goo.gl",
    "totaljobs.com", "reed.co.uk", "monster.", "ziprecruiter.com", "cv-library.co.uk", "welcometothejungle.com",
    "facebook.com", "instagram.com", "yelp.", "craigslist.", "simplyhired.", "careerbuilder.",
)

MIN_INTERVAL = dt.timedelta(hours=20)

_robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}


class FetchRefused(Exception):
    pass


def host_blocked(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(b in host for b in BLOCKED_HOSTS)


def robots_allows(url: str, session: requests.Session) -> bool:
    p = urlparse(url)
    root = f"{p.scheme}://{p.netloc}"
    rp = _robots_cache.get(root)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = session.get(root + "/robots.txt", timeout=15, headers={"User-Agent": USER_AGENT})
            if r.status_code in (401, 403):
                rp.disallow_all = True
            elif r.status_code >= 400:
                rp.allow_all = True
            else:
                rp.parse(r.text.splitlines())
        except requests.RequestException:
            rp.disallow_all = True  # im Zweifel nicht abrufen
        _robots_cache[root] = rp
    return rp.can_fetch(USER_AGENT, url)


def polite_get(url: str, *, last_fetched: dt.datetime | None, session: requests.Session | None = None,
               now: dt.datetime | None = None) -> requests.Response:
    now = now or dt.datetime.now(dt.timezone.utc)
    if host_blocked(url):
        raise FetchRefused(f"Plattform ausgeschlossen: {url}")
    if last_fetched and now - last_fetched < MIN_INTERVAL:
        raise FetchRefused(f"heute schon abgerufen: {url}")
    session = session or requests.Session()
    if not robots_allows(url, session):
        raise FetchRefused(f"robots.txt verbietet: {url}")
    return session.get(url, timeout=20, headers={"User-Agent": USER_AGENT}, allow_redirects=True)


_JSONLD = re.compile(r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.S | re.I)


def _walk(node):
    if isinstance(node, list):
        for n in node:
            yield from _walk(n)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "itemListElement", "item"):
            if key in node:
                yield from _walk(node[key])


def extract_job_postings(html: str, base_url: str = "") -> list[dict]:
    """Liest schema.org-JobPosting-Einträge (JSON-LD) aus einer Karriereseite.

    Gibt nur Stellendaten zurück (Titel, Ort, Datum, URL), keine Kontaktpersonen.
    """
    jobs = []
    for raw in _JSONLD.findall(html):
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            continue
        for node in _walk(data):
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if "JobPosting" not in types:
                continue
            loc = node.get("jobLocation") or {}
            if isinstance(loc, list):
                loc = loc[0] if loc else {}
            addr = (loc.get("address") or {}) if isinstance(loc, dict) else {}
            if isinstance(addr, str):
                addr = {"streetAddress": addr}
            jobs.append({
                "title": (node.get("title") or "").strip(),
                "url": node.get("url") or base_url,
                "date_posted": (node.get("datePosted") or "")[:10] or None,
                "valid_through": (node.get("validThrough") or "")[:10] or None,
                "employment_type": node.get("employmentType"),
                "locality": addr.get("addressLocality"),
                "region": addr.get("addressRegion"),
                "country": addr.get("addressCountry") if isinstance(addr.get("addressCountry"), str) else None,
                "identifier": (node.get("identifier") or {}).get("value")
                if isinstance(node.get("identifier"), dict) else node.get("identifier"),
            })
    return jobs
