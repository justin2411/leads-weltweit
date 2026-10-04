"""Belegungsplan der Werke: wie viele Plätze (GitHub-Jobs) jede Linie bekommt (Inhaber 03.10.2026: „die werke wie
maschinen steuern … wv plätze werden belegt“).

Liest die Linien aus app/lib/werk-linien.json und die Einstellung des Inhabers (owner_settings.slot_plan,
gesetzt im Leitstand des Dashboards) und schreibt die Matrix für lead-werk.yml bzw. kunden-werk.yml.
Fehlt die Einstellung oder ist die Datenbank nicht erreichbar, gelten die Standardwerte – der Plan verhindert
nie einen Lauf. Grenzen: je Linie 0 … max, Summe höchstens total_slots - reserve (sonst Standardwerte).

Autopilot (Inhaber 03.10.2026: „Ja, Autopilot an“, owner_settings.slot_autopilot): verteilt bei jedem Start die
Plätze nach den letzten beiden Läufen je Linie um – erschöpfte Linien behalten 1 Wachplatz, voll ausgelastete
bekommen mehr Teile (Ziel ~30 min je Teil), Linien auf 0 und festgesetzte Linien bleiben, Summe nie über
total_slots - reserve. Leere Linien (Scout 04.10.2026: web-uk/web-fr liefen mit 0 Kandidaten weiter): kommen in
allen Läufen des Fensters (mind. 2) im Schnitt höchstens 1 Kandidat je Teil und kein grüner Lead, gilt die Linie als
„Vorrat leer“ – sie bekommt 0 Plätze und nur alle PROBE_H Stunden einen Prüfplatz; findet der wieder Kandidaten, gilt
sofort wieder die Belegung des Inhabers. Die freien Plätze leerer und erschöpfter Linien gehen an Linien, deren
letzter Lauf grüne Leads brachte (nach grünen je Platz-Stunde, je Start höchstens 2 × Teile + 2, nie über max der
Linie oder die Summe). Speicher-Bremse (Inhaber 03.10.2026): ab 5,5 GB Hinweis, ab 6 GB höchstens 8 Lead-Plätze,
ab 7 GB zusätzlich ohne Rohbestand (--no-raw), ab 7,5 GB Lead-Werk gestoppt (alle Lead-Plätze 0, Kunden-Werk
läuft weiter; Prüfung 04.10.2026: die Datenbank wuchs ~1,3 GB/Tag und hätte 8 GB sonst überschritten); zurück erst
0,2 GB unter der Grenze. GB = 1024³ Byte wie die Speicher-Seite (app/lib/storage.ts). Jede gestartete Belegung steht
mit Gründen in signalwerk.werk_plan_log. Jeder Fehler -> Belegung wie bisher (der Plan verhindert nie einen Lauf).

Zurücksetzen (Inhaber 04.10.2026, neue Quelle für web-uk/web-fr): owner_settings.lane_reset = {Linie: Zeitpunkt} –
Läufe vor dem Zeitpunkt zählen für diese Linie nicht mehr, eine „Vorrat leer“-Meldung davor verfällt; bis zum
ersten neuen Lauf gilt die Belegung des Inhabers. Länder-Vorrang (Inhaber 04.10.2026: „Wenn wir genug us leads haben
dann schau das wir noch uk und fr holen“, config/fokus.yaml `laender_vorrang`): hat ein Nachrang-Land (US) mindestens
faktor × den Bestand jedes Vorrang-Landes (UK, FR; lieferbare Leads des Segments laut kpi_daily), behalten dessen
Linien des Segments 1 Wachplatz und bekommen keine Zusatzplätze; die frei gewordenen Plätze gehen an aktive Linien
der Vorrang-Länder (bis max der Linie und die Summe). Gilt nur, solange eine Vorrang-Linie aktiv ist.

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
BRAKE = (("stopp", 7.5), ("ohne-rohbestand", 7.0), ("drossel", 6.0), ("hinweis", 5.5))  # Stufe, ab GB
BRAKE_STOP_WHY = "Speichergrenze 7,5 GB – Inhaber entscheidet über Aufräumen"
BRAKE_HYST = 0.2      # zurück erst 0,2 GB unter der Grenze
BRAKE_LEAD_MAX = 8    # Lead-Plätze ab „drossel“
TARGET_MIN = 30       # Ziel-Laufzeit je Teil (min): ein langsamer Teil soll das Werk nicht aufhalten
FULL_MIN = 55         # ab dieser Ø-Laufzeit gilt ein Teil als voll ausgelastet (Zeitfenster 75 min)
EMPTY_WHY = "Vorrat leer"  # Anfang des Grundes leerer Linien (Dashboard erkennt die Linie daran, app/lib/leitstand.ts)
PROBE_H = 4           # leere Linie: alle 4 h ein Prüfplatz (findet er Kandidaten, gilt wieder die Belegung)


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


def lane_stats(rows: list[dict], werk: str, runs: int = 2, reset: dict | None = None) -> dict[str, dict]:
    """run_stats-Zeilen (mehrere je Teil: eine je Zielgruppe/Land) -> je Linie die letzten `runs` Läufe:
    Teile im letzten Lauf, leere Teile, Ø/Max-Laufzeit (min), grüne, grüne je Platz-Stunde, Kandidaten.
    reset = {Linie: Zeitpunkt}: Läufe, die vorher begonnen haben, zählen für diese Linie nicht."""
    cut = {k: _ts(v) for k, v in (reset or {}).items() if _ts(v)}
    parts: dict[tuple[str, str], dict] = {}
    for r in rows:
        if r.get("werk") not in (None, werk):
            continue
        lane = lane_of(werk, r.get("part"))
        if not lane:
            continue
        if lane in cut:
            st0 = _ts(r.get("started_at"))
            if st0 is None or st0 < cut[lane]:
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
        every = [x for run in rs for x in rs[run]]  # alle Läufe im Fenster (leere Linie erkennen)
        out[lane] = {"parts_last": len(lp), "parts": len(ps), "empty": sum(1 for x in ps if work(x) == 0),
                     "runs_all": len(rs), "parts_all": len(every), "cand_all": sum(work(x) for x in every),
                     "green_all": sum(x["green"] for x in every), "green_last": sum(x["green"] for x in lp),
                     "last_end": max(x["end"] for x in every).isoformat(),
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


def is_empty(s: dict | None, was_empty: bool = False) -> bool:
    """Linie ohne Kandidaten-Vorrat: alle Läufe im Fenster (mind. 2, nach einer Leer-Meldung reicht 1) ohne grüne Leads
    und im Schnitt höchstens 1 Kandidat je Teil."""
    if not s or "runs_all" not in s:
        return False
    if s["runs_all"] < (1 if was_empty else 2):
        return False
    return s["green_all"] == 0 and s["cand_all"] <= s["parts_all"]


def _hours_since(iso: str | None, now: dt.datetime) -> float:
    t = _ts(iso)
    return (now - t).total_seconds() / 3600 if t else float("inf")


def lane_segments(l: dict) -> set[str]:
    m = re.search(r"--segments\s+(\S+)", l.get("args") or "")
    return {x.strip().upper() for x in m.group(1).split(",")} if m else set()


def lane_countries(l: dict) -> set[str]:
    return {x.strip().upper() for x in str(l.get("country") or "").split(",") if x.strip()}


def vorrang_active(rule: dict | None, stock: dict[str, float] | None) -> tuple[bool, str]:
    """Länder-Vorrang an? (an, Begründung). Aus, wenn Regel oder Bestand fehlt."""
    if not rule or not stock:
        return False, ""
    vor, nach, f = rule.get("vor") or [], rule.get("nach") or [], float(rule.get("faktor") or 0)
    vor_n = [stock.get(c) for c in vor]
    nach_n = [stock.get(c) for c in nach]
    if not vor or not nach or f <= 0 or any(v is None for v in vor_n + nach_n):
        return False, ""
    top = max(vor_n)
    on = all(n >= f * top for n in nach_n)
    txt = (f"Länder-Vorrang {'/'.join(vor)} vor {'/'.join(nach)} "
           f"({', '.join(f'{c} {int(stock[c]):,}'.replace(',', '.') for c in nach + vor)}; ≥ {f:g}×)")
    return on, txt


def autopilot(reg: dict, werk: str, base: dict[str, int], stats: dict[str, dict], locks: dict | None = None,
              other: dict[str, int] | None = None, brake: str = "aus", prev: dict | None = None,
              now: dt.datetime | None = None, reset: dict | None = None, vorrang: dict | None = None,
              stock: dict[str, float] | None = None) -> tuple[dict[str, int], dict[str, str]]:
    """Belegung der Linien von `werk` nach Ertrag. base = Belegung des Inhabers bzw. Standard; other = aktuelle
    Belegung des anderen Werks (für die Summe); prev = Gründe der letzten Belegung dieses Werks (leere Linien);
    reset = zurückgesetzte Linien {Linie: Zeitpunkt}; vorrang/stock = Länder-Vorrang (config/fokus.yaml) und
    lieferbare Leads je Land. Gibt (Plätze je Linie des Werks, Grund je Linie)."""
    locks = locks if isinstance(locks, dict) else {}
    prev = prev if isinstance(prev, dict) else {}
    reset = reset if isinstance(reset, dict) else {}
    now = now or dt.datetime.now(dt.timezone.utc)
    freed = 0  # Plätze leerer/erschöpfter Linien (gehen an ertragreiche Linien)
    lanes = [l for l in reg["lanes"] if l["werk"] == werk]
    cap = int(reg["total_slots"]) - int(reg["reserve"]) - sum((other or {}).values())
    if werk == "lead-werk" and brake in ("drossel", "ohne-rohbestand"):
        cap = min(cap, BRAKE_LEAD_MAX)
    if werk == "lead-werk" and brake == "stopp":
        cap = 0
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
        if lid in reset and _ts(reset[lid]) and not s:
            plan[lid], why[lid] = min(b, mx), "zurückgesetzt (neue Quelle) – wie eingestellt bis zum ersten Lauf"
            continue
        was_empty = str(prev.get(lid) or "").startswith(EMPTY_WHY)
        if is_empty(s, was_empty) or (not s and was_empty):
            n = (s or {}).get("runs_all", 0)
            ago = _hours_since((s or {}).get("last_end"), now)
            runs = f"{n} Läufe ohne Kandidaten" if n != 1 else "1 Lauf ohne Kandidaten"
            if ago >= PROBE_H:
                plan[lid], why[lid] = 1, f"{EMPTY_WHY} ({runs}) – 1 Prüfplatz alle {PROBE_H} h"
            else:
                plan[lid] = 0
                why[lid] = (f"{EMPTY_WHY} ({runs}) – Plätze an ertragreiche Linien, "
                            f"nächste Prüfung in {max(1, math.ceil(PROBE_H - ago))} h")
            freed += max(0, min(b, mx) - plan[lid])
            continue
        if not s:
            plan[lid], why[lid] = min(b, mx), "noch keine Laufzahlen – wie eingestellt"
            continue
        if was_empty:
            plan[lid], why[lid] = min(b, mx), "Vorrat wieder da (Prüfplatz fand Kandidaten) – wie eingestellt"
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
            freed += max(0, min(b, mx) - 1)
            if s["empty"] == 0:
                # kein Teil leer, aber alle schnell fertig: „erschöpft (0/2 Teile leer)“ las sich widersprüchlich
                # (Prüfung 04.10.2026)
                why[lid] = f"Quelle durchgeprüft (Ø {round(s['avg_min'])} min, kaum neue Kandidaten) – 1 Wachplatz"
            else:
                why[lid] = (f"Vorrat erschöpft ({s['empty']}/{s['parts']} Teile leer, Ø {round(s['avg_min'])} min)"
                            " – 1 Wachplatz")
        elif s["empty"] == 0 and s["avg_min"] >= FULL_MIN:
            target = min(mx, math.ceil(s["avg_min"] * last / TARGET_MIN), last * 2 + 2)
            plan[lid] = min(last, mx)
            want[lid] = max(0, target - plan[lid])
            weight[lid] = max(s["per_slot_h"], 1.0)
            why[lid] = f"voll ausgelastet (Ø {round(s['avg_min'])} min je Teil, {round(s['per_slot_h'])} grün/Platz·h)"
        else:
            plan[lid] = min(last, mx)
            why[lid] = f"läuft ({round(s['avg_min'])} min je Teil) – unverändert"
    # Länder-Vorrang: Linien der Nachrang-Länder (Segment der Regel) auf 1 Wachplatz, Plätze an Vorrang-Linien
    on, vtxt = vorrang_active(vorrang, stock)
    seg = str((vorrang or {}).get("segment") or "").upper()
    def _in(l, cs):
        return (not seg or seg in lane_segments(l)) and lane_countries(l) and lane_countries(l) <= set(cs)
    vor_lanes = [l for l in lanes if on and _in(l, vorrang.get("vor") or []) and plan.get(l["id"], 0) > 0
                 and not why[l["id"]].startswith(EMPTY_WHY) and "Wachplatz" not in why[l["id"]]
                 and "durchgeprüft" not in why[l["id"]]]
    nach_ids: set[str] = set()
    if vor_lanes:
        vgain: dict[str, int] = {}
        for l in lanes:
            k = l["id"]
            if k in locks or not _in(l, vorrang.get("nach") or []) or plan.get(k, 0) <= 0:
                continue
            nach_ids.add(k)
            want.pop(k, None)
            if plan[k] > 1:
                freed += plan[k] - 1
                plan[k] = 1
                why[k] = f"{vtxt} – 1 Wachplatz"
            else:
                why[k] += f" – {vtxt}"
        give_v = min(freed, cap - sum(plan.values()))
        vroom = {l["id"]: int(l["max"]) - plan[l["id"]] for l in vor_lanes if int(l["max"]) > plan[l["id"]]}
        while give_v > 0 and vroom:
            k = min(vroom, key=lambda x: (plan[x], x))  # gleichmäßig auffüllen
            plan[k] += 1
            vgain[k] = vgain.get(k, 0) + 1
            give_v -= 1
            freed -= 1
            vroom[k] -= 1
            if vroom[k] <= 0:
                del vroom[k]
        for k, n in vgain.items():
            why[k] += f" – +{n} {vtxt.split(' (')[0]}"
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
    # Plätze leerer/erschöpfter Linien an Linien, deren letzter Lauf grüne Leads brachte (Höchstzahlverfahren)
    give = min(freed, cap - sum(plan.values()))
    gain: dict[str, int] = {}
    room = {}
    for l in lanes:
        k, s = l["id"], stats.get(l["id"])
        if k in locks or k in nach_ids or not s or plan.get(k, 0) <= 0 or not s.get("green_last") \
                or why[k].startswith(EMPTY_WHY):
            continue
        if "Wachplatz" in why[k] or "durchgeprüft" in why[k]:
            continue
        top = min(int(l["max"]), max(1, int(s["parts_last"])) * 2 + 2)
        if top > plan[k]:
            room[k] = top - plan[k]
    while give > 0 and room:
        k = max(room, key=lambda x: (max(stats[x]["per_slot_h"], 1.0) / (plan[x] + 1), x))
        plan[k] += 1
        gain[k] = gain.get(k, 0) + 1
        give -= 1
        room[k] -= 1
        if room[k] <= 0:
            del room[k]
    for k, n in gain.items():
        why[k] += f" – +{n} aus leeren Linien"
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
        rows = db.select("owner_settings", {"select": "key,value", "key": "in.(slot_plan,slot_autopilot,lane_reset)"}) or []
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
        from lib.fokus import laender_vorrang
        rule = laender_vorrang()
        if rule and werk == "lead-werk":
            cs = sorted(set(rule["vor"]) | set(rule["nach"]))
            rows = db.select("kpi_daily", {"select": "day,country,value", "metric": "eq.leads_lieferbar",
                                           "segment_id": f"eq.{rule['segment']}", "country": f"in.({','.join(cs)})",
                                           "order": "day.desc", "limit": "50"}) or []
            stock: dict[str, float] = {}
            for r in rows:  # neuester Tag je Land
                stock.setdefault(r["country"], float(r["value"] or 0))
            out["vorrang"], out["stock"] = rule, stock
    except BaseException as e:  # noqa: BLE001
        print(f"Länder-Vorrang nicht lesbar ({type(e).__name__}) – ohne Vorrang", file=sys.stderr)
    try:
        out["db_bytes"] = int(db.rpc("db_size_bytes", {}))
    except BaseException as e:  # noqa: BLE001
        print(f"Datenbankgröße nicht lesbar ({type(e).__name__}) – letzte Bremsstufe gilt", file=sys.stderr)
    try:
        for r in db.select("werk_plan_log", {"select": "werk,bremse,plan,reasons", "order": "at.desc", "limit": "20"}) or []:
            if r["werk"] == werk and out["last_brake"] == "aus" and not out.get("_brake_seen"):
                out["last_brake"], out["_brake_seen"] = r.get("bremse") or "aus", True
                out["prev_reasons"] = r.get("reasons") if isinstance(r.get("reasons"), dict) else {}
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
            reset = (settings or {}).get("lane_reset")
            reset = reset if isinstance(reset, dict) else {}
            plan, reasons = autopilot(reg, werk, own, lane_stats(inp.get("rows") or [], werk, reset=reset),
                                      ap.get("locks"), other, brake, prev=inp.get("prev_reasons"), reset=reset,
                                      vorrang=inp.get("vorrang"), stock=inp.get("stock"))
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
    if werk == "lead-werk" and brake == "stopp":
        # Speicher-Stopp (Prüfung 04.10.2026): alle Lead-Plätze 0, auch festgesetzte; Kunden-Werk unverändert
        plan = {k: 0 for k in plan}
        reasons = {k: BRAKE_STOP_WHY for k in plan}
    extra = " --no-raw" if werk == "lead-werk" and brake in ("ohne-rohbestand", "stopp") else ""
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
