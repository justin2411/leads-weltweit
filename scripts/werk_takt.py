"""Werk-Takt: hält den Nachfüller am Laufen, auch wenn GitHub die Zeitpläne nachts auslässt (05.10.2026).

Befund Nacht 04./05.10.: werk-nachfuellen (Cron alle 10 min) und der Wachhund liefen nachts fast nur, wenn ein
fertiges Werk sie per Dispatch anstieß. Laufen alle Werke lange (Lead-Werk bis ~75 min), stößt keiner nach ->
nur 15–17 belegte Jobs statt ≥ 30.

Lösung (kostenlos, gleiche Methode wie „Werke stoßen den Wachhund an“: GITHUB_TOKEN-Dispatch, der
workflow_dispatch-Workflows auslöst): werk-takt.yml läuft als EIN Lauf (concurrency werk-takt) knapp eine Stunde und
prüft alle PAUSE_MIN Minuten:
  - Belegung < MIN_BELEGT und kein Nachfüller aktiv -> werk-nachfuellen.yml anstoßen (der füllt nach seinen Grenzen)
  - Wachhund länger als WACHHUND_MIN nicht gelaufen -> wachhund.yml anstoßen
Am Ende höchstens EIN Selbst-Dispatch (nur wenn kein weiterer Takt-Lauf wartet und lead_suche/kunden_suche an sind).
Belegung ≥ MIN_BELEGT -> nichts starten. Startet nie den Versand, ändert keine Grenzen, lädt keine Daten hoch.

  python scripts/werk_takt.py --apply [--runden 5 --pause-min 10]
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import werk_belegung as B  # noqa: E402
import werk_plan as W  # noqa: E402

TAKT_WF = "werk-takt.yml"
WACHHUND_WF = "wachhund.yml"
WACHHUND_MIN = 30


def switches_on(text: str) -> bool:
    """lead_suche oder kunden_suche an (config/pipeline.yaml)? Beide aus = Takt ruht und startet sich nicht neu."""
    return any(re.search(rf"^{k}:\s*true", text, re.M) for k in ("lead_suche", "kunden_suche"))


def round_actions(busy: int, nachfueller_aktiv: bool, wachhund_min: float | None,
                  min_belegt: int = W.MIN_BELEGT) -> list[str]:
    """Was in einer Runde angestoßen wird (reine Logik)."""
    out = []
    if busy < min_belegt and not nachfueller_aktiv:
        out.append(B.NACHFUELLER_WF)
    if wachhund_min is None or wachhund_min >= WACHHUND_MIN:
        out.append(WACHHUND_WF)
    return out


def should_redispatch(apply: bool, on: bool, other_takt_waiting: bool) -> bool:
    """Höchstens ein Selbst-Dispatch je Lauf: nur scharf, Schalter an und kein weiterer Takt-Lauf wartet."""
    return apply and on and not other_takt_waiting


def _minutes_since(ts: str | None, now: dt.datetime) -> float | None:
    if not ts:
        return None
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (now - t).total_seconds() / 60


def one_round(gh: B.GitHub, apply: bool, ref: str) -> list[str]:
    now = dt.datetime.now(dt.timezone.utc)
    runs = gh.active_runs()
    gh._jobs.clear()  # jede Runde frische Job-Stände
    busy = B.busy_jobs(runs, gh.jobs)
    nf = any(str(r.get("path", "")).endswith(B.NACHFUELLER_WF) for r in runs)
    wh = gh._get(f"actions/workflows/{WACHHUND_WF}/runs", {"per_page": 1}).get("workflow_runs", [])
    acts = round_actions(busy, nf, _minutes_since(wh[0]["created_at"] if wh else None, now))
    print(f"{now:%H:%M} UTC belegt {busy}, Nachfüller aktiv {nf} -> {', '.join(acts) or 'nichts'}")
    for wf in acts if apply else []:
        try:
            gh.dispatch(wf, {}, ref=ref)
        except Exception as e:  # noqa: BLE001
            print(f"  {wf} nicht anstoßbar: {e}")
    return acts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--runden", type=int, default=5)
    ap.add_argument("--pause-min", type=float, default=10)
    ap.add_argument("--ref", default="main")
    a = ap.parse_args(argv)
    on = switches_on((ROOT / "config/pipeline.yaml").read_text(encoding="utf-8"))
    gh = B.GitHub()
    for i in range(max(1, a.runden)):
        if not on:
            print("lead_suche und kunden_suche aus – Takt ruht")
            break
        try:
            one_round(gh, a.apply, a.ref)
        except Exception as e:  # noqa: BLE001  (eine gestörte Runde stoppt den Takt nie)
            print(f"Runde {i + 1} fehlgeschlagen: {e}")
        if i < a.runden - 1:
            time.sleep(a.pause_min * 60)
    try:
        waiting = [r for r in gh.active_runs(TAKT_WF) if r.get("status") != "in_progress"]
    except Exception:  # noqa: BLE001
        waiting = []
    if should_redispatch(a.apply, on, bool(waiting)):
        try:
            gh.dispatch(TAKT_WF, {}, ref=a.ref)
            print("nächster Takt-Lauf angestoßen")
        except Exception as e:  # noqa: BLE001
            print(f"Takt nicht neu anstoßbar: {e} – Zeitplan/Nachfüller übernehmen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
