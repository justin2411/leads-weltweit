#!/usr/bin/env python3
"""Prüft die Entwurfsvorlagen in drafts/*.md mit Beispielwerten gegen die Schreibregeln."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.rules import lint_draft  # noqa: E402

EXAMPLE = {"{agency}": "Northpoint Recruitment", "{specialism}": "engineering", "{region}": "Greater Manchester",
           "{town}": "Bolton", "{firm}": "Northbridge Financial Planning", "{specialism}": "workplace pensions", "{sender}": "Signalwerk", "{city}": "Austin", "{niche}": "restaurant", "{state}": "Texas"}

bad = 0
for f in sorted(Path(__file__).resolve().parents[1].glob("drafts/*.md")):
    for block in f.read_text(encoding="utf-8").split("\n---\n")[1:]:
        m = re.search(r"## ([^\n]*)\nSubject: ([^\n]*)\n\n(.*)", block, re.S)
        subj, body = m.group(2), m.group(3).strip()
        for k, v in EXAMPLE.items():
            subj, body = subj.replace(k, v), body.replace(k, v)
        r = lint_draft(subj, body, "fr" if "-FR" in f.name else "en")
        bad += not r.ok
        print(f"{f.name:<10} {m.group(1)[:34]:<36} {len(subj):>2} Z. {r.summary()}")
sys.exit(1 if bad else 0)
