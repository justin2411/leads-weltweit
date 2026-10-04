"""US: kleine Firmen (small business), die einen neuen Bundesauftrag gewonnen haben – USAspending.gov.
Quellen-Scout 04.10.2026 (S1 Personalvermittlung US), Gegenstück zu Find a Tender (UK).

Amtliche, offene Schnittstelle des US-Finanzministeriums (DATA Act), ohne Schlüssel, gemeinfrei (US-Regierungsdaten),
kein Scraping, api.usaspending.gov hat kein robots.txt:
POST https://api.usaspending.gov/api/v2/search/spending_by_award/ (100 Aufträge je Seite)

Filter: nur neue Aufträge (`new_awards_only`) an Firmen mit Kennzeichen „small business“ mit Sitz in den USA,
Auftragsarten A–D (Verträge, Abrufe), Wert ab `MIN_AMOUNT` (darunter selten zusätzliches Personal).
Signal (ehrlich): „was awarded a new federal contract (Gegenstand, Behörde, Datum)“ – KEINE offene Stelle.
Verlängerungen/Optionsjahre (OY, option year, extension, bridge …) zählen nicht als neuer Auftrag.

Kontaktdaten: die Quelle liefert nur Name und Sitzadresse. Website, Telefon und E-Mail ergänzt die vorhandene
kostenlose Anreicherung (eigene Website mit Abgleich von Name/Adresse), nie erratene E-Mails.
Freundlich: eigener Bot-Name, höchstens 1 Abruf je Sekunde, höchstens `max_pages` Seiten je Lauf,
Tages-Zwischenspeicher (jede Seite höchstens einmal am Tag).
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
from collections import Counter
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

API = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
AWARD = "https://www.usaspending.gov/award/"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+company-signal research)", "Accept": "application/json"}
SOURCE = "us_award"
PORTAL = "USAspending.gov"
MIN_AMOUNT = 150_000
CACHE = Path("out/cache/usaspending.json")
FIELDS = ["Award ID", "Recipient Name", "Recipient UEI", "Base Obligation Date", "Award Amount", "Awarding Agency",
          "Awarding Sub Agency", "Description", "generated_internal_id", "Recipient Location", "NAICS"]
# Wettbewerber unserer Käufer (Personaldienste) und Gebilde ohne eigene Belegschaft (Joint Ventures)
SKIP_NAME = re.compile(r"\b(recruit\w*|staffing|personnel|employment|locums?|talent|workforce|temps?|"
                       r"joint venture|jv|j\.v\.|university|college|school|church|tribe|tribal|county|city of)\b", re.I)
SKIP_NAICS = ("5613",)  # Employment Services
# keine neuen Aufträge, sondern Fortsetzungen: Optionsjahre, Verlängerungen, Überbrückungen
NOT_NEW = re.compile(r"\b(oy\s?\d|option\s+(year|period|one|two|three|four|five|\d)|sustain\w*|exercise|extension|extend|bridge|continu\w*|renewal|"
                     r"modification|mod\s?\d|follow[- ]on|recompete)\b", re.I)
# Beschreibungen, die keinen verständlichen Auftragsgegenstand nennen (Verwaltungstext) -> Firma auslassen
UNCLEAR = re.compile(r"\b(pricing period|period of performance|labor category|contractor shall|vendor:|seeks to|"
                     r"incorporated into|in accordance with|see attached|clin|not to exceed|nte)\b", re.I)
EO_CLAUSE = re.compile(r"\b(e\.?o\.?|executive order)\s?\d{5}\b", re.I)
LEAD_JUNK = re.compile(r"^((fund(ing)?|issue|award|new|provide funding (to|for)|fy\s?\d{2,4}|base( year| period)?|"
                       r"task order( for)?|delivery order( for)?|purchase order( for)?|bpa call( for)?)[\s:,-]+)+", re.I)
TAIL_JUNK = re.compile(r"([\s,;:-]+((task|delivery|call|purchase) order|do/to|t\.?o\.?|d\.?o\.?|order|bpa|"
                       r"award|fy\s?\d{2,4})(\s*[-#]?\s*\d+)?)+\s*$", re.I)
TITLE_MAX = 110
SMALL_WORDS = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "from"}
KEEP_UPPER = {"US", "USA", "VA", "DOD", "IT", "HVAC", "NASA", "FAA", "EPA", "DHS", "GSA", "NIH", "CDC", "FBI", "IRS",
              "USDA", "NPS", "USACE", "AF", "II", "III", "IV", "LED", "UPS", "ADA", "CCTV", "MRI", "CT", "EHR"}


def _body(since: dt.date, until: dt.date, page: int) -> dict:
    return {"filters": {"time_period": [{"start_date": since.isoformat(), "end_date": until.isoformat(),
                                         "date_type": "new_awards_only"}],
                        "award_type_codes": ["A", "B", "C", "D"], "recipient_type_names": ["small_business"],
                        "award_amounts": [{"lower_bound": MIN_AMOUNT}], "recipient_locations": [{"country": "USA"}]},
            "fields": FIELDS, "limit": 100, "page": page, "sort": "Base Obligation Date", "order": "desc"}


def fetch(since: dt.date, max_pages: int = 10, log=print, session=None, pause: float = 1.0) -> list[dict]:
    """Neue Aufträge an kleine US-Firmen seit `since` (neueste zuerst), höchstens `max_pages` Abrufe."""
    s = session or requests.Session()
    until = dt.date.today()
    out, page = [], 1
    while page <= max_pages:
        if page > 1:
            time.sleep(pause)
        r = s.post(API, json=_body(since, until, page), headers=UA, timeout=90)
        r.raise_for_status()
        d = r.json()
        out += d.get("results") or []
        if not (d.get("page_metadata") or {}).get("hasNext"):
            break
        page += 1
    log(f"USAspending: {len(out)} neue Aufträge an kleine Firmen seit {since} ({min(page, max_pages)} Abrufe)")
    return out


def _clean(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def _day(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def nice_text(t: str) -> str:
    """Behörden schreiben Beschreibungen meist in Großbuchstaben: in Satzform bringen, Abkürzungen behalten."""
    t = _clean(t)
    if re.search(r"[a-z]", t):
        return t
    words = []
    for i, w in enumerate(t.split(" ")):
        bare = re.sub(r"[^A-Za-z]", "", w)
        if bare.upper() in KEEP_UPPER or (any(ch.isdigit() for ch in w) and len(w) <= 10):
            words.append(w)
        elif i and bare.lower() in SMALL_WORDS:
            words.append(w.lower())
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def short_title(t: str, n: int = TITLE_MAX) -> str:
    """Auftragsgegenstand ohne Gedankenstriche und Vorspann („This is a …“), an einer Wortgrenze gekürzt;
    leer, wenn die Beschreibung keinen verständlichen Gegenstand nennt (dann kein Lead)."""
    t = html.unescape(_clean(t)).replace("\ufffd", "")
    t = re.sub(r"[^\x20-\x7e]", "", t)
    if UNCLEAR.search(t):
        return ""
    t = EO_CLAUSE.sub("", t)
    t = LEAD_JUNK.sub("", t.strip(" .,-"))
    t = TAIL_JUNK.sub("", t.strip(" .,-"))
    t = re.sub(r"\s*[–—]+\s*", ", ", _clean(t))
    t = re.sub(r"^(this (is a|is an|task order is for|order is for|contract is for|requirement is for|action is to)\s+)",
               "", t, flags=re.I)
    t = nice_text(t).strip(" .,-&/")
    if len([w for w in re.findall(r"[A-Za-z]+", t) if len(w) >= 3]) < 3 or len(t) < 15:
        return ""
    if len(t) <= n:
        return t
    return t[:n].rsplit(" ", 1)[0].rstrip(" ,;:-(") + "…"


def nice_agency(top: str) -> str:
    """Oberste Behörde („Department of Veterans Affairs“): Unterstellen wie „Office of Procurement Operations“
    sagen dem Leser nichts."""
    a = _clean(top)
    return title_case(a) if a.isupper() else a


def nice_category(label: str) -> str:
    """NAICS-Bezeichnung in Satzform ohne Klammerzusatz: 'CUSTOM COMPUTER PROGRAMMING SERVICES' ->
    'custom computer programming services' (nur Wörterbuchwörter, daher gefahrlos klein)."""
    t = re.sub(r"\s*\(.*?\)\s*", " ", _clean(label))
    return _clean(t).lower().strip(" ,.")


def select(rows: list[dict], since: dt.date | None = None, log=print) -> list[dict]:
    """Aufträge -> kleine US-Firmen mit neuem Auftrag (je Firma der neueste)."""
    sup: dict[str, dict] = {}
    why = Counter()
    for r in rows:
        d = _day(r.get("Base Obligation Date"))
        if not d or (since and d < since) or d > dt.date.today():
            why["outside_window"] += 1
            continue
        name = _clean(r.get("Recipient Name"))
        loc = r.get("Recipient Location") or {}
        naics = (r.get("NAICS") or {}).get("code") or ""
        desc = _clean(r.get("Description"))
        if not name:
            continue
        if (loc.get("location_country_code") or "USA") != "USA" or not loc.get("state_code"):
            why["outside_us"] += 1
            continue
        if SKIP_NAME.search(name) or str(naics).startswith(SKIP_NAICS):
            why["recruiter_jv_or_public"] += 1
            continue
        if not desc or NOT_NEW.search(desc):
            why["not_a_new_contract"] += 1
            continue
        title, agency = short_title(desc), nice_agency(r.get("Awarding Agency"))
        category = nice_category((r.get("NAICS") or {}).get("description"))
        if not category or not agency or not r.get("generated_internal_id"):
            why["no_category_agency_or_link"] += 1
            continue
        key = _clean(r.get("Recipient UEI")).upper() or re.sub(r"[^a-z0-9]", "", name.lower())
        old = sup.get(key)
        if old and old["date"] >= d.isoformat():
            old["awards"] += 1
            continue
        street = ", ".join(x for x in (_clean(loc.get("address_line1")), _clean(loc.get("address_line2"))) if x)
        sup[key] = {"key": key, "name": name, "uei": _clean(r.get("Recipient UEI")).upper(), "date": d.isoformat(),
                    "title": title, "agency": agency, "naics": str(naics),
                    "naics_label": category,
                    "street": title_case(street), "city": title_case(_clean(loc.get("city_name"))),
                    "state": _clean(loc.get("state_code")).upper(), "zip": _clean(loc.get("zip5")),
                    "award": _clean(r.get("generated_internal_id")), "awards": (old["awards"] + 1) if old else 1}
    out = sorted(sup.values(), key=lambda x: x["date"], reverse=True)
    log(f"USAspending: {len(out)} kleine US-Firmen mit neuem Auftrag; ausgeschlossen {dict(why)}")
    return out


def to_candidate(e: dict) -> dict:
    d = dt.date.fromisoformat(e["date"])
    name = title_case(e["name"])
    return candidate(
        source=SOURCE, source_id=e["key"], country="US", source_url=AWARD + e["award"], source_date=d,
        event_date=d, name=name, legal_name=name, street=e["street"], city=e["city"], state=e["state"],
        zip=e["zip"], phone="", email="", website="", person_name="", person_role="",
        facts={"contract_title": e["title"], "buyer": e["agency"], "awarded_on": d, "awards_in_window": e["awards"],
               "portal": PORTAL, "uei": e["uei"], "naics": e["naics"], "category": e["naics_label"]},
    )


def cached_fetch(since: dt.date, max_pages: int, log=print, path: Path = CACHE) -> list[dict]:
    """Wie fetch(), aber höchstens einmal am Tag: Aufträge von heute aus dem Zwischenspeicher."""
    today = dt.date.today().isoformat()
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if d.get("day") == today and d.get("since") == since.isoformat() and d.get("pages", 0) >= max_pages:
            log(f"USAspending: {len(d['rows'])} Aufträge aus dem Tages-Zwischenspeicher")
            return d["rows"]
    except (OSError, ValueError, KeyError):
        pass
    rows = fetch(since, max_pages, log=log)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"day": today, "since": since.isoformat(), "pages": max_pages, "rows": rows}),
                    encoding="utf-8")
    return rows


def load(since: dt.date, max_pages: int = 10, log=print) -> list[dict]:
    return [to_candidate(e) for e in select(cached_fetch(since, max_pages, log=log), since, log=log)]
