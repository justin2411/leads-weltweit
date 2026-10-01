"""SEC Form D (EDGAR, kostenlos, ohne Schlüssel): Firmen, die gerade privat Kapital aufgenommen haben.

Täglicher Index aller Einreichungen -> je Form D die strukturierte primary_doc.xml: Firma, Adresse, Telefon,
Gründungsjahr, Branche, Umsatzklasse, Betrag, Anzahl Investoren, Geschäftsführung (Executive Officers).
SEC-Regeln: Absenderkennung im User-Agent, höchstens 10 Abrufe pro Sekunde (wir bleiben bei ~5).
"""
from __future__ import annotations

import datetime as dt
import re
import time
import xml.etree.ElementTree as ET

import requests

from extraktor.model import candidate, title_case

UA = "NextGen Profit lead research info@nextgen-profit.de"
INDEX = "https://www.sec.gov/Archives/edgar/daily-index/{y}/QTR{q}/form.{d:%Y%m%d}.idx"
DOC = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/primary_doc.xml"
FILING = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}-index.htm"
PAUSE = 0.2

# Fonds, Immobilien-Zweckgesellschaften und Finanzvehikel sind keine Leads (kein Personal, keine Buchhaltung …)
NAME_SKIP = re.compile(r"\b(fund|funds|l\.?p\.?|partners|investors|investment|investments|capital|reit|properties|realty|"
                       r"spv|series|trust|opportunit(y|ies)|feeder|master|offshore|co-invest|drilling program|"
                       r"apartments|members llc|acquisition|holdings? lp|portfolio|lending|mortgage|notes?)\b", re.I)
INDUSTRY_SKIP = {"Pooled Investment Fund", "REITS and Finance", "Commercial", "Residential", "Other Real Estate",
                 "Investing", "Banking & Financial Services", "Insurance", "Commercial Banking", "Investment Banking",
                 "Other Banking and Financial Services", "Lodging and Conventions"}
US_STATES = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND "
                "OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())


def _session(session: requests.Session | None) -> requests.Session:
    s = session or requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, deflate"})
    return s


def index_entries(day: dt.date, session: requests.Session | None = None) -> list[dict]:
    """Form-D-Erstmeldungen (keine Änderungen D/A) eines Tages: {'company','cik','acc','filed'}."""
    s = _session(session)
    r = s.get(INDEX.format(y=day.year, q=(day.month - 1) // 3 + 1, d=day), timeout=60)
    if r.status_code in (403, 404):  # Wochenende/Feiertag oder heutiger Index noch nicht veröffentlicht
        return []
    r.raise_for_status()
    out = []
    for line in r.text.splitlines():
        if not line.startswith("D "):
            continue
        m = re.match(r"^D\s+(.+?)\s{2,}(\d+)\s+(\d{8})\s+(\S+)", line)
        if not m:
            continue
        acc = m.group(4).rsplit("/", 1)[-1].removesuffix(".txt")
        out.append({"company": m.group(1).strip(), "cik": m.group(2), "acc": acc,
                    "filed": dt.datetime.strptime(m.group(3), "%Y%m%d").date()})
    return out


def _t(node, path: str) -> str:
    el = node.find(path) if node is not None else None
    return (el.text or "").strip() if el is not None and el.text else ""


def parse(xml: str) -> dict:
    root = ET.fromstring(xml)
    iss = root.find("primaryIssuer")
    addr = iss.find("issuerAddress") if iss is not None else None
    off = root.find("offeringData")
    persons = []
    for p in root.findall("relatedPersonsList/relatedPersonInfo"):
        persons.append({
            "first": _t(p, "relatedPersonName/firstName"), "middle": _t(p, "relatedPersonName/middleName"),
            "last": _t(p, "relatedPersonName/lastName"),
            "relationships": [(e.text or "").strip() for e in p.findall("relatedPersonRelationshipList/relationship")],
            "clarification": _t(p, "relationshipClarification"),
        })
    sig = off.find("signatureBlock/signature") if off is not None else None
    return {
        "name": _t(iss, "entityName"), "street": _t(addr, "street1"), "street2": _t(addr, "street2"),
        "city": _t(addr, "city"), "state": _t(addr, "stateOrCountry"), "zip": _t(addr, "zipCode"),
        "phone": _t(iss, "issuerPhoneNumber"), "entity_type": _t(iss, "entityType"),
        "year_of_inc": _t(iss, "yearOfInc/value"), "within_five_years": _t(iss, "yearOfInc/withinFiveYears") == "true",
        "industry": _t(off, "industryGroup/industryGroupType"), "revenue_range": _t(off, "issuerSize/revenueRange"),
        "is_amendment": _t(off, "typeOfFiling/newOrAmendment/isAmendment") == "true",
        "first_sale": _t(off, "typeOfFiling/dateOfFirstSale/value"),
        "offering_amount": _t(off, "offeringSalesAmounts/totalOfferingAmount"),
        "amount_sold": _t(off, "offeringSalesAmounts/totalAmountSold"),
        "investors": _t(off, "investors/totalNumberAlreadyInvested"),
        "equity": _t(off, "typesOfSecuritiesOffered/isEquityType") == "true",
        "debt": _t(off, "typesOfSecuritiesOffered/isDebtType") == "true",
        "persons": persons,
        "signer": _t(sig, "nameOfSigner"), "signer_title": _t(sig, "signatureTitle"),
        "signed_on": _t(sig, "signatureDate"),
    }


def _num(v: str) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def executive(doc: dict) -> tuple[str, str]:
    """(Name, Rolle) der ersten echten Person mit 'Executive Officer'; Rolle aus der Unterschrift, wenn passend."""
    for p in doc["persons"]:
        first, last = p["first"], p["last"]
        if not first or first.upper() in ("N/A", "NA", "NONE", "-") or not last:
            continue
        if "Executive Officer" not in p["relationships"]:
            continue
        name = " ".join(x for x in (first, last) if x)
        role = "Executive Officer"
        if doc.get("signer") and last.lower() in doc["signer"].lower() and doc.get("signer_title"):
            role = doc["signer_title"]
        elif p["clarification"]:
            role = p["clarification"]
        return title_case(name), role.strip()[:60]
    return "", ""


def wanted(entry: dict) -> bool:
    return not NAME_SKIP.search(entry["company"])


def to_candidate(entry: dict, doc: dict) -> dict | None:
    """Nur operative US-Firmen; Fonds/Immobilien/Finanzvehikel, Änderungsmeldungen und Ausland fallen raus."""
    if doc["is_amendment"] or doc["state"] not in US_STATES or doc["industry"] in INDUSTRY_SKIP:
        return None
    if NAME_SKIP.search(doc["name"]):
        return None
    person, role = executive(doc)
    acc_nodash = entry["acc"].replace("-", "")
    facts = {
        "cik": entry["cik"], "filed_on": entry["filed"], "industry": doc["industry"],
        "revenue_range": doc["revenue_range"], "year_of_inc": _num(doc["year_of_inc"]),
        "first_sale": doc["first_sale"] or None, "offering_amount": _num(doc["offering_amount"]),
        "amount_sold": _num(doc["amount_sold"]), "investors": _num(doc["investors"]),
        "equity": doc["equity"], "debt": doc["debt"], "entity_type": doc["entity_type"],
        "n_persons": len(doc["persons"]),
    }
    return candidate(
        source="sec_form_d", source_id=f"{entry['cik']}:{entry['acc']}",
        source_url=FILING.format(cik=int(entry["cik"]), acc=entry["acc"]),
        source_date=entry["filed"], event_date=entry["filed"],
        name=title_case(doc["name"]), legal_name=title_case(doc["name"]),
        street=title_case(doc["street"]), city=title_case(doc["city"]), state=doc["state"], zip=(doc["zip"] or "")[:5],
        phone=doc["phone"], person_name=person, person_role=role, facts=facts,
    ) | {"_doc_url": DOC.format(cik=int(entry["cik"]), acc=acc_nodash)}


def fetch(days: int = 30, until: dt.date | None = None, session: requests.Session | None = None,
          max_docs: int = 4000, log=print) -> list[dict]:
    """Form-D-Kandidaten der letzten `days` Tage (neueste zuerst)."""
    s = _session(session)
    until = until or dt.date.today()
    out, fetched = [], 0
    for back in range(days):
        day = until - dt.timedelta(days=back)
        if day.weekday() >= 5:
            continue
        try:
            entries = [e for e in index_entries(day, s) if wanted(e)]
        except requests.RequestException as exc:
            log(f"  Form D Index {day}: {exc}")
            continue
        time.sleep(PAUSE)
        for e in entries:
            if fetched >= max_docs:
                return out
            url = DOC.format(cik=int(e["cik"]), acc=e["acc"].replace("-", ""))
            try:
                r = s.get(url, timeout=30)
                fetched += 1
                time.sleep(PAUSE)
                if r.status_code != 200:
                    continue
                c = to_candidate(e, parse(r.text))
            except (requests.RequestException, ET.ParseError):
                continue
            if c:
                out.append(c)
        log(f"  Form D {day}: {len(entries)} Meldungen geprüft, {len(out)} operative Firmen bisher")
    return out
