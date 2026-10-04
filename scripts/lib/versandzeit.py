"""Versandzeit der Kalt- und Nachfassmails (Inhaber 04.10.2026: „übernimm alle 3 punkte“).

Nur Dienstag bis Donnerstag zur Bürozeit der Empfänger: Europa (UK, FR …) ca. 09–11 Uhr, USA ab ca. 15 Uhr deutscher
Zeit (Vormittag US-Ostküste). Der Plan steht in app/lib/versandzeit.json (gleiche Datei liest das Dashboard).

send.yml hat je Gruppe zwei Crons (Sommer- und Winterzeit, UTC). Welcher Lauf wirklich sendet, entscheidet allein
die deutsche Uhrzeit beim Start (group_now): der Cron der „falschen“ Jahreszeit landet entweder außerhalb des Fensters
(endet ohne Arbeit) oder eine Stunde nach dem richtigen im Fenster (zweiter Durchgang, sendet nur, was übrig ist).

  python scripts/lib/versandzeit.py --gruppe auto     # GitHub-Ausgaben ok/gruppe/laender/bis für send.yml
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

PLAN_FILE = Path(__file__).resolve().parents[2] / "app" / "lib" / "versandzeit.json"
EARLY_MIN = 10  # ein Lauf darf bis zu 10 min vor dem geplanten Start beginnen (Cron/Wachhund)


def load() -> dict:
    return json.loads(PLAN_FILE.read_text(encoding="utf-8"))


def _tz(plan: dict) -> ZoneInfo:
    return ZoneInfo(plan.get("tz") or "Europe/Berlin")


def local(t: dt.datetime, plan: dict | None = None) -> dt.datetime:
    """Zeitpunkt in deutscher Zeit (für Texte an den Inhaber, CLAUDE.md: nie UTC)."""
    return t.astimezone(_tz(plan or load()))


TAGE = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")


def label(t: dt.datetime, plan: dict | None = None) -> str:
    """„Di 06.10. 08:37“ in deutscher Zeit."""
    t = local(t, plan)
    return f"{TAGE[t.weekday()]} {t:%d.%m. %H:%M}"


def _at(day: dt.date, hhmm: str, tz: ZoneInfo) -> dt.datetime:
    h, m = map(int, hhmm.split(":"))
    return dt.datetime(day.year, day.month, day.day, h, m, tzinfo=tz)


def send_day(day: dt.date, plan: dict | None = None) -> bool:
    """Ist das (deutsche) Datum ein Versandtag? wochentage nach ISO: 1 = Montag … 7 = Sonntag."""
    plan = plan or load()
    return day.isoweekday() in plan["wochentage"]


def group(name: str, plan: dict | None = None) -> dict | None:
    plan = plan or load()
    return next((g for g in plan["laeufe"] if g["gruppe"] == name), None)


def group_now(now: dt.datetime, plan: dict | None = None) -> dict | None:
    """Gruppe, die jetzt senden darf (Versandtag und zwischen Start − 10 min und spätestem Start), sonst None."""
    plan = plan or load()
    tz = _tz(plan)
    local = now.astimezone(tz)
    if not send_day(local.date(), plan):
        return None
    for g in plan["laeufe"]:
        a = _at(local.date(), g["start"], tz) - dt.timedelta(minutes=EARLY_MIN)
        if a <= local < _at(local.date(), g["spaetester_start"], tz):
            return g
    return None


def deadline(g: dict, now: dt.datetime, plan: dict | None = None) -> dt.datetime:
    """Ende des Versandfensters (bis) am heutigen deutschen Tag."""
    plan = plan or load()
    tz = _tz(plan)
    return _at(now.astimezone(tz).date(), g["bis"], tz)


def parse_until(hhmm: str, now: dt.datetime, plan: dict | None = None) -> dt.datetime:
    """--bis HH:MM (deutsche Zeit) -> Zeitpunkt heute."""
    plan = plan or load()
    tz = _tz(plan)
    return _at(now.astimezone(tz).date(), hhmm, tz)


def slots(day: dt.date, plan: dict | None = None) -> list[tuple[dict, dt.datetime]]:
    """Geplante Starts eines deutschen Kalendertags (leer an Nicht-Versandtagen)."""
    plan = plan or load()
    if not send_day(day, plan):
        return []
    tz = _tz(plan)
    return [(g, _at(day, g["start"], tz)) for g in plan["laeufe"]]


def last_due(now: dt.datetime, grace_min: int = 60, plan: dict | None = None) -> tuple[dict, dt.datetime] | None:
    """Letzter geplanter Start, der inzwischen (Start + Karenz) gelaufen sein müsste. None, wenn keiner in 14 Tagen."""
    plan = plan or load()
    day = now.astimezone(_tz(plan)).date()
    for i in range(15):
        for g, t in reversed(slots(day - dt.timedelta(days=i), plan)):
            if t + dt.timedelta(minutes=grace_min) <= now:
                return g, t
    return None


def send_day_start(now: dt.datetime, grace_min: int = 60, plan: dict | None = None) -> dt.datetime | None:
    """Erster geplanter Start des letzten fälligen Versandtags (für „seitdem gesendet?“-Prüfungen)."""
    plan = plan or load()
    due = last_due(now, grace_min, plan)
    if not due:
        return None
    return slots(due[1].astimezone(_tz(plan)).date(), plan)[0][1]


def next_start(now: dt.datetime, plan: dict | None = None) -> tuple[dict, dt.datetime] | None:
    plan = plan or load()
    day = now.astimezone(_tz(plan)).date()
    for i in range(15):
        for g, t in slots(day + dt.timedelta(days=i), plan):
            if t > now:
                return g, t
    return None


def wachhund_jobs(plan: dict | None = None, inputs: dict | None = None) -> list[dict]:
    """Je Gruppe ein Tagesjob für den Wachhund (deutsche Zeit, nur Versandtage, Nachholen bis 15 min vor dem
    spätesten Start, damit der nachgestartete Lauf noch im Fenster beginnt)."""
    plan = plan or load()
    out = []
    for g in plan["laeufe"]:
        h, m = map(int, g["spaetester_start"].split(":"))
        until = (dt.datetime(2000, 1, 1, h, m) - dt.timedelta(minutes=15)).strftime("%H:%M")
        out.append({"wf": "send.yml", "kind": "daily", "at": g["start"], "grace": 40, "until": until,
                    "tz": plan.get("tz") or "Europe/Berlin", "weekdays": [d - 1 for d in plan["wochentage"]],
                    "cond": "versand", "gruppe": g["gruppe"], "inputs": dict(inputs or {}, gruppe="auto")})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gruppe", default="auto", help="auto (nach deutscher Uhrzeit), europa, us oder alle")
    args = ap.parse_args(argv)
    now = dt.datetime.now(dt.timezone.utc)
    plan = load()
    if args.gruppe == "alle":  # nur per Hand (Inhaber): ohne Länder- und Zeitfilter
        out = {"ok": "true", "gruppe": "alle", "laender": "", "bis": ""}
    else:
        g = group_now(now, plan) if args.gruppe == "auto" else group(args.gruppe, plan)
        if g is None:
            nxt = next_start(now, plan)
            when = f"{label(nxt[1], plan)} ({nxt[0]['name']})" if nxt else "–"
            print(f"Außerhalb der Versandzeit (nur Di–Do, Plan app/lib/versandzeit.json) – nächster Lauf {when} "
                  "deutscher Zeit")
            out = {"ok": "false", "gruppe": "", "laender": "", "bis": ""}
        else:
            # feste Gruppe per Hand: ohne Zeitfenster (der Inhaber startet bewusst), auto: Versand nur bis „bis“
            out = {"ok": "true", "gruppe": g["gruppe"], "laender": ",".join(g["laender"]),
                   "bis": g["bis"] if args.gruppe == "auto" else ""}
            print(f"Versandzeit {g['name']}: Länder {out['laender']}"
                  + (f", Versand bis {g['bis']} deutscher Zeit" if out["bis"] else ", ohne Zeitfenster (Handstart)"))
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with open(target, "a", encoding="utf-8") as f:
            f.writelines(f"{k}={v}\n" for k, v in out.items())
    return 0


if __name__ == "__main__":
    sys.exit(main())
