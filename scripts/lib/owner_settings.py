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
    "sample_max_age_hours": None,
    "buyer_countries_off": [],
    # Werke an/aus per Klick (Inhaber 03.10.2026: „alles direkt per click an und ausschalten können jedes werk“):
    # {"lead-werk": "2026-10-03T18:00:00Z", …} = pausiert seit. Versand = send_paused, Nachfass = followup_enabled.
    "werke_paused": {},
}

# Schaltbare Werke (Schlüssel wie im Dashboard). Sicherheitsfunktionen sind NIE schaltbar: Abmelde-Link, Resend-Webhook
# (Bounce/Beschwerde-Sperre), Sperrliste, Notbremse und die Abmelde-Erkennung im Antwort-Assistenten.
WERKE = ("lead-werk", "kunden-werk", "proben-vorrat", "antworten", "kundenlieferung", "tagescheck")


def load(db) -> dict:
    """Alle Schlüssel mit Standardwerten; Fehler beim Lesen (Tabelle fehlt, Netz) -> Standardwerte."""
    out = dict(DEFAULTS)
    try:
        rows = db.select("owner_settings", {"select": "key,value"}) or []
    except Exception:  # noqa: BLE001 – Einstellungen dürfen Versand, Vorrat und Werke nie verhindern
        return out
    for r in rows:
        if r.get("key") in DEFAULTS and r.get("value") is not None:
            out[r["key"]] = r["value"]
    return out


def paused(db, werk: str, settings: dict | None = None) -> str | None:
    """Zeitpunkt, seit dem der Inhaber dieses Werk pausiert hat, sonst None. Lesefehler = nicht pausiert (die
    Datei-Schalter config/*.yaml bleiben unabhängig davon wirksam)."""
    s = settings if settings is not None else load(db)
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
