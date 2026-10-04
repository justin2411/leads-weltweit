"""Aufräumen nach festen Regeln (Inhaber 05.10.2026: „Achte aber auch auf unsere Ressourcen wie Speicherknappheit über
Supabase und lösche auch Daten, die wir nicht brauchen“).

Nur klar unnötige Daten, Kategorien und Mindestalter fest in der Datenbank-Funktion signalwerk.aufraeumen
(Migration 20261005090000): alter Rohbestand (30 Tage, nie Lead/Probe/Lieferung), Laufzahlen/Herzschläge/
Belegungs-Protokoll (14 Tage; Tageswerte in kpi_daily bleiben), verworfene Proben samt Datei (14 Tage). Nie: Leads,
Sperrliste, Nachrichten/Ereignisse, Käufer, Kunden, Abos, Lieferungen, Entscheidungen, brain_*, agent_tasks.

Ablauf: Größen messen -> Trockenlauf (Zählung je Kategorie) -> mit --apply in Häppchen löschen (je Aufruf höchstens
--batch Zeilen, kurze Sperren) -> Größen erneut messen -> Ergebnis als decisions-Notiz (kurz_titel/kurz_grund).

  python scripts/aufraeumen.py            # nur Trockenlauf
  python scripts/aufraeumen.py --apply    # löschen
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

GB = 1024 ** 3
KATEGORIEN = ("rohbestand", "rohbestand_firma", "run_stats", "heartbeat", "plan_log", "proben")
NAMEN = {"rohbestand": "Rohbestand > 30 T", "rohbestand_firma": "alter Rohbestand als Firma > 30 T",
         "run_stats": "Laufzahlen > 14 T", "heartbeat": "Herzschläge > 14 T", "plan_log": "Belegungs-Protokoll > 14 T",
         "proben": "verworfene Proben > 14 T"}
# Tabellen, die das Aufräumen nie anfasst (Prüfung im Test gegen die Migration)
NIE = ("leads", "suppression", "messages", "email_events", "prospects", "customers", "subscriptions", "deliveries",
       "decisions", "agent_tasks", "kpi_daily", "lead_checks")
MAX_BATCHES = 2000  # Sicherung gegen Endlosschleifen (2000 × 2000 = 4 Mio. Zeilen je Kategorie und Lauf)


def groessen(db) -> dict:
    try:
        r = db.rpc("aufraeumen_groessen", {})
        return r if isinstance(r, dict) else json.loads(r)
    except Exception as e:  # noqa: BLE001 – ohne Messung trotzdem aufräumen
        print(f"Größen nicht lesbar ({type(e).__name__})", file=sys.stderr)
        return {}


def trocken(db) -> dict[str, int]:
    return {k: int(db.rpc("aufraeumen", {"p_kind": k, "p_dry": True}) or 0) for k in KATEGORIEN}


def loeschen(db, kind: str, batch: int = 2000, pause: float = 0.2) -> int:
    """Eine Kategorie in Häppchen löschen, bis ein Aufruf weniger als `batch` Zeilen bringt."""
    total = 0
    for _ in range(MAX_BATCHES):
        n = int(db.rpc("aufraeumen", {"p_kind": kind, "p_dry": False, "p_limit": batch}) or 0)
        total += n
        if n < batch:
            break
        time.sleep(pause)
    return total


def gb(b) -> str:
    return f"{(b or 0) / GB:.2f}".replace(".", ",") + " GB"


def notiz(vorher: dict, nachher: dict, zahl: dict[str, int], apply: bool) -> dict:
    n = sum(zahl.values())
    teile = ", ".join(f"{NAMEN[k]} {v}" for k, v in zahl.items() if v) or "nichts fällig"
    titel = f"Speicher aufgeräumt: {n} Zeilen gelöscht" if apply else f"Aufräumen geprüft: {n} Zeilen fällig"
    grund = f"DB {gb(vorher.get('db'))} → {gb(nachher.get('db'))}; {teile}"
    big = sorted((vorher.get("tables") or {}).items(), key=lambda x: -x[1])[:5]
    return {"type": "note", "subject": titel, "status": "done",
            "reasoning": grund + ". Größte Tabellen: " + ", ".join(f"{k} {gb(v)}" for k, v in big),
            "metrics": {"vorher": vorher.get("db"), "nachher": nachher.get("db"), "geloescht": zahl,
                        "apply": apply, "tabellen_vorher": dict(big)},
            "kurz_titel": titel[:60], "kurz_grund": grund[:160]}


def run(db, apply: bool = False, batch: int = 2000, log=print, write_note: bool = True, force_note: bool = False) -> dict:
    vorher = groessen(db)
    try:
        plan = trocken(db)
    except RuntimeError as e:
        if "aufraeumen" in str(e) and ("PGRST202" in str(e) or "Could not find" in str(e)):
            # Migration 20261005090000 noch nicht angewandt: nichts tun, Lauf bleibt grün
            log("Aufräum-Funktion fehlt in der Datenbank (Migration noch nicht angewandt) – nichts gelöscht")
            return {"vorher": vorher.get("db"), "nachher": vorher.get("db"), "plan": {}, "geloescht": {},
                    "fehlt": True}
        raise
    log(f"Trockenlauf (DB {gb(vorher.get('db'))}): " + ", ".join(f"{k} {v}" for k, v in plan.items()))
    zahl = dict(plan)
    if apply:
        try:  # Dateien verworfener Proben zuerst aus dem Storage (Zeile erst danach löschbar)
            from sample_stock import cleanup_files
            cleanup_files(db, log=log)
        except Exception as e:  # noqa: BLE001
            log(f"Proben-Dateien nicht gelöscht ({type(e).__name__}) – Proben-Zeilen bleiben")
        zahl = {k: (loeschen(db, k, batch) if plan[k] else 0) for k in KATEGORIEN}
        log("Gelöscht: " + ", ".join(f"{k} {v}" for k, v in zahl.items()))
    nachher = groessen(db) if apply else vorher
    res = {"vorher": vorher.get("db"), "nachher": nachher.get("db"), "plan": plan, "geloescht": zahl if apply else {}}
    if write_note and (force_note or any(plan.values())):  # leere Tage ohne Notiz (wenig Text, Inhaber 04.10.2026)
        try:
            from lib.kurz import insert_decisions
            insert_decisions(db, notiz(vorher, nachher, zahl, apply))
        except Exception as e:  # noqa: BLE001
            log(f"Notiz nicht geschrieben ({type(e).__name__})")
    return res


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="wirklich löschen (sonst nur zählen)")
    ap.add_argument("--batch", type=int, default=2000)
    ap.add_argument("--notiz", action="store_true", help="Notiz in decisions auch ohne fällige Zeilen")
    a = ap.parse_args(argv)
    from lib.db import DB
    res = run(DB(timeout=180), apply=a.apply, batch=a.batch, force_note=a.notiz)
    print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
