#!/usr/bin/env python3
"""KPI-Tageswerte speichern (JARVIS-Plan W1-1): je deutschem Kalendertag × Land × Kennzahl eine Zeile in
signalwerk.kpi_daily, damit Trends über 7 und 30 Tage für alle Stationen möglich werden (nicht nur für Mails).

Gerechnet wird in der Datenbank (Funktion signalwerk.kpi_day), geschrieben per Upsert – beliebig oft wiederholbar.
Segmente und Länder aus der Test-Freigabe config/fokus.yaml (heute S2 × US/UK/FR). Käufer zählen nur mit
check_status = ok (Inhaber 02.10.2026). Bestandswerte sind Momentaufnahmen, deshalb läuft der Schnappschuss kurz vor
Mitternacht deutscher Zeit (.github/workflows/kpi-tag.yml). Liest Rohdaten, schreibt nur kpi_daily. Sendet nichts,
löscht nichts.

  python scripts/kpi_snapshot.py                      # heute (deutsche Zeit) speichern
  python scripts/kpi_snapshot.py --tag 2026-10-04     # bestimmten Tag (Bestandswerte = jetzt)
  python scripts/kpi_snapshot.py --nur-abends         # Tagesabschluss (Zeitplan/Wachhund): 23:xx deutscher Zeit
                                                      # = heute; verspätet 00:00–05:59 = gestern, falls noch offen
  python scripts/kpi_snapshot.py --zeigen             # nur anzeigen, nichts schreiben

Kennzahlen: leads_lieferbar, leads_neu, leads_alter_median_tage, kaeufer_ok, kaeufer_frei, kaeufer_neu,
freigabe_quote, freigabe_n, proben_bereit, proben_gesendet, gruen_je_platzstunde, antworten_offen, mrr_cents
(antworten_offen und mrr_cents zusätzlich gesamt als Land „ALL“).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

BERLIN = ZoneInfo("Europe/Berlin")
METRICS = ("leads_lieferbar", "leads_neu", "leads_alter_median_tage", "kaeufer_ok", "kaeufer_frei", "kaeufer_neu",
           "freigabe_quote", "freigabe_n", "proben_bereit", "proben_gesendet", "gruen_je_platzstunde",
           "antworten_offen", "mrr_cents")
KEY = "day,country,segment_id,metric"


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def berlin_day(t: dt.datetime) -> dt.date:
    return t.astimezone(BERLIN).date()


def evening(t: dt.datetime) -> bool:
    """Zeitplan läuft mit Sommer- und Winterzeit-Cron; nur der Lauf um 23:xx deutscher Zeit schreibt."""
    return t.astimezone(BERLIN).hour == 23


def abschluss_tag(t: dt.datetime) -> dt.date | None:
    """Welchen Tag schließt ein Zeitplan-Lauf ab? 23:xx deutscher Zeit = heute. GitHub startet geplante Läufe oft
    Stunden zu spät (05.10.2026: 02:12 und 03:18 statt 23:50 MESZ, beide übersprungen, 04.10. ohne Abschluss) –
    darum 00:00–05:59 = gestern (Bestandswerte dann vom Laufzeitpunkt). Sonst None (nichts schreiben)."""
    b = t.astimezone(BERLIN)
    if b.hour == 23:
        return b.date()
    if b.hour < 6:
        return b.date() - dt.timedelta(days=1)
    return None


def abgeschlossen(db, day: dt.date) -> bool:
    """Gibt es für diesen Tag schon einen Abschluss (Schnappschuss ab 23:00 deutscher Zeit)?"""
    since = dt.datetime.combine(day, dt.time(23, 0), tzinfo=BERLIN).astimezone(dt.timezone.utc)
    rows = db.select("kpi_daily", {"select": "day", "day": f"eq.{day.isoformat()}", "metric": "eq.leads_lieferbar",
                                   "updated_at": f"gte.{since.isoformat()}", "limit": "1"})
    return bool(rows)


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else round(f, 4)


TIMEOUT_RETRIES = 3   # 05.10.2026: Abschluss scheiterte an „statement timeout“ (57014), als leads ohne Vacuum lief


def _kpi_day(db, day: dt.date, segment: str, country: str, sleep=None) -> list[dict]:
    """Ein Land; bei Zeitüberschreitung der Datenbank (57014) bis zu 3 Versuche mit Pause, sonst Fehler weitergeben."""
    import time
    sleep = sleep or time.sleep
    for i in range(TIMEOUT_RETRIES):
        try:
            return db.rpc("kpi_day", {"p_day": day.isoformat(), "p_segment": segment, "p_countries": [country]}) or []
        except RuntimeError as e:
            if "57014" not in str(e) or i == TIMEOUT_RETRIES - 1:
                raise
            print(f"kpi_day {country}: Zeitüberschreitung, Versuch {i + 2} von {TIMEOUT_RETRIES}", flush=True)
            sleep(20 * (i + 1))
    return []


def rows_for(db, day: dt.date, segment: str, countries: list[str], t: dt.datetime) -> list[dict]:
    """Zeilen für kpi_daily aus signalwerk.kpi_day (nur bekannte Kennzahlen, je Schlüssel einmal). Ein Aufruf je Land:
    alle drei auf einmal dauerten 6 s (Grenze der Schnittstelle 8 s), einzeln je 0,2–0,6 s."""
    raw = []
    for c in countries:
        raw += _kpi_day(db, day, segment, c)
    out: dict[tuple, dict] = {}
    for r in raw:
        metric, country = str(r.get("metric") or ""), str(r.get("country") or "").upper()
        if metric not in METRICS or not country:
            continue
        out[(country, metric)] = {"day": day.isoformat(), "country": country, "segment_id": segment,
                                  "metric": metric, "value": _num(r.get("value")), "updated_at": t.isoformat()}
    return list(out.values())


def snapshot(db, day: dt.date | None = None, scope: tuple[list[str], list[str]] | None = None,
             write: bool = True, t: dt.datetime | None = None) -> list[dict]:
    from lib.fokus import test_scope
    t = t or now()
    day = day or berlin_day(t)
    segs, countries = scope or test_scope()
    rows = [r for s in segs for r in rows_for(db, day, s, countries, t)]
    if write and rows:
        db.insert("kpi_daily", rows, upsert_on=KEY)
    return rows


def summary(rows: list[dict]) -> str:
    by: dict[str, dict] = {}
    for r in rows:
        by.setdefault(f"{r['segment_id']} {r['country']}", {})[r["metric"]] = r["value"]
    return json.dumps(by, ensure_ascii=False, indent=1)


def _opt(argv: list[str], name: str) -> str | None:
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else None


def main(argv: list[str]) -> int:
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    t = now()
    tag = _opt(argv, "--tag")
    day = dt.date.fromisoformat(tag) if tag else None
    from lib.db import DB
    db = DB()
    if "--nur-abends" in argv:
        day = abschluss_tag(t)
        if day is None:
            print(f"kpi_snapshot: übersprungen ({t.astimezone(BERLIN):%H:%M} deutscher Zeit, Abschluss 23:00–05:59)")
            return 0
        if day < berlin_day(t) and abgeschlossen(db, day):
            print(f"kpi_snapshot: {day} schon abgeschlossen")
            return 0
    rows = snapshot(db, day, write="--zeigen" not in argv, t=t)
    print(f"kpi_snapshot: {len(rows)} Werte für {day or berlin_day(t)}")
    print(summary(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
