"""Website-Agenten (Inhaber 04.10.2026: „agenten erstellen …, die anpassungen an der website übernehmen und schauen das
man dort auch immer alles sauber macht“). Der Inhaber legt sie im Dashboard unter /dashboard/website an (Name, Aufgabe,
Rhythmus täglich/wöchentlich/einmal). Dieses Skript läuft im Wachhund (alle 15 min) und

  1. übernimmt Ergebnisse fertiger Aufträge kurz nach website_agents.last_result,
  2. legt für jeden fälligen, aktiven Agenten einen Auftrag in agent_tasks an (kind 'website', erster freier Agent
     A1–A8, Text „Website-Agent <Name>: <Aufgabe>“) – die JARVIS-Routine (:08/:23/:38/:53) setzt ihn um.

  3. Auto-Fix (Inhaber 04.10.2026: „jarvis soll das aber eigentlich alles selber machen und entscheiden“): ist
     owner_settings.website_autofix an (Standard), bekommt jede Seite mit neuen gelben/roten Funden des letzten
     Website-Checks EINEN gebündelten Auftrag („Website-Fix <Pfad>: Fund → Vorschlag; …“, created_by
     „Website-Auto-Fix“) – nur Funde mit vorschlag.auto (nie Rechtstexte, Preise, Variablen/Server), nicht
     ausgeblendet (owner_settings.website_ignored), nicht schon in Arbeit; höchstens 3 Auto-Aufträge je 24 h und
     höchstens 2 Versuche je Fund in 7 Tagen. Jeder Auftrag steht in signalwerk.website_fixes (Fund-Schlüssel,
     Auftrag); der nächste Website-Check setzt `behoben_at`, sobald die Funde weg sind (`mark_fixed`).

Fällig: aktiv, kein offener/laufender Auftrag dieses Agenten, und täglich: letzter Auftrag ≥ 23 h her; wöchentlich:
≥ 7 Tage − 1 h; einmal: noch nie beauftragt. Gleiche Regeln in app/lib/website.ts (Anzeige „nächster Lauf“).
Schreibt nur in agent_tasks und website_agents. Sendet nichts, löscht nichts.

  python scripts/website_agents.py faellig            # nur anzeigen
  python scripts/website_agents.py faellig --apply    # Ergebnisse übernehmen, fällige beauftragen
  python scripts/website_agents.py liste              # alle Website-Agenten (JSON)
  python scripts/website_agents.py autofix [--apply]  # nur Auto-Fix (auch Teil von faellig --apply)
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


# --------------------------------------------------------------------------------------------- Website-Fixes
FIX_BY = "Website-Auto-Fix"
AUTO_MAX_DAY = 3                # höchstens so viele Auto-Aufträge je 24 h
AUTO_TRIES = 2                  # höchstens so viele Auto-Versuche je Fund in 7 Tagen, dann nur noch Inhaber
FIX_COLS = "id,created_at,task_id,pfad,keys,quelle,behoben_at"
LEVEL_RANK = {"rot": 0, "gelb": 1, "info": 2}
RULES = ("Vorschlag umsetzen oder besser formulieren (Bedeutung gleich, landesweit, FR korrekt). Texte im Repo als PR, "
         "Landingpage-Texte per UPDATE page_variants (alten Wert vorher in decisions). Nie Rechtstexte oder Preise, "
         "kein Versand, keine Kosten. Danach website-check.yml starten.")


def latest_check(db) -> dict | None:
    rows = db.select("website_checks", {"select": "at,funde", "order": "at.desc", "limit": "1"}) or []
    return rows[0] if rows else None


def fix_line(f: dict) -> str:
    v = f.get("vorschlag") or {}
    goal = f"„{v['neu']}“" if v.get("neu") else str(v.get("text") or "beheben")
    return f"{f.get('text', '')} → {goal}"


def fix_brief(pfad: str | None, funde: list[dict], by_owner: bool = False) -> str:
    """Auftragstext (≤ 1000 Zeichen): Seite, je Fund „Fund → Vorschlag“, Regeln."""
    head = f"Website-Fix {pfad or 'Website'}{' (Inhaber)' if by_owner else ''}: "
    body = "; ".join(fix_line(f) for f in funde)
    room = 1000 - len(head) - len(RULES) - 3
    if len(body) > room:
        body = body[:max(0, room - 1)].rstrip() + "…"
    return f"{head}{body} | {RULES}"


def ignored_keys(settings: dict, t: dt.datetime) -> set[str]:
    out = set()
    for k, until in (settings.get("website_ignored") or {}).items():
        u = _ts(until)
        if u and u > t:
            out.add(k)
    return out


def _fixes(db, since: dt.datetime) -> tuple[list[dict], dict]:
    fixes = db.select("website_fixes", {"created_at": f"gte.{since.isoformat()}", "select": FIX_COLS,
                                         "order": "created_at.desc"}) or []
    ids = sorted({str(f["task_id"]) for f in fixes if f.get("task_id")})
    tasks = {}
    if ids:
        for r in db.select("agent_tasks", {"id": f"in.({','.join(ids)})", "select": "id,status,finished_at"}) or []:
            tasks[str(r["id"])] = r
    return fixes, tasks


def busy_keys(fixes: list[dict], tasks: dict, check_at: dt.datetime | None) -> set[str]:
    """Funde, die schon jemand behebt: Auftrag offen/läuft, oder Auftrag nach dem letzten Check angelegt (wartet
    auf den nächsten Check)."""
    out = set()
    for f in fixes:
        st = (tasks.get(str(f.get("task_id") or "")) or {}).get("status")
        created = _ts(f.get("created_at"))
        if f.get("behoben_at"):
            continue
        if st in OPEN or (check_at and created and created > check_at):
            out.update(f.get("keys") or [])
    return out


def autofix(db, t: dt.datetime, apply: bool, settings: dict | None = None, check: dict | None = None) -> dict:
    """Auto-Fix: je Seite ein gebündelter Auftrag für neue gelbe/rote Funde (siehe Kopf, Punkt 3)."""
    from lib import owner_settings
    s = settings if settings is not None else owner_settings.load(db)
    out = {"aus": False, "neu": [], "wartet": [], "gesperrt": []}
    if s.get("website_autofix", True) is False:
        out["aus"] = True
        return out
    check = check if check is not None else latest_check(db)
    if not check:
        return out
    check_at = _ts(check.get("at"))
    fixes, tasks = _fixes(db, t - dt.timedelta(days=7))
    skip = busy_keys(fixes, tasks, check_at) | ignored_keys(s, t)
    tries: dict[str, int] = {}
    for f in fixes:
        if f.get("quelle") == "auto":
            for k in f.get("keys") or []:
                tries[k] = tries.get(k, 0) + 1
    pages: dict[str, list[dict]] = {}
    for f in check.get("funde") or []:
        v = f.get("vorschlag") or {}
        k = f.get("key")
        if not k or f.get("stufe") not in ("rot", "gelb") or not v.get("auto") or k in skip:
            continue
        if tries.get(k, 0) >= AUTO_TRIES:
            out["gesperrt"].append(k)
            continue
        pages.setdefault(f.get("pfad") or "", []).append(f)
    if not pages:
        return out
    day = t - dt.timedelta(hours=24)
    used = sum(1 for f in fixes if f.get("quelle") == "auto" and (_ts(f.get("created_at")) or t) >= day)
    order = sorted(pages.items(), key=lambda kv: (min(LEVEL_RANK.get(x["stufe"], 3) for x in kv[1]), -len(kv[1]), kv[0]))
    free = free_agents(db.select("agent_tasks", {"status": f"in.({','.join(OPEN)})", "select": "agent"}) or [])
    for pfad, funde in order:
        if used >= AUTO_MAX_DAY or not free:
            out["wartet"].append(pfad or "Website")
            continue
        n = free.pop(0)
        used += 1
        brief_text = fix_brief(pfad or None, funde)
        out["neu"].append({"pfad": pfad or "Website", "an": f"A{n}", "funde": len(funde)})
        if not apply:
            continue
        row = (db.insert("agent_tasks", {"agent": n, "kind": "website", "market": None, "brief": brief_text,
                                         "created_by": FIX_BY}) or [{}])[0]
        db.insert("website_fixes", {"task_id": row.get("id"), "pfad": pfad or None, "keys": [f["key"] for f in funde],
                                    "funde": [{k: f.get(k) for k in ("bereich", "stufe", "text", "vorschlag")} for f in funde],
                                    "quelle": "auto", "created_by": FIX_BY, "created_at": t.isoformat()})
    return out


def mark_fixed(db, funde: list[dict], t: dt.datetime) -> int:
    """Nach einem Website-Check: Fixes mit fertigem Auftrag, deren Funde alle weg sind, als behoben markieren."""
    present = {f.get("key") for f in funde if f.get("key")}
    fixes, tasks = _fixes(db, t - dt.timedelta(days=14))
    n = 0
    for f in fixes:
        if f.get("behoben_at") or (tasks.get(str(f.get("task_id") or "")) or {}).get("status") != "fertig":
            continue
        keys = f.get("keys") or []
        if keys and not present.intersection(keys):
            db.update("website_fixes", {"id": f["id"]}, {"behoben_at": t.isoformat()})
            n += 1
    return n


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("faellig", "liste", "autofix"):
        print(__doc__)
        return 1
    from lib.db import DB
    db = DB()
    if argv[0] == "liste":
        print(json.dumps(db.select("website_agents", {"select": COLS, "order": "created_at.asc"}) or [],
                         ensure_ascii=False, indent=1))
        return 0
    if argv[0] == "autofix":
        print(json.dumps(autofix(db, now(), "--apply" in argv), ensure_ascii=False, indent=1))
        return 0
    res = faellig(db, now(), "--apply" in argv)
    try:  # Auto-Fix darf die Website-Agenten nie aufhalten (Tabelle fehlt noch, Netz)
        res["autofix"] = autofix(db, now(), "--apply" in argv)
    except Exception as e:  # noqa: BLE001
        res["autofix"] = {"fehler": str(e)[:200]}
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
