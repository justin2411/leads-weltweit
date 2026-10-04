"""Agenten-Aufträge aus dem Dashboard bearbeiten (Inhaber 03.10.2026: „ich beauftrage agent 1 neue leads zu holen für
den markt“). Werkzeug für die stündliche Claude-Sitzung „Agenten“ (docs/AGENTEN.md):

  python scripts/agent_tasks.py offen                       # offene Aufträge (Chat zuerst, sonst älteste zuerst)
  python scripts/agent_tasks.py start <id>                  # übernehmen: Status „läuft“
  python scripts/agent_tasks.py schritt <id> 40 "prüfe 3 Quellen"   # Fortschritt + Zwischenstand (≤ 120 Zeichen)
  python scripts/agent_tasks.py fertig <id> "Ergebnis in 1–2 Sätzen (≤ 300 Zeichen)" '{"leads": 420}'
  python scripts/agent_tasks.py fehler <id> "Grund"

Schreibt nur in signalwerk.agent_tasks. Sendet nichts.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import DB  # noqa: E402
from lib.kurz import kuerzen  # noqa: E402

CHAT_BY = "JARVIS-Chat"  # wie app/lib/agents.ts
# Wenig Text überall (Inhaber 04.10.2026): Ergebnis kurz und klar, Zwischenstand eine Zeile.
RESULT_MAX = 300
STEP_MAX = 120
NOW = lambda: dt.datetime.now(dt.timezone.utc).isoformat()  # noqa: E731


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    db, cmd = DB(), argv[0]
    if cmd == "offen":
        rows = db.select("agent_tasks", {"status": "in.(offen,laeuft)", "order": "created_at.asc",
                                         "select": "id,agent,kind,market,brief,status,progress,created_at,created_by"})
        # Chat-Nachrichten an JARVIS zuerst (Inhaber wartet im Gespräch), sonst älteste zuerst (stabil)
        rows = sorted(rows or [], key=lambda r: r.get("created_by") != CHAT_BY)
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0
    tid = argv[1]
    if cmd == "start":
        # atomar übernehmen: nur ein offener Auftrag (oder ein seit 2 h liegengebliebener) – zwei Sitzungen nie am selben
        claim = {"status": "laeuft", "progress": 5, "started_at": NOW(), "step": "startet"}
        if not db.update("agent_tasks", {"id": tid, "status": "offen"}, claim):
            row = (db.select("agent_tasks", {"id": f"eq.{tid}", "select": "status,started_at"}) or [{}])[0]
            stale = row.get("status") == "laeuft" and str(row.get("started_at") or "") < (
                dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()
            if not (stale and db.update("agent_tasks", {"id": tid, "status": "laeuft", "started_at": row["started_at"]}, claim)):
                print(f"start: {tid} ist nicht (mehr) offen – übersprungen")
                return 3
    elif cmd == "schritt":
        db.update("agent_tasks", {"id": tid}, {"progress": max(0, min(99, int(argv[2]))), "step": kuerzen(argv[3], STEP_MAX)})
    elif cmd == "fertig":
        nums = json.loads(argv[3]) if len(argv) > 3 else {}
        db.update("agent_tasks", {"id": tid}, {"status": "fertig", "progress": 100, "step": None, "result": kuerzen(argv[2], RESULT_MAX),
                                               "numbers": {k: v for k, v in nums.items() if isinstance(v, (int, float))},
                                               "finished_at": NOW()})
    elif cmd == "fehler":
        db.update("agent_tasks", {"id": tid}, {"status": "fehler", "step": None, "result": kuerzen(argv[2], RESULT_MAX), "finished_at": NOW()})
    else:
        print(__doc__)
        return 1
    print(f"{cmd}: {tid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
