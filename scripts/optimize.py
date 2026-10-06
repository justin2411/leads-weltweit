#!/usr/bin/env python3
"""Selbstlernender Betrieb: Experimente auswerten, Versand auf die Gewinner lenken, neue Zielgruppen starten.

  python scripts/optimize.py            # Probelauf: zeigt, was passieren würde
  python scripts/optimize.py --apply    # Entscheidungen, Gewichte und Starts in die Datenbank schreiben

Ziel (Inhaber 26.09.2026): Neukunden maximieren, selbst lernen, neue Zielgruppen selbstständig aufbauen.

1. Entscheiden nach CLAUDE.md Abschnitt 5 (feste Regeln, erst mit genug Daten):
   ab 50 zugestellten Mails, die mind. 14 Tage alt sind: < 2 % positiv -> stoppen, 2–5 % ohne Proben -> neue
   Botschaft, > 5 % oder ein Kunde -> Gewinner. Beschwerden über 0,3 % -> stoppen.
2. Versandgewichte (Thompson-Sampling): Experimente mit mehr Proben/Kaufinteresse/Kunden bekommen mehr vom
   Tagesbudget; neue Experimente bekommen Erkundungsanteil, damit jede Idee eine faire Chance hat.
3. Neue Zielgruppen aus config/zielgruppen.yaml starten, wenn Platz ist (config/lernen.yaml).
Alles wird in learning_log protokolliert und steht im Morgenbericht.
"""
from __future__ import annotations

import argparse
import datetime as dt
import random
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
MIN_DELIVERED = 50
MEASURE_DAYS = 14
EXPLORE_BELOW = 30  # unter so vielen Zustellungen gilt ein Experiment als neu


def settings() -> dict:
    try:
        return yaml.safe_load((ROOT / "config" / "lernen.yaml").read_text(encoding="utf-8")) or {}
    except OSError:
        return {}


def positives(s: dict) -> int:
    return int(s.get("positive") or 0) + int(s.get("samples") or 0)


def decide(s: dict, mature: int) -> tuple[str, str] | None:
    """Entscheidung nach Abschnitt 5 oder None (weiter sammeln). mature = zugestellte Mails, die alt genug sind."""
    dlv = int(s.get("delivered") or 0)
    comp = int(s.get("complained") or 0)
    if dlv >= MIN_DELIVERED and comp / dlv > 0.003:
        return "killed", f"Spam-Beschwerden {comp}/{dlv} über 0,3 %"
    if int(s.get("customers") or 0) >= 1:
        return "winner", f"{s['customers']} zahlende(r) Kunde(n)"
    if mature < MIN_DELIVERED:
        return None
    pos = positives(s)
    rate = pos / dlv if dlv else 0
    if rate > 0.05:
        return "winner", f"{pos}/{dlv} = {rate:.1%} positiv (über 5 %)"
    if rate < 0.02:
        return "killed", f"{pos}/{dlv} = {rate:.1%} positiv (unter 2 %)"
    if not int(s.get("samples") or 0):
        return "new_message", f"{rate:.1%} positiv, aber keine Probe angefordert"
    return None


def weights(stats: list[dict], rng: random.Random | None = None) -> dict[str, float]:
    """Thompson-Sampling auf die Quote 'positiv'; Kunden zählen dreifach. Mittelwert 1, Untergrenze 0,2."""
    rng = rng or random.Random()
    raw = {}
    for s in stats:
        dlv = int(s.get("delivered") or 0)
        pos = positives(s) + 3 * int(s.get("customers") or 0)
        raw[s["experiment_id"]] = rng.betavariate(1 + pos, 1 + max(dlv - pos, 0))
    if not raw:
        return {}
    top = max(raw.values())
    for s in stats:  # Erkundung: neue Experimente so hoch wie das beste
        if int(s.get("delivered") or 0) < EXPLORE_BELOW:
            raw[s["experiment_id"]] = top
    mean = sum(raw.values()) / len(raw)
    return {k: round(max(v / mean, 0.2), 3) if mean else 1.0 for k, v in raw.items()}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib import catalog
    from lib.db import DB
    db = DB()
    cfg = settings()
    today = dt.date.today()
    now = dt.datetime.now(dt.timezone.utc)
    log = []

    def note(kind: str, text: str, segment: str | None = None, experiment: str | None = None) -> None:
        print(f"[{kind}] {text}")
        log.append({"kind": kind, "text": text, "segment_id": segment, "experiment_id": experiment})

    exps = {e["id"]: e for e in db.select("experiments", {"select": "*"})}
    stats = [s for s in db.select("experiment_stats", {"select": "*"})
             if exps.get(s["experiment_id"], {}).get("decision") != "killed"
             and exps.get(s["experiment_id"], {}).get("status") != "done"]

    # 1. Entscheidungen
    cutoff = (now - dt.timedelta(days=MEASURE_DAYS)).isoformat()
    for s in stats:
        e = exps[s["experiment_id"]]
        old = db.select_all("messages", {"experiment_id": f"eq.{e['id']}", "status": "eq.sent",
                                         "sent_at": f"lte.{cutoff}", "select": "id"})
        mature = min(len(old), int(s.get("delivered") or 0))
        d = decide(s, mature)
        if not d or d[0] == e.get("decision"):
            continue
        decision, reason = d
        note("decision", f"{e['segment_id']}/{e['country']} {e['variant']}: {decision} – {reason}",
             e["segment_id"], e["id"])
        if args.apply:
            upd = {"decision": decision, "decision_reason": reason, "decided_on": today.isoformat()}
            if decision == "killed":
                upd["status"] = "done"
            db.update("experiments", {"id": e["id"]}, upd)
            if decision == "winner":
                db.update("segments", {"id": e["segment_id"]}, {"status": "winner"})
            if decision == "killed":
                others = [x for x in exps.values() if x["segment_id"] == e["segment_id"] and x["id"] != e["id"]
                          and x.get("decision") != "killed" and x.get("status") != "done"]
                if not others:
                    db.update("segments", {"id": e["segment_id"]}, {"status": "killed"})
                    note("decision", f"Zielgruppe {e['segment_id']} gestoppt (alle Tests unter der Schwelle)",
                         e["segment_id"])

    # 2. Versandgewichte
    live = [s for s in stats if s["experiment_id"] in exps]
    w = weights(live)
    if w:
        best = sorted(w.items(), key=lambda kv: -kv[1])[:3]
        note("weights", "Mehr Versand für: " + ", ".join(
            f"{exps[k]['segment_id']}/{exps[k]['country']} ×{v:.1f}" for k, v in best))
        if args.apply:
            for k, v in w.items():
                db.update("experiments", {"id": k}, {"weight": v})

    # 3. Neue Zielgruppen starten
    if cfg.get("auto_start", True):
        segs = {s["id"]: s for s in db.select("segments", {"select": "id,status,name"})}
        active = [sid for sid, s in segs.items() if s["status"] in ("testing", "winner")]
        recent = db.select("learning_log", {"kind": "eq.launch", "select": "created_at", "order": "created_at.desc",
                                            "limit": "1"})
        gap = int(cfg.get("neue_zielgruppe_alle_tage", 7))
        due = not recent or dt.datetime.fromisoformat(recent[0]["created_at"]) <= now - dt.timedelta(days=gap)
        killed_since = bool(recent) and any(
            x.get("decided_on") and x.get("decision") == "killed" and x["decided_on"] >= recent[0]["created_at"][:10]
            for x in exps.values())
        if len(active) < int(cfg.get("max_aktive_zielgruppen", 8)) and (due or killed_since):
            nxt = next((sid for sid in catalog.entries() if segs.get(sid, {}).get("status", "idea") == "idea"), None)
            if nxt:
                entry = catalog.entries()[nxt]
                note("launch", f"Neue Zielgruppe gestartet: {nxt} {entry['name']} ({', '.join(entry['laender'])}) – "
                               f"{entry.get('begruendung', '')}", nxt)
                if args.apply:
                    db.insert("segments", {"id": nxt, "name": entry["name"], "signals": entry.get("signale", []),
                                           "email_countries": entry["laender"], "status": "testing",
                                           "notes": "automatisch gestartet (config/zielgruppen.yaml)"},
                              upsert_on="id")
                    for c in entry["laender"]:
                        db.insert("experiments", {"segment_id": nxt, "country": c, "variant": "v1",
                                                  "hypothesis": entry.get("begruendung") or entry["name"],
                                                  "message_notes": entry["betreff"], "planned_count": 100,
                                                  "status": "running", "started_on": today.isoformat()},
                                  upsert_on="segment_id,country,variant", ignore_duplicates=True)
            else:
                note("idea", "Katalog leer: neue Zielgruppen-Ideen nötig (wöchentliche Lern-Sitzung)")

    if args.apply and log:
        db.insert("learning_log", log)
    if not args.apply:
        print("\nProbelauf – mit --apply übernehmen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
