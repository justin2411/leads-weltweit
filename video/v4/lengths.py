"""Satzlängen je Film anzeigen: python lengths.py [name ...] (Standard: alle mit out/<name>/timing.json)"""
import json, sys
from pathlib import Path
here = Path(__file__).parent
names = sys.argv[1:] or sorted(p.parent.name for p in here.glob("out/*/timing.json"))
for n in names:
    T = json.loads((here / f"out/{n}/timing.json").read_text())
    print(f"{n:24s} {T['total']:5.1f}s ", " ".join(f"{l['id']}={l['end'] - l['start']:.1f}" for l in T["lines"]))
