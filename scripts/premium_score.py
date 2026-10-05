#!/usr/bin/env python3
"""Premium-Bewertung offener Leads nachtragen und aktuell halten (Inhaber 05.10.2026: „nur noch premium leads“).

Neue Leads bekommen die Bewertung beim Speichern (extraktor/store.py, lib/radar.py). Dieses Skript
  1. bewertet offene Leads (Status new) mit datiertem Ereignis der letzten FRESH_MID Tage, die noch keine
     Bewertung haben (Bestand vor dem 05.10.2026) – Ansprechperson und Kontakt aus den Beobachtungen der Firma,
     Belege (Website-Befunde) aus der Ereignis-Beobachtung;
  2. stuft Leads, deren Ereignis inzwischen älter als PREMIUM_MAX_AGE (14) Tage ist, auf „standard“ zurück;
  3. trägt bei offenen Premium-Leads „Zertifikat läuft ab“ die Frist (premium.gilt_bis = Ablaufdatum aus der
     Ereignis-Beobachtung) nach und stuft sie ab dem Ablaufdatum zurück (Premium-Labor 05.10.2026).
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


def with_deadline(l: dict, evidence: dict | None, today: dt.date) -> dict | None:
    """Neue premium-Spalte mit Frist (gilt_bis) für einen Premium-Lead ohne Frist bzw. mit erreichter Frist, sonst
    None. Ohne belegtes Ablaufdatum bleibt alles, wie es ist."""
    p = l.get("premium") or {}
    if not isinstance(p, dict) or p.get("tier") != "premium":
        return None
    until = p.get("gilt_bis") or premium.valid_until(l.get("signal_type") or "", evidence)
    if not until:
        return None
    new = {**p, "gilt_bis": str(until)[:10]}
    if premium.tier_now({**l, "premium": new}, today) != "premium":
        new = {**new, "tier": "standard", "frist_vorbei": today.isoformat()}
    return new if new != p else None


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
    # veraltete Premium-Leads zurückstufen
    since = (today - dt.timedelta(days=premium.PREMIUM_MAX_AGE)).isoformat()
    old = db.select_all("leads", {"status": "eq.new", "premium_score": "not.is.null", "premium->>tier": "eq.premium",
                                  "event_date": f"lt.{since}",
                                  "select": "id,event_date,premium"})
    for l in old:
        new = demote(l, today)
        if new:
            stats["zurueckgestuft"] += 1
            if apply:
                db.update("leads", {"id": l["id"]}, {"premium": new})
    # Frist des Anlasses (Zertifikat läuft ab): nachtragen und ab dem Ablaufdatum zurückstufen
    cert = db.select_all("leads", {"status": "eq.new", "signal_type": "eq.cert_expiring",
                                   "premium->>tier": "eq.premium",
                                   "select": "id,signal_type,event_date,observation_ids,premium"})
    ev = _evidence(db, sorted({(r.get("observation_ids") or [None])[0] for r in cert
                               if not (r.get("premium") or {}).get("gilt_bis")} - {None}))
    for l in cert:
        new = with_deadline(l, ev.get((l.get("observation_ids") or [None])[0]), today)
        if new:
            stats["frist_nachgetragen" if new.get("tier") == "premium" else "frist_vorbei"] += 1
            if apply:
                db.update("leads", {"id": l["id"]}, {"premium": new})
    log(json.dumps(dict(stats), ensure_ascii=False, sort_keys=True))
    return dict(stats)


TEXT_SELECT = "id,company_id,country,signal_type,source_name,source_url,event_summary,opener,urgency_reason," \
              "observation_ids,premium"


def texte_batch(db, rows: list[dict]) -> list[tuple[str, dict]]:
    """(id, Änderung) je Lead: neue Texte (falls belegt) und immer der Merker premium.texte (einmal je Lead)."""
    from lib import radar
    ev = _evidence(db, sorted({(r.get("observation_ids") or [None])[0] for r in rows} - {None}))
    cos = sorted({r["company_id"] for r in rows if r.get("company_id")})
    names = {}
    for i in range(0, len(cos), 150):
        for c in db.select("watch_companies", {"id": f"in.({','.join(cos[i:i + 150])})", "select": "id,name"}):
            names[c["id"]] = c.get("name") or ""
    out = []
    for r in rows:
        new = radar.refresh_combo(r, ev.get((r.get("observation_ids") or [None])[0]), names.get(r.get("company_id"), ""))
        p = r.get("premium") if isinstance(r.get("premium"), dict) else {}
        out.append((r["id"], {**new, "premium": {**p, "texte": "kombi" if new else "geprueft"}}))
    return out


def texte(db, apply: bool, limit: int = 5000, log=print) -> dict:
    """Schritt 3: offene/reservierte Premium-Radar-Leads ohne Merker. Nur Texte aus vorhandenen Belegen, nie Stufe,
    Punktzahl oder Status; die Drei-Stufen-Freigabe prüft die Texte beim nächsten Lauf unverändert."""
    from lib.radar import SOURCE_NAME
    rows = db.select_all("leads", {"status": "in.(new,reserved)", "source_name": f"eq.{SOURCE_NAME}",
                                   "signal_type": "in.(cert_expiring,no_https)", "premium->>tier": "eq.premium",
                                   "premium->>texte": "is.null", "select": TEXT_SELECT})[:limit]
    stats: Counter = Counter()
    for i in range(0, len(rows), 300):
        part = rows[i:i + 300]
        upd = texte_batch(db, part)
        for (_, u), r in zip(upd, part):
            stats[f"texte_{'neu' if 'opener' in u else 'gleich'}:{r.get('country')}"] += 1
        if apply:
            with ThreadPoolExecutor(8) as ex:
                list(ex.map(lambda u: db.update("leads", {"id": u[0]}, u[1]), upd))
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
    db = DB()
    run(db, args.apply, args.limit)
    try:
        texte(db, args.apply)
    except Exception as exc:  # noqa: BLE001 - Texte nachtragen darf die Bewertung nie stoppen
        print(f"texte: {type(exc).__name__}: {str(exc)[:160]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
