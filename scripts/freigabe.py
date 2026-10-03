#!/usr/bin/env python3
"""Drei-Stufen-Freigabe von der Kommandozeile (lib/release_gate.py, Inhaber 03.10.2026).

  python scripts/freigabe.py stichprobe --per 100 --countries US,UK,FR   # tägliche Stichprobe -> Fehlerquote je Land
  python scripts/freigabe.py vorrat [--apply] [--alle]                   # fertige Proben erneut prüfen (verwerfen/neu bauen)
  python scripts/freigabe.py lead <id> [<id> …]                          # einzelne Leads prüfen (nur anzeigen)

Stichprobe: zufällige lieferfähige (vollständige, freie) Leads der Zielgruppe je Land laufen durch dieselbe Prüfung wie
vor jeder Probe und Lieferung (inkl. Live-Nachprüfung des Triggers). Ergebnis in run_stats (werk „stichprobe“), im
Dashboard und im Tagescheck: Fehlerquote über 2 % = gelb, über 5 % = rot. Durchgefallene Leads gehen nie raus (held).
Sendet nichts, löscht nichts.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

LIMIT_YELLOW = 0.02
LIMIT_RED = 0.05


def level(rate: float | None) -> str:
    if rate is None:
        return "grau"
    return "rot" if rate > LIMIT_RED else "gelb" if rate > LIMIT_YELLOW else "gruen"


def sample_ids(db, seg: str, country: str, n: int, rng: random.Random, tries: int = 8) -> list[str]:
    """Zufällige freie Leads (zufälliger Einstieg in die UUID-Reihenfolge, mehrere Stellen), nur vollständige."""
    from deliveries import contact_companies
    picked: dict[str, str] = {}
    for _ in range(tries):
        start = str(uuid.UUID(int=rng.getrandbits(128)))
        rows = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "status": "eq.new",
                                   "id": f"gte.{start}", "order": "id", "limit": str(max(20, n)), "select": "id,company_id"})
        if not rows:
            continue
        known = contact_companies(db, website_optional=(seg == "S2"), only=sorted({r["company_id"] for r in rows}))
        for r in rows:
            if r["company_id"] in known:
                picked.setdefault(r["id"], r["company_id"])
        if len(picked) >= n:
            break
    ids = list(picked)
    rng.shuffle(ids)
    return ids[:n]


def cmd_stichprobe(args) -> int:
    from lib import release_gate as G
    from lib.db import DB
    from lib.run_stats import record
    db = DB()
    rng = random.Random(args.seed)
    out = {}
    for c in [x.strip().upper() for x in args.countries.split(",") if x.strip()]:
        ids = sample_ids(db, args.segment, c, args.per, rng)
        vs = G.check(db, ids, country=c, live=not args.offline)
        if args.apply:
            G.persist(db, vs, "stichprobe")
        s = G.summary(vs)
        rate = (1 - s["freigegeben"] / s["geprueft"]) if s["geprueft"] else None
        out[c] = {**s, "fehlerquote": rate, "ampel": level(rate)}
        print(f"{args.segment}/{c}: {s['geprueft']} geprüft, {s['freigegeben']} freigegeben, Fehlerquote "
              f"{'–' if rate is None else f'{rate:.1%}'} ({level(rate)}) – {list(s['gruende'].items())[:5]}", flush=True)
        if args.apply:
            rows = G.stats_rows(vs) or [{"segment_id": args.segment, "country": c, "candidates": 0, "processed": 0,
                                         "yellow": 0, "green": 0, "red": 0, "reasons": {}, "extra": {}}]
            for r in rows:
                r["extra"] = {**r.get("extra", {}), "fehlerquote": rate, "ampel": level(rate)}
            record(db, "stichprobe", rows, None)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        lines = ["### Freigabe-Stichprobe", "", "| Land | geprüft | freigegeben | Fehlerquote | Ampel | häufigste Gründe |",
                 "|---|---|---|---|---|---|"]
        for c, s in out.items():
            r = s["fehlerquote"]
            lines.append(f"| {c} | {s['geprueft']} | {s['freigegeben']} | {'–' if r is None else f'{r:.1%}'} | {s['ampel']} | "
                         + ", ".join(f"{k} {v}" for k, v in list(s["gruende"].items())[:4]) + " |")
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    if args.json:
        print(json.dumps(out, ensure_ascii=False, default=str))
    return 0


def cmd_vorrat(args) -> int:
    from lib.db import DB
    from sample_stock import verify_stock
    db = DB()
    res = verify_stock(db, args.apply, max_hours=0 if args.alle else 20)
    from lib import release_gate as G
    s = G.summary(res["verdicts"])
    print(f"Proben geprüft {res['geprueft']}, bestanden {res['bestanden']}, verworfen {res['verworfen']}"
          + ("" if args.apply else " (Probelauf)"))
    print(json.dumps(s, ensure_ascii=False))
    by = {}
    for v in res["verdicts"]:
        by.setdefault(v.country, []).append(v)
    for c, vs in sorted(by.items()):
        print(c, json.dumps(G.summary(vs), ensure_ascii=False))
    return 0


def cmd_lead(args) -> int:
    from lib import release_gate as G
    from lib.db import DB
    for v in G.check(DB(), args.ids, live=not args.offline, allowed_status=("new", "reserved")):
        print(v.lead_id, "FREIGEGEBEN" if v.ok else f"Stufe {v.stage} ({G.STAGES[v.stage]})", v.reasons)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("stichprobe")
    s.add_argument("--segment", default="S2")
    s.add_argument("--countries", default="US,UK,FR")
    s.add_argument("--per", type=int, default=100)
    s.add_argument("--seed", type=int)
    s.add_argument("--apply", action="store_true", help="Ergebnis speichern (lead_checks, held, run_stats)")
    s.add_argument("--offline", action="store_true", help="ohne Live-Nachprüfung")
    s.add_argument("--json", action="store_true")
    v = sub.add_parser("vorrat")
    v.add_argument("--apply", action="store_true")
    v.add_argument("--alle", action="store_true", help="alle fertigen Proben, auch frisch geprüfte")
    lp = sub.add_parser("lead")
    lp.add_argument("ids", nargs="+")
    lp.add_argument("--offline", action="store_true")
    args = ap.parse_args(argv)
    return {"stichprobe": cmd_stichprobe, "vorrat": cmd_vorrat, "lead": cmd_lead}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
