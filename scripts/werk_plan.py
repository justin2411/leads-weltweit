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
sofort wieder die Belegung des Inhabers. Mindestbelegung (Inhaber 05.10.2026: „mind. 30 gleichzeitig“): liegen beide
Werke zusammen unter MIN_BELEGT Plätzen, füllt der Autopilot auf – zuerst Premium-/Website-Linien US/UK/FR, dann
Kunden, Prüfer, andere Linien mit Vorrat (fill_minimum); nie über max je Linie oder total_slots - reserve, die
Speicher-Bremse geht vor. Die freien Plätze leerer und erschöpfter Linien gehen an Linien, deren
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
MIN_BELEGT = 30       # Inhaber 05.10.2026: „Werke immer laufen lassen, mind. 30 gleichzeitig“ (beide Werke zusammen)
MIN_WHY = "Mindestbelegung 30"


def lane_of(werk: str, part: str | None) -> str | None:
    """Linie eines Teils (wie laneOf in app/lib/leitstand.ts)."""
    if not part:
        return None
    if werk == "lead-werk":
        return re.sub(r"-\d+$", "", part)
    if werk == "kunden-werk":
        return "kunden" if re.match(r"^(pruefen\b|run --shard)", part) else None
    if werk == "pruefer-werk":  # Prüfer-Werk (Inhaber 05.10.2026): Teile „pruefer-0“ … bzw. „run --shard …“
        return "pruefer" if re.match(r"^(pruefer\b|pruefer-\d+|run --shard)", part) else None
    if werk == "kontakt-werk":  # Kontakt-Werk (Inhaber 05.10.2026): Teile „kontakt-0“ … bzw. „run --shard …“
        return "kontakt" if re.match(r"^(kontakt\b|kontakt-\d+|run --shard)", part) else None
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
        p = parts.setdefault(k, {"lane": lane, "run": k[0], "start": None, "end": None, "cand": 0, "proc": 0, "green": 0,
                                 "premium": 0})
        st, en = _ts(r.get("started_at")), _ts(r.get("finished_at"))
        if st and (p["start"] is None or st < p["start"]):
            p["start"] = st
        if en and (p["end"] is None or en > p["end"]):
            p["end"] = en
        p["cand"] += int(r.get("candidates") or 0)
        p["proc"] += int(r.get("processed") or 0)
        p["green"] += int(r.get("green") or 0)
        ex = r.get("extra") if isinstance(r.get("extra"), dict) else {}
        p["premium"] += int(ex.get("premium") or 0)
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
                     "max_last": max(lmins), "premium_all": sum(x["premium"] for x in every),
                     "premium_last": sum(x["premium"] for x in lp),
                     "premium_per_slot_h": sum(x["premium"] for x in ps) / slot_h if slot_h > 0 else 0.0}
    return out


# ------------------------------------------------------------------------------------------- Premium
# Inhaber 05.10.2026: „wir brauchen keine normalen leads mehr nur noch premium leads“. Sobald eine Linie des
# Lead-Werks im Fenster Premium-Leads (lib/premium.py) gebracht hat, zählt für den Autopilot der Premium-Ertrag statt
# der Lead-Menge: Linien ohne Premium wachsen nicht mehr und bekommen keine frei gewordenen Plätze, und
# premium_shift() gibt Plätze reiner Standard-Linien (jede behält 1) an Premium-Linien mit Platz bis zu deren max.
def premium_weight(stats: dict[str, dict]) -> bool:
    """Gewicht nach Premium-Ertrag umstellen (in place). True, wenn Premium-Zahlen vorliegen."""
    if not any(s.get("premium_all") for s in stats.values()):
        return False
    for s in stats.values():
        s["per_slot_h_leads"] = s.get("per_slot_h", 0.0)
        s["per_slot_h"] = s.get("premium_per_slot_h", 0.0)
        s["green_last"] = s.get("premium_last", 0)
        s["standard_only"] = not s.get("premium_all")
    return True


def premium_shift(reg: dict, werk: str, plan: dict[str, int], reasons: dict[str, str], stats: dict[str, dict],
                  locks: dict | None = None) -> int:
    """Plätze von reinen Standard-Linien an Premium-Linien (höchster Premium-Ertrag je Platz zuerst, bis max).
    Festgesetzte Linien bleiben; jede aktive Standard-Linie behält 1 Platz. Gibt die Zahl verschobener Plätze."""
    locks = locks if isinstance(locks, dict) else {}
    lanes = {l["id"]: l for l in reg["lanes"] if l["werk"] == werk}
    prem = [k for k in plan if k in lanes and k not in locks and (stats.get(k) or {}).get("premium_last")]
    std = [k for k in plan if k in lanes and k not in locks and (stats.get(k) or {}).get("standard_only")]
    moved = 0
    while True:
        room = [k for k in prem if plan[k] > 0 and plan[k] < int(lanes[k]["max"])]
        give = [k for k in std if plan[k] > 1]
        if not room or not give:
            return moved
        g = max(give, key=lambda k: (plan[k], k))
        r = max(room, key=lambda k: (stats[k].get("premium_per_slot_h", 0.0) / (plan[k] + 1), k))
        plan[g] -= 1
        plan[r] += 1
        moved += 1
        reasons[g] = "nur Standard-Leads – Platz an Premium-Linien (Inhaber 05.10.2026)"
        reasons[r] = f"Premium-Ertrag ({round(stats[r].get('premium_per_slot_h', 0.0))} je Platz·h) – +Platz von Standard-Linien"


# Mischung im Lead-Werk (Inhaber 05.10.2026: „ab sofort brauchen wir nur noch premium leads die sollten wir jetzt
# generieren auf voller leistung“ und „möchte auch beim lead werk einstellen wv normale leads und premium leads gemacht
# werden“; owner_settings.lead_mix {"premium_pct": 0–100}, Standard 100). Lead-Linien tragen in werk-linien.json
# `premium` = "ja" (Premium-Quelle) oder "basis" (Radar-Basis: Firmen mit Website für das Veränderungs-Radar).
# 100 %: alle übrigen Lead-Linien 0 Plätze, Radar-Basis höchstens 1 (premium_only_plan). 1–99 %: Plätze des Lead-Werks
# im Verhältnis Premium-Linien / übrige Linien (mix_plan). 0 %: Belegung wie bisher. Festgesetzte Linien bleiben;
# Speicher-Bremse geht vor.
PREMIUM_WHY = "Nur Premium (Inhaber 05.10.2026)"
MIX_WHY = "Mischung"


def mix_from(settings: dict | None) -> int:
    """Premium-Anteil aus den gelesenen Einstellungen (fehlend/unlesbar = 100, nur strenger)."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.premium import mix_value
        return mix_value((settings or {}).get("lead_mix"))
    except Exception:  # noqa: BLE001
        return 100


def mix_plan(reg: dict, werk: str, plan: dict[str, int], why: dict[str, str], locks: dict | None, pct: int) -> int:
    """1–99 %: Plätze des Lead-Werks zwischen aktiven Premium-Linien und aktiven übrigen Linien so verschieben, dass
    der Premium-Anteil möglichst nahe pct liegt (je Linie bis max, Summe unverändert, festgesetzte Linien bleiben).
    Gibt die Zahl verschobener Plätze."""
    if werk != "lead-werk" or not 0 < pct < 100:
        return 0
    locks = locks if isinstance(locks, dict) else {}
    lanes = {l["id"]: l for l in reg["lanes"] if l["werk"] == werk}
    total = sum(plan.get(k, 0) for k in lanes)
    target = round(total * pct / 100)
    prem = [k for k in lanes if lanes[k].get("premium") == "ja"]
    norm = [k for k in lanes if lanes[k].get("premium") != "ja"]
    moved = 0
    while True:
        have = sum(plan.get(k, 0) for k in prem)
        if have == target:
            break
        src, dst = (norm, prem) if have < target else (prem, norm)
        give = [k for k in src if k not in locks and plan.get(k, 0) > 1]
        room = [k for k in dst if k not in locks and 0 < plan.get(k, 0) < int(lanes[k]["max"])]
        if not give or not room:
            break
        g = max(give, key=lambda k: (plan[k], k))
        r = min(room, key=lambda k: (plan[k], k))
        plan[g] -= 1
        plan[r] += 1
        moved += 1
        why[r] = str(why.get(r) or "").split(f" – {MIX_WHY}")[0] + f" – {MIX_WHY} Premium {pct} %"
        why[g] = str(why.get(g) or "").split(f" – {MIX_WHY}")[0] + f" – {MIX_WHY} Premium {pct} %"
    return moved


def premium_only_plan(reg: dict, werk: str, plan: dict[str, int], why: dict[str, str], locks: dict | None,
                      cap: int) -> int:
    """Nur-Premium-Belegung des Lead-Werks (in place): Linien ohne Premium auf 0, Radar-Basis höchstens 1, freie
    Plätze an aktive Premium-Linien (gleichmäßig, bis max, nie über cap). Gibt die Zahl umverteilter Plätze."""
    if werk != "lead-werk":
        return 0
    locks = locks if isinstance(locks, dict) else {}
    lanes = [l for l in reg["lanes"] if l["werk"] == werk]
    for l in lanes:
        k, flag = l["id"], l.get("premium")
        if k in locks or flag == "ja":
            continue
        lim = 1 if flag == "basis" else 0
        if plan.get(k, 0) > lim:
            plan[k] = lim
            why[k] = (f"{PREMIUM_WHY}: Radar-Basis – höchstens 1 Platz" if lim
                      else f"{PREMIUM_WHY}: Linie ohne Premium – 0 Plätze")
    room = {l["id"]: int(l["max"]) - plan.get(l["id"], 0) for l in lanes
            if l.get("premium") == "ja" and l["id"] not in locks and plan.get(l["id"], 0) > 0
            and int(l["max"]) > plan.get(l["id"], 0)}
    free, gain = cap - sum(plan.values()), {}
    while free > 0 and room:
        k = min(room, key=lambda x: (plan[x], x))
        plan[k] += 1
        gain[k] = gain.get(k, 0) + 1
        free -= 1
        room[k] -= 1
        if room[k] <= 0:
            del room[k]
    for k, n in gain.items():
        why[k] = str(why.get(k) or "") + f" – +{n} {PREMIUM_WHY}"
    return sum(gain.values())


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


def nach_lanes(reg: dict, vorrang: dict | None, stock: dict[str, float] | None) -> set[str]:
    """Linien der Nachrang-Länder, solange der Länder-Vorrang an ist (bekommen keine Zusatzplätze)."""
    on, _ = vorrang_active(vorrang, stock)
    if not on:
        return set()
    seg = str((vorrang or {}).get("segment") or "").upper()
    nach = set(vorrang.get("nach") or [])
    return {l["id"] for l in reg["lanes"] if l["werk"] == "lead-werk" and (not seg or seg in lane_segments(l))
            and lane_countries(l) and lane_countries(l) <= nach}


def autopilot(reg: dict, werk: str, base: dict[str, int], stats: dict[str, dict], locks: dict | None = None,
              other: dict[str, int] | None = None, brake: str = "aus", prev: dict | None = None,
              now: dt.datetime | None = None, reset: dict | None = None, vorrang: dict | None = None,
              stock: dict[str, float] | None = None, min_belegt: int = MIN_BELEGT) -> tuple[dict[str, int], dict[str, str]]:
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
            # Premium-Gewicht (05.10.2026): reine Standard-Linien wachsen nicht mehr
            want[lid] = 0 if s.get("standard_only") else max(0, target - plan[lid])
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
        # Vorrang-Linien (UK/FR) zuerst behalten, sonst würden frisch zurückgesetzte Linien ohne Laufzahlen
        # als erste gekürzt (Lauf 04.10.2026: web-fr 17 -> 11, web-north behielt 6)
        vor_ids = {l["id"] for l in vor_lanes}
        order = sorted(plan, key=lambda k: (k in vor_ids, stats.get(k, {}).get("per_slot_h", 0.0)), reverse=True)
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
    if not (werk == "lead-werk" and brake in ("drossel", "ohne-rohbestand", "stopp")):  # Speicher-Bremse geht vor
        fill_minimum(lanes, plan, why, stats, locks, cap, sum((other or {}).values()), min_belegt, nach_ids)
    return plan, why


def _min_tier(l: dict, s: dict | None, nur_premium: bool = False) -> int | None:
    """Rang einer Linie für die Mindestbelegung (kleiner = zuerst), None = nicht auffüllen.
    1 Premium-/Website-Linien US/UK/FR, 2 Kunden, 3 Prüfer, 4 andere Linien mit Vorrat im letzten Lauf.
    nur_premium: Lead-Linien ohne `premium: ja` füllen nie auf (Inhaber 05.10.2026)."""
    lid = l["id"]
    if nur_premium and l.get("werk") == "lead-werk":
        return 1 if l.get("premium") == "ja" else None
    if (s or {}).get("premium_last") or "premium" in lid or \
            (lid.startswith("web-") and lane_countries(l) and lane_countries(l) <= {"US", "UK", "FR"}):
        return 1
    if lid == "kunden":
        return 2
    if "pruefer" in lid:
        return 3
    if s and (s.get("cand_last") or s.get("green_last")):
        return 4
    return None


def fill_minimum(lanes: list[dict], plan: dict[str, int], why: dict[str, str], stats: dict[str, dict],
                 locks: dict, cap: int, other_sum: int, min_belegt: int = MIN_BELEGT,
                 skip: set[str] | None = None, last: set[str] | None = None, nur_premium: bool = False) -> int:
    """Werke immer ausgelastet (Inhaber 05.10.2026): liegen beide Werke zusammen unter `min_belegt` Plätzen, gehen
    die fehlenden Plätze an Linien mit Ertrag/Vorrat (Rang siehe _min_tier, im Rang reihum), je Linie bis max, nie
    über `cap` (total_slots - reserve - anderes Werk, bei Bremse kleiner). Nie: festgesetzte Linien, vom Inhaber auf
    0 gesetzte, leere, erschöpfte (Wachplatz) und Nachrang-Linien des Länder-Vorrangs (skip). `last`: Linien, die erst
    ganz zuletzt auffüllen dürfen (Nachfüller: Nachrang-Linien, wenn alle anderen voll sind). Gibt die Zahl neuer Plätze."""
    skip = skip or set()
    last = last or set()
    need = min(min_belegt - other_sum - sum(plan.values()), cap - sum(plan.values()))
    if need <= 0:
        return 0
    tiers: dict[int, list[dict]] = {}
    for l in lanes:
        k = l["id"]
        r = str(why.get(k) or "")
        if k in locks or k in skip or plan.get(k, 0) <= 0 or r.startswith(EMPTY_WHY) or "Wachplatz" in r \
                or "durchgeprüft" in r or plan[k] >= int(l["max"]):
            continue
        t = _min_tier(l, stats.get(k), nur_premium)
        if t is not None:
            tiers.setdefault(99 if k in last else t, []).append(l)
    added: dict[str, int] = {}
    for t in sorted(tiers):
        group = tiers[t]
        while need > 0:
            open_ = [l for l in group if plan[l["id"]] < int(l["max"])]
            if not open_:
                break
            for l in open_:
                if need <= 0:
                    break
                plan[l["id"]] += 1
                added[l["id"]] = added.get(l["id"], 0) + 1
                need -= 1
    for k, n in added.items():
        why[k] += f" – +{n} {MIN_WHY}"
    return sum(added.values())


def lane_k(l: dict) -> int:
    """Feste Aufteilung einer Lead-Linie (Teile-Läufe, 05.10.2026): immer --shard i/K mit K = max der Linie. So
    bearbeiten mehrere Läufe derselben Linie nebeneinander verschiedene Teile, nie dieselben Firmen."""
    return max(1, int(l.get("max") or 1))


def matrix(reg: dict, werk: str, n: dict[str, int], extra_args: str = "",
           shards: dict[str, list[int]] | None = None) -> list[dict]:
    """Matrix-Einträge eines Werks: Name {linie}-{i}, Teil i von N (--shard), Argumente aus der Linie.
    shards (Lead-Werk, Teile-Läufe): {Linie: Teil-Nummern} – diese Teile mit fester Aufteilung K = lane_k."""
    rows: list[dict] = []
    for l in reg["lanes"]:
        if l["werk"] != werk:
            continue
        if shards is not None and werk == "lead-werk":
            kk = lane_k(l)
            for i in shards.get(l["id"], []):
                args = l["args"] + (f" --shard {i}/{kk}" if kk > 1 else "") + extra_args
                rows.append({"name": f"{l['id']}-{i}", "workers": int(l.get("workers", 16)), "args": args})
            continue
        k = n.get(l["id"], 0)
        for i in range(k):
            if werk == "kunden-werk":
                rows.append({"shard": i, "of": k})
                continue
            if werk in ("pruefer-werk", "kontakt-werk"):
                rows.append({"name": f"{l['id']}-{i}", "shard": i, "of": k})
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
        rows = db.select("owner_settings", {"select": "key,value", "key": "in.(slot_plan,slot_autopilot,lane_reset,lead_mix)"}) or []
        out["settings"] = {r["key"]: r["value"] for r in rows}
        out["settings_seen"] = seen
    except BaseException as e:  # noqa: BLE001
        print(f"Einstellungen nicht lesbar ({type(e).__name__}) – Standardbelegung", file=sys.stderr)
        out["settings"] = None
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).isoformat()
    try:
        out["rows"] = db.select("run_stats", {"werk": f"eq.{werk}", "finished_at": f"gte.{since}", "limit": "5000",
                                              "select": "werk,part,run_id,started_at,finished_at,candidates,processed,green,extra"}) or []
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
            # letzte Belegung JEDES anderen Werks (seit dem Prüfer-Werk gibt es drei)
            if r["werk"] != werk and r["werk"] not in out.setdefault("_other_seen", set()) and isinstance(r.get("plan"), dict):
                out["_other_seen"].add(r["werk"])
                out["other"] = {**(out["other"] or {}), **{k: int(v) for k, v in r["plan"].items()}}
    except BaseException as e:  # noqa: BLE001
        print(f"Letzte Belegung nicht lesbar ({type(e).__name__})", file=sys.stderr)
    return out


def decide(reg: dict, werk: str, inp: dict) -> dict:
    """Belegung für diesen Start: Inhaber/Standard als Basis, Autopilot (falls an) und Bremse darüber."""
    settings = inp.get("settings")
    base, why = counts(reg, (settings or {}).get("slot_plan"))
    own = {l["id"]: base[l["id"]] for l in reg["lanes"] if l["werk"] == werk}
    other_ids = [l["id"] for l in reg["lanes"] if l["werk"] != werk]
    # andere Werke: letzte gestartete Belegung, fehlende Linien mit ihrer Basis (Inhaber/Standard)
    other = {k: base[k] for k in other_ids}
    other.update({k: v for k, v in (inp.get("other") or {}).items() if k in other_ids})
    ap = (settings or {}).get("slot_autopilot")
    ap = ap if isinstance(ap, dict) else {"on": True, "locks": {}}  # Inhaber 03.10.2026: Autopilot an
    brake = brake_level(inp.get("db_bytes"), inp.get("last_brake") or "aus")
    reasons = {k: why for k in own}
    mode = "standard" if why == "Standardbelegung" else "inhaber"
    plan = dict(own)
    stats: dict[str, dict] = {}
    # Prüfer-Werk: feste Belegung (Inhaber 05.10.2026: „4 dauerhafte Prüfer“) – jeder Teil nutzt sein Zeitfenster immer
    # voll, der Autopilot würde ihn sonst als „voll ausgelastet“ ständig vergrößern; seine Plätze zählt er bei den anderen
    if settings is not None and ap.get("on") is not False and werk != "pruefer-werk":
        try:
            reset = (settings or {}).get("lane_reset")
            reset = reset if isinstance(reset, dict) else {}
            stats = lane_stats(inp.get("rows") or [], werk, reset=reset)
            premium_on = werk == "lead-werk" and premium_weight(stats)
            plan, reasons = autopilot(reg, werk, own, stats,
                                      ap.get("locks"), other, brake, prev=inp.get("prev_reasons"), reset=reset,
                                      vorrang=inp.get("vorrang"), stock=inp.get("stock"))
            if premium_on:
                premium_shift(reg, werk, plan, reasons, stats, ap.get("locks"))
            mode = "autopilot"
        except Exception as e:  # noqa: BLE001 – Autopilot darf nie einen Lauf verhindern
            print(f"Autopilot-Fehler ({type(e).__name__}: {e}) – Belegung wie eingestellt", file=sys.stderr)
            plan, mode = dict(own), mode
    pct = int(inp["mix_pct"]) if "mix_pct" in inp else mix_from(settings)
    nur_premium = pct >= 100
    if nur_premium and werk == "lead-werk" and brake != "stopp":
        cap = int(reg["total_slots"]) - int(reg["reserve"]) - sum(other.values())
        if brake in ("drossel", "ohne-rohbestand"):
            cap = min(cap, BRAKE_LEAD_MAX)
        premium_only_plan(reg, werk, plan, reasons, ap.get("locks"), cap)
    elif werk == "lead-werk" and brake != "stopp":
        mix_plan(reg, werk, plan, reasons, ap.get("locks"), pct)
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
            "autopilot": ap, "stats": stats, "nach": nach_lanes(reg, inp.get("vorrang"), inp.get("stock")),
            "nur_premium": nur_premium, "mix_pct": pct}


def run_counts(reg: dict, res: dict, teile: dict[str, int] | None, taken: set[str]) -> tuple[dict[str, int], dict[str, str]]:
    """Plätze, die DIESER Lauf startet (Linien-Läufe, scripts/werk_belegung.py). teile = {Linie: Teile} aus der
    Eingabe (None = alle Linien laut Plan); taken = Linien, die ein anderer Lauf belegt (nie doppelt bearbeiten).
    Je Linie höchstens max; bei Speicher-Bremse höchstens die gebremste Belegung des Plans (stopp = 0)."""
    lanes = {l["id"]: l for l in reg["lanes"] if l["werk"] == "lead-werk"}
    brake = res.get("brake", "aus")
    out, note = {}, {}
    for k in lanes:
        want = res["plan"].get(k, 0) if teile is None else teile.get(k, 0)
        n = max(0, min(int(want), int(lanes[k]["max"])))
        if brake in ("drossel", "ohne-rohbestand", "stopp"):
            n = min(n, int(res["plan"].get(k, 0)))
        if n and k in taken:
            n, note[k] = 0, "läuft schon in einem anderen Lauf"
        out[k] = n
    if brake in ("drossel", "ohne-rohbestand") and sum(out.values()) > BRAKE_LEAD_MAX:
        while sum(out.values()) > BRAKE_LEAD_MAX and any(v > 0 for v in out.values()):
            k = max(out, key=lambda x: out[x])
            out[k] -= 1
    return out, note


def pick_shards(reg: dict, counts: dict[str, int], claimed: dict[str, set[int] | None],
                want: dict[str, list[int]] | None = None, last_used: dict[tuple[str, int], str] | None = None
                ) -> dict[str, list[int]]:
    """Teil-Nummern, die DIESER Lauf je Linie bearbeitet (feste Aufteilung K = lane_k). claimed = Teile anderer
    Läufe ({Linie: Teile}, None = ganze Linie belegt); want = vom Nachfüller gewählte Teile (nur die, die noch frei
    sind); sonst die freien Teile, die am längsten nicht liefen (last_used = {(Linie, Teil): Startzeit}).
    Höchstens counts[Linie] Teile; nie ein Teil, den ein anderer Lauf belegt."""
    last_used = last_used or {}
    out: dict[str, list[int]] = {}
    for l in reg["lanes"]:
        k = l["id"]
        if l["werk"] != "lead-werk" or int(counts.get(k, 0)) <= 0:
            continue
        taken = claimed.get(k, set())
        if taken is None:
            continue
        free = [i for i in range(lane_k(l)) if i not in taken]
        if want is not None and k in want:
            free = [i for i in want[k] if i in free]
        else:
            free.sort(key=lambda i: (str(last_used.get((k, i)) or ""), i))
        pick = free[: int(counts[k])]
        if pick:
            out[k] = sorted(pick)
    return out


def buffer_teile(reg: dict, werk: str, res: dict, teile: dict[str, int]) -> None:
    """Puffer-Teile vom Nachfüller (scripts/werk_belegung.py, Mindestbelegung 30) für Kunden-/Kontakt-/Prüfer-Werk:
    erhöht nur (nie unter den Plan), höchstens max der Linie; nie für Linien, die der Inhaber auf 0 gesetzt oder
    festgesetzt hat (in place)."""
    locks = (res.get("autopilot") or {}).get("locks") or {}
    for l in reg["lanes"]:
        k = l["id"]
        if l["werk"] != werk or k not in teile or k in locks or int(res["plan"].get(k, 0)) <= 0:
            continue
        n = min(int(teile[k]), int(l["max"]))
        if n > res["plan"][k]:
            res["reasons"][k] = f"{res['reasons'].get(k, '')} – {MIN_WHY}: {n} Teile (Nachfüller)"
            res["plan"][k] = n


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
    ap.add_argument("werk", choices=["lead-werk", "kunden-werk", "pruefer-werk", "kontakt-werk"])
    ap.add_argument("--dry", action="store_true", help="nur anzeigen (nichts protokollieren, nichts quittieren)")
    ap.add_argument("--teile", default=None, help="Linien-Lauf (Lead-Werk): „web-us:3,s2-ukfr:6“ – nur diese Linien; andere Werke: "
                         "„kunden:12“ = Puffer-Teile vom Nachfüller (nur mehr, nie über max)")
    ap.add_argument("--shards", default="", help="Lead-Werk, Teile-Lauf vom Nachfüller: Teil-Nummern „3,4,5“ der Linie(n) in "
                         "--teile (feste Aufteilung --shard i/K, K = max der Linie)")
    ap.add_argument("--github", action="store_true",
                    help="Lead-Werk: Linien, die ein anderer aktiver Lauf belegt, auslassen (GitHub-API)")
    a = ap.parse_args(argv)
    reg = load_lines()
    inp = read_inputs(a.werk) if (os.environ.get("SUPABASE_URL") or not a.dry) else {"settings": {}, "rows": []}
    res = decide(reg, a.werk, inp)
    run_plan = res["plan"]
    shards = None
    if a.werk == "lead-werk" and (a.teile is not None or a.github):
        # Linien-Läufe (Nachfüller, 05.10.2026): protokolliert wird die ganze Belegung, gestartet nur der eigene Teil
        import werk_belegung as B
        teile = B.parse_teile(a.teile) if a.teile is not None else None
        claimed: dict = {}
        last_used: dict = {}
        if a.github:
            try:
                all_lanes = {l["id"] for l in reg["lanes"] if l["werk"] == "lead-werk"}
                gh = B.GitHub()
                claimed, clear = B.wait_for_shard_claims(gh, int(os.environ["GITHUB_RUN_ID"]), all_lanes)
                if not clear:
                    print("älterer Lauf ohne fertigen Plan – seine Linien gelten als belegt", file=sys.stderr)
                last_used = B.shard_last_used(gh.recent_runs())
            except BaseException as e:  # noqa: BLE001 – lieber nichts starten als eine Linie doppelt bearbeiten
                print(f"Andere Läufe nicht lesbar ({type(e).__name__}) – keine Linie gestartet", file=sys.stderr)
                claimed = {k: None for k in res["plan"]}
        taken = {k for k, v in claimed.items() if v is None}
        run_plan, note = run_counts(reg, res, teile, taken)
        want = None
        if a.shards.strip() and teile:
            idx = [int(x) for x in re.findall(r"\d+", a.shards)]
            want = {k: idx for k in teile}
        shards = pick_shards(reg, run_plan, claimed, want, last_used)
        for k in run_plan:
            n = len(shards.get(k, []))
            if run_plan[k] and n < run_plan[k]:
                note[k] = f"{n} von {run_plan[k]} Teilen frei (andere laufen schon)"
            run_plan[k] = n
        for k, v in note.items():
            print(f"  {k}: {v}")
    if a.werk != "lead-werk" and a.teile:
        import werk_belegung as B
        buffer_teile(reg, a.werk, res, B.parse_teile(a.teile))
        run_plan = res["plan"]
    db = inp.get("db")
    if db is not None and not a.dry and inp.get("settings") is not None:
        # Quittung (settings_ack): dieses Werk hat Belegungsplan und Autopilot-Schalter gelesen
        try:
            from lib.owner_settings import ack
            s = inp["settings"]
            ack(db, a.werk, ["slot_plan", "slot_autopilot"] + (["lead_mix"] if a.werk == "lead-werk" else []),
                {"slot_plan": s.get("slot_plan") or {}, "slot_autopilot": s.get("slot_autopilot") or {"on": True, "locks": {}},
                 "lead_mix": {"premium_pct": res.get("mix_pct", 100)}},
                seen_at=inp.get("settings_seen"))
        except BaseException as e:  # noqa: BLE001
            print(f"Quittung nicht geschrieben ({type(e).__name__})", file=sys.stderr)
    rows = matrix(reg, a.werk, run_plan, res["extra"], shards)
    summary = ", ".join(f"{k} {v}" for k, v in res["plan"].items())
    gb = f", DB {inp['db_bytes'] / GB:.2f} GB" if inp.get("db_bytes") else ""
    print(f"{a.werk}: {len(rows)} Teile ({res['mode']}, Bremse {res['brake']}{gb}) – {summary}")
    if run_plan is not res["plan"]:
        print("dieser Lauf: " + (", ".join(f"{k} {v}" for k, v in run_plan.items() if v) or "keine Linie frei"))
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
