"""Umsatz-/Kundenprognose 30 Tage (gleiche Logik wie app/lib/prognose.ts, gleiche Fälle in tests/fixtures/prognose_cases.json).

Mails in 30 Tagen (Tempo der letzten 7 Tage, höchstens freie Käufer) × Antwortquote × Proben je Antwort × Abschluss je
Probe × Preis. Jede Quote nur aus echten Zählungen; hat eine Stufe noch keinen Treffer, wird ab dort nicht
hochgerechnet („noch keine Basis“). Unsicherheit als Spanne (Wilson 80 %). Reine Funktionen, keine Datenbank.
"""
from __future__ import annotations

import math

Z80 = 1.2816
DAYS = 30
MIN_SENT, MIN_REPLIES = 100, 5


def wilson(k: float, n: float, z: float = Z80) -> tuple[float, float]:
    if n <= 0:
        return 0.0, 1.0
    p = min(1.0, max(0.0, k / n))
    z2 = z * z
    d = 1 + z2 / n
    c = (p + z2 / (2 * n)) / d
    h = (z * math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d
    return max(0.0, c - h), min(1.0, c + h)


def _stage(key: str, k: float, n: float) -> dict:
    kk = max(0.0, min(k, n))
    lo, hi = wilson(kk, n)
    return {"key": key, "k": kk, "n": n, "rate": kk / n if n > 0 else None, "lo": lo, "hi": hi}


def _scale(r: dict, s: dict) -> dict:
    return {"lo": r["lo"] * s["lo"], "mid": r["mid"] * (s["rate"] or 0), "hi": r["hi"] * s["hi"]}


def _jsround(x: float) -> float:  # wie Math.round (halbe aufrunden)
    return math.floor(x + 0.5)


def _round(r: dict, d: int = 0) -> dict:
    f = 10 ** d
    out = {"lo": math.floor(r["lo"] * f) / f, "mid": _jsround(r["mid"] * f) / f, "hi": math.ceil(r["hi"] * f) / f}
    return {k: (int(v) if float(v).is_integer() else v) for k, v in out.items()}


def fmt_range(r: dict | None, unit: str = "") -> str:
    if not r:
        return "–"
    f = lambda x: f"{_jsround(x):,.0f}".replace(",", ".")
    lo, mid, hi = f(r["lo"]), f(r["mid"]), f(r["hi"])
    return (mid if lo == hi else f"{lo}–{hi}") + unit


def forecast(x: dict) -> dict:
    n = lambda v: v if isinstance(v, (int, float)) and v > 0 else 0
    sent, replies, samples, customers = n(x["sent"]), n(x["replies"]), n(x["samples"]), n(x["customers"])
    by_pace = _jsround(n(x["perDay"]) * DAYS)
    free = x.get("freeBuyers")
    mails30 = int(by_pace if free is None else min(by_pace, n(free)))
    stages = [_stage("antwort", replies, sent), _stage("probe", samples, replies), _stage("kunde", customers, samples)]
    base = {"country": x["country"], "currency": x["currency"], "mails30": mails30, "stages": stages}
    empty = {"antworten30": None, "proben30": None, "kunden30": None, "umsatz30": None}
    if not mails30:
        return {**base, **empty, "basis": "kein_versand",
                "text": f"{x['country']}: kein Versand in Sicht (0 Mails/Tag oder keine freien Käufer) – keine Prognose."}
    if not replies:
        return {**base, **empty, "basis": "keine",
                "text": f"{x['country']}: noch keine Basis – 0 Antworten auf {sent} Mails; ~{mails30} Mails in 30 Tagen geplant."}
    m = {"lo": mails30, "mid": mails30, "hi": mails30}
    a = _scale(m, stages[0])
    p = _scale(a, stages[1]) if samples else None
    k = _scale(p, stages[2]) if samples and customers else None
    u = {key: v * x["price"] for key, v in k.items()} if k else None
    basis = "duenn" if sent < MIN_SENT or replies < MIN_REPLIES else "ok"
    ar, pr, kr, ur = _round(a), p and _round(p, 1), k and _round(k, 1), u and _round(u)
    if not p:
        tail = "Proben/Kunden: noch keine Basis"
    elif not k:
        tail = f"~{fmt_range(pr)} Proben, Kunden: noch keine Basis"
    else:
        tail = f"~{fmt_range(pr)} Proben, {fmt_range(kr)} Kunden ({fmt_range(ur, ' ' + x['currency'])}/Mon.)"
    text = f"{x['country']}: {mails30} Mails → {fmt_range(ar)} Antworten, {tail}{' (wenig Daten)' if basis == 'duenn' else ''}."
    return {**base, "basis": basis, "antworten30": ar, "proben30": pr, "kunden30": kr, "umsatz30": ur, "text": text}
