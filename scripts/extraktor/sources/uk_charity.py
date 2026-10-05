"""UK: Premium-Leads für Webagenturen (S2) aus dem Register der Charity Commission for England and Wales.

Offener Massendownload (Register of Charities, „Data download“, Open Government Licence v3, ohne Konto und ohne
Schlüssel; robots.txt des Registers ohne Disallow), täglich neu erzeugt:
`publicextract.charity.zip` (je Charity Name, Status, Registrierungsdatum, Kontaktadresse, Telefon, E-Mail, Website)
und `publicextract.charity_trustee.zip` (Trustees mit Namen und Vorsitz).

Anlass (Quellen-Scout R38, 05.10.2026): `date_of_registration` = Tag der Eintragung als Charity (neu registriert).
Höchstens NEW_DAYS Tage alt, Status „Registered“, Hauptorganisation (keine verbundene Unter-Charity), ohne Website im
Register = Kombi-Anlass „neu registriert + keine Website“ (lib/premium.py, `details.dated_event`). Ob es wirklich
keine Website gibt, prüft danach die normale Anreicherung und die Drei-Stufen-Freigabe. Ansprechperson = Vorsitz der
Trustees laut Register (natürliche Person); ohne Vorsitz keine Person (die Prüfung nimmt dann die Rolle).

Abruf: einmal am Tag beide Dateien (eigener Job `uk-charity` im Lead-Werk, Merker vor dem Abruf), behalten werden
nur frische Einträge -> Zwischenspeicher `out/cache/uk_charity.json`. Die Teile des Lead-Werks lesen nur diesen.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import zipfile
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

SOURCE = "charity_commission"
BASE = "https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/publicextract.{}.zip"
PAGE_URL = "https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/{}"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
CACHE = Path(os.environ.get("EXTRAKTOR_CHARITY", "out/cache/uk_charity.json"))
MAX_AGE = 20 * 3600
NEW_DAYS = 30  # gespeichert wird bis 30 Tage (Reihenfolge); Premium zählt lib/premium.py nur bis 14 Tage
KEEP_UPPER = re.compile(r"\b(cio|cic|uk|pta|ptfa|fc|afc|nhs|cil)\b", re.I)
COUNTIES = {
    "england", "wales", "united kingdom", "uk", "avon", "bedfordshire", "berkshire", "buckinghamshire",
    "cambridgeshire", "cheshire", "cornwall", "cumbria", "derbyshire", "devon", "dorset", "durham", "co durham",
    "county durham", "east sussex", "west sussex", "essex", "gloucestershire", "hampshire", "herefordshire",
    "hertfordshire", "kent", "lancashire", "leicestershire", "lincolnshire", "merseyside", "middlesex", "norfolk",
    "northamptonshire", "northumberland", "nottinghamshire", "oxfordshire", "rutland", "shropshire", "somerset",
    "staffordshire", "suffolk", "surrey", "tyne and wear", "warwickshire", "west midlands", "wiltshire",
    "worcestershire", "east yorkshire", "north yorkshire", "south yorkshire", "west yorkshire", "greater london",
    "greater manchester", "isle of wight", "anglesey", "carmarthenshire", "ceredigion", "conwy", "denbighshire",
    "flintshire", "gwynedd", "monmouthshire", "pembrokeshire", "powys", "glamorgan", "south glamorgan",
    "mid glamorgan", "west glamorgan", "gwent", "clwyd", "dyfed",
}
POSTNOMINAL = re.compile(r"^\(?(frcs|frcp|msc|bsc|ba|ma|phd|md|mbe|obe|cbe|hons|ed|aca|fca|acca|llb|jp|dl|"
                         r"gmbpss|rgn|mrcgp|frsa|mba)\)?\.?$", re.I)
POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$")


def _date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(s or "")[:10])
    except ValueError:
        return None


def fresh_age(row: dict, today: dt.date) -> int | None:
    """Alter der Registrierung in Tagen, wenn 0 … NEW_DAYS, Status Registered und Hauptorganisation; sonst None."""
    if (row.get("charity_registration_status") or "") != "Registered" or str(row.get("linked_charity_number")) != "0":
        return None
    reg = _date(row.get("date_of_registration"))
    if not reg:
        return None
    age = (today - reg).days
    return age if 0 <= age <= NEW_DAYS else None


def _rows(blob: bytes):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.endswith(".txt"))
        with z.open(name) as f:
            text = io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace", newline="")
            yield from csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)


def _get(kind: str, log=print) -> bytes:
    for attempt in range(3):
        try:
            r = requests.get(BASE.format(kind), headers=UA, timeout=300)
            r.raise_for_status()
            return r.content
        except requests.RequestException as exc:
            log(f"Charity Commission: {kind} fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
            time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"Charity Commission ({kind}) nicht erreichbar")


def select(charities, trustees, today: dt.date) -> list[dict]:
    """Frische Charities (alle, auch mit Website – Filter später) mit ihren Trustees (natürliche Personen)."""
    keep = {}
    for r in charities:
        if fresh_age(r, today) is not None:
            keep[str(r.get("organisation_number"))] = {k: (v or "").strip() for k, v in r.items() if k and isinstance(v, (str, type(None)))}
    tr: dict[str, list[dict]] = {}
    for t in trustees:
        org = str(t.get("organisation_number"))
        if org in keep and (t.get("individual_or_organisation") or "") == "P":
            tr.setdefault(org, []).append({"name": (t.get("trustee_name") or "").strip(),
                                           "chair": (t.get("trustee_is_chair") or "") == "True"})
    return [dict(r, trustees=tr.get(org, [])) for org, r in keep.items()]


def cached() -> list[dict]:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else []
    except ValueError:
        return []


def download(log=print, today: dt.date | None = None) -> list[dict]:
    """Tagesabruf beider Dateien; Zwischenspeicher jünger als MAX_AGE -> kein Abruf."""
    today = today or dt.date.today()
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return cached()
    charities = _get("charity", log)
    trustees = _get("charity_trustee", log)
    out = select(_rows(charities), _rows(trustees), today)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    log(f"Charity Commission: {len(out)} neu registrierte Charities (≤ {NEW_DAYS} Tage)")
    return out


def address(r: dict) -> tuple[str, str] | None:
    """(Straße, Ort) aus den freien Adresszeilen: Grafschaften/Land raus, Ort = letzte Zeile ohne Ziffern,
    Straße = erste Zeile mit Hausnummer, sonst erste Zeile."""
    lines = [re.sub(r"\s+", " ", r.get(f"charity_contact_address{i}") or "").strip() for i in range(1, 6)]
    lines = [x for x in lines if x and x.lower().strip(" ,.") not in COUNTIES]
    if len(lines) < 2:
        return None
    town = next((x for x in reversed(lines[1:]) if not re.search(r"\d", x)), "")
    street = next((x for x in lines if re.match(r"^(flat |unit )?\d", x, re.I) and x != town), lines[0])
    if not town or town == street:
        return None
    return street, town


def _clean_phone(v: str) -> str:
    v = re.sub(r"\s+", " ", v or "").strip()
    return v if len(re.sub(r"\D", "", v)) >= 10 else ""


def person(raw: str) -> str:
    """'KATHERINE PAINE' -> 'Katherine Paine'; Titel (Mr/Mrs/Dr/Rev) raus; nur ein Wort -> ''."""
    s = re.sub(r"\s+", " ", (raw or "").split(",")[0].strip())
    s = " ".join(w for w in s.split(" ") if not POSTNOMINAL.match(w))
    s = re.sub(r"^(mr|mrs|ms|miss|dr|rev|revd|reverend|prof|sir|cllr)\.? ", "", s, flags=re.I)
    if len(s.split()) < 2 or not re.search(r"[A-Za-z]{2}", s) or re.search(r"\d", s):
        return ""
    if s.isupper() or s.islower():
        s = " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")) for w in s.split(" "))
    return s


def companies(rows: list[dict], today: dt.date | None = None) -> list[dict]:
    """Frische Charities ohne Website mit Telefon, E-Mail, Ort und gültiger Postleitzahl (eine Zeile je Charity)."""
    today = today or dt.date.today()
    out, seen = [], set()
    for r in rows:
        num = str(r.get("registered_charity_number") or "")
        if not num or num in seen or fresh_age(r, today) is None:
            continue
        seen.add(num)
        if (r.get("charity_contact_web") or "").strip():
            continue
        pc = re.sub(r"\s+", " ", (r.get("charity_contact_postcode") or "").upper()).strip()
        adr, phone = address(r), _clean_phone(r.get("charity_contact_phone") or "")
        name = re.sub(r"\s+", " ", r.get("charity_name") or "").strip()
        if adr and phone and POSTCODE.match(pc) and name and (r.get("charity_contact_email") or "").strip():
            out.append(dict(r, _adr=adr, _pc=pc, _phone=phone, _name=name))
    return out


def to_candidate(d: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    reg = _date(d["date_of_registration"])
    name = KEEP_UPPER.sub(lambda m: m.group(0).upper(), title_case(d["_name"]))
    chair = next((t for t in d.get("trustees") or [] if t.get("chair")), None)
    who = person((chair or {}).get("name") or "")
    if who and who.lower() == name.lower():
        who = ""
    num = str(d["registered_charity_number"])
    kind = d.get("charity_type") or ""
    return candidate(
        source=SOURCE, source_id=num, country="UK", source_url=PAGE_URL.format(num),
        source_date=today, event_date=reg, name=name, legal_name=d["_name"],
        street=title_case(d["_adr"][0]), city=title_case(d["_adr"][1]), zip=d["_pc"], phone=d["_phone"],
        email=(d.get("charity_contact_email") or "").strip().lower(),
        person_name=who, person_role="Chair of Trustees" if who else "",
        facts={"category": "Registered charity" + (f" ({kind})" if kind else ""), "charity_number": num,
               "company_number": d.get("charity_company_registration_number") or "", "checked_on": today,
               "charity_new": {"date": reg.isoformat(), "type": kind,
                               "activities": (d.get("charity_activities") or "")[:200]}},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None, skip_phones: set[str] | None = None) -> list[dict]:
    """Bis zu `limit` neu registrierte Charities ohne Website, neueste zuerst (exclude = schon gespeicherte
    Charity-Nummern; skip_phones = Telefon-Schlüssel aus overture.phone_key, die schon anderswo stehen)."""
    from extraktor.sources.overture import phone_key
    rows = companies(cached())
    rows.sort(key=lambda d: (d.get("date_of_registration") or "", str(d["registered_charity_number"])), reverse=True)
    skip = skip_phones or set()
    left = [d for d in rows if not (exclude and str(d["registered_charity_number"]) in exclude)
            and phone_key(d["_phone"]) not in skip]
    out = [to_candidate(d) for d in (left if limit is None else left[:limit])]
    log(f"Charity Commission: {len(rows)} neue Charities ohne Website mit Kontakt, {len(rows) - len(left)} schon "
        f"bekannt/in Overture, {len(out)} ausgewählt")
    return out


if __name__ == "__main__":  # Tagesabruf (Job `uk-charity` im Lead-Werk)
    download()
    sys.exit(0)
