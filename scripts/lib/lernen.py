"""Lernschleife des Gehirns – reine Regeln (Inhaber 04.10.2026: „damit es wie Claude Sachen optimiert und immer
schlauer wird“). Genutzt von scripts/brain_learn.py und lib.kurz.insert_decisions.

Erwartung einer Entscheidung (decisions.erwartung, alles außer kennzahl/richtung optional):
  {"kennzahl": "antwortquote" | <kpi_daily.metric>,
   "richtung": "steigt" | "faellt" | "mindestens" | "hoechstens",
   "zielwert": 0.02,            # Pflicht bei mindestens/hoechstens; bei steigt/faellt Vergleich mit der Basis
   "land": "ALL" | "US" | …,    # ALL = Länder der Test-Freigabe (config/fokus.yaml tests)
   "segment": "S2", "tage": 7,  # pruefen_am = Entscheidung + tage (1–60), oder "pruefen_am": ISO-Zeit
   "thema": "betreff-us",       # gleiche Themen werden verglichen (Widersprüche, Vertrauen)
   "lehre": "Kurzer Betreff mit Firmenname hebt Antworten",
   "wissen": ["slug", …],       # weitere passende Wissens-Einträge (Vertrauen hoch/runter)
   "basis": 0.004}              # fehlt sie, misst brain_learn.py den Wert am Tag der Entscheidung
"""
from __future__ import annotations

import datetime as dt
import re

RICHTUNGEN = ("steigt", "faellt", "mindestens", "hoechstens")
ERGEBNISSE = ("bestaetigt", "widerlegt", "unklar")
KENNZAHL = re.compile(r"^[a-z0-9_]{2,60}$")
# Live-Kennzahlen aus signalwerk.gehirn_score_teile (14-Tage-Fenster bis zum Messtag); alles andere = kpi_daily.metric
LIVE = ("antwortquote", "zustellrate", "bounce_quote", "lead_fehlerquote", "gruen_platzh")
MIN_SENT, MIN_CHECKED = 30, 50
TAGE_MIN, TAGE_MAX, TAGE_STD = 1, 60, 7
LEHRE_MAX = 160

# Vertrauen in Wissen (0–1)
V_START_WIRKT, V_START_FEHLER = 0.7, 0.6
V_PLUS, V_MINUS, V_MAX = 0.15, 0.25, 0.95


def slug(text: str | None, n: int = 60) -> str:
    s = str(text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:n].rstrip("-")


def _num(x) -> float | None:
    if x is None or x == "":
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN


def _ts(x) -> dt.datetime | None:
    if not x:
        return None
    if isinstance(x, dt.datetime):
        d = x
    else:
        try:
            d = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def normal(e: dict | None, created: dt.datetime | None = None) -> tuple[dict, str] | None:
    """Erwartung prüfen und vereinheitlichen -> (erwartung, pruefen_am ISO) oder None ohne Erwartung.
    ValueError bei ungültiger Erwartung (kein stilles Verwerfen)."""
    if not e:
        return None
    if not isinstance(e, dict):
        raise ValueError("Erwartung: Objekt erwartet")
    k = str(e.get("kennzahl") or "").strip().lower()
    if not KENNZAHL.match(k):
        raise ValueError("Erwartung: kennzahl a-z/0-9/_ (2–60)")
    r = str(e.get("richtung") or "").strip().lower().replace("ä", "ae").replace("ö", "oe")
    if r not in RICHTUNGEN:
        raise ValueError(f"Erwartung: richtung {', '.join(RICHTUNGEN)}")
    ziel = _num(e.get("zielwert"))
    if r in ("mindestens", "hoechstens") and ziel is None:
        raise ValueError("Erwartung: zielwert fehlt")
    out: dict = {"kennzahl": k, "richtung": r, "land": str(e.get("land") or "ALL").upper()[:3],
                 "segment": str(e.get("segment") or "S2").upper()[:4]}
    if ziel is not None:
        out["zielwert"] = ziel
    if _num(e.get("basis")) is not None:
        out["basis"] = _num(e.get("basis"))
    if e.get("thema"):
        out["thema"] = slug(e["thema"])
    if e.get("lehre"):
        out["lehre"] = " ".join(str(e["lehre"]).split())[:LEHRE_MAX]
    if e.get("wissen"):
        out["wissen"] = [slug(s, 80) for s in (e["wissen"] if isinstance(e["wissen"], list) else [e["wissen"]]) if s][:5]
    base = created or dt.datetime.now(dt.timezone.utc)
    when = _ts(e.get("pruefen_am"))
    if when is None:
        tage = int(_num(e.get("tage")) or TAGE_STD)
        tage = max(TAGE_MIN, min(TAGE_MAX, tage))
        out["tage"] = tage
        when = base + dt.timedelta(days=tage)
    return out, when.isoformat()


def urteil(e: dict, basis: float | None, messwert: float | None) -> tuple[str, str]:
    """(bestaetigt | widerlegt | unklar, Notiz ≤ 160 Zeichen)."""
    r, ziel = e.get("richtung"), _num(e.get("zielwert"))
    if messwert is None:
        return "unklar", "kein Messwert (zu wenig Daten)"
    k = e.get("kennzahl")
    if r == "mindestens" or (r == "steigt" and ziel is not None):
        ok = messwert >= ziel
        return ("bestaetigt" if ok else "widerlegt"), f"{k} {fmt(messwert)} {'≥' if ok else '<'} Ziel {fmt(ziel)}"
    if r == "hoechstens" or (r == "faellt" and ziel is not None):
        ok = messwert <= ziel
        return ("bestaetigt" if ok else "widerlegt"), f"{k} {fmt(messwert)} {'≤' if ok else '>'} Ziel {fmt(ziel)}"
    if basis is None:
        return "unklar", f"{k} {fmt(messwert)}, keine Basis zum Vergleich"
    if messwert == basis:
        return "unklar", f"{k} unverändert {fmt(messwert)}"
    up = messwert > basis
    ok = up if r == "steigt" else not up
    return ("bestaetigt" if ok else "widerlegt"), f"{k} {fmt(basis)} → {fmt(messwert)}"


def fmt(x: float | None) -> str:
    if x is None:
        return "–"
    if abs(x) < 1 and x != 0:
        return f"{x * 100:.1f} %".replace(".", ",")
    return f"{x:,.0f}".replace(",", ".") if abs(x) >= 100 else f"{x:g}".replace(".", ",")


def live_wert(kennzahl: str, roh: dict | None) -> float | None:
    """Live-Kennzahl aus den Rohwerten von gehirn_score_teile; zu wenig Daten = None."""
    if not roh:
        return None
    n = lambda key: float(roh.get(key) or 0)  # noqa: E731
    if kennzahl in ("antwortquote", "zustellrate", "bounce_quote"):
        if n("gesendet") < MIN_SENT:
            return None
        if kennzahl == "antwortquote":
            return round(n("antworten") / n("gesendet"), 4)
        b = n("bounces") / n("gesendet")
        return round(b if kennzahl == "bounce_quote" else 1 - b, 4)
    if kennzahl == "lead_fehlerquote":
        return round(n("fehler") / n("geprueft"), 4) if n("geprueft") >= MIN_CHECKED else None
    if kennzahl == "gruen_platzh":
        return round(n("gruen") / n("platz_h"), 1) if n("platz_h") >= 1 else None
    return None


def thema_of(d: dict) -> str:
    e = d.get("erwartung") or {}
    return e.get("thema") or slug(d.get("kurz_titel") or d.get("subject") or f"entscheidung-{d.get('id')}")


def vertrauen_neu(alt: float | None, plus: bool) -> float:
    v = 0.5 if alt is None else float(alt)
    v = min(V_MAX, v + V_PLUS) if plus else max(0.0, v - V_MINUS)
    return round(v, 2)


def widersprueche(rows: list[dict], min_v: float = 0.3) -> list[dict]:
    """Gleiches Thema, gegensätzliche Aussage (wirkt / wirkt_nicht), beide aktiv mit Vertrauen ≥ min_v."""
    by: dict[str, dict[str, list[str]]] = {}
    for r in rows:
        if r.get("status", "aktiv") != "aktiv" or not r.get("thema") or r.get("richtung") not in ("wirkt", "wirkt_nicht"):
            continue
        if float(r.get("vertrauen") if r.get("vertrauen") is not None else 0.5) < min_v:
            continue
        by.setdefault(r["thema"], {"wirkt": [], "wirkt_nicht": []})[r["richtung"]].append(r["slug"])
    return [{"thema": t, **v} for t, v in sorted(by.items()) if v["wirkt"] and v["wirkt_nicht"]]


def veraltet(r: dict, t: dt.datetime, tage: int = 30, max_v: float = 0.3) -> bool:
    """Archivieren: > tage ohne Bestätigung UND Vertrauen < max_v. Notizen des Inhabers nie."""
    if r.get("status", "aktiv") != "aktiv" or r.get("quelle") == "inhaber":
        return False
    v = r.get("vertrauen")
    if v is None or float(v) >= max_v:
        return False
    last = _ts(r.get("zuletzt_bestaetigt")) or _ts(r.get("created_at")) or _ts(r.get("updated_at"))
    return last is not None and (t - last) > dt.timedelta(days=tage)
