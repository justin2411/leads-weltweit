#!/usr/bin/env python3
"""Mehrere Extraktor-Läufe zusammenführen (z. B. parallel je Branche) und Texte über alle Läufe auf Einmaligkeit prüfen.

  python scripts/extraktor/merge.py out/x1 out/x2 out/x3 --per 100 --out out/extraktor
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extraktor.model import CSV_COLUMNS  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--per", type=int, default=100)
    ap.add_argument("--out", default="out/extraktor")
    args = ap.parse_args(argv)
    rows, seen = [], set()
    for d in args.dirs:
        for r in csv.DictReader(open(Path(d) / "leads_alle.csv", encoding="utf-8")):
            key = (r["segment"], r["source"], r["source_id"])
            if key not in seen:
                seen.add(key)
                rows.append(r)
    for r in rows:  # Grammatik aus älteren Läufen: "a outlook.com" -> "an outlook.com"
        r["signal"] = re.sub(r"\ba ([aeiou][\w.-]*\.[a-z]{2,} address)", r"an \1", r["signal"])
        for k in ("signal", "company_info"):
            r[k] = r[k].replace("..", ".")
    # Einmaligkeit neu bewerten: alte "_not_unique"-Treffer entfernen und Ampel neu setzen
    for r in rows:
        probs = [x for x in r["sc_notes"].split("; ") if x and not x.endswith("_not_unique")]
        r["sc_notes"] = "; ".join(probs)
        r["sc"] = "fail" if probs else "pass"
        r["ampel"] = ("red" if r["qc"] == "red" or probs else "green" if r["qc"] == "green" else "yellow")
    for k in ("signal", "company_info", "opener"):
        groups = defaultdict(list)
        for r in rows:
            if r["ampel"] in ("green", "yellow") and r[k].strip():
                groups[r[k].strip().lower()].append(r)
        for g in groups.values():
            if len({(r["source"], r["source_id"]) for r in g}) > 1:
                for r in g:
                    r["ampel"], r["sc"] = "red", "fail"
                    r["sc_notes"] = "; ".join(x for x in (r["sc_notes"], f"{k}_not_unique") if x)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "leads_alle.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    per, greens = Counter(), []
    for r in rows:
        k = f"{r['segment']}/{r['country']}"
        if r["ampel"] == "green" and per[k] < args.per:
            per[k] += 1
            greens.append(r)
    with open(out / "leads_gruen.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        w.writerows(greens)
    stats = Counter((f"{r['segment']}/{r['country']}", r["ampel"]) for r in rows)
    for seg in sorted({f"{r['segment']}/{r['country']}" for r in rows}):
        print(seg, {a: stats[(seg, a)] for a in ("green", "yellow", "red")}, "geschrieben grün:", per[seg])
    return 0


if __name__ == "__main__":
    sys.exit(main())
