#!/usr/bin/env python3
"""Tägliche Beobachtung: Quellen abrufen, observations pflegen, leads erkennen.

  python scripts/watch.py careers          # Karriereseiten (JSON-LD JobPosting), max. 1x/Tag/Seite
  python scripts/watch.py websites         # Startseiten auf veraltete Technik prüfen, max. 1x/Tag/Seite
  python scripts/watch.py uk-incorporations --location Manchester --days 30
  python scripts/watch.py ny-incorporations --days 30 [--county "Kings"]
  python scripts/watch.py detect           # Regeln aus lib/signals.py anwenden -> leads
  python scripts/watch.py daily            # careers + websites + detect

Umgebungsvariablen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  COMPANIES_HOUSE_API_KEY (kostenlos: developer.company-information.service.gov.uk)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.db import DB  # noqa: E402
from lib.fetch import FetchRefused, ats_endpoint, extract_job_postings, parse_ats_jobs, polite_get  # noqa: E402
from lib.signals import (  # noqa: E402
    detect_incorporation_lead, detect_job_leads, detect_website_lead, segments_for,
)
from lib.site_audit import audit_html  # noqa: E402

TODAY = dt.date.today()
NOW = dt.datetime.now(dt.timezone.utc)


def _ts(v):
    return dt.datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def upsert_observation(db: DB, company_id: str, kind: str, key: str, **fields) -> None:
    existing = db.select("observations", {"company_id": f"eq.{company_id}", "kind": f"eq.{kind}", "key": f"eq.{key}"})
    if existing:
        o = existing[0]
        db.update("observations", {"id": o["id"]}, {
            "last_seen": TODAY.isoformat(), "times_seen": o["times_seen"] + 1, "gone_since": None,
            **{k: v for k, v in fields.items() if v is not None},
        })
    else:
        db.insert("observations", {"company_id": company_id, "kind": kind, "key": key,
                                   "first_seen": TODAY.isoformat(), "last_seen": TODAY.isoformat(), **fields})


def cmd_careers(db: DB, args) -> None:
    session = requests.Session()
    companies = db.select("watch_companies", {"active": "eq.true", "careers_url": "not.is.null"})
    for c in companies:
        ats = ats_endpoint(c["careers_url"])
        try:
            r = polite_get(ats[1] if ats else c["careers_url"], last_fetched=_ts(c.get("careers_fetched_at")),
                           session=session)
        except FetchRefused as e:
            print(f"übersprungen {c['name']}: {e}")
            continue
        except requests.RequestException as e:
            print(f"Fehler {c['name']}: {e}")
            continue
        db.update("watch_companies", {"id": c["id"]}, {"careers_fetched_at": NOW.isoformat()})
        if r.status_code >= 400:
            print(f"Fehler {c['name']}: HTTP {r.status_code}")
            continue
        jobs = parse_ats_jobs(ats[0], r.json()) if ats else extract_job_postings(r.text, r.url)
        seen_keys = set()
        for j in jobs:
            key = j.get("identifier") or j.get("url") or hashlib.sha1(j["title"].encode()).hexdigest()
            key = f"{key}|{j['title']}"
            seen_keys.add(key)
            upsert_observation(db, c["id"], "job_posting", key, title=j["title"], details=j,
                               source_name=f"Karriereseite {c['name']}", source_url=j.get("url") or r.url,
                               posted_on=j.get("date_posted"))
        # Stellen, die nicht mehr da sind, als beendet markieren
        for o in db.select("observations", {"company_id": f"eq.{c['id']}", "kind": "eq.job_posting",
                                            "gone_since": "is.null"}):
            if o["key"] not in seen_keys:
                db.update("observations", {"id": o["id"]}, {"gone_since": TODAY.isoformat()})
        print(f"{c['name']}: {len(jobs)} Stellen ({ats[0] if ats else 'JSON-LD'})")
        if not jobs:
            print("  Hinweis: keine strukturierten Stellendaten gefunden; Seite ggf. manuell prüfen")


def cmd_websites(db: DB, args) -> None:
    session = requests.Session()
    for c in db.select("watch_companies", {"active": "eq.true", "website": "not.is.null"}):
        url = c["website"] if c["website"].startswith("http") else "http://" + c["website"]
        try:
            r = polite_get(url, last_fetched=_ts(c.get("website_fetched_at")), session=session)
        except (FetchRefused, requests.RequestException) as e:
            print(f"übersprungen {c['name']}: {e}")
            continue
        db.update("watch_companies", {"id": c["id"]}, {"website_fetched_at": NOW.isoformat()})
        audit = audit_html(r.text, r.url, TODAY)
        upsert_observation(db, c["id"], "website_audit", "homepage", title="Startseiten-Prüfung",
                           details=audit, source_name="Firmenwebsite", source_url=r.url)
        print(f"{c['name']}: Punkte {audit['score']} {audit['findings']}")


def cmd_import_employers(db: DB, args) -> None:
    """Arbeitgeber mit eigener Karriereseite in die Beobachtungsliste übernehmen (CSV)."""
    import csv
    from lib.fetch import host_blocked
    from lib.rules import normalize_domain
    n = 0
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if not row.get("careers_url") or host_blocked(row["careers_url"]):
                    print(f"übersprungen {row.get('name')}: keine eigene Karriereseite")
                    continue
                domain = normalize_domain(row.get("website"))
                if domain and db.select("watch_companies", {"domain": f"eq.{domain}", "select": "id"}):
                    continue
                db.insert("watch_companies", {
                    "name": row["name"], "country": args.country, "city": row.get("city") or None,
                    "website": row.get("website") or None, "domain": domain or None,
                    "careers_url": row["careers_url"], "industry": row.get("industry") or None,
                    "notes": f"gefunden über {row.get('found_via', '')}".strip(),
                })
                n += 1
    print(f"{n} Arbeitgeber übernommen")


def _upsert_company(db: DB, row: dict) -> dict:
    found = db.select("watch_companies", {"registry_source": f"eq.{row['registry_source']}",
                                          "registry_id": f"eq.{row['registry_id']}"})
    return found[0] if found else db.insert("watch_companies", row)[0]


def cmd_uk_incorporations(db: DB, args) -> None:
    """Companies House (offizielle, kostenlose API). Nur Firmendaten, keine Personen."""
    key = os.environ.get("COMPANIES_HOUSE_API_KEY")
    if not key:
        raise SystemExit("COMPANIES_HOUSE_API_KEY fehlt (kostenlos bei Companies House registrieren)")
    params = {
        "incorporated_from": (TODAY - dt.timedelta(days=args.days)).isoformat(),
        "incorporated_to": TODAY.isoformat(),
        "company_status": "active",
        "company_type": "ltd",
        "size": str(args.limit),
    }
    if args.location:
        params["location"] = args.location
    if args.sic:
        params["sic_codes"] = args.sic
    r = requests.get("https://api.company-information.service.gov.uk/advanced-search/companies",
                     params=params, auth=(key, ""), timeout=30)
    r.raise_for_status()
    items = r.json().get("items", [])
    for it in items:
        a = it.get("registered_office_address") or {}
        address = ", ".join(x for x in (a.get("address_line_1"), a.get("address_line_2"), a.get("locality"),
                                        a.get("postal_code")) if x)
        comp = _upsert_company(db, {
            "name": it["company_name"], "legal_form": "Ltd", "country": "UK", "city": a.get("locality"),
            "region": a.get("region"), "address": address, "registry_source": "companies_house",
            "registry_id": it["company_number"], "industry": ",".join(it.get("sic_codes") or []),
        })
        upsert_observation(db, comp["id"], "incorporation", it["company_number"], title="Eintragung Companies House",
                           details={"sic_codes": it.get("sic_codes"), "company_type": it.get("company_type")},
                           source_name="Companies House",
                           source_url=f"https://find-and-update.company-information.service.gov.uk/company/{it['company_number']}",
                           posted_on=it.get("date_of_creation"))
    print(f"{len(items)} Neugründungen übernommen")


# Personenbezogene Felder des NY-Datensatzes werden bewusst nicht übernommen.
NY_KEEP = ("dos_id", "current_entity_name", "initial_dos_filing_date", "county", "entity_type",
           "jurisdiction", "location_city", "location_state")


def cmd_ny_incorporations(db: DB, args) -> None:
    """New York Department of State, offener Datensatz auf data.ny.gov (Socrata, kostenlos)."""
    since = (TODAY - dt.timedelta(days=args.days)).isoformat()
    where = f"initial_dos_filing_date >= '{since}T00:00:00'"
    if args.county:
        where += f" AND county = '{args.county.replace(chr(39), '')}'"
    headers = {"X-App-Token": os.environ["SOCRATA_APP_TOKEN"]} if os.environ.get("SOCRATA_APP_TOKEN") else {}
    r = requests.get("https://data.ny.gov/resource/n9v6-gdp6.json", headers=headers, timeout=60, params={
        "$where": where, "$order": "initial_dos_filing_date DESC", "$limit": str(args.limit),
        "$select": ",".join(NY_KEEP),
    })
    r.raise_for_status()
    rows = r.json()
    for it in rows:
        comp = _upsert_company(db, {
            "name": it["current_entity_name"], "legal_form": it.get("entity_type"), "country": "US",
            "region": "NY", "city": it.get("location_city"), "registry_source": "ny_dos",
            "registry_id": it["dos_id"],
        })
        upsert_observation(db, comp["id"], "incorporation", it["dos_id"], title="Filing NY Department of State",
                           details={k: it.get(k) for k in ("county", "entity_type", "jurisdiction")},
                           source_name="NY Department of State (data.ny.gov)",
                           source_url="https://data.ny.gov/d/n9v6-gdp6",
                           posted_on=(it.get("initial_dos_filing_date") or "")[:10] or None)
    print(f"{len(rows)} Neugründungen übernommen")


BODACC_URL = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records"


def parse_bodacc_record(rec: dict) -> dict | None:
    """Neugründung aus dem BODACC. Nur Gesellschaften (personne morale); Einzelunternehmer
    tragen den Namen einer Person und werden übersprungen."""
    import json
    raw = rec.get("listepersonnes")
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except json.JSONDecodeError:
        return None
    pers = data.get("personne") if isinstance(data, dict) else None
    if isinstance(pers, list):
        pers = pers[0] if pers else None
    if not isinstance(pers, dict) or pers.get("typePersonne") != "pm":
        return None
    reg = rec.get("registre") or []
    siren = (reg[-1] if isinstance(reg, list) and reg else str(reg)).replace(" ", "")
    if not siren:
        return None
    return {
        "name": pers.get("denomination") or rec.get("commercant"),
        "legal_form": pers.get("formeJuridique"),
        "city": rec.get("ville"), "postcode": rec.get("cp"),
        "siren": siren, "published_on": (rec.get("dateparution") or "")[:10] or None,
        "notice_id": rec.get("id"), "tribunal": rec.get("tribunal"),
    }


def cmd_fr_incorporations(db: DB, args) -> None:
    """Neugründungen aus dem BODACC (amtliche Bekanntmachungen, offene Schnittstelle)."""
    since = (TODAY - dt.timedelta(days=args.days)).isoformat()
    dep = args.departement.replace('"', "")
    n = offset = 0
    while offset < args.limit:
        r = requests.get(BODACC_URL, timeout=60, params={
            "where": f'familleavis="creation" and numerodepartement="{dep}" and dateparution>=date\'{since}\'',
            "order_by": "dateparution desc", "limit": "100", "offset": str(offset),
        })
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            break
        for rec in results:
            it = parse_bodacc_record(rec)
            if not it:
                continue
            comp = _upsert_company(db, {
                "name": it["name"], "legal_form": it["legal_form"], "country": "FR", "region": dep,
                "city": it["city"], "address": it["postcode"], "registry_source": "bodacc_siren",
                "registry_id": it["siren"],
            })
            upsert_observation(db, comp["id"], "incorporation", it["siren"], title="Création (BODACC)",
                               details={"tribunal": it["tribunal"], "legal_form": it["legal_form"]},
                               source_name="BODACC (annonces commerciales)",
                               source_url=f"https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:{it['notice_id']}",
                               posted_on=it["published_on"])
            n += 1
        offset += 100
    print(f"{n} Gesellschaftsgründungen übernommen (Département {dep})")


def cmd_detect(db: DB, args) -> None:
    n = 0
    for c in db.select("watch_companies", {"active": "eq.true"}):
        obs = db.select("observations", {"company_id": f"eq.{c['id']}"})
        found = detect_job_leads(c, obs, TODAY)
        for o in obs:
            if o["kind"] == "incorporation":
                lead = detect_incorporation_lead(c, o, TODAY)
                found += [lead] if lead else []
            elif o["kind"] == "website_audit":
                lead = detect_website_lead(c, o)
                found += [lead] if lead else []
        for lead in found:
            for seg in segments_for(lead):
                row = {k: v for k, v in lead.items() if k != "topic"}
                row.update({"company_id": c["id"], "segment_id": seg, "country": c["country"],
                            "source_date": TODAY.isoformat()})
                db.insert("leads", row, upsert_on="company_id,segment_id,signal_type,event_date",
                          ignore_duplicates=True)
                n += 1
    print(f"{n} Signale geprüft/übernommen")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["careers", "websites", "uk-incorporations", "ny-incorporations", "detect", "daily",
                                    "import-employers", "fr-incorporations"])
    ap.add_argument("--departement", default="69")
    ap.add_argument("files", nargs="*")
    ap.add_argument("--country", default="UK")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--location"); ap.add_argument("--sic"); ap.add_argument("--county")
    args = ap.parse_args(argv)
    db = DB()
    steps = {"careers": [cmd_careers], "websites": [cmd_websites], "uk-incorporations": [cmd_uk_incorporations],
             "ny-incorporations": [cmd_ny_incorporations], "detect": [cmd_detect],
             "import-employers": [cmd_import_employers], "fr-incorporations": [cmd_fr_incorporations],
             "daily": [cmd_careers, cmd_websites, cmd_detect]}[args.cmd]
    for step in steps:
        step(db, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
