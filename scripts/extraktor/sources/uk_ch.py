"""UK: Neugründungen aus den kostenlosen Massendaten von Companies House (ohne Schlüssel, ohne Konto).

  BasicCompanyData (monatlich, ~500 MB): Name, Nummer, Sitz, Branche (SIC), Gründungsdatum, Status
  PSC-Snapshot (täglich, 32 Teile): Eigentümer ab 25 % (Personen mit maßgeblichem Einfluss) -> Ansprechperson

Das Register hat kein Telefon und keine E-Mail: die kommen nur von der eigenen Website der Firma, die erst gilt,
wenn sie die Registernummer, die Postleitzahl oder den vollen Namen belegt (enrich.py / lib.websites.score_match).
https://download.companieshouse.gov.uk/en_output.html, https://download.companieshouse.gov.uk/en_pscdata.html
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import zipfile
from pathlib import Path

import requests

from extraktor.model import candidate

BASE = "https://download.companieshouse.gov.uk/"
CACHE = Path(os.environ.get("EXTRAKTOR_CACHE_CH", "out/cache/ch"))

# Keine Leads: ruhende Firmen, Holdings, Immobilien-/Vermögensverwaltung, Fonds
SKIP_SIC = re.compile(r"^(99999|74990|64(1|2|3)\d\d|6820[1-9]|68100|68320|70100|66300|98000|98100|98200)")
SKIP_NAME = re.compile(r"\b(holdings?|property|properties|estates?|investments?|capital|nominees?|trustees?|"
                       r"spv|propco|lettings?)\b", re.I)


def _latest(page: str, pattern: str) -> str:
    html = requests.get(BASE + page, timeout=60).text
    files = re.findall(pattern, html)
    if not files:
        raise RuntimeError(f"keine Datei auf {page}")
    return sorted(set(files))[-1]


def _download(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        with requests.get(BASE + name, stream=True, timeout=300) as r:
            r.raise_for_status()
            tmp = path.with_suffix(".part")
            with open(tmp, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
            tmp.rename(path)
    return path


def _date(v: str) -> dt.date | None:
    try:
        return dt.datetime.strptime(v, "%d/%m/%Y").date()
    except (TypeError, ValueError):
        return None


def incorporations(since: dt.date, log=print) -> list[dict]:
    """Aktive Neugründungen ab `since` (Private Limited Company / LLP), Holdings/Immobilien/ruhend ausgenommen."""
    name = _latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    path = _download(name)
    rows = []
    with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        for row in reader:
            if len(row) < len(head):  # vereinzelt kaputte Zeilen in den Massendaten
                continue
            inc = _date(row[ix["IncorporationDate"]])
            if not inc or inc < since or row[ix["CompanyStatus"]] != "Active":
                continue
            if row[ix["CompanyCategory"]] not in ("Private Limited Company", "Limited Liability Partnership"):
                continue
            sic = [row[ix[f"SICCode.SicText_{i}"]] for i in range(1, 5) if row[ix[f"SICCode.SicText_{i}"]]]
            if not sic or all(SKIP_SIC.match(s) for s in sic) or SKIP_NAME.search(row[ix["CompanyName"]]):
                continue
            rows.append({k: row[ix[k]] for k in ("CompanyName", "CompanyNumber", "RegAddress.AddressLine1",
                                                 "RegAddress.AddressLine2", "RegAddress.PostTown", "RegAddress.PostCode",
                                                 "RegAddress.CareOf")} | {"inc": inc, "sic": sic})
    log(f"UK: {len(rows)} aktive Neugründungen seit {since} ({name})")
    return rows


def owners(numbers: set[str], log=print) -> dict[str, dict]:
    """Erste natürliche Person mit maßgeblichem Einfluss je Firmennummer aus dem PSC-Snapshot (32 Teile)."""
    found: dict[str, dict] = {}
    snap = _latest("en_pscdata.html", r'psc-snapshot-\d{4}-\d{2}-\d{2}_\d+of\d+\.zip')
    stamp, total = re.match(r"psc-snapshot-(\d{4}-\d{2}-\d{2})_\d+of(\d+)\.zip", snap).groups()
    for part in range(1, int(total) + 1):
        path = _download(f"psc-snapshot-{stamp}_{part}of{total}.zip")
        with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
            for line in io.TextIOWrapper(f, encoding="utf-8"):
                if '"individual-person-with-significant-control"' not in line:
                    continue
                cn = re.search(r'"company_number"\s*:\s*"([^"]+)"', line)
                if not cn or cn.group(1) not in numbers or cn.group(1) in found:
                    continue
                d = json.loads(line).get("data", {})
                if d.get("ceased_on"):
                    continue
                ne = d.get("name_elements") or {}
                first, last = ne.get("forename"), ne.get("surname")
                if first and last:
                    found[cn.group(1)] = {"name": f"{first.title()} {last.title()}",
                                          "role": "Owner (person with significant control, Companies House)",
                                          "since": d.get("notified_on")}
        if os.environ.get("EXTRAKTOR_KEEP_PSC") != "1":
            path.unlink(missing_ok=True)  # Platz sparen: jeder Teil ~70 MB
    log(f"UK: Eigentümer für {len(found)} von {len(numbers)} Firmen im PSC-Register")
    return found


def to_candidate(r: dict) -> dict:
    sic_txt = [s.split(" - ", 1)[-1] for s in r["sic"]]
    sic_codes = [s.split(" - ", 1)[0] for s in r["sic"]]
    street = ", ".join(x for x in (r["RegAddress.AddressLine1"], r["RegAddress.AddressLine2"]) if x)
    from extraktor.model import title_case
    return candidate(
        source="companies_house", source_id=r["CompanyNumber"], country="UK",
        source_url=f"https://find-and-update.company-information.service.gov.uk/company/{r['CompanyNumber']}",
        source_date=r["inc"], event_date=r["inc"], name=title_case(r["CompanyName"]),
        legal_name=title_case(r["CompanyName"]), street=title_case(street),
        city=title_case(r["RegAddress.PostTown"]), state="", zip=r["RegAddress.PostCode"].upper(),
        facts={"company_number": r["CompanyNumber"], "incorporated_on": r["inc"], "sic_codes": sic_codes,
               "sic": sic_txt, "care_of": bool(r.get("RegAddress.CareOf"))},
    )


def _key(name: str) -> str:
    from lib.websites import core_words
    return " ".join(core_words(name))


def match_companies(cands: list[dict], log=print) -> dict[str, str]:
    """Overture-Firma -> Companies-House-Nummer über Name (ohne Rechtsform) + Postleitzahl des Sitzes.
    Nur eindeutige Treffer; Firmen ohne Eintrag (Einzelunternehmer) bleiben ohne Nummer."""
    want = {}
    for c in cands:
        pc = (c.get("zip") or "").replace(" ", "").upper()
        if pc:
            want.setdefault((_key(c["name"]), pc), []).append(c["source_id"])
    pcs = {k[1] for k in want}
    name = _latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    hits: dict[tuple, set] = {}
    with zipfile.ZipFile(_download(name)) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        for row in reader:
            if len(row) < len(head) or row[ix["CompanyStatus"]] != "Active":
                continue
            pc = row[ix["RegAddress.PostCode"]].replace(" ", "").upper()
            if pc not in pcs:
                continue
            k = (_key(row[ix["CompanyName"]]), pc)
            if k in want:
                hits.setdefault(k, set()).add(row[ix["CompanyNumber"]])
    out = {}
    for k, nums in hits.items():
        if len(nums) == 1:
            for sid in want[k]:
                out[sid] = next(iter(nums))
    log(f"UK: {len(out)} von {len(cands)} Firmen eindeutig im Firmenregister gefunden")
    return out


def match_by_name(names: dict[str, str], log=print, with_sic: bool = False) -> dict:
    """{Kandidaten-ID: Firmenname} -> {Kandidaten-ID: Firmennummer}, nur wenn der Name (ohne Rechtsform) unter den
    aktiven Firmen genau einmal vorkommt und mindestens zwei Wörter oder 8 Zeichen hat (eindeutig genug).
    with_sic: {Kandidaten-ID: {"number", "sic": {SIC-Codes}}} (Namens-Pool im Kunden-Werk)."""
    want: dict[str, list[str]] = {}
    for sid, n in names.items():
        k = _key(n)
        if len(k.split()) >= 2 or len(k) >= 8:
            want.setdefault(k, []).append(sid)
    found: dict[str, set] = {}
    name = _latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    with zipfile.ZipFile(_download(name)) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        sic_ix = [i for h, i in ix.items() if h.startswith("SICCode")]
        sics: dict[str, set] = {}
        for row in reader:
            if len(row) < len(head) or row[ix["CompanyStatus"]] != "Active":
                continue
            k = _key(row[ix["CompanyName"]])
            if k in want:
                found.setdefault(k, set()).add(row[ix["CompanyNumber"]])
                if with_sic:
                    sics[row[ix["CompanyNumber"]]] = {row[i].split(" ")[0] for i in sic_ix if row[i]}
    out = {sid: next(iter(nums)) for k, nums in found.items() if len(nums) == 1 for sid in want[k]}
    if with_sic:
        out = {sid: {"number": n, "sic": sics.get(n, set())} for sid, n in out.items()}
    log(f"UK: {len(out)} von {len(names)} Firmen über den Namen eindeutig im Register")
    return out


# Rechtsformen, die als „corporate subscriber“ gelten (PECR) und in lib.rules als Kapitalgesellschaft zählen
CATEGORY_FORM = {"Private Limited Company": "Ltd", "Public Limited Company": "PLC",
                 "Limited Liability Partnership": "LLP"}


def by_number(numbers: set[str], log=print) -> dict[str, dict]:
    """Firmennummern (z. B. von der eigenen Website) -> {name, status, category, form} aus den Massendaten.
    Quellen-Scout R20 (03.10.2026): die Nummer auf der Website zählt erst, wenn das Register sie bestätigt."""
    out: dict[str, dict] = {}
    if not numbers:
        return out
    name = _latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    with zipfile.ZipFile(_download(name)) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        for row in reader:
            if len(row) < len(head) or row[ix["CompanyNumber"]] not in numbers:
                continue
            cat = row[ix["CompanyCategory"]]
            out[row[ix["CompanyNumber"]]] = {"name": row[ix["CompanyName"]], "status": row[ix["CompanyStatus"]],
                                             "category": cat, "form": CATEGORY_FORM.get(cat)}
    log(f"UK: {len(out)} von {len(numbers)} Firmennummern im Register")
    return out


def details(numbers: set[str], log=print) -> dict[str, dict]:
    """Registrierter Name und Sitz je Firmennummer (aktive Firmen) aus den Massendaten."""
    from extraktor.model import title_case
    out: dict[str, dict] = {}
    if not numbers:
        return out
    name = _latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    with zipfile.ZipFile(_download(name)) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        for row in reader:
            if len(row) < len(head) or row[ix["CompanyNumber"]] not in numbers:
                continue
            if row[ix["CompanyStatus"]] != "Active":
                continue
            street = ", ".join(x for x in (row[ix["RegAddress.AddressLine1"]], row[ix["RegAddress.AddressLine2"]]) if x)
            out[row[ix["CompanyNumber"]]] = {
                "legal_name": title_case(row[ix["CompanyName"]]), "street": title_case(street),
                "city": title_case(row[ix["RegAddress.PostTown"]]), "zip": row[ix["RegAddress.PostCode"]].upper()}
    log(f"UK: {len(out)} von {len(numbers)} Firmennummern aktiv im Register")
    return out
