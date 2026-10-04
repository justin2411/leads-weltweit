"""Meta-Review: das Gehirn optimiert sich selbst (Inhaber 04.10.2026: „Bau es so das sich auch das gehirn weiter
selbstoptimiert“). Läuft täglich 21:10 deutscher Zeit als Gehirn-Routine „Meta-Review Gehirn“ und einmal täglich in der
Gehirn-Sitzung (docs/GEHIRN-SITZUNG.md „Selbstverbesserung“); je deutschem Tag wird höchstens einmal angepasst.

1. Gehirn-Score (0–100) aus Antwortquote S2 (14 T, Ziel 5 %), Zustellrate (14 T, 90–100 %), Lead-Fehlerquote der
   Freigabe-Stichprobe (0–5 %) und grünen Leads je Platz-Stunde (Ziel 200) – Gewichte 40/20/20/20, nur Teile mit
   Basis; weniger als 2 Teile = „noch keine Basis“. Täglich in kpi_daily (Land ALL, Kennzahl gehirn_score + gs_*).
2. Bewertung je Gehirn-Routine und je Auftragsart: Wirkung jedes fertigen Auftrags (agent_tasks.wirkung aus
   datenfluss.py, sonst Gehirn-Score vorher/nachher ±2 Punkte), Fehler, Laufzeit in Minuten (Kosten).
3. Selbst anwenden (umkehrbar, jede Änderung in decisions mit kurz_titel/kurz_grund):
   - Routine ohne Wirkung nach ≥ 5 bewerteten Läufen → Takt halbieren (4→2→1→jeden 2. Tag), danach pausieren
     (aktiv = false, nie löschen). Routine mit klarer Wirkung (≥ 60 % wirkt) → Takt verdoppeln, höchstens 4×/Tag.
     Nach jeder Anpassung zählen nur neue Läufe (brain_routines.meta_at). Das Meta-Review selbst wird nie angepasst.
   - Erfolgsmuster und Fehlermuster („bringt nichts bei …“) als Wissensnotizen (brain_knowledge typ gelernt /
     fehlermuster); Auftragsarten mit Vorrang: `vorrang`.
   - Höchstens 3 offene Verbesserungsvorschläge für docs/GEHIRN-SITZUNG.md mit Beleg (brain_improvements).
   Zu wenig Daten: nichts ändern, „noch keine Basis“.

Nie: Regeln/Grenzen ändern, Versand, Kosten, Sperrliste, Prüfregeln, Löschen. Sendet nichts, löscht nichts.

  python scripts/brain_meta.py lauf [--apply] [--force]     # Meta-Review (ohne --apply nur anzeigen)
  python scripts/brain_meta.py score [--apply] [--tag YYYY-MM-DD] [--nur-abends]   # kpi-tag.yml 23:xx
  python scripts/brain_meta.py vorschlaege                  # offene Verbesserungsvorschläge (JSON)
  python scripts/brain_meta.py uebernommen <id> --pr <url>  # Vorschlag per PR übernommen
  python scripts/brain_meta.py verworfen <id> --grund "…"   # Vorschlag verworfen (≤ 160 Zeichen)
  python scripts/brain_meta.py zurueck <decision_id>        # Takt-Änderung zurücknehmen
  python scripts/brain_meta.py vorrang                      # Auftragsarten nach Wirkung (für docs/GEHIRN-SITZUNG.md 4b)
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

BERLIN = ZoneInfo("Europe/Berlin")
SEGMENT = "S2"

# Gehirn-Score
WEIGHTS = {"antwortquote": 40, "zustellrate": 20, "fehlerquote": 20, "gruen_platzh": 20}
PART_LABEL = {"antwortquote": "Antwortquote", "zustellrate": "Zustellrate", "fehlerquote": "Lead-Fehlerquote",
              "gruen_platzh": "Grüne Leads je Platz-Stunde"}
MIN_SENT, MIN_CHECKED, MIN_SLOT_H = 30, 50, 1.0
ZIEL_ANTWORT, ZIEL_GRUEN = 0.05, 200.0
MIN_PARTS = 2
TREND_TAGE, TREND_SCHWELLE = 7, 2.0

# Bewertung und Regeln
MIN_RUNS = 5
GOOD_SHARE = 0.6
DELTA_POINTS = 2.0
LOOKBACK = dt.timedelta(days=30)
TAKTE = (0.5, 1, 2, 4)
MAX_TAKT = 4
MAX_OPEN_IMPROVEMENTS = 3
IMPROVEMENT_TTL = dt.timedelta(days=7)
ERROR_SHARE = 0.3
META_ROUTINE = "Meta-Review Gehirn"
PREFIX = "Meta: "

KIND_NAME = {"leads": "Leads", "kaeufer": "Käufer", "quelle": "Quelle", "pruefen": "Prüfen", "frage": "Frage",
             "kunde": "Kunde", "website": "Website", "gehirn": "Gehirn-Routine"}
SLUG_GOOD, SLUG_BAD = "gehirn-gelernt", "gehirn-fehlermuster"


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _ts(x) -> dt.datetime | None:
    if not x:
        return None
    try:
        d = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def berlin_day(t: dt.datetime) -> dt.date:
    return t.astimezone(BERLIN).date()


def _clamp(x: float) -> float:
    return round(max(0.0, min(100.0, x)), 1)


# ------------------------------------------------------------------------------------------------ Gehirn-Score
def score_parts(raw: dict) -> dict:
    """Rohwerte (gehirn_score_teile) → {teil: {wert, punkte}}; Teile ohne Basis fehlen."""
    n = lambda k: float(raw.get(k) or 0)  # noqa: E731
    out: dict[str, dict] = {}
    sent = n("gesendet")
    if sent >= MIN_SENT:
        q = n("antworten") / sent
        out["antwortquote"] = {"wert": round(q, 4), "punkte": _clamp(q / ZIEL_ANTWORT * 100)}
        z = 1 - n("bounces") / sent
        out["zustellrate"] = {"wert": round(z, 4), "punkte": _clamp((z - 0.90) / 0.10 * 100)}
    if n("geprueft") >= MIN_CHECKED:
        f = n("fehler") / n("geprueft")
        out["fehlerquote"] = {"wert": round(f, 4), "punkte": _clamp(100 - f / 0.05 * 100)}
    if n("platz_h") >= MIN_SLOT_H:
        g = n("gruen") / n("platz_h")
        out["gruen_platzh"] = {"wert": round(g, 1), "punkte": _clamp(g / ZIEL_GRUEN * 100)}
    return out


def score_of(parts: dict) -> float | None:
    if len(parts) < MIN_PARTS:
        return None
    w = sum(WEIGHTS[k] for k in parts)
    return round(sum(WEIGHTS[k] * p["punkte"] for k, p in parts.items()) / w, 1)


def trend(history: dict[dt.date, float], day: dt.date) -> dict:
    """Score heute gegen den Schnitt der 7 Tage davor: steigt / fällt / gleich / neu / keine Basis."""
    s = history.get(day)
    prev = [v for d, v in history.items() if day - dt.timedelta(days=TREND_TAGE) <= d < day and v is not None]
    if s is None:
        return {"score": None, "richtung": "keine Basis"}
    if not prev:
        return {"score": s, "richtung": "neu"}
    avg = round(sum(prev) / len(prev), 1)
    d = round(s - avg, 1)
    r = "steigt" if d >= TREND_SCHWELLE else "fällt" if d <= -TREND_SCHWELLE else "gleich"
    return {"score": s, "vorher": avg, "delta": d, "richtung": r}


def kpi_rows(day: dt.date, parts: dict, score: float | None, t: dt.datetime) -> list[dict]:
    base = {"day": day.isoformat(), "country": "ALL", "segment_id": SEGMENT, "updated_at": t.isoformat()}
    rows = [{**base, "metric": "gehirn_score", "value": score}]
    rows += [{**base, "metric": f"gs_{k}", "value": p["wert"]} for k, p in parts.items()]
    return rows


def compute_score(db, day: dt.date, countries: list[str]) -> tuple[dict, float | None]:
    raw = (db.rpc("gehirn_score_teile", {"p_day": day.isoformat(), "p_segment": SEGMENT, "p_countries": countries}) or [{}])
    raw = raw[0] if isinstance(raw, list) and raw else raw if isinstance(raw, dict) else {}
    parts = score_parts(raw)
    return parts, score_of(parts)


def score_history(db, upto: dt.date, days: int = 14) -> dict[dt.date, float]:
    rows = db.select("kpi_daily", {"metric": "eq.gehirn_score", "country": "eq.ALL", "segment_id": f"eq.{SEGMENT}",
                                   "day": f"gte.{(upto - dt.timedelta(days=days)).isoformat()}",
                                   "select": "day,value", "order": "day.asc"}) or []
    out = {}
    for r in rows:
        if r.get("value") is not None and str(r["day"])[:10] <= upto.isoformat():
            out[dt.date.fromisoformat(str(r["day"])[:10])] = float(r["value"])
    return out


def score_cmd(db, day: dt.date, apply: bool, t: dt.datetime, countries: list[str] | None = None) -> dict:
    if countries is None:
        from lib.fokus import test_scope
        countries = test_scope()[1] or ["US", "UK", "FR"]
    parts, score = compute_score(db, day, countries)
    if apply:
        db.insert("kpi_daily", kpi_rows(day, parts, score, t), upsert_on="day,country,segment_id,metric")
    hist = score_history(db, day)
    if score is not None:
        hist[day] = score
    return {"tag": day.isoformat(), "score": score, "teile": parts, "trend": trend(hist, day),
            "basis": "ok" if score is not None else "noch keine Basis"}


# ------------------------------------------------------------------------------------------------ Bewertung
def task_verdict(task: dict, scores: dict[dt.date, float]) -> str:
    """wirkt | neutral | sinkt | fehler | keine Daten – zuerst datenfluss.py (agent_tasks.wirkung), sonst Gehirn-Score."""
    if task.get("status") == "fehler":
        return "fehler"
    w = (task.get("wirkung") or {}).get("bewertung") if isinstance(task.get("wirkung"), dict) else None
    if w in ("wirkt", "neutral", "sinkt"):
        return w
    start = _ts(task.get("started_at")) or _ts(task.get("created_at"))
    end = _ts(task.get("finished_at"))
    if not start or not end:
        return "keine Daten"
    d0, d1 = berlin_day(start), berlin_day(end)
    before = [scores[d] for d in (d0 - dt.timedelta(days=i) for i in range(1, 4)) if d in scores]
    after = [scores[d] for d in (d1 + dt.timedelta(days=i) for i in range(1, 4)) if d in scores]
    if not before or not after:
        return "keine Daten"
    delta = sum(after) / len(after) - sum(before) / len(before)
    return "wirkt" if delta >= DELTA_POINTS else "sinkt" if delta <= -DELTA_POINTS else "neutral"


def minutes(task: dict) -> float | None:
    a, b = _ts(task.get("started_at")), _ts(task.get("finished_at"))
    return round((b - a).total_seconds() / 60, 1) if a and b and b > a else None


def bilanz(tasks: list[dict], scores: dict[dt.date, float]) -> dict:
    v = [task_verdict(x, scores) for x in tasks]
    rated = [x for x in v if x != "keine Daten"]
    mins = [m for m in (minutes(x) for x in tasks) if m is not None]
    b = {"laeufe": len(tasks), "bewertet": len(rated), "wirkt": rated.count("wirkt"), "neutral": rated.count("neutral"),
         "sinkt": rated.count("sinkt"), "fehler": rated.count("fehler"),
         "minuten": round(sum(mins) / len(mins), 1) if mins else None}
    b["urteil"] = judge(b)
    return b


def judge(b: dict) -> str:
    """gut | ohne Wirkung | offen | noch keine Basis."""
    if b["bewertet"] < MIN_RUNS:
        return "noch keine Basis"
    if b["wirkt"] / b["bewertet"] >= GOOD_SHARE and b["wirkt"] > b["sinkt"]:
        return "gut"
    if b["wirkt"] == 0:
        return "ohne Wirkung"
    return "offen"


def routine_of(task: dict, routines: list[dict]) -> dict | None:
    rid = task.get("routine_id")
    for r in routines:
        if rid and str(r["id"]) == str(rid):
            return r
    brief = str(task.get("brief") or "")
    for r in routines:  # ältere Aufträge ohne routine_id: Auftragstext beginnt mit „Gehirn-Routine <Name> (“
        name = " ".join(str(r.get("name") or "").split())[:60]
        if name and brief.startswith(f"Gehirn-Routine {name} ("):
            return r
    return None


def protected(r: dict) -> bool:
    return r.get("name") == META_ROUTINE or "brain_meta.py" in str(r.get("aufgabe") or "")


def next_takt(takt: float, urteil: str) -> tuple[float, bool] | None:
    """(neuer Takt, aktiv) oder None ohne Änderung."""
    takt = float(takt or 1)
    if urteil == "ohne Wirkung":
        lower = [x for x in TAKTE if x < takt]
        return (float(lower[-1]), True) if lower else (takt, False)
    if urteil == "gut" and takt < MAX_TAKT:
        return (float(min(MAX_TAKT, takt * 2)), True)
    return None


def takt_text(takt: float, aktiv: bool = True) -> str:
    if not aktiv:
        return "pausiert"
    return "jeden 2. Tag" if float(takt) < 1 else "1×/Tag" if float(takt) == 1 else f"{int(takt)}×/Tag"


def short_bilanz(b: dict) -> str:
    m = f", Ø {b['minuten']:g} min" if b.get("minuten") is not None else ""
    return f"{b['wirkt']} von {b['bewertet']} Läufen mit Wirkung{m}"


# ------------------------------------------------------------------------------------------------ Muster + Vorschläge
def patterns(by_kind: dict[str, dict], by_market: dict[tuple[str, str], dict]) -> tuple[list[dict], list[dict]]:
    good, bad = [], []
    for k, b in sorted(by_kind.items()):
        name = KIND_NAME.get(k, k)
        if b["urteil"] == "gut":
            good.append({"key": f"art-{k}", "text": f"Aufträge der Art {name} wirken ({b['wirkt']}/{b['bewertet']}).", "art": k, **b})
        elif b["urteil"] == "ohne Wirkung":
            bad.append({"key": f"art-{k}", "text": f"Art {name} bringt nichts ({b['bewertet']} bewertet, 0 wirken).", "art": k, **b})
    for (k, m), b in sorted(by_market.items()):
        name = KIND_NAME.get(k, k)
        if b["urteil"] == "ohne Wirkung" and by_kind.get(k, {}).get("urteil") != "ohne Wirkung":
            bad.append({"key": f"art-{k}-{m.lower()}", "text": f"{name} bringt nichts bei {m} ({b['bewertet']} bewertet, 0 wirken).",
                        "art": k, "markt": m, **b})
        elif b["urteil"] == "gut" and by_kind.get(k, {}).get("urteil") != "gut":
            good.append({"key": f"art-{k}-{m.lower()}", "text": f"{name} wirkt bei {m} ({b['wirkt']}/{b['bewertet']}).",
                         "art": k, "markt": m, **b})
    return good, bad


def improvements(good: list[dict], bad: list[dict], tasks: list[dict], sc: dict) -> list[dict]:
    """Kandidaten für docs/GEHIRN-SITZUNG.md (nur ergänzen/präzisieren, nie Regeln oder Grenzen)."""
    out = []
    for g in good:
        if "markt" in g:
            continue
        name = KIND_NAME.get(g["art"], g["art"])
        out.append({"regel": f"art-vorrang-{g['art']}", "abschnitt": "4b",
                    "kurz_titel": f"Aufträge „{name}“ zuerst wählen",
                    "vorschlag": f"In 4b ergänzen: Bei freier Wahl zuerst Aufträge der Art {name} vergeben – sie wirken meist.",
                    "beleg": f"{g['wirkt']} von {g['bewertet']} Aufträgen mit Wirkung (72 h, kpi_daily/Gehirn-Score)."})
    for b in bad:
        name = KIND_NAME.get(b["art"], b["art"])
        wo = f" in {b['markt']}" if b.get("markt") else ""
        out.append({"regel": f"art-meiden-{b['art']}" + (f"-{b['markt'].lower()}" if b.get("markt") else ""), "abschnitt": "4b",
                    "kurz_titel": f"„{name}“{wo} nur mit Ziel-Kennzahl",
                    "vorschlag": f"In 4b ergänzen: Aufträge der Art {name}{wo} nur mit konkreter Quelle und Ziel-Kennzahl vergeben.",
                    "beleg": f"0 von {b['bewertet']} Aufträgen{wo} mit Wirkung."})
    done = [x for x in tasks if x.get("status") in ("fertig", "fehler")]
    err = [x for x in done if x.get("status") == "fehler"]
    if len(done) >= MIN_RUNS and len(err) / len(done) >= ERROR_SHARE:
        out.append({"regel": "auftrag-konkreter", "abschnitt": "4b", "kurz_titel": "Aufträge konkreter formulieren",
                    "vorschlag": "In 4b ergänzen: jeden Auftrag mit Markt, Ziel-Kennzahl und erwartetem Ergebnis schreiben.",
                    "beleg": f"{len(err)} von {len(done)} Gehirn-Aufträgen endeten mit Fehler (30 Tage)."})
    tr, parts = sc.get("trend") or {}, sc.get("teile") or {}
    if tr.get("richtung") == "fällt" and parts:
        weak = min(parts, key=lambda k: parts[k]["punkte"])
        out.append({"regel": f"score-{weak.replace('_', '-')}", "abschnitt": "4",
                    "kurz_titel": f"Zuerst {PART_LABEL[weak]} verbessern"[:60],
                    "vorschlag": f"In Ablauf 4 ergänzen: fällt der Gehirn-Score, zuerst den schwächsten Teil ({PART_LABEL[weak]}) angehen.",
                    "beleg": f"Gehirn-Score {tr.get('vorher')} → {tr.get('score')}, {PART_LABEL[weak]} {parts[weak]['punkte']:g} Punkte."})
    return out


def knowledge_md(items: list[dict], head: str) -> str:
    if not items:
        return f"{head}\n\n_noch keine Basis (je Muster ≥ {MIN_RUNS} bewertete Aufträge)._"
    lines = [head, ""]
    for x in items:
        m = f" · Ø {x['minuten']:g} min" if x.get("minuten") is not None else ""
        lines.append(f"- {x['text']}{m}")
    lines += ["", f"_Meta-Review: wirkt = Kennzahl +10 % (datenfluss.py) oder Gehirn-Score +{DELTA_POINTS:g} Punkte, "
                  f"je Muster ≥ {MIN_RUNS} bewertete Aufträge._"]
    return "\n".join(lines)


# ------------------------------------------------------------------------------------------------ Lauf
def _decision(db, subject: str, titel: str, grund: str, metrics: dict, action: str | None = None) -> dict:
    from lib.kurz import insert_decisions
    row = {"type": "note", "subject": f"{PREFIX}{subject}", "reasoning": grund, "metrics": metrics, "status": "done",
           "kurz_titel": titel[:60], "kurz_grund": grund[:160]}
    if action:
        row["action"] = action
    return (insert_decisions(db, row) or [{}])[0]


def load(db, t: dt.datetime) -> tuple[list[dict], list[dict]]:
    routines = db.select("brain_routines", {"select": "id,name,aufgabe,takt,aktiv,meta_at", "order": "created_at.asc"}) or []
    tasks = db.select("agent_tasks", {"status": "in.(fertig,fehler)", "finished_at": f"gte.{(t - LOOKBACK).isoformat()}",
                                      "select": "id,agent,kind,market,brief,status,created_by,created_at,started_at,"
                                                "finished_at,wirkung,routine_id",
                                      "order": "finished_at.asc", "limit": "2000"}) or []
    return routines, tasks


def review(db, t: dt.datetime | None = None, apply: bool = False, force: bool = False,
           countries: list[str] | None = None) -> dict:
    t = t or now()
    day = berlin_day(t)
    sc = score_cmd(db, day, apply, t, countries)
    done_today = db.select("brain_meta_runs", {"day": f"eq.{day.isoformat()}", "select": "day"}) or []
    if apply and done_today and not force:
        return {"tag": day.isoformat(), "score": sc, "hinweis": "heute schon gelaufen – nichts geändert"}
    scores = score_history(db, day, days=45)
    if sc["score"] is not None:
        scores[day] = sc["score"]
    routines, tasks = load(db, t)

    # je Routine (nur Läufe seit der letzten Anpassung)
    per_routine: dict[str, list[dict]] = {}
    for x in tasks:
        r = routine_of(x, routines)
        if not r:
            continue
        since = _ts(r.get("meta_at"))
        if since and (_ts(x.get("created_at")) or t) < since:
            continue
        per_routine.setdefault(str(r["id"]), []).append(x)
    changes, routine_out = [], []
    for r in routines:
        b = bilanz(per_routine.get(str(r["id"]), []), scores)
        routine_out.append({"routine": r["name"], "takt": takt_text(r.get("takt") or 1, r.get("aktiv", True)), **b})
        if protected(r) or not r.get("aktiv"):
            continue
        nxt = next_takt(float(r.get("takt") or 1), b["urteil"])
        if not nxt:
            continue
        takt, aktiv = nxt
        before = {"takt": float(r.get("takt") or 1), "aktiv": True}
        after = {"takt": takt, "aktiv": aktiv}
        name = " ".join(str(r["name"]).split())
        if b["urteil"] == "gut":
            titel = f"Routine „{name}“ öfter"
        elif aktiv:
            titel = f"Routine „{name}“ seltener"
        else:
            titel = f"Routine „{name}“ pausiert"
        grund = f"{short_bilanz(b)}; jetzt {takt_text(takt, aktiv)}."
        ch = {"routine_id": r["id"], "routine": name, "vorher": before, "nachher": after, "titel": titel, "grund": grund}
        changes.append(ch)
        if apply:
            db.update("brain_routines", {"id": r["id"]}, {"takt": takt, "aktiv": aktiv, "meta_at": t.isoformat()})
            dec = _decision(db, f"Routine {name} Takt {takt_text(**before)} → {takt_text(takt, aktiv)}", titel, grund,
                            {"meta": "routine_takt", **{k: ch[k] for k in ("routine_id", "vorher", "nachher")}, "bilanz": b})
            ch["decision_id"] = dec.get("id")

    # je Auftragsart (ohne Routine-Aufträge) und je Art × Markt
    own = [x for x in tasks if x.get("kind") != "gehirn"]
    by_kind = {k: bilanz([x for x in own if x.get("kind") == k], scores) for k in sorted({x.get("kind") for x in own if x.get("kind")})}
    by_market: dict[tuple[str, str], dict] = {}
    for k in by_kind:
        for m in sorted({str(x.get("market") or "").upper() for x in own if x.get("kind") == k} - {""}):
            if re.fullmatch(r"[A-Z]{2}", m):
                by_market[(k, m)] = bilanz([x for x in own if x.get("kind") == k and str(x.get("market") or "").upper() == m], scores)
    good, bad = patterns(by_kind, by_market)
    prev = (db.select("brain_meta_runs", {"day": f"lt.{day.isoformat()}", "select": "ergebnis", "order": "day.desc",
                                          "limit": "1"}) or [{}])[0].get("ergebnis") or {}
    known = set(prev.get("muster") or [])
    new_patterns = [p for p in good + bad if p["key"] not in known]

    brain_tasks = [x for x in tasks if x.get("created_by") in ("Gehirn", "Gehirn-Routine")]
    cands = improvements(good, bad, brain_tasks, sc)
    added = []
    if apply:
        import brain_knowledge
        for slug, titel, items, typ, head in ((SLUG_GOOD, "Gelernt: was wirkt", good, "gelernt", "# Was wirkt"),
                                             (SLUG_BAD, "Fehlermuster: was nichts bringt", bad, "fehlermuster", "# Was nichts bringt")):
            md = knowledge_md(items, head)
            cur = brain_knowledge.get(db, slug)
            if not cur or (cur.get("markdown") or "").strip() != md.strip():
                brain_knowledge.add(db, slug, titel, md, quelle="routine", typ=typ, now=t)
        for p in new_patterns:
            ok = p in good
            _decision(db, f"Muster {p['key']}", ("Gelernt: " if ok else "Fehlermuster: ") + p["text"][:50],
                      p["text"], {"meta": "muster", "key": p["key"], "art": p.get("art"), "markt": p.get("markt")})
        added = add_improvements(db, cands, t)
    vorrang = [k for k, b in sorted(by_kind.items(), key=lambda kv: -(kv[1]["wirkt"] / kv[1]["bewertet"] if kv[1]["bewertet"] else 0))
               if b["urteil"] != "ohne Wirkung"]
    enough = any(b["bewertet"] >= MIN_RUNS for b in list(by_kind.values()) + [x for x in routine_out])
    res = {"tag": day.isoformat(), "score": sc, "routinen": routine_out, "auftragsarten": by_kind,
           "aenderungen": changes, "gelernt": [g["text"] for g in good], "fehlermuster": [b["text"] for b in bad],
           "vorschlaege_neu": added if apply else cands[:MAX_OPEN_IMPROVEMENTS], "vorrang": vorrang,
           "basis": "ok" if enough else "noch keine Basis"}
    if apply:
        db.insert("brain_meta_runs", {"day": day.isoformat(), "at": t.isoformat(), "score": sc["score"], "basis": res["basis"],
                                      "ergebnis": {"aenderungen": [{k: c[k] for k in ("routine", "titel", "grund")} for c in changes],
                                                   "muster": [p["key"] for p in good + bad], "vorrang": vorrang,
                                                   "trend": sc["trend"]}}, upsert_on="day")
    return res


def add_improvements(db, cands: list[dict], t: dt.datetime) -> list[dict]:
    """Abgelaufene offene Vorschläge verwerfen (nicht löschen), dann bis zu 3 offene auffüllen (je Regel einmal)."""
    rows = db.select("brain_improvements", {"select": "id,regel,status,created_at,erledigt_at",
                                            "created_at": f"gte.{(t - dt.timedelta(days=30)).isoformat()}"}) or []
    for r in rows:
        if r["status"] == "offen" and (_ts(r.get("created_at")) or t) < t - IMPROVEMENT_TTL:
            db.update("brain_improvements", {"id": r["id"]},
                      {"status": "verworfen", "notiz": "veraltet (7 Tage offen)", "erledigt_at": t.isoformat()})
            r["status"] = "verworfen"
    open_ = [r for r in rows if r["status"] == "offen"]
    recent = {r["regel"] for r in rows if r["status"] == "offen"
              or (r["status"] == "uebernommen" and (_ts(r.get("erledigt_at")) or t) >= t - dt.timedelta(days=14))}
    added = []
    for c in cands:
        if len(open_) + len(added) >= MAX_OPEN_IMPROVEMENTS:
            break
        if c["regel"] in recent:
            continue
        row = {k: c[k] for k in ("regel", "abschnitt", "kurz_titel", "vorschlag", "beleg")}
        row.update(kurz_titel=row["kurz_titel"][:60], status="offen", created_at=t.isoformat())
        db.insert("brain_improvements", row)
        recent.add(c["regel"])
        added.append(row)
    return added


def offene(db) -> list[dict]:
    return db.select("brain_improvements", {"status": "eq.offen", "order": "created_at.asc",
                                            "select": "id,created_at,regel,abschnitt,kurz_titel,vorschlag,beleg"}) or []


def close_improvement(db, iid: str, status: str, pr: str | None = None, grund: str | None = None,
                      t: dt.datetime | None = None) -> int:
    vals = {"status": status, "erledigt_at": (t or now()).isoformat()}
    if pr:
        vals["pr_url"] = pr
    if grund:
        vals["notiz"] = " ".join(grund.split())[:160]
    return len(db.update("brain_improvements", {"id": iid}, vals) or [])


def zurueck(db, decision_id: str, t: dt.datetime | None = None) -> dict:
    """Takt-Änderung zurücknehmen: alter Takt/aktiv wieder herstellen, neuer Eintrag in decisions."""
    t = t or now()
    d = (db.select("decisions", {"id": f"eq.{decision_id}", "select": "id,metrics"}) or [None])[0]
    m = (d or {}).get("metrics") or {}
    if m.get("meta") != "routine_takt" or not m.get("routine_id"):
        raise ValueError("keine Takt-Änderung des Meta-Reviews")
    v = m["vorher"]
    db.update("brain_routines", {"id": m["routine_id"]}, {"takt": v["takt"], "aktiv": v["aktiv"], "meta_at": t.isoformat()})
    _decision(db, f"Takt zurück ({decision_id})", "Routine-Takt zurückgenommen",
              f"Zurück auf {takt_text(v['takt'], v['aktiv'])}.", {"meta": "zurueck", "decision_id": decision_id, **m})
    return {"routine_id": m["routine_id"], "takt": v["takt"], "aktiv": v["aktiv"]}


def _opt(args: list[str], name: str) -> str | None:
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    cmd, args = argv[0], argv[1:]
    db = DB()
    if cmd == "lauf":
        res = review(db, apply="--apply" in args, force="--force" in args)
        print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
        return 0
    if cmd == "score":
        tag = _opt(args, "--tag")
        t = now()
        if "--nur-abends" in args and t.astimezone(BERLIN).hour != 23:
            print("score: übersprungen (nur 23:xx deutscher Zeit)")
            return 0
        print(json.dumps(score_cmd(db, dt.date.fromisoformat(tag) if tag else berlin_day(t), "--apply" in args, t),
                         ensure_ascii=False, indent=1))
        return 0
    if cmd == "vorschlaege":
        print(json.dumps(offene(db), ensure_ascii=False, indent=1, default=str))
        return 0
    if cmd in ("uebernommen", "verworfen") and args:
        n = close_improvement(db, args[0], cmd, _opt(args, "--pr"), _opt(args, "--grund"))
        print(f"{cmd}: {n}")
        return 0 if n else 2
    if cmd == "zurueck" and args:
        try:
            print(json.dumps(zurueck(db, args[0]), ensure_ascii=False))
        except ValueError as exc:
            print(f"zurueck: {exc}")
            return 2
        return 0
    if cmd == "vorrang":
        last = (db.select("brain_meta_runs", {"select": "day,ergebnis", "order": "day.desc", "limit": "1"}) or [{}])[0]
        print(json.dumps({"tag": last.get("day"), "vorrang": (last.get("ergebnis") or {}).get("vorrang") or []},
                         ensure_ascii=False))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
