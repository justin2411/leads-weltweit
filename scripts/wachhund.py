"""Wachhund: startet geplante Läufe nach, die GitHub ausgelassen hat.

GitHub führt geplante Workflows unter Last verspätet oder gar nicht aus (27./28.09.2026: Antwort-Assistent statt
stündlich nur 3-mal am Tag, Morgenbericht, Sync und Käufersuche am 28.09. gar nicht). Dieser Lauf prüft alle
30 Minuten, ob ein Pflichtlauf überfällig ist, und startet ihn per workflow_dispatch (mit GITHUB_TOKEN erlaubt).

Regeln:
  - stündliche Läufe: überfällig, wenn im erlaubten Stundenfenster seit N Minuten kein Lauf gestartet wurde
  - Dauerbetrieb (Lead-/Kunden-Werk): sobald kein Lauf aktiv ist, nächster Lauf (frühestens min_gap nach dem letzten Start)
  - tägliche Läufe: überfällig, wenn die geplante Zeit + Karenz vorbei ist und seit der geplanten Zeit kein Lauf
    gestartet wurde
  - der Versand wird nur nachgestartet, wenn config/versand.yaml aktiv: true sagt (ein Handstart würde den
    Schalter sonst umgehen); die Lead-Suche nur, wenn config/pipeline.yaml lead_suche: true sagt

  python scripts/wachhund.py            # nur anzeigen
  python scripts/wachhund.py --apply    # überfällige Läufe starten
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]

# (Datei, Art, Zeit/Minuten, Karenz in Minuten, Eingaben, Bedingung)
#   hourly: (start_h, end_h) UTC-Fenster, Minuten ohne Lauf bis überfällig
#   daily:  "HH:MM" UTC, Wochentage (0=Mo) oder None
JOBS = [
    {"wf": "antworten.yml", "kind": "hourly", "window": (6, 21), "max_min": 90, "inputs": {"probelauf": "false"}},
    # Proben-Vorrat + Web-Proben rund um die Uhr (03.10.2026: Anfrage 18:30 wartete 5 h, weil GitHub Läufe ausließ)
    {"wf": "proben-vorrat.yml", "kind": "hourly", "window": (0, 23), "max_min": 75, "inputs": {"befehl": "run"}},
    {"wf": "morgenbericht.yml", "kind": "daily", "at": "04:47", "grace": 45},
    {"wf": "kaeufer.yml", "kind": "daily", "at": "05:13", "grace": 60},
    {"wf": "sync.yml", "kind": "daily", "at": "06:17", "grace": 45},
    {"wf": "taeglich.yml", "kind": "daily", "at": "12:17", "grace": 45},
    {"wf": "send.yml", "kind": "daily", "at": "14:23", "grace": 40, "until": "21:00", "cond": "versand",
     "inputs": {"freigabe": "Dauerfreigabe des Inhabers laut config/versand.yaml (Wachhund: geplanter Lauf ausgefallen)",
                "probelauf": "false"}},
    {"wf": "tagescheck.yml", "kind": "daily", "at": "17:37", "grace": 40, "inputs": {"mail": "true"}},
    {"wf": "freigabe-stichprobe.yml", "kind": "daily", "at": "05:07", "grace": 60},
    {"wf": "kundenlieferung.yml", "kind": "daily", "at": "04:53", "grace": 60, "weekdays": [0], "until": "12:00"},
    {"wf": "anreichern.yml", "kind": "daily", "at": "08:41", "grace": 60, "cond": "lead_suche"},
    # Werke (24/7): GitHub ließ am 01.10.2026 die ersten geplanten Kunden-Werk-Läufe aus. Inhaber 01.10.2026: „Er soll
    # schon eher wieder starten damit es immer zuverlässig durchläuft“ -> Dauerbetrieb: ist kein Lauf aktiv, startet
    # der nächste sofort (Wachhund prüft alle 15 min); min_gap verhindert Dauerschleifen bei sofortigem Absturz.
    {"wf": "lead-werk.yml", "kind": "continuous", "min_gap": 20, "cond": "lead_suche"},
    {"wf": "kunden-werk.yml", "kind": "continuous", "min_gap": 20, "cond": "kunden_suche"},
]


# Schalter im Dashboard (Inhaber 03.10.2026): pausierte Werke startet der Wachhund nie nach. antworten.yml bleibt
# immer an (Abmeldungen per Antwort dürfen nie liegen bleiben; pausiert werden dort nur automatische Antworten).
PAUSE_KEY = {"lead-werk.yml": "lead-werk", "kunden-werk.yml": "kunden-werk", "proben-vorrat.yml": "proben-vorrat",
             "kundenlieferung.yml": "kundenlieferung", "tagescheck.yml": "tagescheck"}


def owner_paused(job: dict, settings: dict | None) -> str | None:
    """Grund, wenn der Inhaber dieses Werk im Dashboard pausiert hat, sonst None."""
    if not settings:
        return None
    if job["wf"] == "send.yml" and settings.get("send_paused"):
        return "Versand im Dashboard pausiert"
    key = PAUSE_KEY.get(job["wf"])
    since = (settings.get("werke_paused") or {}).get(key) if key and isinstance(settings.get("werke_paused"), dict) else None
    return f"pausiert durch Inhaber (seit {since})" if since else None


def load_settings() -> dict | None:
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        return None
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.db import DB
        from lib.owner_settings import load
        return load(DB())
    except Exception as exc:  # noqa: BLE001 - ohne Einstellungen gelten nur die Datei-Schalter
        print(f"Einstellungen nicht lesbar: {type(exc).__name__}")
        return None


def cfg(name: str, key: str) -> str | None:
    try:
        m = re.search(rf"^{key}:\s*(\S+)", (ROOT / "config" / name).read_text(), re.M)
        return m.group(1) if m else None
    except OSError:
        return None


def allowed(job: dict) -> tuple[bool, str]:
    if job.get("cond") == "versand" and cfg("versand.yaml", "aktiv") != "true":
        return False, "Versand ausgeschaltet (config/versand.yaml)"
    if job.get("cond") == "lead_suche" and cfg("pipeline.yaml", "lead_suche") != "true":
        return False, "Lead-Suche pausiert (config/pipeline.yaml)"
    if job.get("cond") == "kunden_suche" and cfg("pipeline.yaml", "kunden_suche") != "true":
        return False, "Käufersuche pausiert (config/pipeline.yaml)"
    return True, ""


def at_today(now: dt.datetime, hhmm: str) -> dt.datetime:
    h, m = map(int, hhmm.split(":"))
    return now.replace(hour=h, minute=m, second=0, microsecond=0)


def overdue(job: dict, runs: list[dict], now: dt.datetime) -> tuple[bool, str]:
    """runs: neueste zuerst, jeweils mit created_at (ISO) und status."""
    starts = [dt.datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) for r in runs]
    if any(r["status"] in ("queued", "in_progress", "waiting", "requested", "pending") for r in runs[:3]):
        return False, "läuft gerade"
    if job["kind"] == "continuous":
        last = starts[0] if starts else None
        if last and (now - last).total_seconds() / 60 < job["min_gap"]:
            return False, f"zuletzt vor {(now - last).total_seconds() / 60:.0f} min gestartet"
        return True, "kein Lauf aktiv (Dauerbetrieb)"
    if job["kind"] == "hourly":
        a, b = job["window"]
        if not (a <= now.hour <= b):
            return False, "außerhalb des Zeitfensters"
        last = starts[0] if starts else None
        if last and (now - last).total_seconds() / 60 < job["max_min"]:
            return False, f"zuletzt vor {(now - last).total_seconds() / 60:.0f} min"
        return True, "kein Lauf in " + (f"{(now - last).total_seconds() / 60:.0f} min" if last else "der Historie")
    if job.get("weekdays") is not None and now.weekday() not in job["weekdays"]:
        return False, "heute nicht geplant"
    due = at_today(now, job["at"])
    if now < due + dt.timedelta(minutes=job["grace"]):
        return False, "noch nicht fällig"
    if job.get("until") and now > at_today(now, job["until"]):
        return False, "Nachholfenster vorbei"
    if any(s >= due - dt.timedelta(minutes=15) for s in starts):
        return False, "heute gelaufen"
    return True, f"geplant {job['at']} UTC, heute kein Lauf"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    repo, token = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"]
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    now = dt.datetime.now(dt.timezone.utc)
    started = []
    settings = load_settings()
    for job in JOBS:
        ok, why = allowed(job)
        if ok and owner_paused(job, settings):
            ok, why = False, owner_paused(job, settings)
        if not ok:
            print(f"-  {job['wf']:<22} {why}")
            continue
        r = requests.get(f"https://api.github.com/repos/{repo}/actions/workflows/{job['wf']}/runs",
                         params={"per_page": 10, "branch": "main"}, headers=h, timeout=30)
        r.raise_for_status()
        runs = r.json().get("workflow_runs", [])
        late, why = overdue(job, runs, now)
        print(f"{'!' if late else '✓'}  {job['wf']:<22} {why}")
        if late and args.apply:
            d = requests.post(f"https://api.github.com/repos/{repo}/actions/workflows/{job['wf']}/dispatches",
                              json={"ref": "main", "inputs": job.get("inputs", {})}, headers=h, timeout=30)
            if d.status_code >= 300:
                print(f"   Start fehlgeschlagen: {d.status_code} {d.text[:200]}")
            else:
                started.append(job["wf"])
                print("   nachgestartet")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text("### Wachhund\n\n" + ("Nachgestartet: " + ", ".join(started) if started
                                                      else "Alle Läufe im Plan.") + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
