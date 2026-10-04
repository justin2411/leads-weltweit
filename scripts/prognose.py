#!/usr/bin/env python3
"""Prognose 30 Tage für das Gehirn (gleiche Rechnung wie JARVIS, app/lib/prognose.ts): je Land der Test-Freigabe
(config/fokus.yaml, heute S2 × US/UK/FR) Mails → Antworten → Proben → Kunden → Umsatz, mit Spanne. Ohne Antworten:
„noch keine Basis“ – nichts wird erfunden. Liest nur Zählungen (experiment_stats, inbound_replies, dashboard_daily,
kpi_daily), schreibt nichts, sendet nichts.

  python scripts/prognose.py           # ein Satz je Land
  python scripts/prognose.py --json    # volle Werte (Stufen, Spannen)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.prognose import forecast  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
CURRENCY = {"US": "$", "UK": "£", "FR": "€"}
STARTER = 129  # Inhaber 29.09.2026: Starter 129 in allen Ländern (Landeswährung)


def per_day(daily: list[dict], today: dt.date) -> dict[str, float]:
    """Mails je Tag je Land: Schnitt der 7 vollen Tage vor heute."""
    lo, hi = (today - dt.timedelta(days=7)).isoformat(), (today - dt.timedelta(days=1)).isoformat()
    out: dict[str, float] = {}
    for r in daily:
        c, d = r.get("country"), str(r.get("day") or "")
        if c and lo <= d <= hi:
            out[c] = out.get(c, 0) + float(r.get("sent") or 0) / 7
    return out


def inbound(rows: list[dict], segment: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in rows:
        p = r.get("prospects") or {}
        c, seg = p.get("country"), p.get("segment_id")
        if not c or (seg and seg != segment) or r.get("intent") == "out_of_office":
            continue
        x = out.setdefault(c, {"replies": 0, "samples": 0})
        x["replies"] += 1
        if r.get("intent") in ("sample", "buy"):
            x["samples"] += 1
    return out


def build(stats: list[dict], replies: dict[str, dict], pace: dict[str, float], free: dict[str, float],
          segment: str, countries: list[str]) -> list[dict]:
    out = []
    for c in countries:
        rows = [s for s in stats if s.get("segment_id") == segment and s.get("country") == c]
        f = {k: sum(int(s.get(k) or 0) for s in rows) for k in ("sent", "replies", "samples", "customers")}
        ib = replies.get(c, {"replies": 0, "samples": 0})
        out.append(forecast({
            "country": c, "sent": f["sent"], "replies": max(f["replies"], ib["replies"]), "samples": max(f["samples"], ib["samples"]),
            "customers": f["customers"], "perDay": pace.get(c, 0), "freeBuyers": free.get(c), "price": STARTER, "currency": CURRENCY.get(c, "€"),
        }))
    return out


def load(db, segment: str, countries: list[str], now: dt.datetime | None = None) -> list[dict]:
    today = (now or dt.datetime.now(dt.timezone.utc)).astimezone(BERLIN).date()
    stats = db.select("experiment_stats", {"select": "segment_id,country,sent,replies,samples,customers", "segment_id": f"eq.{segment}"})
    rep = db.select_all("inbound_replies", {"select": "intent,prospects(country,segment_id)"})
    daily = db.rpc("dashboard_daily", {"p_segment": segment, "p_from": (today - dt.timedelta(days=8)).isoformat(), "p_to": today.isoformat()}) or []
    kpi = db.select("kpi_daily", {"select": "day,country,value", "metric": "eq.kaeufer_frei", "segment_id": f"eq.{segment}", "order": "day.desc", "limit": "30"})
    free: dict[str, float] = {}
    for r in kpi:
        free.setdefault(r["country"], float(r.get("value") or 0))
    return build(stats, inbound(rep, segment), per_day(daily, today), free, segment, countries)


def main(argv: list[str]) -> int:
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    from lib.fokus import test_scope
    segs, countries = test_scope()
    db = DB()
    for s in segs:
        ps = load(db, s, countries)
        if "--json" in argv:
            print(json.dumps({s: ps}, ensure_ascii=False, indent=1))
        else:
            print(f"Prognose 30 Tage {s}:")
            for p in ps:
                print(f"  {p['text']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
