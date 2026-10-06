"""UK: Premium-Leads für Webagenturen (S2) aus dem ICO-Register der Gebührenzahler (Register of fee payers).

Öffentliches Register des Information Commissioner's Office, täglicher Massendownload ohne Konto und ohne Schlüssel
(`register-of-data-controllers-<Datum>.zip`, verlinkt auf der Download-Seite; Open Government Licence – die Lizenz
gilt laut ICO nicht für personenbezogene Daten, deshalb: Ansprechperson nur, wenn die Firma selbst auf die Person
lautet (Einzelunternehmer = Inhaber), sonst nur die Rolle; robots.txt erlaubt alles außer /private und /restricted,
Crawl-delay 6 -> 2 Abrufe am Tag).

Anlass (Quellen-Scout R42, 05.10.2026): `Start_date_of_registration` = Tag der ersten Eintragung als Verantwortlicher
(bei Verlängerung bleibt das Datum, neue Nummer nur bei Neuanmeldung) = „neu beim ICO angemeldet“. Höchstens NEW_DAYS
Tage alt, keine Behörde, mit Kontakt-E-Mail und -Telefon aus dem Register. Kombi mit „keine Website“: nur Freemail
(eigene Mail-Domain = vermutlich Website, raus wie bei RGE/Bio/Charity); ob es wirklich keine Website gibt, prüft die
normale Anreicherung und die Drei-Stufen-Freigabe.

Abruf: einmal am Tag (eigener Job `uk-ico` im Lead-Werk, Merker vor dem Abruf), behalten werden nur frische Einträge
mit Kontakt -> Zwischenspeicher `out/cache/uk_ico.json`. Die Teile des Lead-Werks lesen nur diesen.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

SOURCE = "ico_register"
SITE = "https://ico.org.uk"
PAGE = SITE + "/about-the-ico/what-we-do/register-of-fee-payers/download-the-register/"
LINK = re.compile(r'href="(/media2/[^"]+/register-of-data-controllers-\d{4}-\d{2}-\d{2}\.zip)"')
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
CACHE = Path(os.environ.get("EXTRAKTOR_ICO", "out/cache/uk_ico.json"))
RADAR_CACHE = Path(os.environ.get("EXTRAKTOR_ICO_RADAR", "out/cache/uk_ico_radar.json"))
RADAR_DAYS = 14  # Radar nur Premium-fähig (lib/premium.PREMIUM_MAX_AGE)
RADAR_KEEP = ("Registration_number", "Organisation_name", "Trading_names", "Organisation_postcode",
              "Start_date_of_registration", "Payment_tier", "Public_register_entry_URL")
MAX_AGE = 20 * 3600
NEW_DAYS = 30  # gespeichert wird bis 30 Tage (Reihenfolge); Premium zählt lib/premium.py nur bis 14 Tage
FREEMAIL = re.compile(r"@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|btinternet|sky|msn|protonmail|"
                      r"proton|ymail|mail|gmx|virginmedia|talktalk|ntlworld|blueyonder)\.", re.I)
TITLE = re.compile(r"^(mr|mrs|ms|miss|mx|dr|rev|revd|prof|sir|dame|lady|lord)\.?\s+", re.I)
LEGAL = re.compile(r"\b(ltd|limited|llp|plc|cic)\b\.?", re.I)
POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$")
KEEP = ("Registration_number", "Organisation_name", "Organisation_address_line_1", "Organisation_address_line_2",
        "Organisation_address_line_3", "Organisation_address_line_4", "Organisation_address_line_5",
        "Organisation_postcode", "Start_date_of_registration", "Trading_names", "Payment_tier",
        "DPO_or_Person_responsible_for_DP_First_name", "DPO_or_Person_responsible_for_DP_Last_name",
        "DPO_or_Person_responsible_for_DP_Email", "DPO_or_Person_responsible_for_DP_Phone",
        "Public_register_entry_URL")


def _date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(s or "")[:10])
    except ValueError:
        return None


def fresh_age(row: dict, today: dt.date) -> int | None:
    """Alter der Eintragung in Tagen, wenn 0 … NEW_DAYS und keine Behörde; sonst None."""
    if (row.get("Public_authority") or "N").strip().upper() == "Y":
        return None
    start = _date(row.get("Start_date_of_registration"))
    if not start:
        return None
    age = (today - start).days
    return age if 0 <= age <= NEW_DAYS else None


def select(rows, today: dt.date) -> list[dict]:
    """Frische Eintragungen mit Kontakt-E-Mail und -Telefon (nur die nötigen Felder)."""
    out = []
    for r in rows:
        if fresh_age(r, today) is None:
            continue
        if not ((r.get("DPO_or_Person_responsible_for_DP_Email") or "").strip()
                and (r.get("DPO_or_Person_responsible_for_DP_Phone") or "").strip()):
            continue
        out.append({k: (r.get(k) or "").strip() for k in KEEP})
    return out


def radar_rows(rows, today: dt.date) -> list[dict]:
    """Frische Eintragungen (≤ RADAR_DAYS, keine Behörde, mit PLZ) nur mit Firmenfeldern – ohne Kontaktperson,
    E-Mail und Telefon (Anlass für lib/uk_ico_radar.py, Kontakt kommt aus dem eigenen Bestand)."""
    out = []
    for r in rows:
        age = fresh_age(r, today)
        if age is None or age > RADAR_DAYS or not (r.get("Organisation_postcode") or "").strip():
            continue
        out.append({k: (r.get(k) or "").strip() for k in RADAR_KEEP})
    return out


def cached() -> list[dict]:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else []
    except ValueError:
        return []


def _get(url: str, log=print, stream: bool = False):
    for attempt in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=300, stream=stream)
            r.raise_for_status()
            return r
        except requests.RequestException as exc:
            log(f"ICO-Register: Abruf fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("ICO-Register nicht erreichbar")


def download(log=print, today: dt.date | None = None) -> list[dict]:
    """Tagesabruf (Download-Seite + ZIP); Zwischenspeicher jünger als MAX_AGE -> kein Abruf."""
    today = today or dt.date.today()
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return cached()
    m = LINK.search(_get(PAGE, log).text)
    if not m:
        raise RuntimeError("ICO-Register: kein Download-Link auf der Seite")
    time.sleep(6)  # Crawl-delay laut robots.txt
    with tempfile.TemporaryFile() as tmp:
        for chunk in _get(SITE + m.group(1), log, stream=True).iter_content(1 << 20):
            tmp.write(chunk)
        tmp.seek(0)
        with zipfile.ZipFile(tmp) as z:
            name = next(n for n in z.namelist() if n.endswith(".csv"))
            with z.open(name) as f:
                text = io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace", newline="")
                fresh = [r for r in csv.DictReader(text) if fresh_age(r, today) is not None]
    out = select(fresh, today)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    # Premium-Radar UK (Scout R58, lib/uk_ico_radar.py): alle frischen Eintragungen ohne Personendaten als Anlass für
    # Firmen im eigenen Bestand – derselbe Abruf, keine zusätzliche Anfrage
    RADAR_CACHE.write_text(json.dumps(radar_rows(fresh, today), ensure_ascii=False), encoding="utf-8")
    log(f"ICO-Register: {len(out)} neu eingetragene Verantwortliche mit Kontakt (≤ {NEW_DAYS} Tage)")
    return out


def address(r: dict) -> tuple[str, str] | None:
    """(Straße, Ort): Ort = letzte Adresszeile ohne Ziffern (Grafschaft am Ende wird nicht als Ort genommen, wenn
    davor eine Zeile ohne Ziffern steht), Straße = erste Zeile mit Hausnummer, sonst erste Zeile."""
    from extraktor.sources.uk_charity import COUNTIES
    lines = [re.sub(r"\s+", " ", r.get(f"Organisation_address_line_{i}") or "").strip(" ,") for i in range(1, 6)]
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
    return v if 10 <= len(re.sub(r"\D", "", v)) <= 13 else ""


def _strip_title(s: str) -> str:
    return TITLE.sub("", re.sub(r"\s+", " ", s or "").strip())


def firm_name(r: dict) -> tuple[str, bool] | None:
    """(Anzeigename, lautet auf eine Person). Firmen mit Rechtsform behalten ihren Namen; Einzelunternehmer (Name mit
    Anrede oder = Kontaktperson) heißen nach dem ersten Handelsnamen; ohne Handelsnamen -> None."""
    org = re.sub(r"\s+", " ", r.get("Organisation_name") or "").strip()
    if not org:
        return None
    if LEGAL.search(org):
        return org, False
    last = (r.get("DPO_or_Person_responsible_for_DP_Last_name") or "").strip().lower()
    personal = bool(TITLE.match(org)) or bool(last and last in org.lower().split())
    trade = next((t.strip() for t in (r.get("Trading_names") or "").split("|") if t.strip()), "")
    if personal:
        return (trade, True) if trade and trade.lower() != org.lower() else None
    return org, False


def person(r: dict, org: str) -> str:
    """Inhaber als Ansprechperson nur bei Einzelunternehmern, deren Eintrag auf genau diese Person lautet."""
    first = (r.get("DPO_or_Person_responsible_for_DP_First_name") or "").strip()
    last = (r.get("DPO_or_Person_responsible_for_DP_Last_name") or "").strip()
    if not (first and last) or not re.fullmatch(r"[A-Za-z'\- ]{2,}", first + last):
        return ""
    words = _strip_title(org).lower().split()
    if last.lower() not in words or first.lower() not in words:
        return ""
    s = f"{first} {last}"
    return " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")) for w in s.split()) \
        if s.isupper() or s.islower() else s


def companies(rows: list[dict], today: dt.date | None = None) -> list[dict]:
    """Frische Eintragungen mit Freemail, Telefon, Ort und gültiger Postleitzahl (eine Zeile je Registernummer)."""
    today = today or dt.date.today()
    out, seen = [], set()
    for r in rows:
        num = r.get("Registration_number") or ""
        if not num or num in seen or fresh_age(r, today) is None:
            continue
        seen.add(num)
        em = (r.get("DPO_or_Person_responsible_for_DP_Email") or "").strip().lower()
        if not FREEMAIL.search(em) or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", em):
            continue
        nm = firm_name(r)
        pc = re.sub(r"\s+", " ", (r.get("Organisation_postcode") or "").upper()).strip()
        adr, phone = address(r), _clean_phone(r.get("DPO_or_Person_responsible_for_DP_Phone") or "")
        if nm and adr and phone and POSTCODE.match(pc):
            out.append(dict(r, _adr=adr, _pc=pc, _phone=phone, _name=nm[0], _personal=nm[1], _email=em))
    return out


def to_candidate(d: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    start = _date(d["Start_date_of_registration"])
    name = title_case(d["_name"]) if d["_name"].isupper() or d["_name"].islower() else d["_name"]
    who = person(d, d.get("Organisation_name") or "") if d.get("_personal") else ""
    num = d["Registration_number"]
    return candidate(
        source=SOURCE, source_id=num, country="UK",
        source_url=d.get("Public_register_entry_URL") or f"{SITE}/ESDWebPages/Entry/{num}",
        source_date=today, event_date=start, name=name, legal_name=d.get("Organisation_name") or "",
        street=title_case(d["_adr"][0]), city=title_case(d["_adr"][1]), zip=d["_pc"], phone=d["_phone"],
        email=d["_email"], person_name=who, person_role="Owner" if who else "",
        facts={"category": "Newly registered data controller (ICO)", "ico_number": num, "checked_on": today,
               "ico_new": {"date": start.isoformat(), "tier": d.get("Payment_tier") or ""}},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None, skip_phones: set[str] | None = None) -> list[dict]:
    """Bis zu `limit` neu eingetragene Verantwortliche mit Freemail, neueste zuerst (exclude = schon gespeicherte
    Registernummern; skip_phones = Telefon-Schlüssel aus overture.phone_key, die schon anderswo stehen)."""
    from extraktor.sources.overture import phone_key
    rows = companies(cached())
    rows.sort(key=lambda d: (d.get("Start_date_of_registration") or "", d["Registration_number"]), reverse=True)
    skip = skip_phones or set()
    left = [d for d in rows if not (exclude and d["Registration_number"] in exclude)
            and phone_key(d["_phone"]) not in skip]
    out = [to_candidate(d) for d in (left if limit is None else left[:limit])]
    log(f"ICO-Register: {len(rows)} neue Eintragungen mit Freemail und Kontakt, {len(rows) - len(left)} schon "
        f"bekannt/in Overture, {len(out)} ausgewählt")
    return out


if __name__ == "__main__":  # Tagesabruf (Job `uk-ico` im Lead-Werk)
    download()
    sys.exit(0)
