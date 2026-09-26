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


# ---------------------------------------------------------------------------
# Offizielle, öffentliche Job-Schnittstellen von Bewerbungssystemen (keine Plattform-Suche,
# nur die Stellen der jeweiligen Firma, so wie sie sie selbst veröffentlicht).
# ---------------------------------------------------------------------------
import datetime as _dt  # noqa: E402

_ATS = [
    (re.compile(r"jobs\.(?:eu\.)?lever\.co/([^/?#]+)", re.I), "lever"),
    (re.compile(r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/([^/?#]+)", re.I), "greenhouse"),
    (re.compile(r"apply\.workable\.com/([^/?#]+)|([a-z0-9-]+)\.workable\.com", re.I), "workable"),
    (re.compile(r"([a-z0-9-]+)\.recruitee\.com", re.I), "recruitee"),
    (re.compile(r"([a-z0-9-]+)\.breezy\.hr", re.I), "breezy"),
    (re.compile(r"([a-z0-9-]+)\.pinpointhq\.com", re.I), "pinpoint"),
]


def ats_endpoint(careers_url: str) -> tuple[str, str] | None:
    for pat, kind in _ATS:
        m = pat.search(careers_url or "")
        if m:
            slug = next(g for g in m.groups() if g)
            if kind == "lever":
                host = "api.eu.lever.co" if ".eu.lever.co" in careers_url else "api.lever.co"
                return kind, f"https://{host}/v0/postings/{slug}?mode=json"
            if kind == "greenhouse":
                return kind, f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            if kind == "recruitee":
                return kind, f"https://{slug}.recruitee.com/api/offers/"
            if kind == "breezy":
                return kind, f"https://{slug}.breezy.hr/json"
            if kind == "pinpoint":
                return kind, f"https://{slug}.pinpointhq.com/postings.json"
            return kind, f"https://apply.workable.com/api/v1/widget/accounts/{slug}"
    return None


def _iso(value) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return _dt.datetime.fromtimestamp(value / 1000, _dt.timezone.utc).date().isoformat()
    return str(value)[:10]


def parse_ats_jobs(kind: str, data) -> list[dict]:
    jobs = []
    if kind == "lever":
        for j in data or []:
            cat = j.get("categories") or {}
            jobs.append({"title": j.get("text", ""), "url": j.get("hostedUrl"), "date_posted": _iso(j.get("createdAt")),
                         "locality": cat.get("location"), "identifier": j.get("id")})
    elif kind == "greenhouse":
        for j in (data or {}).get("jobs", []):
            jobs.append({"title": j.get("title", ""), "url": j.get("absolute_url"),
                         "date_posted": _iso(j.get("first_published")),  # updated_at ist kein Veröffentlichungsdatum
                         "locality": (j.get("location") or {}).get("name"), "identifier": str(j.get("id"))})
    elif kind == "workable":
        for j in (data or {}).get("jobs", []):
            jobs.append({"title": j.get("title", ""), "url": j.get("url") or j.get("shortlink"),
                         "date_posted": _iso(j.get("published_on") or j.get("created_at")),
                         "locality": j.get("city"), "identifier": j.get("shortcode")})
    elif kind == "recruitee":
        for j in (data or {}).get("offers", []):
            jobs.append({"title": j.get("title", ""), "url": j.get("careers_url"),
                         "date_posted": _iso(j.get("published_at") or j.get("created_at")),
                         "locality": j.get("city"), "identifier": str(j.get("id"))})
    elif kind == "breezy":
        for j in data or []:
            loc = j.get("location") or {}
            jobs.append({"title": j.get("name", ""), "url": j.get("url"),
                         "date_posted": _iso(j.get("published_date")),
                         "locality": loc.get("city") if isinstance(loc, dict) else None, "identifier": j.get("id")})
    elif kind == "pinpoint":
        items = data.get("data", []) if isinstance(data, dict) else data or []
        for j in items:
            a = j.get("attributes", j)
            jobs.append({"title": a.get("title", ""), "url": a.get("url") or j.get("links", {}).get("self"),
                         "date_posted": _iso(a.get("published_at") or a.get("created_at")),
                         "locality": a.get("location_name"), "identifier": str(j.get("id"))})
    return jobs
