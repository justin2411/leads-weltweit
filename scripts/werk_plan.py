"""Belegungsplan der Werke: wie viele Plätze (GitHub-Jobs) jede Linie bekommt (Inhaber 03.10.2026: „die werke wie
maschinen steuern … wv plätze werden belegt“).

Liest die Linien aus app/lib/werk-linien.json und die Einstellung des Inhabers (owner_settings.slot_plan,
gesetzt im Leitstand des Dashboards) und schreibt die Matrix für lead-werk.yml bzw. kunden-werk.yml.
Fehlt die Einstellung oder ist die Datenbank nicht erreichbar, gelten die Standardwerte – der Plan verhindert
nie einen Lauf. Grenzen: je Linie 0 … max, Summe höchstens total_slots - reserve (sonst Standardwerte).

Autopilot (Inhaber 03.10.2026: „Ja, Autopilot an“, owner_settings.slot_autopilot): verteilt bei jedem Start die
Plätze nach den letzten beiden Läufen je Linie um – erschöpfte Linien behalten 1 Wachplatz, voll ausgelastete
bekommen mehr Teile (Ziel ~30 min je Teil), Linien auf 0 und festgesetzte Linien bleiben, Summe nie über
total_slots - reserve. Speicher-Bremse (Inhaber 03.10.2026): ab 5,5 GB Hinweis, ab 6 GB höchstens 8 Lead-Plätze,
ab 7 GB zusätzlich ohne Rohbestand (--no-raw); zurück erst 0,2 GB unter der Grenze. Jede gestartete Belegung steht
mit Gründen in signalwerk.werk_plan_log. Jeder Fehler -> Belegung wie bisher (der Plan verhindert nie einen Lauf).

  python scripts/werk_plan.py lead-werk      # schreibt matrix=… und teile=… nach $GITHUB_OUTPUT
  python scripts/werk_plan.py kunden-werk --dry
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
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


# ------------------------------------------------------------------------------------------- Autopilot
GB = 1024 ** 3
BRAKE = (("ohne-rohbestand", 7.0), ("drossel", 6.0), ("hinweis", 5.5))  # Stufe, ab GB
BRAKE_HYST = 0.2      # zurück erst 0,2 GB unter der Grenze
BRAKE_LEAD_MAX = 8    # Lead-Plätze ab „drossel“
TARGET_MIN = 30       # Ziel-Laufzeit je Teil (min): ein langsamer Teil soll das Werk nicht aufhalten
FULL_MIN = 55         # ab dieser Ø-Laufzeit gilt ein Teil als voll ausgelastet (Zeitfenster 75 min)


def lane_of(werk: str, part: str | None) -> str | None:
    """Linie eines Teils (wie laneOf in app/lib/leitstand.ts)."""
    if not part:
        return None
    if werk == "lead-werk":
        return re.sub(r"-\d+$", "", part)
    if werk == "kunden-werk":
        return "kunden" if re.match(r"^(pruefen\b|run --shard)", part) else None
    return None


def _ts(x) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def lane_stats(rows: list[dict], werk: str, runs: int = 2) -> dict[str, dict]:
    """run_stats-Zeilen (mehrere je Teil: eine je Zielgruppe/Land) -> je Linie die letzten `runs` Läufe:
    Teile im letzten Lauf, leere Teile, Ø/Max-Laufzeit (min), grüne, grüne je Platz-Stunde, Kandidaten."""
    parts: dict[tuple[str, str], dict] = {}
    for r in rows:
        if r.get("werk") not in (None, werk):
            continue
        lane = lane_of(werk, r.get("part"))
        if not lane:
            continue
        k = (str(r.get("run_id") or r.get("started_at")), str(r.get("part")))
        p = parts.setdefault(k, {"lane": lane, "run": k[0], "start": None, "end": None, "cand": 0, "proc": 0, "green": 0})
        st, en = _ts(r.get("started_at")), _ts(r.get("finished_at"))
        if st and (p["start"] is None or st < p["start"]):
            p["start"] = st
        if en and (p["end"] is None or en > p["end"]):
            p["end"] = en
        p["cand"] += int(r.get("candidates") or 0)
        p["proc"] += int(r.get("processed") or 0)
        p["green"] += int(r.get("green") or 0)
    by_lane: dict[str, dict[str, list[dict]]] = {}
    for p in parts.values():
        if p["start"] and p["end"]:
            by_lane.setdefault(p["lane"], {}).setdefault(p["run"], []).append(p)
    out: dict[str, dict] = {}
    for lane, rs in by_lane.items():
        order = sorted(rs, key=lambda run: max(x["end"] for x in rs[run]), reverse=True)[:runs]
        ps = [x for run in order for x in rs[run]]
        mins = [(x["end"] - x["start"]).total_seconds() / 60 for x in ps]
        work = (lambda x: x["cand"]) if werk == "lead-werk" else (lambda x: x["proc"])
        slot_h = sum(mins) / 60
        green = sum(x["green"] for x in ps)
        lp = rs[order[0]]  # letzter Lauf allein (frisch aufgefüllte Quelle soll nicht an alten Leerläufen scheitern)
        lmins = [(x["end"] - x["start"]).total_seconds() / 60 for x in lp]
        out[lane] = {"parts_last": len(lp), "parts": len(ps), "empty": sum(1 for x in ps if work(x) == 0),
                     "avg_min": sum(mins) / len(mins), "max_min": max(mins), "green": green,
                     "per_slot_h": green / slot_h if slot_h > 0 else 0.0, "cand_last": sum(work(x) for x in lp),
                     "empty_last": sum(1 for x in lp if work(x) == 0), "avg_last": sum(lmins) / len(lmins),
                     "max_last": max(lmins)}
    return out


def brake_level(db_bytes: int | None, last: str = "aus") -> str:
    """Stufe der Speicher-Bremse; ohne Messwert gilt die letzte Stufe weiter. Eine höhere Stufe bleibt, bis die
    Datenbank 0,2 GB unter deren Grenze liegt (kein Flattern um die Grenze)."""
    levels = [("aus", 0.0)] + sorted(((n, at) for n, at in BRAKE), key=lambda x: x[1])
    names = [n for n, _ in levels]
    if db_bytes is None:
        return last if last in names else "aus"
    gb = db_bytes / GB
    lvl = max(i for i, (_, at) in enumerate(levels) if gb >= at)
    prev = names.index(last) if last in names else 0
    if prev > lvl:
        lvl = max(lvl, max(i for i in range(prev + 1) if gb >= levels[i][1] - BRAKE_HYST))
    return names[lvl]


def autopilot(reg: dict, werk: str, base: dict[str, int], stats: dict[str, dict], locks: dict | None = None,
              other: dict[str, int] | None = None, brake: str = "aus") -> tuple[dict[str, int], dict[str, str]]:
    """Belegung der Linien von `werk` nach Ertrag. base = Belegung des Inhabers bzw. Standard; other = aktuelle
    Belegung des anderen Werks (für die Summe). Gibt (Plätze je Linie des Werks, Grund je Linie)."""
    locks = locks if isinstance(locks, dict) else {}
    lanes = [l for l in reg["lanes"] if l["werk"] == werk]
    cap = int(reg["total_slots"]) - int(reg["reserve"]) - sum((other or {}).values())
    if werk == "lead-werk" and brake in ("drossel", "ohne-rohbestand"):
        cap = min(cap, BRAKE_LEAD_MAX)
    plan, why, want, weight = {}, {}, {}, {}
    for l in lanes:
        lid, mx, b = l["id"], int(l["max"]), int(base.get(l["id"], 0))
        if lid in locks:
            try:
                plan[lid], why[lid] = max(0, min(int(locks[lid]), mx)), "von dir festgesetzt"
            except (TypeError, ValueError):
                plan[lid], why[lid] = b, "festgesetzt (ungültig) – wie eingestellt"
            continue
        if b <= 0:
            plan[lid], why[lid] = 0, "von dir auf 0 gesetzt"
            continue
        s = stats.get(lid)
        if not s:
            plan[lid], why[lid] = min(b, mx), "noch keine Laufzahlen – wie eingestellt"
            continue
        last = max(1, int(s["parts_last"]))
        share = s["empty"] / max(1, s["parts"])
        dry_all = share >= 0.5 or (s["avg_min"] < 10 and s["max_min"] < 30)
        # Erschöpft nur, wenn auch der letzte Lauf allein leer war (Nachtschicht 04.10.2026: nach Auffüllen der
        # US-Quelle wären sonst 21 ergiebige Teile wegen zweier alter Leerläufe auf 1 Platz gekürzt worden)
        if "empty_last" in s:
            dry_last = s["empty_last"] / last >= 0.5 or (s["avg_last"] < 10 and s["max_last"] < 30)
        else:
            dry_last = dry_all
        if dry_all and not dry_last:
            plan[lid] = min(last, mx)
            why[lid] = (f"letzter Lauf ergiebig ({last - s['empty_last']}/{last} Teile mit Kandidaten, "
                        f"Ø {round(s['avg_last'])} min) – unverändert")
        elif dry_all:
            plan[lid] = 1
            why[lid] = f"Vorrat erschöpft ({s['empty']}/{s['parts']} Teile leer, Ø {round(s['avg_min'])} min) – 1 Wachplatz"
        elif s["empty"] == 0 and s["avg_min"] >= FULL_MIN:
            target = min(mx, math.ceil(s["avg_min"] * last / TARGET_MIN), last * 2 + 2)
            plan[lid] = min(last, mx)
            want[lid] = max(0, target - plan[lid])
            weight[lid] = max(s["per_slot_h"], 1.0)
            why[lid] = f"voll ausgelastet (Ø {round(s['avg_min'])} min je Teil, {round(s['per_slot_h'])} grün/Platz·h)"
        else:
            plan[lid] = min(last, mx)
            why[lid] = f"läuft ({round(s['avg_min'])} min je Teil) – unverändert"
    # über der Summe: zuerst Wachplätze behalten, dann nach Ertrag kürzen
    if sum(plan.values()) > cap:
        order = sorted(plan, key=lambda k: (stats.get(k, {}).get("per_slot_h", 0.0)), reverse=True)
        left, fixed = cap, {}
        for k in order:  # 1 je aktiver Linie, solange Platz ist
            fixed[k] = 1 if plan[k] > 0 and left > 0 else 0
            left -= fixed[k]
        for k in order:
            add = min(plan[k] - fixed[k], max(0, left))
            fixed[k] += add
            left -= add
            if fixed[k] < plan[k]:
                why[k] += f" – gekürzt auf {fixed[k]} (Summe {cap})"
        plan, want = fixed, {}
    # freie Plätze einzeln an voll ausgelastete Linien (Höchstzahlverfahren nach grünen je Platz-Stunde)
    free = cap - sum(plan.values())
    while free > 0:
        open_ = [k for k in want if want[k] > 0]
        if not open_:
            break
        k = max(open_, key=lambda x: (weight[x] / (plan[x] + 1), x))
        plan[k] += 1
        want[k] -= 1
        free -= 1
    for k in plan:
        if plan[k] > (stats.get(k, {}).get("parts_last") or 0) and k in weight:
            why[k] += f" – mehr Teile: {plan[k]}"
    return plan, why


def matrix(reg: dict, werk: str, n: dict[str, int], extra_args: str = "") -> list[dict]:
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
            args = l["args"] + (f" --shard {i}/{k}" if k > 1 else "") + extra_args
            rows.append({"name": f"{l['id']}-{i}", "workers": int(l.get("workers", 16)), "args": args})
    return rows


def read_plan(werk: str | None = None) -> dict | None:
    """Belegungsplan aus owner_settings; mit `werk` quittiert dieses Werk den gelesenen Plan (settings_ack)."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.db import DB
        db = DB(timeout=15)
        seen = dt.datetime.now(dt.timezone.utc).isoformat()  # Lesezeitpunkt (nicht Quittungszeit)
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.slot_plan"}) or []
        plan = rows[0]["value"] if rows else None
        if werk:
            from lib.owner_settings import ack
            ack(db, werk, ["slot_plan"], {"slot_plan": plan if plan is not None else {}}, seen_at=seen)
        return plan
    except BaseException as e:  # noqa: BLE001 – ohne Datenbank gilt der Standard (SystemExit ohne Schlüssel inklusive)
        print(f"Belegungsplan nicht lesbar ({type(e).__name__}) – Standardbelegung", file=sys.stderr)
        return None


def read_inputs(werk: str, hours: int = 8) -> dict:
    """Alles für den Plan aus der Datenbank (einzeln abgesichert): Einstellungen, Laufzahlen, Größe, letzte Belegung.
    Fehlt etwas, bleibt der Eintrag leer – der Plan fällt dann auf die Belegung des Inhabers bzw. Standard zurück."""
    out: dict = {"db": None, "settings": {}, "rows": [], "db_bytes": None, "last_brake": "aus", "other": None}
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.db import DB
        db = DB(timeout=15)
        out["db"] = db
    except BaseException as e:  # noqa: BLE001 – ohne Datenbank gilt der Standard (SystemExit ohne Schlüssel inklusive)
        print(f"Datenbank nicht erreichbar ({type(e).__name__}) – Standardbelegung", file=sys.stderr)
        return out
    seen = dt.datetime.now(dt.timezone.utc).isoformat()  # Lesezeitpunkt (nicht Quittungszeit)
    try:
        rows = db.select("owner_settings", {"select": "key,value", "key": "in.(slot_plan,slot_autopilot)"}) or []
        out["settings"] = {r["key"]: r["value"] for r in rows}
        out["settings_seen"] = seen
    except BaseException as e:  # noqa: BLE001
        print(f"Einstellungen nicht lesbar ({type(e).__name__}) – Standardbelegung", file=sys.stderr)
        out["settings"] = None
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).isoformat()
    try:
        out["rows"] = db.select("run_stats", {"werk": f"eq.{werk}", "finished_at": f"gte.{since}", "limit": "5000",
                                              "select": "werk,part,run_id,started_at,finished_at,candidates,processed,green"}) or []
    except BaseException as e:  # noqa: BLE001
        print(f"Laufzahlen nicht lesbar ({type(e).__name__}) – ohne Autopilot", file=sys.stderr)
    try:
        out["db_bytes"] = int(db.rpc("db_size_bytes", {}))
    except BaseException as e:  # noqa: BLE001
        print(f"Datenbankgröße nicht lesbar ({type(e).__name__}) – letzte Bremsstufe gilt", file=sys.stderr)
    try:
        for r in db.select("werk_plan_log", {"select": "werk,bremse,plan", "order": "at.desc", "limit": "20"}) or []:
            if r["werk"] == werk and out["last_brake"] == "aus" and not out.get("_brake_seen"):
                out["last_brake"], out["_brake_seen"] = r.get("bremse") or "aus", True
            if r["werk"] != werk and out["other"] is None and isinstance(r.get("plan"), dict):
                out["other"] = {k: int(v) for k, v in r["plan"].items()}
    except BaseException as e:  # noqa: BLE001
        print(f"Letzte Belegung nicht lesbar ({type(e).__name__})", file=sys.stderr)
    return out


def decide(reg: dict, werk: str, inp: dict) -> dict:
    """Belegung für diesen Start: Inhaber/Standard als Basis, Autopilot (falls an) und Bremse darüber."""
    settings = inp.get("settings")
    base, why = counts(reg, (settings or {}).get("slot_plan"))
    own = {l["id"]: base[l["id"]] for l in reg["lanes"] if l["werk"] == werk}
    other_ids = [l["id"] for l in reg["lanes"] if l["werk"] != werk]
    other = inp.get("other") or {k: base[k] for k in other_ids}
    other = {k: v for k, v in other.items() if k in other_ids}
    ap = (settings or {}).get("slot_autopilot")
    ap = ap if isinstance(ap, dict) else {"on": True, "locks": {}}  # Inhaber 03.10.2026: Autopilot an
    brake = brake_level(inp.get("db_bytes"), inp.get("last_brake") or "aus")
    reasons = {k: why for k in own}
    mode = "standard" if why == "Standardbelegung" else "inhaber"
    plan = dict(own)
    if settings is not None and ap.get("on") is not False:
        try:
            plan, reasons = autopilot(reg, werk, own, lane_stats(inp.get("rows") or [], werk), ap.get("locks"), other, brake)
            mode = "autopilot"
        except Exception as e:  # noqa: BLE001 – Autopilot darf nie einen Lauf verhindern
            print(f"Autopilot-Fehler ({type(e).__name__}: {e}) – Belegung wie eingestellt", file=sys.stderr)
            plan, mode = dict(own), mode
    if werk == "lead-werk" and brake in ("drossel", "ohne-rohbestand") and sum(plan.values()) > BRAKE_LEAD_MAX:
        # Bremse auch ohne Autopilot: die Linien mit den meisten Plätzen kürzen, jede aktive behält 1
        while sum(plan.values()) > BRAKE_LEAD_MAX and any(v > 1 for v in plan.values()):
            k = max(plan, key=lambda x: plan[x])
            plan[k] -= 1
            reasons[k] = f"Speicher-Bremse ({brake}) – gekürzt"
    extra = " --no-raw" if werk == "lead-werk" and brake == "ohne-rohbestand" else ""
    return {"plan": plan, "reasons": reasons, "mode": mode, "brake": brake, "extra": extra, "base": own,
            "autopilot": ap}


def log_plan(db, werk: str, res: dict, db_bytes: int | None) -> None:
    """Gestartete Belegung protokollieren (JARVIS/Regler zeigen sie); Fehler stoppen nie den Lauf."""
    if db is None:
        return
    try:
        db.insert("werk_plan_log", {"werk": werk, "run_id": os.environ.get("GITHUB_RUN_ID"), "mode": res["mode"],
                                    "bremse": res["brake"], "db_bytes": db_bytes, "base": res["base"],
                                    "plan": res["plan"], "reasons": res["reasons"]})
    except BaseException as e:  # noqa: BLE001
        print(f"Belegung nicht protokolliert ({type(e).__name__})", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("werk", choices=["lead-werk", "kunden-werk"])
    ap.add_argument("--dry", action="store_true", help="nur anzeigen (nichts protokollieren, nichts quittieren)")
    a = ap.parse_args(argv)
    reg = load_lines()
    inp = read_inputs(a.werk) if (os.environ.get("SUPABASE_URL") or not a.dry) else {"settings": {}, "rows": []}
    res = decide(reg, a.werk, inp)
    db = inp.get("db")
    if db is not None and not a.dry and inp.get("settings") is not None:
        # Quittung (settings_ack): dieses Werk hat Belegungsplan und Autopilot-Schalter gelesen
        try:
            from lib.owner_settings import ack
            s = inp["settings"]
            ack(db, a.werk, ["slot_plan", "slot_autopilot"],
                {"slot_plan": s.get("slot_plan") or {}, "slot_autopilot": s.get("slot_autopilot") or {"on": True, "locks": {}}},
                seen_at=inp.get("settings_seen"))
        except BaseException as e:  # noqa: BLE001
            print(f"Quittung nicht geschrieben ({type(e).__name__})", file=sys.stderr)
    rows = matrix(reg, a.werk, res["plan"], res["extra"])
    summary = ", ".join(f"{k} {v}" for k, v in res["plan"].items())
    gb = f", DB {inp['db_bytes'] / GB:.2f} GB" if inp.get("db_bytes") else ""
    print(f"{a.werk}: {len(rows)} Teile ({res['mode']}, Bremse {res['brake']}{gb}) – {summary}")
    for k, v in res["reasons"].items():
        print(f"  {k}: {res['plan'].get(k)} – {v}")
    if not a.dry:
        log_plan(db, a.werk, res, inp.get("db_bytes"))
    out = os.environ.get("GITHUB_OUTPUT")
    if out and not a.dry:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"matrix={json.dumps({'include': rows}, ensure_ascii=False)}\n")
            f.write(f"teile={len(rows)}\n")
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ and not a.dry:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"Belegung {a.werk}: {len(rows)} Plätze ({res['mode']}, Bremse {res['brake']}{gb}) – {summary}\n\n")
            for k, v in res["reasons"].items():
                f.write(f"- {k}: {res['plan'].get(k)} – {v}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
