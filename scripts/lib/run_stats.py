"""Zähler je Lauf für das Dashboard „Werke“ (Inhaber 03.10.2026: „was sie produziert haben … welche
qualitätsfilter es gibt und wie dort jeweils die zahlen sind“). Jedes Werk schreibt am Laufende je
Zielgruppe/Land eine Zeile in signalwerk.run_stats. Fehler beim Schreiben brechen den Lauf nie ab."""
from __future__ import annotations

import os
import sys

WERKE = {"lead-werk", "kunden-werk", "proben-vorrat", "freigabe", "stichprobe", "dauerpruefung", "pruefer-werk",
         "kontakt-werk"}


def _part() -> str:
    return (os.environ.get("RUN_PART") or " ".join(sys.argv[1:]))[:200]


def rows_from_lead_report(segments: dict) -> list[dict]:
    """extraktor/run.py funnel(): {"S2/US": {pool, processed, green, yellow, red, top_reasons}} -> Zeilen."""
    out = []
    for key, r in (segments or {}).items():
        seg, _, country = key.partition("/")
        out.append({"segment_id": seg or None, "country": country or None, "candidates": int(r.get("pool") or 0),
                    "processed": int(r.get("processed") or 0), "green": int(r.get("green") or 0),
                    "yellow": int(r.get("yellow") or 0), "red": int(r.get("red") or 0),
                    "reasons": {str(k): int(v) for k, v in (r.get("top_reasons") or [])},
                    "extra": {**({"stufen": r["stufen"]} if r.get("stufen") else {}),
                              **({"premium": int(r["premium"])} if r.get("premium") else {})}})
    return out


def rows_from_buyer_stats(stats: dict, candidates: int) -> list[dict]:
    """kundenwerk.py: Zähler „S2/US:ok“, „S2/US:call_only“, „S2/US:rejected“ -> Zeilen je Zielgruppe/Land."""
    per: dict[str, dict] = {}
    for k, v in (stats or {}).items():
        if "/" not in k or ":" not in k:
            continue
        key, status = k.rsplit(":", 1)
        seg, _, country = key.partition("/")
        r = per.setdefault(key, {"segment_id": seg, "country": country, "candidates": 0, "processed": 0,
                                 "green": 0, "yellow": 0, "red": 0, "reasons": {}})
        r["processed"] += int(v)
        if status == "ok":
            r["green"] += int(v)
        elif status == "call_only":
            r["yellow"] += int(v)
        else:
            r["red"] += int(v)
    rows = list(per.values())
    extra = {k: int(v) for k, v in (stats or {}).items() if "/" not in k and isinstance(v, int)}
    for r in rows:
        r["extra"] = {"lauf": extra, "kandidaten_gesamt": candidates}
    return rows


def rows_pool_empty(segments: list[str]) -> list[dict]:
    """kundenwerk.py ohne Kandidaten: eine Zeile mit extra.pool_leer, damit der Lauf sichtbar bleibt."""
    return [{"segment_id": None, "country": None, "candidates": 0, "processed": 0, "green": 0, "yellow": 0, "red": 0,
             "reasons": {}, "extra": {"pool_leer": True, "fokus": list(segments)}}]


def rows_from_stock_summary(summary: dict) -> list[dict]:
    """sample_stock.run(): {"S2/US": {soll, vorher, neu}} -> Zeilen (green = neu gebaute Proben)."""
    out = []
    for key, r in (summary or {}).items():
        seg, _, country = key.partition("/")
        out.append({"segment_id": seg, "country": country, "candidates": int(r.get("soll") or 0),
                    "processed": int(r.get("vorher") or 0), "green": int(r.get("neu") or 0), "reasons": {},
                    "extra": ({"premium": int(r.get("premium_leads_neu") or 0)} if r.get("neu") else {})
                    | ({"premium_getauscht": int(r["premium_getauscht"])} if r.get("premium_getauscht") else {})})
    return out


def record(db, werk: str, rows: list[dict], started_at: str | None = None, log=print) -> int:
    if werk not in WERKE or db is None or not rows:
        return 0
    base = {"werk": werk, "run_id": os.environ.get("GITHUB_RUN_ID"), "part": _part(), "started_at": started_at}
    try:
        db.insert("run_stats", [{**base, **r} for r in rows])
        return len(rows)
    except Exception as exc:  # noqa: BLE001 – Zähler dürfen ein Werk nie anhalten
        log(f"run_stats nicht gespeichert: {type(exc).__name__}: {str(exc)[:200]}")
        return 0
