"""Belegungsplan der Werke: wie viele Plätze (GitHub-Jobs) jede Linie bekommt (Inhaber 03.10.2026: „die werke wie
maschinen steuern … wv plätze werden belegt“).

Liest die Linien aus app/lib/werk-linien.json und die Einstellung des Inhabers (owner_settings.slot_plan,
gesetzt im Leitstand des Dashboards) und schreibt die Matrix für lead-werk.yml bzw. kunden-werk.yml.
Fehlt die Einstellung oder ist die Datenbank nicht erreichbar, gelten die Standardwerte – der Plan verhindert
nie einen Lauf. Grenzen: je Linie 0 … max, Summe höchstens total_slots - reserve (sonst Standardwerte).

  python scripts/werk_plan.py lead-werk      # schreibt matrix=… und teile=… nach $GITHUB_OUTPUT
  python scripts/werk_plan.py kunden-werk --dry
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINES = ROOT / "app" / "lib" / "werk-linien.json"


def load_lines(path: Path = LINES) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def counts(reg: dict, plan: dict | None) -> tuple[dict[str, int], str]:
    """Plätze je Linie aus Einstellung + Standard, geprüft. Rückgabe (Plätze, Hinweis)."""
    default = {l["id"]: int(l["default"]) for l in reg["lanes"]}
    if not isinstance(plan, dict) or not plan:
        return default, "Standardbelegung"
    out = dict(default)
    for l in reg["lanes"]:
        v = plan.get(l["id"])
        if v is None:
            continue
        try:
            n = int(v)
        except (TypeError, ValueError):
            return default, f"ungültiger Wert für {l['id']} – Standardbelegung"
        out[l["id"]] = max(0, min(n, int(l["max"])))
    cap = int(reg["total_slots"]) - int(reg["reserve"])
    if sum(out.values()) > cap:
        return default, f"Summe {sum(out.values())} > {cap} Plätze – Standardbelegung"
    return out, "Belegung des Inhabers"


def matrix(reg: dict, werk: str, n: dict[str, int]) -> list[dict]:
    """Matrix-Einträge eines Werks: Name {linie}-{i}, Teil i von N (--shard), Argumente aus der Linie."""
    rows: list[dict] = []
    for l in reg["lanes"]:
        if l["werk"] != werk:
            continue
        k = n.get(l["id"], 0)
        for i in range(k):
            if werk == "kunden-werk":
                rows.append({"shard": i, "of": k})
                continue
            args = l["args"] + (f" --shard {i}/{k}" if k > 1 else "")
            rows.append({"name": f"{l['id']}-{i}", "workers": int(l.get("workers", 16)), "args": args})
    return rows


def read_plan(werk: str | None = None) -> dict | None:
    """Belegungsplan aus owner_settings; mit `werk` quittiert dieses Werk den gelesenen Plan (settings_ack)."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.db import DB
        db = DB(timeout=15)
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.slot_plan"}) or []
        plan = rows[0]["value"] if rows else None
        if werk:
            from lib.owner_settings import ack
            ack(db, werk, ["slot_plan"], {"slot_plan": plan if plan is not None else {}})
        return plan
    except BaseException as e:  # noqa: BLE001 – ohne Datenbank gilt der Standard (SystemExit ohne Schlüssel inklusive)
        print(f"Belegungsplan nicht lesbar ({type(e).__name__}) – Standardbelegung", file=sys.stderr)
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("werk", choices=["lead-werk", "kunden-werk"])
    ap.add_argument("--dry", action="store_true", help="nur anzeigen")
    a = ap.parse_args(argv)
    reg = load_lines()
    # Quittung (settings_ack) nur bei echten Läufen, nicht bei --dry
    n, why = counts(reg, None if a.dry and not os.environ.get("SUPABASE_URL") else read_plan(None if a.dry else a.werk))
    rows = matrix(reg, a.werk, n)
    summary = ", ".join(f"{l['id']} {n[l['id']]}" for l in reg["lanes"] if l["werk"] == a.werk)
    print(f"{a.werk}: {len(rows)} Teile ({why}) – {summary}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out and not a.dry:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"matrix={json.dumps({'include': rows}, ensure_ascii=False)}\n")
            f.write(f"teile={len(rows)}\n")
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ and not a.dry:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"Belegung {a.werk}: {len(rows)} Plätze ({why}) – {summary}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
