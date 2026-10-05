"""Versand rund um die Uhr (Inhaber 04.10.2026: „es sollen immer mails rausgehen nicht nur di-do. sondern jeden tag
um jede uhrzeit es soll die ganze zeit laufen“).

Kalt- und Nachfassmails jeden Tag 0–24 Uhr: send.yml startet stündlich zur Minute 37 (Plan app/lib/versandzeit.json,
gleiche Datei liest das Dashboard). Jeder Lauf sendet nur seinen Anteil der Tagesmenge (share: Rest des Tages geteilt
durch die verbleibenden Läufe des Tages) und höchstens dauer_min Minuten lang – gleichmäßig, ohne Spitzen. Alle
übrigen Grenzen (Notbremse, Sperrliste, Länderregeln, Postfach-/Länder-Tageslimits, Pausenschalter) gelten unverändert
in outreach.py.

  python scripts/lib/versandzeit.py --gruppe auto     # GitHub-Ausgaben ok/gruppe/laender/bis/minuten/anteil
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

PLAN_FILE = Path(__file__).resolve().parents[2] / "app" / "lib" / "versandzeit.json"
UTC = dt.timezone.utc


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


def group(plan: dict | None = None) -> dict:
    """Die eine Gruppe: alle Länder in jedem Lauf."""
    plan = plan or load()
    return {"gruppe": "alle", "name": plan.get("name") or "alle Länder", "laender": []}


def send_day(day: dt.date, plan: dict | None = None) -> bool:
    """Ist das (deutsche) Datum ein Versandtag? wochentage nach ISO: 1 = Montag … 7 = Sonntag (heute: alle)."""
    plan = plan or load()
    return day.isoweekday() in plan["wochentage"]


def group_now(now: dt.datetime, plan: dict | None = None) -> dict | None:
    """Gruppe, die jetzt senden darf (an jedem Versandtag zu jeder Uhrzeit), sonst None."""
    plan = plan or load()
    return group(plan) if send_day(now.astimezone(_tz(plan)).date(), plan) else None


def slots(day: dt.date, plan: dict | None = None) -> list[tuple[dict, dt.datetime]]:
    """Geplante stündliche Starts (Minute `minute`) eines deutschen Kalendertags (23–25 je nach Zeitumstellung)."""
    plan = plan or load()
    if not send_day(day, plan):
        return []
    tz = _tz(plan)
    start = dt.datetime(day.year, day.month, day.day, tzinfo=tz).astimezone(UTC)
    g = group(plan)
    out = []
    for h in range(26):
        t = start + dt.timedelta(hours=h, minutes=int(plan.get("minute", 37)))
        if t.astimezone(tz).date() == day:
            out.append((g, t))
    return out


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
    """Erster geplanter Start des Tags des letzten fälligen Laufs (für „seitdem gesendet?“-Prüfungen)."""
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


def runs_left(now: dt.datetime) -> int:
    """Verbleibende stündliche Läufe des Versandtags inkl. dieses Laufs. Der Tag der Tagesmenge ist der UTC-Tag
    (outreach.py zählt „heute gesendet“ ab 00:00 UTC), je UTC-Stunde ein Lauf."""
    return max(1, 24 - now.astimezone(UTC).hour)


def share(remaining: int, now: dt.datetime) -> int:
    """Anteil dieses Laufs an der Resttagesmenge: gleichmäßig auf die verbleibenden Läufe verteilt (aufgerundet)."""
    if remaining <= 0:
        return 0
    return math.ceil(remaining / runs_left(now))


def wachhund_jobs(plan: dict | None = None, inputs: dict | None = None) -> list[dict]:
    """Ein Stundenjob für den Wachhund: rund um die Uhr, nachstarten, wenn 70 min kein wirksamer Lauf begann
    (Betrieb 05.10.2026: fehlgeschlagene Läufe und Probeläufe zählen nicht, scripts/takt.py)."""
    return [{"wf": "send.yml", "kind": "hourly", "window": (0, 23), "max_min": 70, "cond": "versand",
             "gruppe": "alle", "inputs": dict(inputs or {}, gruppe="auto")}]


def plan_text(plan: dict | None = None) -> str:
    plan = plan or load()
    return f"täglich 0–24 Uhr · stündlich :{int(plan.get('minute', 37)):02d}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gruppe", default="auto", help="auto (Anteil der Tagesmenge, höchstens dauer_min Minuten) "
                                                       "oder alle (per Hand: ohne Anteil und Zeitgrenze)")
    args = ap.parse_args(argv)
    now = dt.datetime.now(UTC)
    plan = load()
    if args.gruppe == "alle":  # nur per Hand (Inhaber): ohne Anteil und Zeitgrenze
        out = {"ok": "true", "gruppe": "alle", "laender": "", "bis": "", "minuten": "", "anteil": "false"}
        print("Handstart: alle Länder, ohne Anteil und Zeitgrenze")
    elif group_now(now, plan) is None:
        nxt = next_start(now, plan)
        print(f"Heute kein Versandtag (Plan app/lib/versandzeit.json) – nächster Lauf "
              f"{label(nxt[1], plan) if nxt else '–'} deutscher Zeit")
        out = {"ok": "false", "gruppe": "", "laender": "", "bis": "", "minuten": "", "anteil": "false"}
    else:
        out = {"ok": "true", "gruppe": "alle", "laender": "", "bis": "", "minuten": str(plan.get("dauer_min", 45)),
               "anteil": "true"}
        print(f"Versand rund um die Uhr ({plan_text(plan)}): alle Länder, Anteil der Tagesmenge, "
              f"höchstens {out['minuten']} min")
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with open(target, "a", encoding="utf-8") as f:
            f.writelines(f"{k}={v}\n" for k, v in out.items())
    return 0


if __name__ == "__main__":
    sys.exit(main())
