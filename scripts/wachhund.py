"""Wachhund: startet geplante Läufe nach, die GitHub ausgelassen hat.

GitHub führt geplante Workflows unter Last verspätet oder gar nicht aus (27./28.09.2026: Antwort-Assistent statt
stündlich nur 3-mal am Tag, Morgenbericht, Sync und Käufersuche am 28.09. gar nicht). Dieser Lauf prüft alle
30 Minuten, ob ein Pflichtlauf überfällig ist, und startet ihn per workflow_dispatch (mit GITHUB_TOKEN erlaubt).

Regeln:
  - stündliche Läufe: überfällig, wenn im erlaubten Stundenfenster seit N Minuten kein Lauf gestartet wurde
  - Dauerbetrieb (Lead-/Kunden-Werk): sobald kein Lauf aktiv ist, nächster Lauf (frühestens min_gap nach dem letzten Start)
  - tägliche Läufe: überfällig, wenn die geplante Zeit + Karenz vorbei ist und seit der geplanten Zeit kein Lauf
    gestartet wurde
  - Direktstart (Inhaber 03.10.2026): offene Startwünsche aus dem Dashboard (signalwerk.start_requests) werden vor
    den Plan-Prüfungen gestartet – nur erlaubte Abläufe (START_WF, nie der Versand), nie bei Pause durch den Inhaber,
    Wünsche älter als 2 h werden verworfen
  - der Versand wird nur nachgestartet, wenn config/versand.yaml aktiv: true sagt (ein Handstart würde den
    Schalter sonst umgehen); die Lead-Suche nur, wenn config/pipeline.yaml lead_suche: true sagt – das gilt auch für
    Startwünsche; läuft ein Ablauf schon, startet ein Wunsch keinen zweiten Lauf
  - Sicherheitsnetz Baukasten: Leads, die nur an einer gelösten/geänderten Inhaber-Regel hängen, gehen zurück an die
    Freigabe (flow_release_stale_held)

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
sys.path.insert(0, str(ROOT / "scripts"))
from lib import versandzeit  # noqa: E402

# (Datei, Art, Zeit/Minuten, Karenz in Minuten, Eingaben, Bedingung)
#   hourly: (start_h, end_h) UTC-Fenster, Minuten ohne Lauf bis überfällig
#   daily:  "HH:MM" UTC (oder in "tz", z. B. Europe/Berlin), Wochentage (0=Mo) oder None
JOBS = [
    # Antworten rund um die Uhr alle 10 min (Nachtschicht 04.10.2026: US-Antworten kommen in unserer Nacht);
    # nach 20 statt 45 min nachstarten (Prüfung 04.10.2026: GitHub ließ geplante Läufe stundenlang aus)
    {"wf": "antworten.yml", "kind": "hourly", "window": (0, 23), "max_min": 20, "inputs": {"probelauf": "false"}},
    # Proben-Vorrat + Web-Proben rund um die Uhr (03.10.2026: Anfrage 18:30 wartete 5 h, weil GitHub Läufe ausließ)
    {"wf": "proben-vorrat.yml", "kind": "hourly", "window": (0, 23), "max_min": 75, "inputs": {"befehl": "run"}},
    # Agenten-Werk (04.10.2026): Master-Pipeline füllt Speicher, eigene Agenten laufen nach Auslöser
    {"wf": "agenten-werk.yml", "kind": "hourly", "window": (0, 23), "max_min": 90, "inputs": {"probelauf": "false"}},
    # Dauerprüfung (04.10.2026): Prüf-Agenten ohne Tokens, stündlich :47 – nachstarten nach 2 h ohne Lauf
    {"wf": "dauerpruefung.yml", "kind": "hourly", "window": (0, 23), "max_min": 120, "inputs": {"probelauf": "false"}},
    {"wf": "morgenbericht.yml", "kind": "daily", "at": "04:47", "grace": 45},
    {"wf": "kaeufer.yml", "kind": "daily", "at": "05:13", "grace": 60},
    {"wf": "sync.yml", "kind": "daily", "at": "06:17", "grace": 45},
    {"wf": "taeglich.yml", "kind": "daily", "at": "12:17", "grace": 45},
    # Versand rund um die Uhr (Inhaber 04.10.2026): stündlich (Plan app/lib/versandzeit.json), nachstarten, wenn
    # 80 min kein Lauf begann; send_paused und config/versand.yaml aktiv: false starten nie nach
    *versandzeit.wachhund_jobs(inputs={
        "freigabe": "Dauerfreigabe des Inhabers laut config/versand.yaml (Wachhund: geplanter Lauf ausgefallen)",
        "probelauf": "false"}),
    {"wf": "tagescheck.yml", "kind": "daily", "at": "17:37", "grace": 40, "inputs": {"mail": "true"}},
    {"wf": "freigabe-stichprobe.yml", "kind": "daily", "at": "05:07", "grace": 60},
    # Website-Check der eigenen Seite (Inhaber 04.10.2026, /dashboard/website)
    {"wf": "website-check.yml", "kind": "daily", "at": "04:23", "grace": 90},
    {"wf": "kundenlieferung.yml", "kind": "daily", "at": "04:53", "grace": 60, "weekdays": [0], "until": "12:00"},
    {"wf": "anreichern.yml", "kind": "daily", "at": "08:41", "grace": 60, "cond": "lead_suche"},
    # Werke (24/7): GitHub ließ am 01.10.2026 die ersten geplanten Kunden-Werk-Läufe aus. Inhaber 01.10.2026: „Er soll
    # schon eher wieder starten damit es immer zuverlässig durchläuft“ -> Dauerbetrieb: ist kein Lauf aktiv, startet
    # der nächste sofort (Wachhund prüft alle 15 min); min_gap verhindert Dauerschleifen bei sofortigem Absturz.
    {"wf": "lead-werk.yml", "kind": "continuous", "min_gap": 20, "cond": "lead_suche"},
    {"wf": "kunden-werk.yml", "kind": "continuous", "min_gap": 20, "cond": "kunden_suche"},
    # Prüfer-Werk (Inhaber 05.10.2026: „4 dauerhafte Prüfer der Leads“): rund um die Uhr, ohne Datei-Schalter
    {"wf": "pruefer-werk.yml", "kind": "continuous", "min_gap": 20},
    # Nachfüller (Inhaber 05.10.2026: „mind. 30 gleichzeitig“): startet freie Lead-Linien sofort neu; GitHub lässt
    # seinen 10-min-Zeitplan unter Last aus -> nach 15 min ohne Lauf nachstarten. Pause/Schalter prüft er selbst.
    {"wf": "werk-nachfuellen.yml", "kind": "hourly", "window": (0, 23), "max_min": 15, "cond": "lead_suche"},
    # Kontakt-Werk (Inhaber 05.10.2026): Register + Website gegenprüfen, rund um die Uhr
    {"wf": "kontakt-werk.yml", "kind": "continuous", "min_gap": 20},
]


# Schalter im Dashboard (Inhaber 03.10.2026): pausierte Werke startet der Wachhund nie nach. antworten.yml bleibt
# immer an (Abmeldungen per Antwort dürfen nie liegen bleiben; pausiert werden dort nur automatische Antworten).
PAUSE_KEY = {"lead-werk.yml": "lead-werk", "kunden-werk.yml": "kunden-werk", "proben-vorrat.yml": "proben-vorrat",
             "kundenlieferung.yml": "kundenlieferung", "tagescheck.yml": "tagescheck", "agenten-werk.yml": "agenten",
             "dauerpruefung.yml": "dauerpruefung", "pruefer-werk.yml": "pruefer-werk",
             "werk-nachfuellen.yml": "lead-werk", "kontakt-werk.yml": "kontakt-werk"}


# Direktstart aus dem Dashboard (gleiche Liste wie app/lib/start-queue.ts START_WORKFLOWS und die DB-Prüfung in
# supabase/migrations/20261004030100_signalwerk_start_requests.sql). Der Versand ist NIE startbar.
START_WF = {
    "lead-werk": {"wf": "lead-werk.yml", "inputs": {}},
    "kunden-werk": {"wf": "kunden-werk.yml", "inputs": {}},
    "proben-vorrat": {"wf": "proben-vorrat.yml", "inputs": {"befehl": "run", "probelauf": "false"}},
    "freigabe-stichprobe": {"wf": "freigabe-stichprobe.yml", "inputs": {}},
}
START_MAX_AGE_MIN = 120


def owner_paused(job: dict, settings: dict | None) -> str | None:
    """Grund, wenn der Inhaber dieses Werk im Dashboard pausiert hat, sonst None."""
    if not settings:
        return None
    if job["wf"] == "send.yml" and settings.get("send_paused"):
        return "Versand im Dashboard pausiert"
    key = PAUSE_KEY.get(job["wf"])
    since = (settings.get("werke_paused") or {}).get(key) if key and isinstance(settings.get("werke_paused"), dict) else None
    return f"pausiert durch Inhaber (seit {since})" if since else None


def open_db():
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        return None
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.db import DB
        return DB()
    except Exception as exc:  # noqa: BLE001
        print(f"Datenbank nicht erreichbar: {type(exc).__name__}")
        return None


def load_settings(db=None) -> dict | None:
    db = db or open_db()
    if db is None:
        return None
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib.owner_settings import load
        return load(db)
    except Exception as exc:  # noqa: BLE001 - ohne Einstellungen gelten nur die Datei-Schalter
        print(f"Einstellungen nicht lesbar: {type(exc).__name__}")
        return None


def plan_starts(rows: list[dict], settings: dict | None, now: dt.datetime) -> list[tuple[dict, str, str]]:
    """Offene Startwünsche -> [(Zeile, 'starten'|'verworfen', Grund)]. Je Ablauf nur der neueste; ältere doppelte,
    unbekannte, zu alte (> 2 h) und vom Inhaber pausierte Abläufe werden verworfen."""
    out, seen = [], set()
    for r in sorted(rows, key=lambda x: x.get("created_at") or "", reverse=True):
        wf = r.get("workflow")
        if wf not in START_WF:
            out.append((r, "verworfen", "Ablauf nicht erlaubt"))
            continue
        if wf in seen:
            out.append((r, "verworfen", "doppelt (neuerer Wunsch)"))
            continue
        seen.add(wf)
        try:
            age = (now - dt.datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00"))).total_seconds() / 60
        except (KeyError, ValueError):
            age = START_MAX_AGE_MIN + 1
        if age > START_MAX_AGE_MIN:
            out.append((r, "verworfen", f"älter als {START_MAX_AGE_MIN // 60} h"))
            continue
        job = next((j for j in JOBS if j["wf"] == START_WF[wf]["wf"]), {"wf": START_WF[wf]["wf"]})
        ok, why = allowed(job)  # Datei-Schalter (config/pipeline.yaml) gelten auch für Startwünsche
        if not ok:
            out.append((r, "verworfen", why))
            continue
        why = owner_paused({"wf": START_WF[wf]["wf"]}, settings)
        if why:
            out.append((r, "verworfen", why))
            continue
        out.append((r, "starten", "Wunsch aus dem Dashboard"))
    return out


def strict_settings(db, settings: dict | None) -> dict | None:
    """Pausen frisch und OHNE Rückfall lesen (owner_settings.load fällt bei Fehlern auf Standardwerte zurück):
    None = nicht lesbar -> kein Direktstart."""
    try:
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.werke_paused"}) or []
    except Exception as exc:  # noqa: BLE001
        print(f"Einstellungen nicht lesbar ({type(exc).__name__}) – Startwünsche bleiben offen")
        return None
    paused = next((r.get("value") for r in rows if r.get("key") == "werke_paused"), None)
    return {**(settings or {}), "werke_paused": paused if isinstance(paused, dict) else {}}


def handle_starts(db, settings: dict | None, dispatch, now: dt.datetime, apply: bool, running=None) -> list[str]:
    """Startwünsche abarbeiten. dispatch(wf_datei, inputs) -> (ok, Text); running(wf_datei) -> bool (läuft/wartet
    schon ein Lauf? dann kein zweiter). Gibt die gestarteten Dateien zurück. Sind die Pausen nicht lesbar, bleibt
    alles offen. Fehler hier dürfen die normalen Prüfungen nie verhindern (Aufrufer fängt ab)."""
    settings = strict_settings(db, settings)
    if settings is None:
        return []
    rows = db.select("start_requests", {"select": "id,workflow,created_at,status", "status": "eq.offen",
                                        "order": "created_at.desc", "limit": "50"}) or []
    started = []
    for r, what, why in plan_starts(rows, settings, now):
        wf = START_WF.get(r.get("workflow"), {}).get("wf", str(r.get("workflow")))
        print(f"{'▶' if what == 'starten' else '-'}  Start {wf:<16} {why}")
        if not apply:
            continue
        if what == "verworfen":
            db.update("start_requests", {"id": r["id"], "status": "offen"}, {"status": "verworfen", "note": why[:300]})
            continue
        if running is not None and running(wf):
            db.update("start_requests", {"id": r["id"], "status": "offen"},
                      {"status": "gestartet", "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                       "note": "läuft bereits"})
            print("   läuft bereits – kein zweiter Lauf")
            continue
        ok, text = dispatch(wf, START_WF[r["workflow"]]["inputs"])
        stamp = dt.datetime.now(dt.timezone.utc).isoformat()
        if ok:
            started.append(wf)
            db.update("start_requests", {"id": r["id"], "status": "offen"},
                      {"status": "gestartet", "started_at": stamp, "note": "Wachhund"})
            print("   gestartet")
        else:
            db.update("start_requests", {"id": r["id"], "status": "offen"}, {"status": "fehler", "note": text[:300]})
            print(f"   Start fehlgeschlagen: {text[:200]}")
    return started


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


ACTIVE_RUN = ("queued", "in_progress", "waiting", "requested", "pending")


def is_running(runs: list[dict]) -> bool:
    """Läuft oder wartet einer der letzten 3 Läufe (neueste zuerst)?"""
    return any(r.get("status") in ACTIVE_RUN for r in runs[:3])


def release_stale_held(db) -> int:
    """Sicherheitsnetz Stufe 4 (Baukasten-Regeln): Leads, die nur an einer inzwischen gelösten/geänderten Regel
    hängen, zurück an die normale Freigabe (signalwerk.flow_release_stale_held). Fehler nur melden."""
    try:
        n = int(db.rpc("flow_release_stale_held", {}) or 0)
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten
        print(f"Regel-Rücknahme nicht möglich: {type(exc).__name__}: {str(exc)[:160]}")
        return 0
    if n:
        print(f"↺  {n} Leads von gelösten/geänderten Inhaber-Regeln zurück an die Freigabe")
    return n


def refresh_dashboard_stock(db) -> None:
    """Bestandszahlen fürs Dashboard vorrechnen (signalwerk.dashboard_cache), damit JARVIS nie „…“ zeigt."""
    try:
        db.rpc("dashboard_stock_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten
        print(f"Dashboard-Bestand nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")
    try:  # Speicher-Ansicht (dashboard_storage braucht > 20 s – vorrechnen, damit die Seite sofort lädt)
        db.rpc("dashboard_storage_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten
        print(f"Speicher-Zahlen nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")
    try:  # JARVIS-Zentrale: langsamer Teil (Läufe, Ziele, Lernschleife, Speicher …) als dashboard_cache 'zentrale'
        db.rpc("zentrale_cache_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten (Migration evtl. noch nicht angewendet)
        print(f"Zentrale-Zahlen nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")
    try:  # Website-Kennzahlen für die JARVIS-Linie „Website“ (Tagessummen + letzte Stunde/24 h/30 Tage)
        db.rpc("website_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten (Migration evtl. noch nicht angewendet)
        print(f"Website-Kennzahlen nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")
    try:  # Website-Trichter Startseite → Landingpage → Tarif → Stripe → Danke (24 h / 7 / 30 Tage, dashboard_cache)
        db.rpc("web_funnel_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten
        print(f"Website-Trichter nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")
    try:  # Website-Analyse wie GA4 (Kacheln, Kanäle, Web Vitals, A/B) für Dashboard und JARVIS
        db.rpc("web_analytics_refresh", {})
    except Exception as exc:  # noqa: BLE001 - darf den Wachhund nie aufhalten
        print(f"Website-Analyse nicht aufgefrischt: {type(exc).__name__}: {str(exc)[:160]}")


def overdue(job: dict, runs: list[dict], now: dt.datetime) -> tuple[bool, str]:
    """runs: neueste zuerst, jeweils mit created_at (ISO) und status."""
    starts = [dt.datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) for r in runs]
    if is_running(runs):
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
    if job.get("tz"):  # Zeiten in Ortszeit (Versand: deutsche Zeit, Sommer-/Winterzeit automatisch)
        from zoneinfo import ZoneInfo
        now = now.astimezone(ZoneInfo(job["tz"]))
    if job.get("weekdays") is not None and now.weekday() not in job["weekdays"]:
        return False, "heute nicht geplant"
    due = at_today(now, job["at"])
    if now < due + dt.timedelta(minutes=job["grace"]):
        return False, "noch nicht fällig"
    if job.get("until") and now > at_today(now, job["until"]):
        return False, "Nachholfenster vorbei"
    if any(s >= due - dt.timedelta(minutes=15) for s in starts):
        return False, "heute gelaufen"
    return True, f"geplant {job['at']} {'deutscher Zeit' if job.get('tz') else 'UTC'}, heute kein Lauf"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    repo, token = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"]
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    now = dt.datetime.now(dt.timezone.utc)
    started = []
    db = open_db()
    settings = load_settings(db)

    def dispatch(wf: str, inputs: dict) -> tuple[bool, str]:
        d = requests.post(f"https://api.github.com/repos/{repo}/actions/workflows/{wf}/dispatches",
                          json={"ref": "main", "inputs": inputs}, headers=h, timeout=30)
        return d.status_code < 300, f"GitHub {d.status_code} {d.text[:200]}"

    def runs_of(wf: str) -> list[dict]:
        r = requests.get(f"https://api.github.com/repos/{repo}/actions/workflows/{wf}/runs",
                         params={"per_page": 10, "branch": "main"}, headers=h, timeout=30)
        r.raise_for_status()
        return r.json().get("workflow_runs", [])

    def running(wf: str) -> bool:
        try:
            return is_running(runs_of(wf))
        except Exception as exc:  # noqa: BLE001 - lieber ein Lauf zu viel in der Warteschlange als ein ausgelassener
            print(f"   Läufe von {wf} nicht lesbar: {type(exc).__name__}")
            return False

    if db is not None:
        try:
            started += handle_starts(db, settings, dispatch, now, args.apply, running)
        except Exception as exc:  # noqa: BLE001 - Startwünsche dürfen den Wachhund nie aufhalten
            print(f"Startwünsche nicht lesbar: {type(exc).__name__}: {str(exc)[:200]}")
        if args.apply:
            release_stale_held(db)
            refresh_dashboard_stock(db)
    for job in JOBS:
        if job["wf"] in started:
            print(f"✓  {job['wf']:<22} eben auf Wunsch gestartet")
            continue
        ok, why = allowed(job)
        if ok and owner_paused(job, settings):
            ok, why = False, owner_paused(job, settings)
        if not ok:
            print(f"-  {job['wf']:<22} {why}")
            continue
        runs = runs_of(job["wf"])
        late, why = overdue(job, runs, now)
        print(f"{'!' if late else '✓'}  {job['wf']:<22} {why}")
        if late and args.apply:
            ok, text = dispatch(job["wf"], job.get("inputs", {}))
            if not ok:
                print(f"   Start fehlgeschlagen: {text}")
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
