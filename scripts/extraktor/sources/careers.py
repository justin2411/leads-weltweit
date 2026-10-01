"""S1 (Personalvermittlung): offene Stellen von der eigenen Karriereseite der Firma (Inhaber 01.10.2026: „ja mach das“).

Firmenliste: Web Data Commons, JobPosting-Auszug aus Common Crawl (frei, CC-Lizenz) – alle Domains, deren eigene Seiten
schema.org-Stellenanzeigen enthalten. UK: Domains auf .uk; US: .com/.us/.net/.org, Land über die Stellenorte.
Je Firma: Startseite -> Karriere-Link -> Stellen aus dem offiziellen Bewerbungssystem (Lever, Greenhouse …) oder aus
den strukturierten Stellendaten (JSON-LD) der eigenen Seite. Abruf nur über den Fetcher (robots.txt, gesperrte
Plattformen, 1 Anfrage/Sekunde je Domain, höchstens einmal je Lauf). Keine Jobbörsen.

Keine Leads: Personalvermittler selbst (das sind unsere Käufer), Jobbörsen und Seiten mit Stellen vieler Arbeitgeber,
Behörden/Schulen/Kliniken des Staates, Konzerne (über MAX_ROLES Stellen) und Stellen außerhalb des Ziellands.
FR bewusst nicht: Code du travail L5331-1 (Inhaber 01.10.2026: S1 in Frankreich bleiben lassen).
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

from extraktor.model import candidate, title_case
from lib import websites as W
from lib.fetch import _JSONLD, FetchRefused, _walk, ats_endpoint, host_blocked, parse_ats_jobs, polite_get

WDC_URL = ("https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/stats/schemaorg/"
           "JobPosting/domain_stats.csv")
WDC_CACHE = Path(os.environ.get("EXTRAKTOR_CACHE_WDC", "out/cache/wdc_job_domains.csv"))
SEEN = Path(os.environ.get("EXTRAKTOR_CAREERS_SEEN", "out/cache/careers_seen.json"))
COUNTRIES = ("UK", "US")
TLDS = {"UK": (".uk",), "US": (".com", ".us", ".net", ".org")}
MAX_ENTITIES = 400        # mehr Stellen-Einträge im Crawl: Jobbörse oder Konzern
MAX_ROLES = 60            # mehr offene Stellen im Land: Konzern mit eigener Personalabteilung
MAX_DETAIL = 4            # so viele Stellen-Detailseiten je Firma höchstens lesen

BOARD_DOMAIN = re.compile(r"(job|career|karriere|recruit|staffing|talent|hiring|hire|vacanc|employ|resum|"
                          r"\bcv|headhunt|search|work(?:ers|force)|apply)", re.I)
PUBLIC_DOMAIN = re.compile(r"\.(gov|ac|nhs|sch|police|mod|parliament|edu|mil)\.|\.(gov|edu|mil)$|"
                           r"(council|county|state|city|school|college|university|academy|hospital|nhs|police)", re.I)
AGENCY_TEXT = re.compile(r"\b(recruitment (agency|consultan\w+|specialists?|business)|staffing (agency|firm|company|"
                         r"solutions)|employment agency|executive search|headhunt\w*|temp(orary)? staffing|"
                         r"we (place|recruit) candidates|our clients? (are|is) (looking|hiring|seeking)|"
                         r"on behalf of (our|a) client|job board)\b", re.I)
CAREER_HREF = re.compile(r'href=["\']([^"\'#]*(?:career|jobs|vacanc|join-us|join_us|work-with-us|work-for-us|'
                         r'opportunit|hiring|current-openings|open-positions)[^"\'#]*)["\']', re.I)
JOB_PATH = re.compile(r"/(?:careers?|jobs?|job-vacancy|vacanc(?:y|ies)|positions?|openings?|job-openings|"
                      r"opportunit(?:y|ies)(?:-details)?|join-us|roles?|current-vacancies|work-for-us)/[\w%.-]{3,}", re.I)
AGENCY_TITLE = re.compile(r"\b(recruit\w*|staffing|(?:employment|teaching|nursing|supply|locum|care|temp) agency|locums?|"
                          r"appointments|selection|talent|personnel|resourcing|headhunt\w*|job ?boards?|jobs? in|"
                          r"\w+ jobs|vacancies in|careers in|outsourcing)\b", re.I)
OTHER_ATS = re.compile(r"(teamtailor\.com|personio\.(?:de|com)|bamboohr\.com|smartrecruiters\.com|jobvite\.com|"
                       r"applytojob\.com|hibob\.com|occupop\.com|eploy\.net|tal\.net|jobtrain\.co\.uk|"
                       r"webrecruit\.co|ciphr\w*\.com|zohorecruit\.\w+|recruitee\.com|manatal\.com)", re.I)
ATS_URL = re.compile(r"https?://(?:jobs\.(?:eu\.)?lever\.co/[\w-]+|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/[\w-]+|"
                     r"apply\.workable\.com/[\w-]+|[\w-]+\.recruitee\.com|[\w-]+\.breezy\.hr|[\w-]+\.pinpointhq\.com)", re.I)
COUNTRY_CODES = {"UK": {"gb", "uk", "united kingdom", "great britain", "england", "scotland", "wales",
                        "northern ireland", "gbr"},
                 "US": {"us", "usa", "united states", "united states of america"}}
US_STATES = {"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
             "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
             "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"}
WORDS = {"UK": re.compile(r"\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|london|manchester|"
                          r"birmingham|leeds|glasgow|edinburgh|bristol|liverpool|cardiff|belfast|cambridge|oxford|"
                          r"reading|nottingham|sheffield|newcastle|brighton|southampton|leicester|milton keynes)\b", re.I),
         "US": re.compile(r"\b(usa|united states|u\.s\.|new york|san francisco|chicago|austin|boston|seattle|"
                          r"los angeles|denver|atlanta|miami|dallas|houston|remote - us|remote, us)\b|,\s*(?:"
                          + "|".join(sorted(US_STATES)) + r")\b")}


# ---------------------------------------------------------------------------
# Firmenliste
# ---------------------------------------------------------------------------
def domains(country: str, limit: int | None = None, log=print) -> list[str]:
    """Domains mit eigenen Stellenanzeigen (Web Data Commons), ohne Jobbörsen, Behörden und Konzerne."""
    if not WDC_CACHE.exists():
        WDC_CACHE.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(WDC_URL, timeout=300)
        r.raise_for_status()
        WDC_CACHE.write_bytes(r.content)
    out = []
    with open(WDC_CACHE, encoding="utf-8", errors="replace") as fh:
        for row in csv.reader(fh, delimiter="\t"):
            if len(row) < 3 or not row[2].isdigit():
                continue
            dom, n = row[0].strip().lower(), int(row[2])
            if not dom.endswith(TLDS[country]) or not 1 <= n <= MAX_ENTITIES:
                continue
            if BOARD_DOMAIN.search(dom) or PUBLIC_DOMAIN.search(dom) or host_blocked("https://" + dom):
                continue
            out.append(dom)
    out = list(dict.fromkeys(out))
    log(f"S1/{country}: {len(out)} Arbeitgeber-Domains mit eigenen Stellenanzeigen (Web Data Commons)")
    return out[:limit] if limit else out


# ---------------------------------------------------------------------------
# Stellen lesen
# ---------------------------------------------------------------------------
def _country_of(addr) -> str:
    if isinstance(addr, dict):
        c = addr.get("addressCountry")
        if isinstance(c, dict):
            c = c.get("name") or c.get("identifier")
        return str(c or "").strip().lower()
    return ""


def postings(html: str, url: str) -> list[dict]:
    """JobPosting aus JSON-LD mit Arbeitgeber, Ort und Land (lib.fetch liest das Land nur als Text)."""
    out = []
    for raw in _JSONLD.findall(html or ""):
        try:
            data = json.loads(raw.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        for node in _walk(data):
            types = node.get("@type")
            if "JobPosting" not in (types if isinstance(types, list) else [types]):
                continue
            locs = node.get("jobLocation") or []
            locs = locs if isinstance(locs, list) else [locs]
            addrs = [(l.get("address") if isinstance(l, dict) else None) or {} for l in locs]
            addrs = [a for a in addrs if isinstance(a, dict)]
            org = node.get("hiringOrganization") or {}
            org = org if isinstance(org, dict) else {"name": str(org)}
            remote = str(node.get("jobLocationType") or "").upper() == "TELECOMMUTE"
            req = node.get("applicantLocationRequirements") or {}
            req = req[0] if isinstance(req, list) and req else req
            out.append({
                "title": re.sub(r"\s+", " ", str(node.get("title") or "")).strip(),
                "url": node.get("url") or url,
                "date_posted": str(node.get("datePosted") or "")[:10] or None,
                "valid_through": str(node.get("validThrough") or "")[:10] or None,
                "countries": [_country_of(a) for a in addrs]
                + ([str((req or {}).get("name") or "").lower()] if remote and isinstance(req, dict) else []),
                "locality": ", ".join(x for a in addrs for x in (a.get("addressLocality"), a.get("addressRegion"))
                                      if isinstance(x, str) and x),
                "org": str(org.get("name") or "").strip(),
                "org_url": str(org.get("sameAs") or org.get("url") or "").strip(),
                "address": addrs[0] if addrs else {},
            })
    return out


def in_country(job: dict, country: str) -> bool:
    cs = [c for c in job.get("countries") or [] if c]
    if cs:
        return any(c in COUNTRY_CODES[country] for c in cs)
    return bool(WORDS[country].search(job.get("locality") or ""))


def _careers_links(html: str, base: str) -> list[str]:
    host = W.site_domain(base)
    out = []
    for href in CAREER_HREF.findall(html or ""):
        u = urljoin(base, href.replace("&amp;", "&"))
        if "{" in u or urlparse(u).scheme not in ("http", "https") or host_blocked(u):
            continue
        if W.site_domain(u) == host or ATS_URL.match(u) or OTHER_ATS.search(u):
            out.append(u.split("#")[0].rstrip("/"))
    base_n = base.split("#")[0].rstrip("/")
    # Listen-Seiten zuerst (vacancies/jobs vor allgemeinem „careers“)
    out = [u for u in dict.fromkeys(out) if u != base_n]
    return sorted(out, key=lambda u: (not re.search(r"vacanc|jobs|openings|positions|current", u, re.I), len(u)))[:3]


ANCHOR = re.compile(r'<a\b[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', re.I | re.S)


ROLE_WORD = re.compile(r"\b(manager|engineer|assistant|worker|officer|executive|technician|driver|nurse|carer|"
                       r"consultant|developer|analyst|co-?ordinator|administrator|admin|operative|operator|lead|head|"
                       r"director|specialist|advis[eo]r|sales|accountant|apprentice|solicitor|chef|cleaner|"
                       r"receptionist|designer|architect|surveyor|estimator|planner|buyer|supervisor|fitter|"
                       r"electrician|plumber|mechanic|welder|joiner|labourer|warehouse|picker|packer|teacher|"
                       r"tutor|therapist|practitioner|pharmacist|dentist|dental|veterinary|vet|paralegal|clerk|"
                       r"controller|bookkeeper|marketing|scientist|researcher|programmer|tester|support|"
                       r"representative|associate|partner|trainee|graduate|intern|cook|server|bartender|"
                       r"stylist|hygienist|optometrist|physio\w*|psychologist|recruiter|editor|writer|producer)s?\b",
                       re.I)


NOT_A_ROLE = re.compile(r"\b(programmes?|programs?|schemes?|graduates|apprenticeships|opportunities|partners|"
                        r"head office|support for|training|academy|fast track|team members|types of|our |"
                        r"closed|filled|expired|no longer|jobs? in|editlink|\{\{)", re.I)


def _job_title(text: str, url: str) -> str | None:
    """Stellenbezeichnung aus dem Linktext oder, wenn der nur „Mehr erfahren“ sagt, aus der Adresse."""
    if NOT_A_ROLE.search(text) or NOT_A_ROLE.search(urlparse(url).path.replace("-", " ")):
        return None
    if ROLE_WORD.search(text):
        return text
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"[-_]+", " ", re.sub(r"\.\w{2,4}$|[-_]?\d{3,}.*$", "", slug)).strip()
    if 2 <= len(slug.split()) <= 8 and ROLE_WORD.search(slug):
        return slug[:1].upper() + slug[1:]
    return None


def _job_links(html: str, base: str) -> list[tuple[str, str]]:
    """(URL, Linktext) der einzelnen Stellen auf einer Listen-Seite: gleicher Host, Pfad mit Stellen-Wort und
    eigenem Kürzel dahinter, oder unterhalb der Listen-Seite."""
    host = W.site_domain(base)
    base_path = urlparse(base).path.rstrip("/")
    out = {}
    for href, inner in ANCHOR.findall(html or ""):
        u = urljoin(base, href.replace("&amp;", "&")).split("?")[0].rstrip("/")
        p = urlparse(u)
        if W.site_domain(u) != host or p.path.rstrip("/") in (base_path, ""):
            continue
        below = base_path and p.path.startswith(base_path + "/") and len(p.path) > len(base_path) + 4
        if not (JOB_PATH.search(p.path) or below):
            continue
        text = re.sub(r"\s+", " ", W.page_text(inner)).strip()
        title = _job_title(text if len(text) <= 90 else "", u)
        if title:
            out.setdefault(u, title)
    return list(out.items())


def _ats_jobs(url: str, fetcher) -> tuple[str, list[dict]] | None:
    ep = ats_endpoint(url)
    if not ep:
        return None
    fetcher._throttle(ep[1])  # Fetcher.get liest nur HTML; die Schnittstellen liefern JSON
    try:
        r = polite_get(ep[1], last_fetched=None, session=fetcher.session)
        if r.status_code >= 400:
            return None
        jobs = parse_ats_jobs(ep[0], r.json())
    except (FetchRefused, requests.RequestException, ValueError, TypeError, AttributeError):
        return None
    return ep[0], jobs


def looks_like_agency(domain: str, html: str) -> bool:
    """Personalvermittler, Zeitarbeit und Jobbörsen sind keine Leads (sie sind unsere Käufer)."""
    title = " ".join([W.title_of(html) or ""] + re.findall(
        r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']{0,120})', html or "", re.I))
    desc = " ".join(re.findall(r'<meta[^>]+(?:name=["\']description["\']|property=["\']og:description["\'])[^>]+'
                               r'content=["\']([^"\']{0,400})', html or "", re.I))
    return bool(AGENCY_TITLE.search(title) or AGENCY_TEXT.search(desc + " " + W.page_text(html)[:20000]))


def scan(domain: str, country: str, fetcher) -> dict:
    """{'ok': bool, 'why': str, ...} – die offenen Stellen einer Firma im Zielland, von ihrer eigenen Seite."""
    home = fetcher.get("https://" + domain) or fetcher.get("https://www." + domain)
    if not home:
        return {"ok": False, "why": "website_unreachable"}
    final, html = home
    if W.site_domain(final) != W.site_domain("https://" + domain):
        return {"ok": False, "why": "redirects_elsewhere"}
    if looks_like_agency(domain, html):
        return {"ok": False, "why": "recruitment_agency_or_board"}
    found = {"home": final, "home_html": html}
    # Karriereseite: Startseite -> Karriere-Link -> ggf. Unterseite „Vacancies“ (höchstens 4 Seiten)
    pages, queue, careers_url, ats_url = [], _careers_links(html, final), None, ATS_URL.search(html)
    ats_url = ats_url.group(0) if ats_url else None
    visited = set()
    while queue and len(visited) < 4 and not ats_url:
        link = queue.pop(0)
        if link in visited:
            continue
        visited.add(link)
        if ATS_URL.match(link):
            ats_url = link
            break
        got = fetcher.get(link)
        if not got:
            continue
        pages.append(got)
        careers_url = careers_url or got[0]
        m = ATS_URL.search(got[1])
        if m:
            ats_url = m.group(0)
            break
        if len(_job_links(got[1], got[0])) >= 2 or postings(got[1], got[0]):
            careers_url = got[0]
            break
        queue += [u for u in _careers_links(got[1], got[0]) if u not in visited]
    if ats_url:
        via = _ats_jobs(ats_url, fetcher)
        if via and via[1]:
            jobs = [dict(j, countries=[], org="", address={}) for j in via[1]]
            return _finish(jobs, via[0], ats_url, country, found)
    if not pages:
        return {"ok": False, "why": "no_careers_page"}
    jobs = [j for _, page in [(None, html)] + [(None, p[1]) for p in pages] for j in postings(page, careers_url)]
    if jobs:
        return _finish(jobs, "website", careers_url, country, found)
    final_page = next((p for p in reversed(pages) if p[0] == careers_url), pages[-1])
    links = _job_links(final_page[1], final_page[0])
    if not links:
        return {"ok": False, "why": "no_job_listings"}
    sample = []
    for link, _ in links[:MAX_DETAIL]:
        got = fetcher.get(link)
        if got:
            sample += postings(got[1], got[0])
    if sample:
        local = [j for j in sample if in_country(j, country)]
        if not local:
            return {"ok": False, "why": "roles_outside_country"}
        if len(local) < len(sample):  # gemischte Länder: nur die gelesenen Stellen zählen
            return _finish(sample, "website", careers_url, country, found)
        known = {(j.get("url") or "").rstrip("/") for j in sample}
        rest = [{"title": t, "url": u, "date_posted": None, "countries": [], "locality": "", "org": "",
                 "address": {}, "assumed_local": True} for u, t in links if u not in known]
        return _finish(sample + rest, "website", careers_url, country, found)
    # Keine strukturierten Daten: Stellen-Links zählen, nur wenn die Firma selbst im Zielland sitzt
    if not W.postcodes(W.page_text(html), country) and not domain.endswith(".uk" if country == "UK" else ".us"):
        return {"ok": False, "why": "country_unclear"}
    jobs = [{"title": t, "url": u, "date_posted": None, "countries": [], "locality": "", "org": "", "address": {},
             "assumed_local": True} for u, t in links]
    return _finish(jobs, "website_links", careers_url, country, found)


def _stale(j: dict, today: str) -> bool:
    """Abgelaufen (validThrough vorbei) oder über ein Jahr alt ohne gültiges Ablaufdatum: alte Seite, keine Stelle."""
    vt, dp = j.get("valid_through") or "", j.get("date_posted") or ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", vt) and vt < today:
        return True
    year_ago = (dt.date.fromisoformat(today) - dt.timedelta(days=365)).isoformat()
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", dp)) and dp < year_ago and not vt


def _finish(jobs: list[dict], kind: str, careers_url: str, country: str, found: dict) -> dict:
    today = dt.date.today().isoformat()
    jobs = [j for j in jobs if (j.get("url") or j.get("title")) and not _stale(j, today)]
    if not jobs:
        return {"ok": False, "why": "no_job_listings"}
    orgs = Counter(j["org"].lower() for j in jobs if j.get("org"))
    if sum(bool(re.search(r"\bjobs? in\b", j.get("title") or "", re.I)) for j in jobs) >= max(1, len(jobs) // 2):
        return {"ok": False, "why": "recruitment_agency_or_board"}
    if len(orgs) >= 3:
        return {"ok": False, "why": "roles_for_several_employers"}
    local = [j for j in jobs if j.get("assumed_local") or in_country(j, country)]
    if not local:
        return {"ok": False, "why": "roles_outside_country"}
    if len(local) > MAX_ROLES:
        return {"ok": False, "why": "large_employer"}
    uniq = {}
    for j in local:
        uniq.setdefault(_key(j), j)
    org = orgs.most_common(1)[0][0] if orgs else ""
    org_name = next((j["org"] for j in jobs if j.get("org", "").lower() == org), "")
    return {"ok": True, "kind": kind, "careers_url": careers_url, "jobs": list(uniq.values()), "org": org_name, **found}


# ---------------------------------------------------------------------------
# Beobachtung über Läufe hinweg (erstes Sehen je Stelle) -> „seit über 30 Tagen offen“
# ---------------------------------------------------------------------------
def load_seen() -> dict:
    try:
        return json.loads(SEEN.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_seen(seen: dict) -> None:
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    SEEN.write_text(json.dumps(seen, sort_keys=True), encoding="utf-8")


def today_slice(doms: list[str], seen: dict, limit: int, today: dt.date) -> list[str]:
    """Firmen mit schon gesehenen Stellen jeden Tag (für „seit über 30 Tagen“), dazu ein täglich wechselnder Teil
    der übrigen Liste – so wird jede Seite höchstens einmal täglich abgerufen und die ganze Liste reihum geprüft."""
    tracked = [d for d in doms if seen.get(d)]
    rest = [d for d in doms if not seen.get(d)]
    room = max(0, limit - len(tracked))
    if not rest or not room:
        return tracked[:limit]
    start = (today.toordinal() * room) % len(rest)
    return tracked + (rest[start:] + rest[:start])[:room]


def remember(seen: dict, domain: str, jobs: list[dict], today: dt.date) -> None:
    """Erstes Sehen je Stelle festhalten; nicht mehr gesehene Stellen fallen heraus."""
    old = seen.get(domain, {})
    seen[domain] = {k: old.get(k, today.isoformat()) for k in (_key(j) for j in jobs)}


def _key(j: dict) -> str:
    return (j.get("url") or "").rstrip("/") or j.get("title", "").lower()


# ---------------------------------------------------------------------------
# Kandidat
# ---------------------------------------------------------------------------
def company_name(res: dict, domain: str) -> str:
    if res.get("org") and W.name_is_distinctive(res["org"]):
        return res["org"]
    m = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']{2,80})["\']', res["home_html"], re.I)
    if m:
        return W.page_text(m.group(1)).strip()
    t = re.split(r"\s+[|\-–—:]\s+", W.title_of(res["home_html"]) or "")
    parts = [p.strip() for p in t if p.strip()]
    stem = domain.split(".")[0].lower()
    for p in parts:
        if stem[:4] in re.sub(r"[^a-z]", "", p.lower()):
            return p
    return parts[-1] if parts and len(parts[-1]) <= 40 else domain.split(".")[0].title()


def to_candidate(domain: str, res: dict, country: str, seen: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    jobs = res["jobs"]
    first = seen.get(domain, {})
    since = []
    for j in jobs:
        d = [x for x in (j.get("date_posted"), first.get(_key(j))) if x and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x)]
        if d:
            since.append(min(d))
    since = [s for s in since if s <= today.isoformat()]
    oldest = min(since) if since else None
    titles = [j["title"] for j in jobs if j.get("title")][:3]
    name = title_case(company_name(res, domain))
    addr = next((j["address"] for j in jobs if (j.get("address") or {}).get("postalCode")), {}) or \
        W.postal_address_jsonld(res["home_html"]) or {}
    street = str(addr.get("streetAddress") or "")
    zip_ = str(addr.get("postalCode") or "")
    if country == "UK":
        zip_ = zip_.upper()
    return candidate(
        source="careers", source_id=domain, country=country, source_url=res["careers_url"],
        source_date=today, event_date=today, name=name, legal_name=name,
        street=title_case(street) if street.isupper() else street, city=str(addr.get("addressLocality") or ""),
        state=str(addr.get("addressRegion") or "") if country == "US" else "", zip=zip_,
        website="https://" + domain,
        facts={"open_roles": len(jobs), "oldest_posted": oldest, "titles": titles, "checked_on": today,
               "careers_url": res["careers_url"], "ats": res["kind"],
               "registry_numbers": W.registry_numbers(W.page_text(res["home_html"]), country)[:2]},
    )
