"""S1 (Personalvermittlung): offene Stellen aus den öffentlichen Job-Schnittstellen der Bewerber-Systeme
(Greenhouse, Lever, Ashby, Workable, Recruitee). Diese Systeme veröffentlichen Stellen bewusst über offene
Schnittstellen für Karriereseiten – kein Scraping von Jobbörsen (Indeed, LinkedIn … bleiben gesperrt).

Firmen-Grundgesamtheit:
  UK: Register der Visa-Sponsoren (Home Office, tägliche CSV) – Arbeitgeber, die aktiv einstellen
  FR/UK/US: weitere Namenslisten (z. B. Overture-Firmen mit Website) über `universe_names`

Je Firma werden naheliegende Board-Namen geprüft. Ein Treffer zählt nur, wenn der Board-Name zur Firma passt und
Stellen im Zielland liegen. Signal: Zahl offener Stellen im Land, älteste offene Stelle (Datum), Beispiel-Titel.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import re

import requests

from extraktor.model import candidate
from lib import websites as W
from lib.fetch import parse_ats_jobs

SPONSORS = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+company-signal research)"}
COUNTRY_WORDS = {
    "UK": re.compile(r"\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|london|manchester|"
                     r"birmingham|leeds|glasgow|edinburgh|bristol|liverpool|cardiff|belfast|cambridge|oxford|"
                     r"reading|nottingham|sheffield|newcastle|brighton|southampton|leicester|milton keynes)\b", re.I),
    "FR": re.compile(r"\b(france|paris|lyon|marseille|toulouse|lille|bordeaux|nantes|nice|strasbourg|montpellier|"
                     r"rennes|grenoble|aix|sophia|île-de-france|ile-de-france|la défense)\b", re.I),
    "US": re.compile(r"\b(usa|united states|u\.s\.|new york|san francisco|chicago|austin|boston|seattle|los angeles|"
                     r"denver|atlanta|miami|dallas|houston|remote - us|remote, us)\b", re.I),
}


def boards(slug: str) -> list[tuple[str, str]]:
    return [
        ("greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"),
        ("lever", f"https://api.lever.co/v0/postings/{slug}?mode=json"),
        ("lever", f"https://api.eu.lever.co/v0/postings/{slug}?mode=json"),
        ("ashby", f"https://api.ashbyhq.com/posting-api/job-board/{slug}"),
        ("workable", f"https://apply.workable.com/api/v1/widget/accounts/{slug}"),
        ("recruitee", f"https://{slug}.recruitee.com/api/offers/"),
    ]


def parse(kind: str, data) -> list[dict]:
    if kind == "ashby":
        out = []
        for j in (data or {}).get("jobs", []):
            loc = ", ".join(x for x in [j.get("location")] + [s.get("location") for s in j.get("secondaryLocations") or []] if x)
            out.append({"title": j.get("title", ""), "url": j.get("jobUrl"), "date_posted": (j.get("publishedAt") or "")[:10] or None,
                        "locality": loc, "identifier": j.get("id")})
        return out
    return parse_ats_jobs(kind, data)


def slugs(name: str) -> list[str]:
    core = W.core_words(name)
    full = W.name_words(name)
    out = ["".join(core), "-".join(core), "".join(full)]
    return [s for s in dict.fromkeys(out) if len(s) >= 4][:2]


def probe(name: str, country: str, session: requests.Session) -> dict | None:
    """Erstes passendes Board mit Stellen im Land: {'kind', 'slug', 'url', 'jobs'} oder None."""
    for slug in slugs(name):
        for kind, url in boards(slug):
            try:
                r = session.get(url, timeout=12, headers=UA)
            except requests.RequestException:
                continue
            if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
                continue
            try:
                jobs = parse(kind, r.json())
            except ValueError:
                continue
            local = [j for j in jobs if COUNTRY_WORDS[country].search(j.get("locality") or "")]
            if local:
                return {"kind": kind, "slug": slug, "url": url, "jobs": local, "all_jobs": len(jobs)}
    return None


def sponsors_uk(limit: int | None = None, log=print) -> list[dict]:
    """Visa-Sponsoren (Skilled Worker), neueste Datei von GOV.UK: Name, Ort."""
    html = requests.get(SPONSORS, timeout=60, headers=UA).text
    url = re.search(r'https://assets\.publishing\.service\.gov\.uk/[^"]+\.csv', html).group(0)
    text = requests.get(url, timeout=120, headers=UA).content.decode("utf-8", "replace")
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        if "Skilled Worker" not in (r.get("Route") or ""):
            continue
        rows.append({"name": (r.get("Organisation Name") or "").strip(), "city": (r.get("Town/City") or "").strip().title()})
    log(f"UK: {len(rows)} Visa-Sponsoren (Skilled Worker) im Register")
    return rows[:limit] if limit else rows


def to_candidate(company: dict, hit: dict, country: str) -> dict:
    today = dt.date.today()
    dates = sorted(d for d in (j.get("date_posted") for j in hit["jobs"]) if d)
    oldest = dates[0] if dates else None
    titles = [re.sub(r"\s+", " ", j["title"]).strip() for j in hit["jobs"]][:3]
    return candidate(
        source="ats_jobs", source_id=f"{hit['kind']}:{hit['slug']}", country=country,
        source_url=(hit["jobs"][0].get("url") or hit["url"]), source_date=today, event_date=today,
        name=company["name"], legal_name=company["name"], city=company.get("city") or "",
        facts={"ats": hit["kind"], "open_roles": len(hit["jobs"]), "oldest_posted": oldest, "titles": titles,
               "checked_on": today, "sponsor": company.get("sponsor", False)},
    )


CC_INDEX = "https://index.commoncrawl.org/collinfo.json"
CC_PATTERNS = {"greenhouse": ["boards.greenhouse.io/*", "job-boards.greenhouse.io/*"], "lever": ["jobs.lever.co/*"],
               "ashby": ["jobs.ashbyhq.com/*"], "workable": ["apply.workable.com/*"]}


def cc_slugs(max_per_pattern: int = 20000, log=print) -> list[str]:
    """Board-Namen aller Firmen, deren Karriereseite bei Greenhouse/Lever/Ashby/Workable liegt (Common-Crawl-Index,
    frei). Liefert eine Namensliste; die Stellen selbst kommen danach aus den offiziellen Schnittstellen."""
    s = requests.Session()
    coll = s.get(CC_INDEX, timeout=60).json()[0]["cdx-api"]
    names = set()
    for kind, pats in CC_PATTERNS.items():
        for pat in pats:
            try:
                r = s.get(coll, params={"url": pat, "output": "json", "fl": "url", "limit": max_per_pattern}, timeout=300)
            except requests.RequestException as exc:
                log(f"  Common Crawl {pat}: {exc}")
                continue
            for line in r.text.splitlines():
                m = re.search(r'"url":\s*"https?://[^/]+/([A-Za-z0-9_-]+)', line)
                if m and m.group(1).lower() not in ("embed", "jobs", "v1", "api", "careers"):
                    names.add(m.group(1).lower())
    log(f"Common Crawl: {len(names)} Karriere-Boards gefunden")
    return sorted(names)
