"""UK: kleine und mittlere Firmen (KMU), die einen öffentlichen Auftrag gewonnen haben – Find a Tender (OCDS).
Quellen-Scout 02.10.2026 (S1 Personalvermittlung UK).

Amtliche Schnittstelle des Cabinet Office, ohne Schlüssel, Open Government Licence v3.0, kein Scraping:
https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=award (100 Meldungen je Seite, Cursor)

Signal (ehrlich): „won a public contract (Titel, Auftraggeber, Datum)“ – KEINE offene Stelle. Ein gewonnener
Auftrag ist ein Anlass für zusätzliches Personal, mehr behaupten wir nicht. Datum = release.date der Meldung.

Kontaktdaten nur so, wie die Quelle sie für den LIEFERANTEN liefert (Telefon, E-Mail, Adresse, Website) –
nie die Kontakte des Auftraggebers. Fehlende Website/E-Mail ergänzt die vorhandene kostenlose Anreicherung
(eigene Website, Companies-House-Nummer aus `identifier` GB-COH), nie erratene E-Mails.
Freundlich: eigener Bot-Name, höchstens 1 Abruf je Sekunde, höchstens `max_pages` Seiten je Lauf.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import time
from collections import Counter
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
NOTICE = "https://www.find-tender.service.gov.uk/Notice/"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+company-signal research)", "Accept": "application/json"}
SOURCE_NAME = "Find a Tender (UK Cabinet Office), Open Government Licence v3.0"
UK_NAMES = {"united kingdom", "uk", "gb", "england", "scotland", "wales", "northern ireland", "great britain"}
# Wettbewerber unserer Käufer (Vermittler) und keine KMU-Käufer von Personaldiensten (öffentliche Stellen, Vereine)
SKIP_NAME = re.compile(r"\b(recruit\w*|staffing|personnel|employment agency|locums?|talent|workforce solutions|"
                       r"council|nhs|trust|university|college|school|academy|charity|cic|church|police)\b", re.I)
SKIP_SCHEMES = {"GB-NHS", "GB-CHC", "GB-SC", "GB-NIC", "GB-EDU", "GB-GOR", "GB-UKPRN"}
TITLE_MAX = 110
# Tages-Zwischenspeicher: jede Seite der Schnittstelle höchstens einmal am Tag abrufen (CLAUDE.md §2)
CACHE = Path("out/cache/find_tender.json")


def fetch(since: dt.date, max_pages: int = 10, log=print, session=None, pause: float = 1.0) -> list[dict]:
    """Zuschlagsmeldungen seit `since` (neueste zuerst), höchstens `max_pages` Abrufe."""
    s = session or requests.Session()
    url = f"{API}?stages=award&limit=100&updatedFrom={since.isoformat()}T00:00:00"
    out, pages = [], 0
    while url and pages < max_pages:
        if pages:
            time.sleep(pause)
        r = s.get(url, headers=UA, timeout=90)
        r.raise_for_status()
        d = r.json()
        out += d.get("releases") or []
        pages += 1
        url = (d.get("links") or {}).get("next")
    log(f"Find a Tender: {len(out)} Zuschlagsmeldungen seit {since} ({pages} Abrufe)")
    return out


def _day(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _clean(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def short_title(t: str, n: int = TITLE_MAX) -> str:
    """Auftragstitel ohne Gedankenstriche, an einer Wortgrenze gekürzt (keine halben Zahlen)."""
    t = _clean(re.sub(r"\s*[–—]+\s*", ", ", _clean(t))).strip(" .,-")
    if len(t) <= n:
        return t
    return t[:n].rsplit(" ", 1)[0].rstrip(" ,;:-(") + "…"


def nice_name(n: str) -> str:
    """'ACME SERVICES LIMITED LIMITED' -> 'Acme Services Limited' (Großschreibung und doppelte Rechtsform glätten)."""
    n = _clean(n)
    n = re.sub(r"\b(limited|ltd\.?|llp|plc)(\s+\1)+\b", r"\1", n, flags=re.I)
    return title_case(n) if n.isupper() else n


def _uk(addr: dict) -> bool:
    return _clean(addr.get("countryName") or addr.get("country")).lower() in UK_NAMES


def _company_number(p: dict) -> str:
    ids = [p.get("identifier") or {}] + list(p.get("additionalIdentifiers") or [])
    for i in ids:
        if i.get("scheme") == "GB-COH" and i.get("id"):
            num = re.sub(r"\s", "", str(i["id"])).upper()
            return num.zfill(8) if num.isdigit() else num
    return ""


def select(releases: list[dict], since: dt.date | None = None, log=print) -> list[dict]:
    """Zuschlagsmeldungen -> KMU-Lieferanten in Großbritannien (je Firma der neueste Zuschlag)."""
    sup: dict[str, dict] = {}
    why = Counter()
    for rel in releases:
        d = _day(rel.get("date"))
        if not d or (since and d < since):
            why["outside_window"] += 1
            continue
        parties = {p.get("id"): p for p in rel.get("parties") or []}
        buyer = nice_name((rel.get("buyer") or {}).get("name") or next(
            (p.get("name") for p in parties.values() if "buyer" in (p.get("roles") or [])), ""))
        title = short_title((rel.get("tender") or {}).get("title") or "")
        for a in rel.get("awards") or []:
            if a.get("status") not in (None, "", "active"):
                why["award_not_active"] += 1
                continue
            for ref in a.get("suppliers") or []:
                p = parties.get(ref.get("id")) or {}
                det, addr, cp = p.get("details") or {}, p.get("address") or {}, p.get("contactPoint") or {}
                name = nice_name(p.get("name") or ref.get("name"))
                if not name:
                    continue
                if det.get("scale") != "sme":
                    why["not_sme"] += 1
                    continue
                if not _uk(addr):
                    why["outside_uk"] += 1
                    continue
                schemes = {(p.get("identifier") or {}).get("scheme")} | {
                    i.get("scheme") for i in p.get("additionalIdentifiers") or []}
                if SKIP_NAME.search(name) or schemes & SKIP_SCHEMES:
                    why["recruiter_or_public_body"] += 1
                    continue
                if not (title and buyer):
                    why["no_title_or_buyer"] += 1
                    continue
                num = _company_number(p)
                key = num or re.sub(r"[^a-z0-9]", "", name.lower())
                old = sup.get(key)
                if old and old["date"] >= d.isoformat():
                    old["awards"] += 1
                    continue
                sup[key] = {
                    "key": key, "name": name, "company_number": num, "ocid": rel.get("ocid") or "",
                    "notice": str(rel.get("id") or ""), "date": d.isoformat(), "title": title, "buyer": buyer,
                    "street": _clean(addr.get("streetAddress")), "city": _clean(addr.get("locality")),
                    "zip": _clean(addr.get("postalCode")).upper(), "phone": _clean(cp.get("telephone")),
                    "email": _clean(cp.get("email")).lower(), "person": _clean(cp.get("name")),
                    "website": _clean(det.get("url")), "awards": (old["awards"] + 1) if old else 1,
                }
    out = sorted(sup.values(), key=lambda x: x["date"], reverse=True)
    log(f"Find a Tender: {len(out)} KMU-Lieferanten in UK; ausgeschlossen {dict(why)}")
    return out


def _notice_url(e: dict) -> str:
    m = re.match(r"^(\d{6}-\d{4})", e.get("notice") or "")
    return NOTICE + m.group(1) if m else API + "?stages=award"


def to_candidate(e: dict) -> dict:
    d = dt.date.fromisoformat(e["date"])
    web = e["website"]
    if web and not re.match(r"^https?://", web, re.I):
        web = "https://" + web
    return candidate(
        source="find_tender", source_id=e["key"], country="UK", source_url=_notice_url(e), source_date=d,
        event_date=d, name=e["name"], legal_name=e["name"], street=e["street"], city=e["city"], state="",
        zip=e["zip"], phone=e["phone"], email=e["email"], website="",
        person_name=e["person"] if len(e["person"].split()) >= 2 else "",
        person_role="Contact named in the contract award notice" if len(e["person"].split()) >= 2 else "",
        facts={"contract_title": e["title"], "buyer": e["buyer"], "awarded_on": d, "awards_in_window": e["awards"],
               "company_number": e["company_number"], "ocid": e["ocid"], "listed_website": web},
    )


def cached_fetch(since: dt.date, max_pages: int, log=print, path: Path = CACHE) -> list[dict]:
    """Wie fetch(), aber höchstens einmal am Tag: Meldungen von heute aus dem Zwischenspeicher."""
    today = dt.date.today().isoformat()
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if d.get("day") == today and d.get("since") == since.isoformat() and d.get("pages", 0) >= max_pages:
            log(f"Find a Tender: {len(d['releases'])} Meldungen aus dem Tages-Zwischenspeicher")
            return d["releases"]
    except (OSError, ValueError, KeyError):
        pass
    rel = fetch(since, max_pages, log=log)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"day": today, "since": since.isoformat(), "pages": max_pages, "releases": rel}),
                    encoding="utf-8")
    return rel


def load(since: dt.date, max_pages: int = 10, log=print) -> list[dict]:
    return [to_candidate(e) for e in select(cached_fetch(since, max_pages, log=log), since, log=log)]
