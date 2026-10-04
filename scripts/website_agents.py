"""Website-Agenten (Inhaber 04.10.2026: „agenten erstellen …, die anpassungen an der website übernehmen und schauen das
man dort auch immer alles sauber macht“). Der Inhaber legt sie im Dashboard unter /dashboard/website an (Name, Aufgabe,
Rhythmus täglich/wöchentlich/einmal). Dieses Skript läuft im Wachhund (alle 15 min) und

  1. übernimmt Ergebnisse fertiger Aufträge kurz nach website_agents.last_result,
  2. legt für jeden fälligen, aktiven Agenten einen Auftrag in agent_tasks an (kind 'website', erster freier Agent
     A1–A8, Text „Website-Agent <Name>: <Aufgabe>“) – die JARVIS-Routine (:08/:23/:38/:53) setzt ihn um.

Fällig: aktiv, kein offener/laufender Auftrag dieses Agenten, und täglich: letzter Auftrag ≥ 23 h her; wöchentlich:
≥ 7 Tage − 1 h; einmal: noch nie beauftragt. Gleiche Regeln in app/lib/website.ts (Anzeige „nächster Lauf“).
Schreibt nur in agent_tasks und website_agents. Sendet nichts, löscht nichts.

  python scripts/website_agents.py faellig            # nur anzeigen
  python scripts/website_agents.py faellig --apply    # Ergebnisse übernehmen, fällige beauftragen
  python scripts/website_agents.py liste              # alle Website-Agenten (JSON)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

AGENT_COUNT = 8                 # A1–A8 (app/lib/agents.ts AGENT_COUNT)
BY = "Website-Agent"
MAX_NEW = 3                     # höchstens so viele neue Aufträge je Lauf
SLACK = dt.timedelta(hours=1)   # Läufe kommen nie auf die Minute genau
INTERVAL = {"taeglich": dt.timedelta(days=1), "woechentlich": dt.timedelta(days=7)}
OPEN = ("offen", "laeuft")
DONE = ("fertig", "fehler", "abgebrochen")
COLS = "id,name,aufgabe,rhythmus,aktiv,last_run_at,last_task_id,last_result,created_at"


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _ts(x) -> dt.datetime | None:
    if not x:
        return None
    try:
        d = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def due(agent: dict, t: dt.datetime, task_status: str | None = None) -> bool:
    """Soll dieser Agent jetzt einen Auftrag bekommen?"""
    if not agent.get("aktiv"):
        return False
    if task_status in OPEN:
        return False
    last = _ts(agent.get("last_run_at"))
    r = agent.get("rhythmus")
    if r == "einmal":
        return last is None and not agent.get("last_task_id")
    if r not in INTERVAL:
        return False
    return last is None or t - last >= INTERVAL[r] - SLACK


def brief(agent: dict) -> str:
    name = " ".join(str(agent.get("name") or "").split())[:40]
    task = " ".join(str(agent.get("aufgabe") or "").split())[:240]
    return f"Website-Agent {name}: {task}"[:1000]


def short_result(task: dict) -> str:
    text = " ".join(str(task.get("result") or "").split())
    if task.get("status") == "abgebrochen":
        text = text or "abgebrochen"
    elif task.get("status") == "fehler":
        text = f"Fehler: {text or 'ohne Angabe'}"
    return (text or "erledigt")[:300]


def free_agents(open_tasks: list[dict]) -> list[int]:
    busy = {int(r["agent"]) for r in open_tasks if str(r.get("agent", "")).isdigit()}
    return [n for n in range(1, AGENT_COUNT + 1) if n not in busy]


def faellig(db, t: dt.datetime, apply: bool) -> dict:
    agents = db.select("website_agents", {"select": COLS, "order": "created_at.asc"}) or []
    ids = [str(a["last_task_id"]) for a in agents if a.get("last_task_id")]
    tasks = {}
    if ids:
        for r in db.select("agent_tasks", {"id": f"in.({','.join(ids)})", "select": "id,status,result"}) or []:
            tasks[str(r["id"])] = r
    out = {"ergebnisse": [], "neu": [], "wartet": []}
    # 1) Ergebnisse fertiger Aufträge übernehmen
    for a in agents:
        task = tasks.get(str(a.get("last_task_id") or ""))
        if task and task.get("status") in DONE:
            res = short_result(task)
            if res != a.get("last_result"):
                out["ergebnisse"].append({"agent": a["name"], "ergebnis": res})
                if apply:
                    db.update("website_agents", {"id": a["id"]}, {"last_result": res})
    # 2) fällige beauftragen (je freiem Agenten A1–A8 einer)
    todo = [a for a in agents if due(a, t, (tasks.get(str(a.get("last_task_id") or "")) or {}).get("status"))]
    if not todo:
        return out
    free = free_agents(db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": "agent"}) or [])
    for a in todo:
        if not free or len(out["neu"]) >= MAX_NEW:
            out["wartet"].append(a["name"])
            continue
        n = free.pop(0)
        out["neu"].append({"agent": a["name"], "an": f"A{n}", "text": brief(a)})
        if not apply:
            continue
        row = (db.insert("agent_tasks", {"agent": n, "kind": "website", "market": None, "brief": brief(a),
                                         "created_by": BY}) or [{}])[0]
        db.update("website_agents", {"id": a["id"]}, {"last_run_at": t.isoformat(), "last_task_id": row.get("id")})
    return out


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("faellig", "liste"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    if argv[0] == "liste":
        print(json.dumps(db.select("website_agents", {"select": COLS, "order": "created_at.asc"}) or [],
                         ensure_ascii=False, indent=1))
        return 0
    res = faellig(db, now(), "--apply" in argv)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
