#!/usr/bin/env python3
"""Probe-Leads je Segment und Land auswählen (status sample) und nach samples/ schreiben.

  python scripts/samples.py            # alle Segment/Land-Kombinationen mit Experiment
Auswahl: höchste Dringlichkeit, neueste Ereignisse, höchstens 3 Leads je Firma, keine Firmennamen,
die wie Personennamen aussehen (Heuristik: nur zwei Wörter + LLC/Ltd ohne Branchenwort).
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.db import DB  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
URG = {"high": 0, "medium": 1, "low": 2}
BUSINESS_WORDS = re.compile(r"(group|services?|solutions|consult|market|company|studio|media|tech|design|"
                            r"construct|build|clean|care|food|cafe|restaurant|trade|logistic|transport|motor|auto|"
                            r"health|dental|salon|beauty|fitness|home|propert|realty|ventures|holdings?|partners|"
                            r"agency|retail|store|shop|supply|import|export|digital|software|energy|electric|"
                            r"plumb|roof|landscap|events|bakery|kitchen|coffee|news|soap|retreat|sport|road|"
                            r"sas|sarl|conseil|immobilier|transports|batiment|restauration|boulangerie|nettoyage|"
                            r"ltd|limited|llc|inc|corp)", re.I)


def looks_personal(name: str) -> bool:
    core = re.sub(r"\b(LLC|L\.L\.C\.|INC\.?|CORP\.?|CORPORATION|LTD|LIMITED|SAS|SARL|SASU|EURL|SCI)\b\.?", "",
                  name, flags=re.I).strip(" .,")
    words = [w for w in re.split(r"\s+", core) if w]
    has_word = BUSINESS_WORDS.search(core) is not None
    return len(words) <= 3 and not has_word


def main() -> int:
    db = DB()
    exps = db.select("experiments", {"select": "segment_id,country"})
    for e in exps:
        seg, c = e["segment_id"], e["country"]
        existing = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{c}", "status": "eq.sample",
                                       "select": "id"})
        leads = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{c}",
                                    "status": "in.(new,sample)",
                                    "select": "*,watch_companies(name,legal_form,city,region,address,website)",
                                    "order": "event_date.desc", "limit": "2000"})
        leads = [l for l in leads if not looks_personal(l["watch_companies"]["name"])]
        leads.sort(key=lambda l: (URG.get(l["urgency"], 3), -(int((l.get("event_date") or "1900-01-01").replace("-", "")))))
        chosen, per_company = [], {}
        for l in leads:
            if per_company.get(l["company_id"], 0) >= 3:
                continue
            per_company[l["company_id"]] = per_company.get(l["company_id"], 0) + 1
            chosen.append(l)
            if len(chosen) >= 10:
                break
        if len(chosen) < 10:
            print(f"{seg}/{c}: nur {len(chosen)} geeignete Leads – keine Probe, kein Versand")
            continue
        if len(existing) < 10:
            for l in chosen:
                db.update("leads", {"id": l["id"]}, {"status": "sample"})
        out = ROOT / "samples" / seg / c
        out.mkdir(parents=True, exist_ok=True)
        with open(out / "leads.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["company", "legal_form", "location", "signal", "event", "event_date", "source", "source_url",
                        "checked_on", "urgency", "urgency_reason", "opener"])
            for l in chosen:
                co = l["watch_companies"]
                loc = ", ".join(x for x in (co.get("city"), co.get("region")) if x)
                w.writerow([co["name"], co.get("legal_form") or "", loc, l["signal_type"], l["event_summary"],
                            l.get("event_date") or "", l["source_name"], l.get("source_url") or "", l["source_date"],
                            l["urgency"], l["urgency_reason"], l["opener"]])
        print(f"{seg}/{c}: Probe mit {len(chosen)} Leads -> {out / 'leads.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
