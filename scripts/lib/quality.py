"""Qualitätswert aus Dauerprüfung und Freigabe (Inhaber 04.10.2026: „je länger die liegen, desto bessere Qualität, weil
sie so oft geprüft wurden“).

Jede Freigabe-Prüfung (Probe, Vorrat, Lieferung, Stichprobe, Dauerprüfung) zählt: bestanden = pruef_anzahl + 1,
nächste Prüfung nach wachsendem Abstand (config/pruefung.yaml intervalle_tage, z. B. 1 → 3 → 7 → 14 → 30 Tage),
qualitaet_score steigt mit bestandenen Prüfungen und Alter; nicht bestanden = Wert fällt um 50, keine nächste
Prüfung (der Lead ist dann ohnehin 'held'). Die Rechnung macht die Datenbank (signalwerk.lead_quality_apply,
signalwerk.quality_score); score() hier ist der Spiegel für Tests und Anzeigen.

Der Wert ändert nie, OB ein Lead rausgeht – das entscheidet allein die Freigabe. Er ändert nur die Reihenfolge, in
der freigegebene Leads gewählt werden (Proben-Vorrat, Lieferungen: öfter geprüfte zuerst).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INTERVALS = [1, 3, 7, 14, 30]


@lru_cache(maxsize=1)
def config() -> dict:
    try:
        import yaml
        return yaml.safe_load((ROOT / "config" / "pruefung.yaml").read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001 - ohne Datei gelten die Standardwerte
        return {}


def intervals(cfg: dict | None = None) -> list[int]:
    raw = (cfg if cfg is not None else config()).get("intervalle_tage") or DEFAULT_INTERVALS
    out = [max(1, int(x)) for x in raw if str(x).strip().lstrip("-").isdigit()]
    return out or list(DEFAULT_INTERVALS)


def next_interval(passed: int, steps: list[int] | None = None) -> int:
    """Tage bis zur nächsten Prüfung nach `passed` bestandenen Prüfungen (passed >= 1)."""
    steps = steps or DEFAULT_INTERVALS
    return steps[min(max(passed, 1), len(steps)) - 1]


def score(passed: int, age_days: float) -> int:
    """Spiegel von signalwerk.quality_score: 25 + 15 je bestandener Prüfung (max. 4) + 1 je 2 Tage (max. 15)."""
    return int(min(100, 25 + 15 * min(max(passed, 0), 4) + min(15, max(0, int(age_days // 2)))))


def failed_score(old: int | None) -> int:
    return max(0, (old or 0) - 50)


def sort_key(row: dict) -> int:
    """Für stabile Sortierung: höherer Wert zuerst, nie geprüfte (None) zuletzt."""
    v = row.get("qualitaet_score")
    return -int(v) if isinstance(v, (int, float)) else 1


def apply_leads(db, verdicts, log=print) -> int:
    """Ergebnis einer Freigabe in die Qualitätsfelder übernehmen. Wirft nie (Freigabe bleibt davon unberührt)."""
    rows = [{"id": v.lead_id, "ok": bool(v.ok)} for v in verdicts if getattr(v, "lead_id", None)]
    if not rows:
        return 0
    n = 0
    try:
        for i in range(0, len(rows), 500):
            r = db.rpc("lead_quality_apply", {"p_rows": rows[i:i + 500], "p_intervals": intervals()})
            n += int(r or 0) if isinstance(r, (int, float)) else 0
    except Exception as exc:  # noqa: BLE001 - Qualitätswert ist nie kritisch
        log(f"Qualitätswert nicht gespeichert: {type(exc).__name__}: {str(exc)[:160]}")
    return n


def apply_prospects(db, rows: list[dict], log=print) -> int:
    """rows: {"id", "result": ok|hinweis|abgelehnt, "hinweis"}."""
    if not rows:
        return 0
    cfg = config()
    n = 0
    try:
        for i in range(0, len(rows), 500):
            r = db.rpc("prospect_quality_apply", {"p_rows": rows[i:i + 500], "p_intervals": intervals(cfg),
                                                  "p_hint_days": int(cfg.get("hinweis_nachpruefung_tage") or 1)})
            n += int(r or 0) if isinstance(r, (int, float)) else 0
    except Exception as exc:  # noqa: BLE001
        log(f"Käufer-Qualitätswert nicht gespeichert: {type(exc).__name__}: {str(exc)[:160]}")
    return n
