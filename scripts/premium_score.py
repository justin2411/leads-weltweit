#!/usr/bin/env python3
"""Premium-Bewertung offener Leads nachtragen und aktuell halten (Inhaber 05.10.2026: „nur noch premium leads“).

Neue Leads bekommen die Bewertung beim Speichern (extraktor/store.py, lib/radar.py). Dieses Skript
  1. bewertet offene Leads (Status new) mit datiertem Ereignis der letzten FRESH_MID Tage, die noch keine
     Bewertung haben (Bestand vor dem 05.10.2026) – Ansprechperson und Kontakt aus den Beobachtungen der Firma,
     Belege (Website-Befunde) aus der Ereignis-Beobachtung;
  2. stuft Leads, deren Ereignis inzwischen älter als FRESH_MID Tage ist, auf „standard“ zurück.
Nur Reihenfolge – ob ein Lead rausgeht, entscheidet allein die Drei-Stufen-Freigabe. Nichts wird gelöscht.

  python scripts/premium_score.py            # zählen, nichts schreiben
  python scripts/premium_score.py --apply    # schreiben
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import premium  # noqa: E402

DATED_SOURCE_LIKE = ("*FMCSA*", "*Connecticut*", "*Companies House*", "*BODACC*", "*SEC EDGAR*", "*change radar*",
                     "*contract award*", "*Department of State*")
SELECT = "id,company_id,segment_id,country,signal_type,event_date,source_name,source_url,observation_ids,premium"


def candidate_filter(today: dt.date) -> dict:
    """PostgREST-Filter: offen, ohne Bewertung, datiertes Signal oder Quelle (Tag und Markt setzt run())."""
    ors = [f"signal_type.in.({','.join(sorted(premium.DATED_SIGNALS))})"]
    ors += [f"source_name.ilike.{p}" for p in DATED_SOURCE_LIKE]
    return {"status": "eq.new", "premium_score": "is.null", "or": f"({','.join(ors)})", "select": SELECT}


def lead_input(l: dict, evidence: dict | None, contact: dict | None, person: dict | None) -> dict:
    contact, person = contact or {}, person or {}
    return {"signal_type": l.get("signal_type") or "", "event_date": l.get("event_date"),
            "source_name": l.get("source_name") or "", "source_url": l.get("source_url") or "",
            "details": evidence or {}, "person_name": person.get("name") or "",
            "phone": contact.get("phone") or "", "email": contact.get("email") or ""}


def demote(l: dict, today: dt.date) -> dict | None:
    """Neue premium-Spalte für einen veralteten Premium-Lead, sonst None."""
    p = l.get("premium") or {}
    if isinstance(p, dict) and p.get("tier") == "premium" and premium.tier_now(l, today) != "premium":
        return {**p, "tier": "standard", "aged_out": today.isoformat()}
    return None


def aged_columns(l: dict, today: dt.date) -> dict:
    """Spalten-Update für einen Premium-Lead, dessen Frische-Punkte gesunken sind (premium_score auf heute gealtert,
    damit signalwerk.premium_status() und der Index dieselbe Zahl sehen); leer, wenn sich nichts ändert."""
    out = {}
    now = premium.score_now(l, today)
    if now is not None and now != l.get("premium_score"):
        out["premium_score"] = now
    new = demote(l, today)
    if new:
        out["premium"] = new
    return out


def _company_obs(db, ids: list[str]) -> tuple[dict, dict]:
    contact, person = {}, {}
    for i in range(0, len(ids), 150):
        part = ",".join(ids[i:i + 150])
        for o in db.select("observations", {"company_id": f"in.({part})", "kind": "eq.other",
                                            "key": "in.(contact,person)", "select": "company_id,key,details"}):
            (contact if o["key"] == "contact" else person)[o["company_id"]] = o.get("details") or {}
    return contact, person


def _evidence(db, ids: list[str]) -> dict:
    out = {}
    for i in range(0, len(ids), 150):
        for o in db.select("observations", {"id": f"in.({','.join(ids[i:i + 150])})", "select": "id,details"}):
            d = o.get("details") or {}
            out[o["id"]] = d if isinstance(d, dict) else {}
    return out


def score_batch(db, rows: list[dict], today: dt.date) -> list[tuple[str, dict]]:
    cos = sorted({r["company_id"] for r in rows if r.get("company_id")})
    contact, person = _company_obs(db, cos)
    ev = _evidence(db, sorted({(r.get("observation_ids") or [None])[0] for r in rows} - {None}))
    out = []
    for r in rows:
        oid = (r.get("observation_ids") or [None])[0]
        out.append((r["id"], premium.columns(lead_input(r, ev.get(oid), contact.get(r.get("company_id")),
                                                        person.get(r.get("company_id"))), today)))
    return out


def markets(db) -> list[tuple[str, str]]:
    """Zielgruppe × Land mit Live-Seite (dorthin gehen Proben und Lieferungen)."""
    return [(r["segment_id"], r["country"]) for r in db.rpc("premium_status", {}) or []]


def run(db, apply: bool, limit: int = 50000, today: dt.date | None = None, log=print,
        pairs: list[tuple[str, str]] | None = None) -> dict:
    """Je Markt und Tag (Index segment_id, country, status, event_date – eine Abfrage über 30 Tage lief in die
    Zeitgrenze), neueste Tage zuerst."""
    today = today or dt.date.today()
    stats: Counter = Counter()
    pairs = pairs if pairs is not None else markets(db)
    for back in range(0, premium.FRESH_MID + 1):
        day = (today - dt.timedelta(days=back)).isoformat()
        for seg, cc in pairs:
            if stats["bewertet"] >= limit:
                break
            q = {**candidate_filter(today), "segment_id": f"eq.{seg}", "country": f"eq.{cc}", "event_date": f"eq.{day}"}
            try:
                rows = db.select_all("leads", q)
            except Exception as exc:  # noqa: BLE001 - ein Markt/Tag darf die übrigen nicht stoppen
                stats["fehler"] += 1
                log(f"{seg}/{cc} {day}: {type(exc).__name__}: {str(exc)[:120]}")
                continue
            for i in range(0, len(rows), 500):
                part = rows[i:i + 500]
                upd = score_batch(db, part, today)
                for (_, cols), r in zip(upd, part):
                    stats["bewertet"] += 1
                    stats[f"{cols['premium']['tier']}:{seg}/{cc}"] += 1
                if apply:
                    with ThreadPoolExecutor(8) as ex:
                        list(ex.map(lambda u: db.update("leads", {"id": u[0]}, u[1]), upd))
    # gealterte Premium-Leads: Frische-Punkte senken (ab FRESH_HIGH Tagen), zurückstufen (unter PREMIUM_MIN oder
    # älter als FRESH_MID Tage)
    since = (today - dt.timedelta(days=premium.FRESH_HIGH)).isoformat()
    old = db.select_all("leads", {"status": "eq.new", "premium_score": "not.is.null", "premium->>tier": "eq.premium",
                                  "event_date": f"lt.{since}",
                                  "select": "id,event_date,premium_score,premium"})
    for l in old:
        upd = aged_columns(l, today)
        if "premium" in upd:
            stats["zurueckgestuft"] += 1
        elif upd:
            stats["gealtert"] += 1
        if upd and apply:
            db.update("leads", {"id": l["id"]}, upd)
    log(json.dumps(dict(stats), ensure_ascii=False, sort_keys=True))
    return dict(stats)


def counts(db, today: dt.date | None = None) -> dict:
    """Premium-Leads heute je Zielgruppe/Land (offen, frisch) – über signalwerk.premium_status()."""
    return {f"{r['segment_id']}/{r['country']}": r["premium_frei"] for r in db.rpc("premium_status", {}) or []}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=50000)
    args = ap.parse_args(argv)
    from lib.db import DB
    run(DB(), args.apply, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
