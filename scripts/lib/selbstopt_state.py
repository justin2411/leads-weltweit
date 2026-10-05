"""Stellschrauben der Selbstoptimierung lesen (scripts/selbstopt.py schreibt sie in signalwerk.selbstopt_state).

Jeder Leser fällt bei Fehler oder fehlender Zeile auf den Standard zurück (= Wert aus config/*) und kann den
Standard nur in die sichere Richtung verlassen:
  versand_faktor()      0,5 … 1,0  × Tagesmenge aus config/versand.yaml (nie mehr als dort erlaubt)
  pruef_faktoren()      Budget 1,0 … 2,0 × config/pruefung.yaml, Prüfabstände 0,5 … 1,0 × (nur öfter prüfen)
  kategorien_hinten()   Käufer-Kategorien, die das Kunden-Werk zuletzt prüft (nur Reihenfolge, nichts fällt weg)
"""
from __future__ import annotations

VERSAND_MIN, VERSAND_MAX = 0.5, 1.0
BUDGET_MIN, BUDGET_MAX = 1.0, 2.0
INTERVALL_MIN, INTERVALL_MAX = 0.5, 1.0


def _clamp(x, lo: float, hi: float, default: float) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def get(db, schraube: str) -> dict:
    try:
        rows = db.select("selbstopt_state", {"schraube": f"eq.{schraube}", "select": "wert"}) or []
        w = rows[0].get("wert") if rows else None
        return w if isinstance(w, dict) else {}
    except Exception:  # noqa: BLE001 - Tabelle fehlt/DB weg: Standard
        return {}


def updated_at(db, schraube: str):
    """Zeitpunkt der letzten Änderung (datetime, UTC) oder None."""
    import datetime as dt
    try:
        rows = db.select("selbstopt_state", {"schraube": f"eq.{schraube}", "select": "updated_at"}) or []
        raw = rows[0].get("updated_at") if rows else None
        if not raw:
            return None
        t = dt.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)
    except Exception:  # noqa: BLE001 - ohne Zeitstempel: nur das Protokoll zählt
        return None


def versand_faktor(db=None, wert: dict | None = None) -> float:
    w = wert if wert is not None else get(db, "versand_menge")
    return _clamp(w.get("faktor", 1.0), VERSAND_MIN, VERSAND_MAX, 1.0)


def pruef_faktoren(db=None, wert: dict | None = None) -> tuple[float, float]:
    w = wert if wert is not None else get(db, "dauerpruefung")
    return (_clamp(w.get("budget_faktor", 1.0), BUDGET_MIN, BUDGET_MAX, 1.0),
            _clamp(w.get("intervall_faktor", 1.0), INTERVALL_MIN, INTERVALL_MAX, 1.0))


def kategorien_hinten(db=None, wert: dict | None = None) -> set[str]:
    w = wert if wert is not None else get(db, "kaeufer_kategorien")
    raw = w.get("hinten") or []
    return {str(x).strip().lower().replace(" ", "_") for x in raw if str(x).strip()} if isinstance(raw, list) else set()
