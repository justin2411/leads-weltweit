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
    detect_incorporation_lead, detect_job_leads, detect_website_lead, opener_for, segments_for,
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
    companies = db.select_all("watch_companies", {"active": "eq.true", "careers_url": "not.is.null", "order": "id"})
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
                               source_name=f"{'Page carrières' if c.get('country') == 'FR' else 'Careers page'} {c['name']}", source_url=j.get("url") or r.url,
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
    for c in db.select_all("watch_companies", {"active": "eq.true", "website": "not.is.null", "order": "id"}):
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
    for dep in [d.strip().replace('"', "") for d in args.departement.split(",") if d.strip()]:
        _bodacc_dep(db, args, dep)


def _bodacc_dep(db: DB, args, dep: str) -> None:
    since = (TODAY - dt.timedelta(days=args.days)).isoformat()
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


# Muss zu den Käufer-Regionen in osm.py passen (Käufer brauchen Leads aus ihrem Markt)
from lib.regions import UK as _UK_AREAS  # noqa: E402
UK_POSTCODE_AREAS = set().union(*_UK_AREAS.values())


def cmd_uk_bulk(db: DB, args) -> None:
    """Neugründungen aus dem kostenlosen Monats-Abzug von Companies House (ohne API-Schlüssel).

    Nur Private Limited Companies in ausgewählten Regionen; nur Firmendaten (Name, Nummer, Ort, SIC)."""
    import csv
    import io
    import re as _re
    import zipfile
    idx = requests.get("https://download.companieshouse.gov.uk/en_output.html", timeout=60).text
    m = _re.search(r'href="(BasicCompanyDataAsOneFile-[\d-]+\.zip)"', idx)
    if not m:
        raise SystemExit("Companies-House-Abzug nicht gefunden")
    url = "https://download.companieshouse.gov.uk/" + m.group(1)
    path = "/tmp/ch.zip"
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(path, "wb") as fh:
            for chunk in r.iter_content(1 << 20):
                fh.write(chunk)
    since = TODAY - dt.timedelta(days=args.days)
    n = 0
    with zipfile.ZipFile(path) as z:
        name = z.namelist()[0]
        with z.open(name) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8", errors="replace"))
            for row in reader:
                row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
                try:
                    inc = dt.datetime.strptime(row.get("IncorporationDate", ""), "%d/%m/%Y").date()
                except ValueError:
                    continue
                if inc < since or row.get("CompanyCategory") != "Private Limited Company":
                    continue
                pc = row.get("RegAddress.PostCode", "").upper()
                area = _re.match(r"[A-Z]+", pc)
                if not area or area.group(0) not in UK_POSTCODE_AREAS:
                    continue
                num = row.get("CompanyNumber")
                comp = _upsert_company(db, {
                    "name": row.get("CompanyName"), "legal_form": "Ltd", "country": "UK",
                    "city": row.get("RegAddress.PostTown") or None, "address": pc or None,
                    "registry_source": "companies_house", "registry_id": num,
                    "industry": row.get("SICCode.SicText_1") or None,
                })
                upsert_observation(db, comp["id"], "incorporation", num, title="Eintragung Companies House",
                                   details={"sic": row.get("SICCode.SicText_1"), "postcode_area": area.group(0)},
                                   source_name="Companies House",
                                   source_url=f"https://find-and-update.company-information.service.gov.uk/company/{num}",
                                   posted_on=inc.isoformat())
                n += 1
                if args.limit and n >= args.limit:
                    break
    print(f"{n} UK-Neugründungen übernommen (seit {since})")


def cmd_sitecheck(db: DB, args) -> None:
    """Neugründungen (letzte 30 Tage): gibt es schon eine Website? Ergänzt die Webagentur-Leads (S2) und ist
    Voraussetzung für Telefon und Sammel-E-Mail (cmd_contacts). --segment all prüft die Neugründungen aller Segmente."""
    from lib.sitecheck import find_website
    session = requests.Session()
    since = (TODAY - dt.timedelta(days=30)).isoformat()
    q = {"signal_type": "eq.new_incorporation", "event_date": f"gte.{since}", "order": "event_date.desc",
         "select": "id,company_id,segment_id,event_summary,watch_companies!inner(id,name,country,region,city,address,"
                   "registry_source,registry_id,website_checked_at)",
         "watch_companies.website_checked_at": "is.null", "limit": str(args.limit * 3)}
    if args.segment != "all":
        q["segment_id"] = f"eq.{args.segment}"
    leads = db.select("leads", q)
    n = found = 0
    seen: set[str] = set()
    for l in leads:
        co = l["watch_companies"]
        if co.get("website_checked_at") or co["id"] in seen or n >= args.limit:
            continue
        seen.add(co["id"])
        site, checked = find_website(co["name"], co["country"], session, company=co)
        db.update("watch_companies", {"id": co["id"]}, {"website_checked_at": NOW.isoformat(),
                                                        **({"website": site} if site else {})})
        n += 1
        if site:
            found += 1
            continue
        if l["segment_id"] != "S2":
            continue
        fr = co["country"] == "FR"
        extra = (f" Aucun site trouvé ({', '.join(checked[:3])} vérifiés le {TODAY:%d/%m/%Y})." if fr else
                 f" No website found yet (checked {', '.join(checked[:3])} on {TODAY:%-d %b %Y}).")
        db.update("leads", {"id": l["id"]}, {"event_summary": l["event_summary"].rstrip() + extra, "urgency": "high"})
    print(f"{n} Neugründungen geprüft, {found} mit Website, {n - found} ohne gefundene Website")


def cmd_contacts(db: DB, args) -> None:
    """Seit 27.09.2026: übernimmt scripts/enrich.py (Website prüfen, Vorwahl passend, MX geprüft, Qualität).
    Der alte Weg unten würde die geprüften Kontakte mit ungeprüften überschreiben und bleibt nur als Rückfall."""
    if not getattr(args, "legacy", False):
        from enrich import main as enrich_main
        enrich_main(["run", "--limit", str(getattr(args, "limit", 200))])
        return
    from lib.contacts import fetch_contacts
    session = requests.Session()
    done = {o["company_id"]: o for o in db.select_all("observations", {"kind": "eq.other", "key": "eq.contact",
                                                                        "select": "company_id,last_seen"})}
    cutoff = (TODAY - dt.timedelta(days=30)).isoformat()
    cos = db.select_all("watch_companies", {"website": "not.is.null", "active": "eq.true",
                                            "select": "id,name,website,phone_main", "order": "id"})
    n = hit = 0
    for c in cos:
        prev = done.get(c["id"])
        if prev and (prev.get("last_seen") or "") >= cutoff:
            continue
        if n >= getattr(args, "limit", 200):
            break
        n += 1
        found = fetch_contacts(c["website"], session)
        db.insert("observations", {"company_id": c["id"], "kind": "other", "key": "contact",
                                   "first_seen": TODAY.isoformat(), "last_seen": TODAY.isoformat(),
                                   "source_name": "Company website", "source_url": (found["pages"] or [c["website"]])[0],
                                   "details": {"email": found["email"], "phone": found["phone"]}},
                  upsert_on="company_id,kind,key")
        if found["phone"] and not c.get("phone_main"):
            db.update("watch_companies", {"id": c["id"]}, {"phone_main": found["phone"]})
        hit += bool(found["email"] or found["phone"])
    print(f"{n} Websites auf allgemeine Kontakte geprüft, {hit} mit Telefon oder Sammel-E-Mail")


def cmd_people(db: DB, args) -> None:
    """Ansprechperson (Name, Rolle) aus öffentlichen Registern für Firmen mit aktuellen Leads (CLAUDE.md 8a)."""
    from lib.people import fr_dirigeant, ny_contact, uk_officer
    session = requests.Session()
    key = os.environ.get("COMPANIES_HOUSE_API_KEY")
    done = {o["company_id"] for o in db.select_all("observations", {"kind": "eq.other", "key": "eq.person", "select": "company_id"})}
    since = (TODAY - dt.timedelta(days=60)).isoformat()
    ids = sorted({l["company_id"] for l in db.select_all("leads", {"status": "in.(new,sample)", "event_date": f"gte.{since}",
                                                                    "select": "company_id"})} - done)
    n = hit = 0
    for i in range(0, len(ids), 100):
        for c in db.select("watch_companies", {"id": f"in.({','.join(ids[i:i + 100])})",
                                               "select": "id,name,registry_source,registry_id"}):
            if n >= args.limit:
                break
            src, rid = c.get("registry_source"), (c.get("registry_id") or "").strip()
            if not rid:
                continue
            try:
                if src == "companies_house":
                    if not key:
                        continue
                    found = uk_officer(rid, key, session)
                elif src == "bodacc_siren":
                    found = fr_dirigeant(rid, session)
                elif src == "ny_dos":
                    found = ny_contact(rid, c["name"], session)
                else:
                    continue
            except requests.RequestException:
                continue
            n += 1
            db.insert("observations", {"company_id": c["id"], "kind": "other", "key": "person",
                                       "first_seen": TODAY.isoformat(), "last_seen": TODAY.isoformat(),
                                       "source_name": (found or {}).get("source") or src,
                                       "details": {"name": (found or {}).get("name"), "role": (found or {}).get("role")}},
                      upsert_on="company_id,kind,key")
            hit += bool(found)
    print(f"{n} Firmen im Register geprüft, {hit} mit Ansprechperson")


def cmd_detect(db: DB, args) -> None:
    from lib import catalog
    n = 0
    active = {s["id"] for s in db.select("segments", {"status": "in.(testing,winner)", "select": "id"})}
    active_catalog = active & set(catalog.entries())
    # alle Beobachtungen auf einmal statt einer Abfrage je Firma
    by_company: dict[str, list[dict]] = {}
    for o in db.select_all("observations", {"order": "id"}):
        by_company.setdefault(o["company_id"], []).append(o)
    for c in db.select_all("watch_companies", {"active": "eq.true", "order": "id"}):
        obs = by_company.get(c["id"], [])
        found = detect_job_leads(c, obs, TODAY)
        for o in obs:
            if o["kind"] == "incorporation":
                lead = detect_incorporation_lead(c, o, TODAY)
                found += [lead] if lead else []
            elif o["kind"] == "website_audit":
                lead = detect_website_lead(c, o)
                found += [lead] if lead else []
        for lead in found:
            for seg in segments_for(lead, active_catalog):
                row = {k: v for k, v in lead.items() if k not in ("topic", "sic")}
                row["opener"] = opener_for(lead, seg, c)
                row.update({"company_id": c["id"], "segment_id": seg, "country": c["country"],
                            "source_date": TODAY.isoformat()})
                db.insert("leads", row, upsert_on="company_id,segment_id,signal_type,event_date",
                          ignore_duplicates=True)
                n += 1
    print(f"{n} Signale geprüft/übernommen")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["careers", "websites", "uk-incorporations", "ny-incorporations", "detect", "daily",
                                    "import-employers", "fr-incorporations", "uk-bulk", "sitecheck", "contacts", "people"])
    ap.add_argument("--departement", default="69")
    ap.add_argument("files", nargs="*")
    ap.add_argument("--country", default="UK")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--segment", default="S2", help="sitecheck: Segment oder 'all'")
    ap.add_argument("--legacy", action="store_true", help="contacts: alter Weg ohne Prüfung")
    ap.add_argument("--location"); ap.add_argument("--sic"); ap.add_argument("--county")
    args = ap.parse_args(argv)
    db = DB()
    steps = {"careers": [cmd_careers], "websites": [cmd_websites], "uk-incorporations": [cmd_uk_incorporations],
             "ny-incorporations": [cmd_ny_incorporations], "detect": [cmd_detect],
             "import-employers": [cmd_import_employers], "fr-incorporations": [cmd_fr_incorporations],
             "uk-bulk": [cmd_uk_bulk], "sitecheck": [cmd_sitecheck], "contacts": [cmd_contacts], "people": [cmd_people],
             "daily": [cmd_careers, cmd_websites, cmd_contacts, cmd_detect]}[args.cmd]
    for step in steps:
        step(db, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
