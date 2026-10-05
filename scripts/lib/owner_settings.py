"""Einstellungen, die der Inhaber im Dashboard setzt (Inhaber 03.10.2026: „selbst steuern … wo ich direkt auch
einfluss auf das ganze nehmen kann“). Gespeichert in signalwerk.owner_settings (Schlüssel/Wert, Protokoll in
owner_log); die Konfigurationsdateien bleiben Rückfall, wenn nichts gesetzt ist oder die Tabelle fehlt.

Harte Grenzen werden hier NIE aufgeweicht:
- Mails je Land: höchstens das daily_limit aus countries.yaml; Postfach-Kapazität, Notbremse, Sperrliste,
  Frischeprüfung und nur_fokus bleiben im Versand unverändert. Länder lassen sich nur ABschalten, nie freischalten.
- Proben-Soll je Seite 0–100, Verfall 24–96 h; Nachfass 3–10 Tage.
"""
from __future__ import annotations

MAX_SAMPLE_TARGET = 100
MAX_AGE_RANGE = (24, 96)
FOLLOWUP_DAYS_RANGE = (3, 10)

DEFAULTS = {
    "send_paused": False,
    "send_countries_off": [],
    "send_country_limits": {},
    "followup_enabled": True,
    "followup_days": None,
    "sample_targets": {},
    # Premium-Proben je Seite ({"S2/US": 10}, Inhaber 05.10.2026): davon Proben mit 10/10 Premium-Leads
    "sample_premium_targets": {},
    "sample_max_age_hours": None,
    "buyer_countries_off": [],
    # Werke an/aus per Klick (Inhaber 03.10.2026: „alles direkt per click an und ausschalten können jedes werk“):
    # {"lead-werk": "2026-10-03T18:00:00Z", …} = pausiert seit. Versand = send_paused, Nachfass = followup_enabled.
    "werke_paused": {},
    # Belegungsplan (Inhaber 03.10.2026): Plätze je Linie, gelesen von scripts/werk_plan.py; {} = Standard
    "slot_plan": {},
    # Autopilot der Plätze (Inhaber 03.10.2026: „Ja, Autopilot an“): verteilt bei jedem Start nach Ertrag um,
    # innerhalb aller Grenzen; locks = Linien, die der Inhaber festsetzt ({"web-us": 4}). Gelesen von werk_plan.py
    "slot_autopilot": {"on": True, "locks": {}},
    # Website Auto-Fix (Inhaber 04.10.2026: „jarvis soll das aber eigentlich alles selber machen und entscheiden“):
    # an = scripts/website_agents.py autofix legt für neue Website-Funde selbst Aufträge an
    "website_autofix": True,
    # Website-Funde ausblenden: {fund_key: bis (ISO)}, 30 Tage, nichts gelöscht (app/lib/website.ts)
    "website_ignored": {},
}

# Schaltbare Werke (Schlüssel wie im Dashboard). Sicherheitsfunktionen sind NIE schaltbar: Abmelde-Link, Resend-Webhook
# (Bounce/Beschwerde-Sperre), Sperrliste, Notbremse und die Abmelde-Erkennung im Antwort-Assistenten.
WERKE = ("lead-werk", "kunden-werk", "proben-vorrat", "antworten", "kundenlieferung", "tagescheck", "agenten",
         "dauerpruefung")


class Settings(dict):
    """Einstellungen wie dict, dazu `loaded_at` = Lesezeitpunkt (für die Quittung: angewandt ist, was gelesen wurde)."""
    loaded_at: str | None = None


def _now() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load(db) -> dict:
    """Alle Schlüssel mit Standardwerten; Fehler beim Lesen (Tabelle fehlt, Netz) -> Standardwerte."""
    out = Settings(DEFAULTS)
    out.loaded_at = _now()  # vor dem Lesen: eine Speicherung während des Lesens gilt als nicht gesehen
    try:
        rows = db.select("owner_settings", {"select": "key,value"}) or []
    except Exception:  # noqa: BLE001 – Einstellungen dürfen Versand, Vorrat und Werke nie verhindern
        return out
    for r in rows:
        if r.get("key") in DEFAULTS and r.get("value") is not None:
            out[r["key"]] = r["value"]
    return out


# (Werk, Schlüssel), die dieser Prozess schon quittiert hat – höchstens eine Quittung je Lauf
_ACKED: set[tuple[str, str]] = set()


def ack(db, werk: str, keys, settings: dict | None = None, seen_at: str | None = None) -> int:
    """„Angewandt“-Quittung (Inhaber 03.10.2026: „dass die änderungen auch übernommen werden“): schreibt je Schlüssel
    eine Zeile in signalwerk.settings_ack (Werk, Schlüssel, Zeitpunkt, gelesener Wert, GITHUB_RUN_ID). Das Dashboard
    zeigt damit „angewandt ✓ HH:MM“. Höchstens einmal je Prozess und (Werk, Schlüssel); wirft NIE – eine fehlende
    Quittung darf kein Werk anhalten. seen_at = Lesezeitpunkt der Einstellungen (Standard: `settings.loaded_at` aus
    load(), sonst jetzt) – nie die Schreibzeit, sonst gälte eine Speicherung zwischen Lesen und Quittung als
    angewandt. Rückgabe: Anzahl geschriebener Zeilen (0 bei Fehler)."""
    try:
        import os
        todo = [k for k in ([keys] if isinstance(keys, str) else list(keys or ())) if (werk, k) not in _ACKED]
        if not todo:
            return 0
        _ACKED.update((werk, k) for k in todo)  # vor dem Schreiben: ein Fehler wird nicht wiederholt
        s = settings if settings is not None else load(db)
        now = seen_at or getattr(s, "loaded_at", None) or _now()
        run_id = os.environ.get("GITHUB_RUN_ID") or None
        rows = [{"werk": werk, "key": k, "seen_at": now, "value": s.get(k, DEFAULTS.get(k)), "run_id": run_id}
                for k in todo]
        db.insert("settings_ack", rows, upsert_on="werk,key")
        return len(rows)
    except BaseException:  # noqa: BLE001 – auch SystemExit aus der Datenbank-Schicht: Quittung ist nie kritisch
        return 0


def paused(db, werk: str, settings: dict | None = None) -> str | None:
    """Zeitpunkt, seit dem der Inhaber dieses Werk pausiert hat, sonst None. Lesefehler = nicht pausiert (die
    Datei-Schalter config/*.yaml bleiben unabhängig davon wirksam). Quittiert „werke_paused“ für dieses Werk."""
    s = settings if settings is not None else load(db)
    ack(db, werk, ["werke_paused"], s)
    v = (s.get("werke_paused") or {}).get(werk) if isinstance(s.get("werke_paused"), dict) else None
    return str(v) if v else None


def stop_if_paused(db, werk: str, log=print) -> bool:
    """True = pausiert (Aufrufer beendet sich sauber, Exit 0). Schreibt den Grund auch in die Actions-Zusammenfassung."""
    import os
    since = paused(db, werk)
    if not since:
        return False
    msg = f"{werk}: pausiert durch Inhaber (seit {since}) – nichts zu tun"
    log(msg)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except OSError:
            pass
    return True


def _int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _clamp(v, lo: int, hi: int, default):
    i = _int(v)
    return default if i is None else max(lo, min(i, hi))


def sample_target(default: int, overrides: dict, segment: str, country: str) -> int:
    """Soll-Bestand einer Seite: Wert aus dem Dashboard (0–100), sonst config/proben.yaml."""
    return _clamp((overrides or {}).get(f"{segment}/{country}"), 0, MAX_SAMPLE_TARGET, default)


def premium_target(default: int, overrides: dict, segment: str, country: str) -> int:
    """Premium-Soll einer Seite (Proben mit 10/10 Premium-Leads): Wert aus dem Dashboard (0–100), sonst
    config/proben.yaml (premium_<land>, sonst premium_andere)."""
    return _clamp((overrides or {}).get(f"{segment}/{country}"), 0, MAX_SAMPLE_TARGET, default)


def max_age_hours(default: int, value) -> int:
    """Verfall des Proben-Vorrats: 24–96 h aus dem Dashboard, sonst config/proben.yaml."""
    return _clamp(value, *MAX_AGE_RANGE, default)


def followup_days(default: int, value) -> int:
    return _clamp(value, *FOLLOWUP_DAYS_RANGE, default)


def country_limit(yaml_limit: int, overrides: dict, country: str, off: list | None = None) -> int:
    """Tageslimit eines Landes: 0, wenn im Dashboard abgeschaltet; sonst Dashboard-Wert, aber nie über dem
    daily_limit aus countries.yaml."""
    if country in (off or []):
        return 0
    return _clamp((overrides or {}).get(country), 0, yaml_limit, yaml_limit)
