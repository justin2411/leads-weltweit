#!/usr/bin/env python3
"""Probe-Leads je Segment und Land auswählen (status sample) und nach samples/ schreiben.

  python scripts/samples.py            # alle Segment/Land-Kombinationen mit Experiment
Auswahl: höchste Dringlichkeit, neueste Ereignisse, höchstens 3 Leads je Firma, keine Firmennamen,
die wie Personennamen aussehen (Heuristik: nur zwei Wörter + LLC/Ltd ohne Branchenwort).
"""
from __future__ import annotations

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
    from deliveries import _lang, contact_companies, enrich, to_csv
    exps = db.select("experiments", {"select": "segment_id,country"})
    known = contact_companies(db)
    for e in exps:
        seg, c = e["segment_id"], e["country"]
        existing = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{c}", "status": "eq.sample",
                                       "select": "id"})
        leads = db.select_all("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{c}",
                                    "status": "in.(new,sample)",
                                    "select": "*,watch_companies(name,legal_form,city,region,address,website)",
                                    "order": "event_date.desc,id"})
        leads = [l for l in leads if not looks_personal(l["watch_companies"]["name"])]
        # Leads mit Telefon und E-Mail zuerst (so sieht der Kunde, was er im Abo bekäme)
        leads.sort(key=lambda l: (l["company_id"] not in known, URG.get(l["urgency"], 3), -(int((l.get("event_date") or "1900-01-01").replace("-", "")))))
        chosen, per_company = [], {}
        for l in leads:
            # genau 10 verschiedene Firmen je Probe (Inhaber 29.09.2026: „es müssen immer genau 10 sein“)
            key = re.sub(r"[^a-z0-9]", "", (l["watch_companies"]["name"] or "").lower())
            if per_company.get(l["company_id"], 0) >= 1 or ("name:" + key) in per_company:
                continue
            per_company[l["company_id"]] = per_company.get(l["company_id"], 0) + 1
            per_company["name:" + key] = 1
            chosen.append(l)
            if len(chosen) >= 10:
                break
        if len(chosen) < 10:
            print(f"{seg}/{c}: nur {len(chosen)} geeignete Leads – keine Probe, kein Versand")
            stale = ROOT / "samples" / seg / c / "leads.csv"
            if stale.exists():  # nie eine Probe mit weniger als 10 Firmen liegen lassen
                stale.unlink()
            continue
        if len(existing) < 10:
            for l in chosen:
                db.update("leads", {"id": l["id"]}, {"status": "sample"})
        out = ROOT / "samples" / seg / c
        out.mkdir(parents=True, exist_ok=True)
        enrich(db, chosen, known)
        (out / "leads.csv").write_bytes(to_csv(chosen, _lang(c)))
        print(f"{seg}/{c}: Probe mit {len(chosen)} Leads -> {out / 'leads.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
