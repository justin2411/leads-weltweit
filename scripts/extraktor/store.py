#!/usr/bin/env python3
"""Extraktor-Ergebnis (leads_alle.csv) in die Datenbank übernehmen – nur grüne Leads, nur mit --apply.

  python scripts/extraktor/store.py out/extraktor/leads_alle.csv            # Probelauf: zeigt, was passieren würde
  python scripts/extraktor/store.py out/extraktor/leads_alle.csv --apply

Schreibt in die bestehenden Tabellen (keine Migration nötig), so dass Proben und Lieferungen die Leads als
vollständig erkennen (deliveries.contact_companies):
  watch_companies           Firma (registry_source = fmcsa | sec_form_d, registry_id = Quell-ID)
  observations other/contact   Telefon + E-Mail     other/person  Ansprechperson     other/quality  Prüfergebnis
  observations other/profile   Firmeninfo           filing/<quelle>  das Ereignis mit Quelle und Datum
  leads                     Signal, Dringlichkeit, Einstiegssatz, Branche
Firmen, die schon da sind (gleiche Quelle + ID), werden übersprungen.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SOURCE_NAME = {"fmcsa": "FMCSA Company Census (US DOT)", "sec_form_d": "SEC EDGAR Form D"}
SIGNAL_TYPE = {"S4": "new_fleet", "S2": "no_website", "S1": "funding_growth", "S5": "funding_new_company",
               "S9": "funding_executive"}
EVENT_KEY = {"fmcsa": "fmcsa_registration", "sec_form_d": "form_d"}


def company_row(r: dict) -> dict:
    from lib.websites import site_domain
    addr = ", ".join(x for x in (r["street"], r["city"], f"{r['state']} {r['zip']}".strip()) if x)
    return {"name": r["company"], "legal_form": None, "country": r["country"], "region": r["state"], "city": r["city"],
            "address": addr, "website": r["website"] or None, "domain": site_domain(r["website"]) if r["website"] else None,
            "phone_main": r["phone"], "registry_source": r["source"], "registry_id": r["source_id"],
            "industry": "Motor carrier" if r["source"] == "fmcsa" else None, "active": True,
            "notes": f"Extraktor {dt.date.today()}"}


def store(db, r: dict, today: str) -> str:
    co = db.insert("watch_companies", company_row(r))[0]
    cid = co["id"]
    common = {"company_id": cid, "first_seen": today, "last_seen": today, "source_name": "Extraktor"}
    db.insert("observations", {**common, "kind": "other", "key": "contact", "source_url": r["website"] or None,
                               "details": {"phone": r["phone"], "email": r["email"], "phone_type": r["phone_type"],
                                           "email_type": r["email_type"], "source": r["source"]}})
    db.insert("observations", {**common, "kind": "other", "key": "person",
                               "details": {"name": r["contact_name"], "role": r["contact_role"],
                                           "source": SOURCE_NAME[r["source"]]}})
    db.insert("observations", {**common, "kind": "other", "key": "quality",
                               "details": {"complete": True, "blocking": False, "qc": r["qc"], "sc": r["sc"],
                                           "notes": r["qc_notes"], "checked_on": today, "by": "extraktor"}})
    db.insert("observations", {**common, "kind": "other", "key": "profile", "details": {"company_info": r["company_info"]}})
    ev = db.insert("observations", {**common, "kind": "filing", "key": EVENT_KEY[r["source"]], "title": r["signal"],
                                    "source_name": SOURCE_NAME[r["source"]], "source_url": r["source_url"],
                                    "posted_on": r["signal_date"], "details": {"source_id": r["source_id"]}})[0]
    db.insert("leads", {"company_id": cid, "segment_id": r["segment"], "country": r["country"],
                        "signal_type": SIGNAL_TYPE[r["segment"]], "event_summary": r["signal"],
                        "event_date": r["signal_date"], "source_name": SOURCE_NAME[r["source"]],
                        "source_url": r["source_url"], "source_date": r["signal_date"], "urgency": r["urgency"],
                        "urgency_reason": r["urgency_reason"], "opener": r["opener"], "observation_ids": [ev["id"]],
                        "status": "new"})
    return cid


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    rows = [r for r in csv.DictReader(open(args.csv, encoding="utf-8")) if r["ampel"] == "green"]
    from extraktor.filters import Guard
    from lib.db import DB
    db = DB()
    guard = Guard(db)
    today = dt.date.today().isoformat()
    n = {"neu": 0, "schon_da": 0}
    for r in rows:
        if (r["source"], r["source_id"]) in guard.known:
            n["schon_da"] += 1
            continue
        n["neu"] += 1
        if args.apply:
            store(db, r, today)
            guard.known.add((r["source"], r["source_id"]))
    print(n, "" if args.apply else "(Probelauf – mit --apply schreiben)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
