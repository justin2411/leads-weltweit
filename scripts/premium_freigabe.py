#!/usr/bin/env python3
"""Drei-Stufen-Freigabe für frische, noch ungeprüfte Premium-Leads einer Zielgruppe (Branchen-Test 05.10.2026).

Neue Zielgruppen außerhalb des Fokus (z. B. S5 Buchhaltung US/UK) bekommen keine tägliche Stichprobe; ihre
Premium-Leads zählen für die Tore (scripts/zielgruppe_bereit.py) aber erst mit lead_checks.result = released. Dieses
Skript prüft genau diese Leads mit derselben Freigabe wie vor jeder Probe und Lieferung (lib/release_gate.py, inkl.
Live-Nachprüfung höchstens 1×/Tag je Seite und Inhaber-Regeln). Durchgefallene gehen auf `held` (nie raus), nichts
wird gelöscht, nichts gesendet.

  python scripts/premium_freigabe.py S5 US,UK            # Probelauf: nur zählen
  python scripts/premium_freigabe.py S5 US,UK --apply    # Ergebnis speichern (lead_checks, held)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.premium import PREMIUM_MAX_AGE  # noqa: E402


def unchecked(db, seg: str, country: str, today: dt.date, limit: int = 1000) -> list[str]:
    """Frische Premium-Leads (Status new, Ereignis ≤ PREMIUM_MAX_AGE Tage) ohne Prüfergebnis."""
    since = (today - dt.timedelta(days=PREMIUM_MAX_AGE)).isoformat()
    rows = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "eq.new",
                               "premium->>tier": "eq.premium", "event_date": f"gte.{since}",
                               "select": "id,lead_checks(result)", "order": "event_date.desc", "limit": str(limit)})
    return [r["id"] for r in rows if not r.get("lead_checks")]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("segment")
    ap.add_argument("countries", help="z. B. US,UK")
    ap.add_argument("--apply", action="store_true", help="lead_checks schreiben, Durchgefallene auf held")
    ap.add_argument("--offline", action="store_true", help="ohne Live-Nachprüfung (nur zum Ansehen)")
    args = ap.parse_args(argv)
    if args.apply and args.offline:
        print("--apply nur mit Live-Nachprüfung (die Freigabe wird nie aufgeweicht)")
        return 2
    from lib import release_gate as G
    from lib.db import DB
    db = DB()
    today = dt.datetime.now(dt.timezone.utc).date()
    seg = args.segment.strip().upper()
    out = {}
    for c in [x.strip().upper() for x in args.countries.split(",") if x.strip()]:
        ids = unchecked(db, seg, c, today)
        if not ids:
            out[c] = {"geprueft": 0, "freigegeben": 0}
            print(f"{seg}/{c}: keine ungeprüften Premium-Leads")
            continue
        vs = G.check(db, ids, country=c, live=not args.offline)
        if args.apply:
            G.persist(db, vs, f"premium-{seg.lower()}")
        s = G.summary(vs)
        out[c] = s
        print(f"{seg}/{c}: {s['geprueft']} geprüft, {s['freigegeben']} freigegeben"
              + ("" if args.apply else " (Probelauf)") + f" – {list(s['gruende'].items())[:4]}", flush=True)
    print(json.dumps(out, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
