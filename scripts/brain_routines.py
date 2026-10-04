"""Gehirn-Routinen (Inhaber 04.10.2026: „beim gehirn mit ihm auch einzelne workflows bauen können z.b. jeden tag um
14 uhr sollst du 15min recherchieren wie wir unser system verbessern können … jeden tag um 11 uhr sollst du prüfen ob
alles glatt läuft … alles was er dort lernt soll in mds gepackt werden“).

Der Inhaber legt Routinen auf /dashboard/gehirn#routinen oder im Chat an (Tabelle signalwerk.brain_routines: Uhrzeit in
deutscher Zeit, Tage, Dauer 5–60 min). Ausgeführt wird ohne Extrakosten über die bestehende JARVIS-Runde:

  1. Ergebnisse fertiger Aufträge kurz nach brain_routines.last_result übernehmen,
  2. fällige, aktive Routinen als Auftrag in agent_tasks anlegen (kind 'gehirn', erster freier Agent A1–A8,
     created_by „Gehirn-Routine“; Routine eines Fach-Agenten (agent_roles.routine_id): Text aus agent_roles.auftrag,
     agent_tasks.rolle gesetzt – JARVIS „Team“) – die JARVIS-Runde (:08/:23/:38/:53, docs/AGENTEN.md) arbeitet ihn ab, schreibt das
     Ergebnis als Wissen (scripts/brain_knowledge.py add) und kurz in den Gehirn-Chat (jarvis_chat.py gehirn-update).

Fällig (gleiche Regel wie app/lib/brain-routines.ts dueAt): aktiv, kein offener/laufender Auftrag dieser Routine, der
letzte geplante Zeitpunkt (heute oder gestern, Tage passend) liegt höchstens 6 h zurück und last_run_at ist älter.
Läuft im Wachhund (alle 15 min). Schreibt nur in agent_tasks und brain_routines. Sendet nichts, löscht nichts.

  python scripts/brain_routines.py faellig            # nur anzeigen
  python scripts/brain_routines.py faellig --apply    # Ergebnisse übernehmen, fällige beauftragen
  python scripts/brain_routines.py liste              # alle Routinen (JSON)
  python scripts/brain_routines.py ergebnis <routine_id> "kurz"   # Ergebnis direkt setzen (≤ 300 Zeichen)

Gehirn beauftragt Agenten selbst (Inhaber 04.10.2026: „ich will auch das das gehirn die agents selber nutzt und
beauftragt für seine ziele“) – gleiche Regeln wie app/lib/agents.ts checkBrainTask:

  python scripts/brain_routines.py auftrag <art> "<Auftrag>" --grund "<≤ 160 Zeichen, Ziel-Bezug>" [--markt US|UK|FR] [--agent N]
        # art: leads, kaeufer, quelle, pruefen, frage; nur freie Agenten (höchstens ein offener Auftrag je Agent),
        # höchstens 3 neue Gehirn-Aufträge je Stunde, nie Versand/Kosten/Prüfregeln/Sperrliste/Löschen;
        # created_by „Gehirn“; Kurzmeldung „A3 beauftragt: …“ in den Gehirn-Chat. Exit 2 = abgelehnt (Grund steht da).
  python scripts/brain_routines.py ergebnisse     # fertige Aufträge vom Gehirn, noch nicht ausgewertet (JSON)
  python scripts/brain_routines.py gelernt <task_id> [...]   # als ausgewertet markieren (nach brain_knowledge.py add)
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

BERLIN = ZoneInfo("Europe/Berlin")
AGENT_COUNT = 8                       # A1–A8 (app/lib/agents.ts AGENT_COUNT)
BY = "Gehirn-Routine"                 # wie app/lib/brain-routines.ts BRAIN_BY
CATCH_UP = dt.timedelta(hours=6)      # höchstens so lange nach der geplanten Zeit nachholen
MAX_NEW = 3                           # höchstens so viele neue Aufträge je Lauf
OPEN = ("offen", "laeuft")
DONE = ("fertig", "fehler", "abgebrochen")
RESULT_MAX = 300
COLS = "id,name,aufgabe,uhrzeit,tage,wochentage,dauer_min,aktiv,last_run_at,last_task_id,last_result,created_at"
HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


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


def runs_on(r: dict, weekday: int) -> bool:
    """weekday 1 = Mo … 7 = So."""
    tage = r.get("tage") or "taeglich"
    if tage == "werktags":
        return weekday <= 5
    if tage == "wochentage":
        return weekday in {int(x) for x in (r.get("wochentage") or []) if str(x).isdigit()}
    return True


def berlin_at(day: dt.date, hhmm: str) -> dt.datetime:
    """Zeitpunkt „Tag, HH:MM deutsche Zeit“ als UTC (Sommer-/Winterzeit; nicht existierende Zeit → eine Stunde später)."""
    h, m = (int(x) for x in hhmm.split(":"))
    local = dt.datetime(day.year, day.month, day.day, h, m, tzinfo=BERLIN)
    # zoneinfo: nicht existierende Zeit (Umstellung) wandert mit fold=0 eine Stunde vor – wie die TS-Fassung
    back = local.astimezone(dt.timezone.utc).astimezone(BERLIN)
    if (back.hour, back.minute) != (h, m):
        local = local + dt.timedelta(hours=1)
    return local.astimezone(dt.timezone.utc)


def due_at(r: dict, t: dt.datetime, task_open: bool = False) -> dt.datetime | None:
    """Geplanter Zeitpunkt, wenn die Routine jetzt beauftragt werden soll, sonst None."""
    if not r.get("aktiv") or task_open or not HHMM.match(str(r.get("uhrzeit") or "")):
        return None
    today = t.astimezone(BERLIN).date()
    slots = [berlin_at(d, r["uhrzeit"]) for d in (today - dt.timedelta(days=1), today)
             if runs_on(r, d.isoweekday())]
    past = [s for s in slots if s <= t]
    if not past:
        return None
    slot = past[-1]
    if t - slot > CATCH_UP:
        return None
    last = _ts(r.get("last_run_at"))
    if last and last >= slot:
        return None
    return slot


def brief(r: dict) -> str:
    """Auftragstext (≤ 1000 Zeichen), gleich app/lib/brain-routines.ts routineBrief."""
    name = " ".join(str(r.get("name") or "").split())[:60]
    head = f"Gehirn-Routine {name} ({int(r.get('dauer_min') or 15)} min): "
    tail = " | Ergebnis als Wissen (brain_knowledge.py add), kurz ins Gehirn (jarvis_chat.py gehirn-update)."
    task = " ".join(str(r.get("aufgabe") or "").split())
    return f"{head}{task[:1000 - len(head) - len(tail)]}{tail}"


def role_brief(role: dict, dauer: int = 15, zusatz: str | None = None) -> str:
    """Auftragstext eines Fach-Agenten (≤ 1000 Zeichen), gleich app/lib/fach-agenten.ts roleBrief."""
    name = " ".join(str(role.get("name") or "").split())[:40]
    head = f"Fach-Agent {name} ({int(dauer or 15)} min): "
    tail = " | Ergebnis als Wissen (brain_knowledge.py add), kurz ins Gehirn (jarvis_chat.py gehirn-update)."
    z = " ".join(str(zusatz or "").split())
    body = " ".join(str(role.get("auftrag") or "").split())
    if z and not z.startswith(" ".join(str(role.get("name") or "").split())):
        body += f" Routine: {z}"
    return f"{head}{body[:1000 - len(head) - len(tail)]}{tail}"


def roles_by_routine(db) -> dict[str, dict]:
    """Fach-Agenten (agent_roles) je verknüpfter Routine; fehlt die Tabelle → leer (Routinen laufen wie bisher)."""
    try:
        rows = db.select("agent_roles", {"aktiv": "eq.true", "select": "slug,name,auftrag,routine_id"}) or []
    except Exception:  # noqa: BLE001
        return {}
    return {str(r["routine_id"]): r for r in rows if r.get("routine_id")}


def short_result(task: dict) -> str:
    text = " ".join(str(task.get("result") or "").split())
    if task.get("status") == "abgebrochen":
        text = text or "abgebrochen"
    elif task.get("status") == "fehler":
        text = f"Fehler: {text or 'ohne Angabe'}"
    return (text or "erledigt")[:RESULT_MAX]


def free_agents(open_tasks: list[dict]) -> list[int]:
    busy = {int(r["agent"]) for r in open_tasks if str(r.get("agent", "")).isdigit()}
    return [n for n in range(1, AGENT_COUNT + 1) if n not in busy]


def faellig(db, t: dt.datetime, apply: bool) -> dict:
    routines = db.select("brain_routines", {"select": COLS, "order": "created_at.asc"}) or []
    ids = [str(r["last_task_id"]) for r in routines if r.get("last_task_id")]
    tasks = {}
    if ids:
        for x in db.select("agent_tasks", {"id": f"in.({','.join(ids)})", "select": "id,status,result"}) or []:
            tasks[str(x["id"])] = x
    out = {"ergebnisse": [], "neu": [], "wartet": []}
    for r in routines:  # 1) Ergebnisse übernehmen
        task = tasks.get(str(r.get("last_task_id") or ""))
        if task and task.get("status") in DONE:
            res = short_result(task)
            if res != r.get("last_result"):
                out["ergebnisse"].append({"routine": r["name"], "ergebnis": res})
                if apply:
                    db.update("brain_routines", {"id": r["id"]}, {"last_result": res})
    todo = [r for r in routines
            if due_at(r, t, (tasks.get(str(r.get("last_task_id") or "")) or {}).get("status") in OPEN)]
    if not todo:
        return out
    free = free_agents(db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": "agent"}) or [])
    roles = roles_by_routine(db)
    for r in todo:  # 2) fällige beauftragen
        if not free or len(out["neu"]) >= MAX_NEW:
            out["wartet"].append(r["name"])
            continue
        n = free.pop(0)
        role = roles.get(str(r["id"]))
        text = role_brief(role, int(r.get("dauer_min") or 15), r.get("aufgabe")) if role else brief(r)
        out["neu"].append({"routine": r["name"], "an": f"A{n}", "text": text, **({"rolle": role["slug"]} if role else {})})
        if not apply:
            continue
        task = {"agent": n, "kind": "gehirn", "market": None, "brief": text, "created_by": BY}
        if role:
            task["rolle"] = role["slug"]
        row = (db.insert("agent_tasks", task) or [{}])[0]
        db.update("brain_routines", {"id": r["id"]}, {"last_run_at": t.isoformat(), "last_task_id": row.get("id")})
    return out


# ------------------------------------------------------------------------------------------- Aufträge vom Gehirn
BRAIN_TASK_BY = "Gehirn"                        # wie app/lib/agents.ts BRAIN_TASK_BY
BRAIN_SOURCES = ("Gehirn", "Gehirn-Routine")
BRAIN_MAX_PER_HOUR = 3
BRAIN_MARKETS = ("US", "UK", "FR")              # Fokus-Tests config/fokus.yaml (S2 in US, UK, FR)
OWNER_KINDS = ("leads", "kaeufer", "quelle", "pruefen", "frage")
FORBIDDEN = re.compile(r"versand\s*(an|ein|start)|mails?\s+(senden|schicken|verschicken)|sperrliste|notbremse|abmeld|"
                       r"pr[üu]fregel|freigabe\s*(lockern|aus|abschalten)|kosten|bezahl|kaufen|upgrade|abo\s+abschlie|l[öo]sch",
                       re.I)


class TaskError(ValueError):
    pass


def check_brain_task(kind: str, brief: str, grund: str, market: str | None, agent: int | None,
                     tasks: list[dict], t: dt.datetime) -> dict:
    """Gehirn-Auftrag prüfen (gleich app/lib/agents.ts checkBrainTask); gibt die Zeile für agent_tasks zurück."""
    if kind not in OWNER_KINDS:
        raise TaskError("Gehirn-Auftrag: Art leads, kaeufer, quelle, pruefen oder frage")
    m = str(market or "").strip().upper()
    market = None if m in ("", "ALLE") else m
    if market and market not in BRAIN_MARKETS:
        raise TaskError("Gehirn-Auftrag: nur Fokus-Märkte US, UK, FR")
    grund = " ".join(str(grund or "").split())
    if not 3 <= len(grund) <= 160:
        raise TaskError("Gehirn-Auftrag: Grund 3–160 Zeichen (Ziel-Bezug)")
    brief = " ".join(str(brief or "").split())
    if not 3 <= len(brief) <= 1000:
        raise TaskError("Auftrag: 3–1000 Zeichen")
    if FORBIDDEN.search(f"{brief} {grund}"):
        raise TaskError("Gehirn-Auftrag: Versand, Kosten, Prüfregeln, Sperrliste und Löschen nie per Auftrag")
    hour = t - dt.timedelta(hours=1)
    recent = [x for x in tasks if x.get("created_by") == BRAIN_TASK_BY and (_ts(x.get("created_at")) or t) >= hour]
    if len(recent) >= BRAIN_MAX_PER_HOUR:
        raise TaskError(f"Gehirn-Auftrag: höchstens {BRAIN_MAX_PER_HOUR} je Stunde")
    busy = {int(x["agent"]) for x in tasks if x.get("status") in OPEN and str(x.get("agent", "")).isdigit()}
    if agent is None:
        free = [n for n in range(1, AGENT_COUNT + 1) if n not in busy]
        if not free:
            raise TaskError("Gehirn-Auftrag: alle Agenten belegt")
        agent = free[0]
    elif not 1 <= agent <= AGENT_COUNT:
        raise TaskError("Agent wählen")
    elif agent in busy:
        raise TaskError(f"Gehirn-Auftrag: A{agent} ist belegt – freien Agenten nehmen")
    return {"agent": agent, "kind": kind, "market": market, "brief": brief, "grund": grund, "created_by": BRAIN_TASK_BY}


def auftrag(db, kind: str, brief: str, grund: str, market: str | None = None, agent: int | None = None,
            t: dt.datetime | None = None, note=None) -> dict:
    """Gehirn-Auftrag anlegen und kurz im Gehirn-Chat melden."""
    t = t or now()
    cols = "id,agent,status,created_by,created_at"
    open_rows = db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": cols}) or []
    recent = db.select("agent_tasks", {"created_by": f"eq.{BRAIN_TASK_BY}", "created_at": f"gte.{(t - dt.timedelta(hours=1)).isoformat()}",
                                       "select": cols}) or []
    tasks = list({str(x["id"]): x for x in open_rows + recent}.values())
    row = check_brain_task(kind, brief, grund, market, agent, tasks, t)
    res = (db.insert("agent_tasks", row) or [{}])[0]
    if note is None:
        import jarvis_chat
        note = lambda text: jarvis_chat.gehirn_update(db, text, [{"label": "Agenten", "url": "/dashboard/jarvis#agenten"}])  # noqa: E731
    try:
        note(f"A{row['agent']} beauftragt: {row['grund']}")
    except Exception as exc:  # noqa: BLE001 - Meldung ist zweitrangig, der Auftrag steht
        print(f"  Hinweis: Gehirn-Chat-Meldung fehlgeschlagen ({type(exc).__name__})")
    return {"id": res.get("id"), "agent": f"A{row['agent']}", "grund": row["grund"]}


def ergebnisse(db) -> list[dict]:
    """Fertige Aufträge vom Gehirn (eigene und aus Routinen), die das Gehirn noch nicht ausgewertet hat."""
    rows = db.select("agent_tasks", {"status": "in.(fertig,fehler)", "created_by": f"in.({','.join(BRAIN_SOURCES)})",
                                     "gelernt_at": "is.null", "order": "finished_at.asc",
                                     "select": "id,agent,kind,market,brief,grund,result,numbers,status,finished_at,created_by"}) or []
    return rows[:20]


def gelernt(db, ids: list[str], t: dt.datetime | None = None) -> int:
    stamp = (t or now()).isoformat()
    return sum(len(db.update("agent_tasks", {"id": i}, {"gelernt_at": stamp}) or []) for i in ids)


def _opt(args: list[str], name: str) -> str | None:
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    from lib.db import DB
    cmd = argv[0]
    db = DB()
    if cmd == "faellig":
        res = faellig(db, now(), "--apply" in argv)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0
    if cmd == "liste":
        print(json.dumps(db.select("brain_routines", {"select": COLS, "order": "uhrzeit.asc"}) or [], ensure_ascii=False, indent=1))
        return 0
    if cmd == "auftrag" and len(argv) >= 3:
        try:
            ag = _opt(argv, "--agent")
            res = auftrag(db, argv[1], argv[2], _opt(argv, "--grund") or "", _opt(argv, "--markt"), int(ag) if ag else None)
        except (TaskError, ValueError) as exc:
            print(f"auftrag: {exc}")
            return 2
        print(f"auftrag: {json.dumps(res, ensure_ascii=False)}")
        return 0
    if cmd == "ergebnisse":
        print(json.dumps(ergebnisse(db), ensure_ascii=False, indent=1, default=str))
        return 0
    if cmd == "gelernt" and len(argv) >= 2:
        print(f"gelernt: {gelernt(db, argv[1:])}")
        return 0
    if cmd == "ergebnis" and len(argv) >= 3:
        db.update("brain_routines", {"id": argv[1]}, {"last_result": " ".join(argv[2].split())[:RESULT_MAX]})
        print(f"ergebnis: {argv[1]}")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
