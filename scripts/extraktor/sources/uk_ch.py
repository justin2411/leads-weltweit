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
