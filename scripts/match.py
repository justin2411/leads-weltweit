#!/usr/bin/env python3
"""Leads taggen, Qualitätswert berechnen, mit Kundenfiltern abgleichen (BRAIN.md Abschnitt 5.3).

  python scripts/match.py            # Probelauf: zeigt Verteilung der Qualitätswerte
  python scripts/match.py --apply    # lead_tags schreiben

Qualitätswert 0–100 = Aktualität (40) + Eindeutigkeit des Signals (30) + Vollständigkeit der Firmendaten (30).
Unter 60 wird nicht geliefert.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

MIN_QUALITY = 60
SIGNAL_CLARITY = {"new_incorporation": 30, "job_open_30d": 30, "jobs_3plus": 25, "outdated_website": 20}


def quality(lead: dict, company: dict, today: dt.date | None = None) -> tuple[int, dict]:
    """(Wert, Begründung) – reine Funktion, testbar."""
    today = today or dt.date.today()
    reasons = {}
    date = lead.get("event_date") or None
    if date:
        age = (today - dt.date.fromisoformat(str(date)[:10])).days
        fresh = 40 if age <= 14 else 32 if age <= 30 else 20 if age <= 60 else 10 if age <= 90 else 0
        reasons["alter_tage"] = age
    else:
        fresh = 15
        reasons["alter_tage"] = None
    clarity = SIGNAL_CLARITY.get(lead.get("signal_type", ""), 10)
    complete = (5 if company.get("name") else 0) + (10 if company.get("address") else 0) + \
        (5 if company.get("city") else 0) + (5 if company.get("website") else 0) + (5 if lead.get("source_url") else 0)
    reasons.update({"aktualitaet": fresh, "signal": clarity, "vollstaendigkeit": complete})
    return fresh + clarity + complete, reasons


def area_for(country: str, company: dict, details: dict | None) -> str | None:
    from lib.regions import FR, UK, US, lead_matches
    for area in {"UK": UK, "US": US, "FR": FR}.get(country, {}):
        if lead_matches(country, area, company, details):
            return area
    return None


# Alte Formular-Schlüssel (vor 02.10.2026) auf die Wunsch-Schlüssel aus lib/wishes.py
_OLD_KEYS = {"outdated_website": "website_outdated"}


def signal_wanted(key: str, lead: dict) -> bool:
    """Formular-Schlüssel (dieselben wie im Probe-Formular, lib/wishes.py) oder roher Signaltyp."""
    from lib.wishes import matches
    key = _OLD_KEYS.get(key, key)
    return lead.get("signal_type") == key or matches(key, lead)


def matches_filter(lead: dict, tag: dict, company: dict, f: dict) -> bool:
    """Abgleich mit customer_filters (Regionen, Signale, Branchen, Ausschlüsse, Qualität)."""
    from lib.regions import area_of
    if tag["quality"] < MIN_QUALITY:
        return False
    if f.get("segment_id") and f["segment_id"] not in tag["segments"] and lead.get("segment_id") != f["segment_id"]:
        return False
    if f.get("signals") and not any(signal_wanted(k, lead) for k in f["signals"]):
        return False
    regions = f.get("regions") or []
    if regions:
        place = f"{company.get('city') or ''} {company.get('region') or ''}".lower()
        ok = any((area_of(r) == tag.get("region") and tag.get("region")) or r.lower() in place for r in regions)
        if not ok:
            return False
    # Freitext aus dem Formular: Plural-s ignorieren („restaurants“ trifft „Restaurant“)
    inds = [i.lower().strip().removesuffix("s") for i in f.get("industries") or [] if i.strip()]
    if inds and not any(i in (tag.get("industry") or "").lower() for i in inds):
        return False
    name = (company.get("name") or "").lower()
    if any(x.lower() in name for x in f.get("exclusions") or []):
        return False
    return True


def tag_leads(db, days: int = 120, apply: bool = False) -> list[dict]:
    """lead_tags für alle Leads der letzten `days` Tage berechnen und (mit apply) schreiben.

    Wird auch von deliveries.py prepare vor der Auswahl aufgerufen, damit frische Leads getaggt sind."""
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    leads = db.select_all("leads", {"created_at": f"gte.{since}", "status": "neq.expired", "order": "id",
                                    "select": "id,company_id,segment_id,country,signal_type,event_date,source_url,"
                                              "observation_ids,watch_companies(name,address,city,region,website,industry)"})
    obs_ids = list({l["observation_ids"][0] for l in leads if l.get("observation_ids")})
    details = {}
    for i in range(0, len(obs_ids), 150):
        for o in db.select("observations", {"id": f"in.({','.join(obs_ids[i:i + 150])})", "select": "id,details"}):
            details[o["id"]] = o.get("details") or {}
    segs: dict[tuple, set] = {}
    for l in leads:
        segs.setdefault((l["company_id"], l["signal_type"], l.get("event_date")), set()).add(l["segment_id"])
    rows, dist = [], {"<60": 0, "60-79": 0, "80+": 0}
    for l in leads:
        co = l.get("watch_companies") or {}
        det = details.get((l.get("observation_ids") or [None])[0]) or {}
        q, why = quality(l, co)
        dist["<60" if q < 60 else "60-79" if q < 80 else "80+"] += 1
        rows.append({"lead_id": l["id"], "segments": sorted(segs[(l["company_id"], l["signal_type"], l.get("event_date"))]),
                     "region": area_for(l["country"], co, det), "industry": det.get("sic") or co.get("industry"),
                     "quality": q, "reasons": why, "tagged_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    print(f"{len(rows)} Leads getaggt – Qualität: {dist} (unter {MIN_QUALITY} wird nicht geliefert)")
    if apply:
        for i in range(0, len(rows), 500):
            db.insert("lead_tags", rows[i:i + 500], upsert_on="lead_id")
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--days", type=int, default=120, help="nur Leads der letzten N Tage")
    args = ap.parse_args(argv)
    from lib.db import DB
    tag_leads(DB(), args.days, args.apply)
    return 0


if __name__ == "__main__":
    sys.exit(main())
