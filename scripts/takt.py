"""Takt-Absicherung für Versand und Antworten (Betrieb 05.10.2026).

GitHub ließ in der Nacht 04./05.10.2026 die Zeitpläne von mails-senden (stündlich :37) und antworten (alle 10 min)
stundenlang aus; der Wachhund selbst lief nur alle 1–2 h. Zusätzlich zählte ein fehlgeschlagener Versandlauf
(Datenbank-Zeitüberschreitung beim Auffrischen der Entwürfe) und ein Probelauf als „gelaufen“ – letzte echte Mail
20:59 UTC. Dieses Skript läuft im Nachfüller (alle 10 min + nach jedem Werk-Lauf) und im Wachhund und stößt an:

  - send.yml (gruppe=auto, probelauf=false), wenn der letzte *wirksame* Versandlauf > 70 min her ist, kein Lauf
    läuft oder wartet, der Versand nicht pausiert ist (owner_settings.send_paused) und config/versand.yaml
    `aktiv: true` sagt. Wirksam = läuft/wartet oder erfolgreich und kein Probelauf (fehlgeschlagene und abgebrochene
    Läufe zählen nicht). Tagesmenge, Anteil je Lauf, Notbremse und alle Prüfungen bleiben im Workflow.
  - antworten.yml (probelauf=false), wenn > 25 min kein Lauf begann (immer an: Abmeldungen per Antwort dürfen nie
    liegen bleiben).

Ein Lauf, der in den letzten 5 min begann, gilt immer als frisch (ein eben angestoßener Lauf erscheint mit
Verzögerung in der Liste) – so starten Wachhund und Nachfüller nie zwei Läufe kurz hintereinander.

  python scripts/takt.py            # nur anzeigen
  python scripts/takt.py --apply    # überfällige Läufe anstoßen
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import wachhund  # noqa: E402

SEND_MAX_MIN = 70
ANSWER_MAX_MIN = 25
FRESH_MIN = 5
FREIGABE = ("Dauerfreigabe des Inhabers (03.10.2026: Versand an; 04.10.2026: rund um die Uhr) laut "
            "config/versand.yaml – Takt-Absicherung: geplanter Lauf ausgefallen")

TAKT = [
    {"wf": "send.yml", "max_min": SEND_MAX_MIN, "cond": "versand", "wirksam": True,
     "inputs": {"freigabe": FREIGABE, "probelauf": "false", "gruppe": "auto"}},
    {"wf": "antworten.yml", "max_min": ANSWER_MAX_MIN, "inputs": {"probelauf": "false"}},
]


def _ts(r: dict) -> dt.datetime:
    return dt.datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))


def is_probelauf(jobs: list[dict]) -> bool:
    """Probelauf = Schritt „Probelauf“ lief, „Senden“ nicht (send.yml)."""
    steps = {s.get("name"): s.get("conclusion") for j in jobs for s in (j.get("steps") or [])}
    return steps.get("Probelauf") == "success" and steps.get("Senden") in (None, "skipped")


def last_effective(runs: list[dict], jobs_of=None, wirksam: bool = False) -> dt.datetime | None:
    """Start des letzten zählenden Laufs (runs: neueste zuerst). Ohne `wirksam` zählt jeder Start außer
    fehlgeschlagenen/abgebrochenen; mit `wirksam` zusätzlich kein Probelauf und kein Lauf ohne Senden-Schritt."""
    checked = 0
    for r in runs:
        if r.get("status") in wachhund.ACTIVE_RUN:
            return _ts(r)
        if r.get("conclusion") not in ("success", "neutral", "skipped"):
            continue
        if wirksam and r.get("event") == "workflow_dispatch" and jobs_of is not None and checked < 3:
            checked += 1
            try:
                if is_probelauf(jobs_of(r["id"])):
                    continue
            except Exception as exc:  # noqa: BLE001 - nicht lesbar -> Lauf zählt (lieber kein Doppelstart)
                print(f"   Schritte von Lauf {r.get('id')} nicht lesbar: {type(exc).__name__}")
        return _ts(r)
    return None


def decide(job: dict, runs: list[dict], now: dt.datetime, jobs_of=None) -> tuple[bool, str]:
    if wachhund.is_running(runs):
        return False, "läuft oder wartet"
    if runs and (now - _ts(runs[0])).total_seconds() / 60 < FRESH_MIN:
        return False, "eben gestartet"
    last = last_effective(runs, jobs_of, job.get("wirksam", False))
    if last is None:
        return True, "kein zählender Lauf in der Historie"
    mins = (now - last).total_seconds() / 60
    if mins <= job["max_min"]:
        return False, f"letzter zählender Lauf vor {mins:.0f} min"
    return True, f"letzter zählender Lauf vor {mins:.0f} min (Grenze {job['max_min']})"


def blocked(job: dict, settings: dict | None) -> str | None:
    ok, why = wachhund.allowed(job)
    if not ok:
        return why
    if job["wf"] == "send.yml" and os.environ.get("SENDEN_AKTIV", "").strip().lower() == "nein":
        return "Versand gestoppt (Variable SENDEN_AKTIV = nein)"
    return wachhund.owner_paused(job, settings)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--ref", default="main")
    args = ap.parse_args(argv)
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ.get("GITHUB_TOKEN") or os.environ["GH_TOKEN"]
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    api = f"https://api.github.com/repos/{repo}/actions"
    now = dt.datetime.now(dt.timezone.utc)
    db = wachhund.open_db()
    settings = wachhund.load_settings(db)
    # Versand nur mit lesbaren Einstellungen: ist send_paused nicht prüfbar, startet der Takt den Versand nicht
    # (der Wachhund und der Zeitplan bleiben als Rückfall)
    send_readable = settings is not None
    lines = []

    def jobs_of(run_id) -> list[dict]:
        r = requests.get(f"{api}/runs/{run_id}/jobs", headers=h, timeout=30)
        r.raise_for_status()
        return r.json().get("jobs", [])

    for job in TAKT:
        why = blocked(job, settings)
        if not why and job["wf"] == "send.yml" and not send_readable:
            why = "Einstellungen nicht lesbar – Versand nicht angestoßen"
        if why:
            lines.append(f"-  {job['wf']:<14} {why}")
            continue
        try:
            r = requests.get(f"{api}/workflows/{job['wf']}/runs", params={"per_page": 10, "branch": "main"},
                             headers=h, timeout=30)
            r.raise_for_status()
            runs = r.json().get("workflow_runs", [])
        except Exception as exc:  # noqa: BLE001 - Läufe nicht lesbar -> nichts anstoßen
            lines.append(f"?  {job['wf']:<14} Läufe nicht lesbar ({type(exc).__name__})")
            continue
        late, why = decide(job, runs, now, jobs_of)
        lines.append(f"{'!' if late else '✓'}  {job['wf']:<14} {why}")
        if late and args.apply:
            d = requests.post(f"{api}/workflows/{job['wf']}/dispatches",
                              json={"ref": args.ref, "inputs": job["inputs"]}, headers=h, timeout=30)
            lines.append("   angestoßen" if d.status_code < 300 else f"   Start fehlgeschlagen: GitHub {d.status_code}")
    print("\n".join(lines))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("### Takt Versand/Antworten\n\n```\n" + "\n".join(lines) + "\n```\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
