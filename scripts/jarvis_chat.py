"""JARVIS-Chat für die JARVIS-Routine (Inhaber 04.10.2026: „ich will mit jarvis direkt einen eigenen chat mit
unterschiedlichen sitzungen haben … er soll auch selber jeden tag über einen speziellen chat sagen was er angepasst
hat“). Ablauf: docs/AGENTEN.md, Abschnitt „JARVIS-Chat“. Schreibt nur in signalwerk.jarvis_sessions/jarvis_messages.
Sendet nichts.

  python scripts/jarvis_chat.py offen                        # offene Inhaber-Nachrichten je Sitzung + letzte 20 als Verlauf (JSON)
  python scripts/jarvis_chat.py start <msg_id>               # übernehmen: Status „in_arbeit“ (Exit 3 = schon übernommen)
  python scripts/jarvis_chat.py antwort <session_id> antwort.txt [--links '[{"label": "PR", "url": "https://…"}]'] [--zwischenstand]
                                                             # JARVIS-Antwort speichern; Nachrichten der Sitzung in Arbeit → fertig
  python scripts/jarvis_chat.py bericht bericht.txt          # Tagesbericht (höchstens einmal je Tag, deutsche Zeit; sonst Exit 3)

Datei „-“ = Text von der Standardeingabe. Exit 2 = Eingabe ungültig (Text 1–8000 Zeichen, Links: höchstens 10,
label 1–80 Zeichen, url https://… oder /dashboard…).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import DB  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
HISTORY = 20                 # Nachrichten Verlauf je Sitzung
STALE = dt.timedelta(hours=2)  # „in_arbeit“ seit 2 h ohne Antwort → darf neu übernommen werden
MAX_BODY, MAX_LINKS = 8000, 10
MSG_COLS = "id,session_id,created_at,role,body,status,started_at,links"


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class InputError(ValueError):
    pass


def _read(path: str) -> str:
    text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    text = text.strip()
    if not 1 <= len(text) <= MAX_BODY:
        raise InputError(f"Text: 1–{MAX_BODY} Zeichen (ist {len(text)})")
    return text


def parse_links(raw: str | None) -> list[dict]:
    """Links für die Antwort prüfen: [{"label": "PR #12", "url": "https://github.com/…"}] – nur https oder Dashboard-Pfade."""
    if not raw:
        return []
    try:
        links = json.loads(raw)
    except ValueError as exc:
        raise InputError(f"Links: kein JSON ({exc})") from exc
    if not isinstance(links, list) or len(links) > MAX_LINKS:
        raise InputError(f"Links: Liste mit höchstens {MAX_LINKS} Einträgen")
    out = []
    for x in links:
        if not isinstance(x, dict):
            raise InputError("Links: je Eintrag {label, url}")
        label, url = str(x.get("label") or "").strip(), str(x.get("url") or "").strip()
        if not 1 <= len(label) <= 80:
            raise InputError("Links: label 1–80 Zeichen")
        if not (url.startswith("https://") or (url.startswith("/dashboard") and "//" not in url)) or len(url) > 500:
            raise InputError(f"Links: url muss mit https:// oder /dashboard beginnen ({url[:60]})")
        out.append({"label": label, "url": url})
    return out


def berlin_day_start(t: dt.datetime) -> dt.datetime:
    """Mitternacht (Europe/Berlin) des Tages von t, als UTC."""
    local = t.astimezone(BERLIN)
    return dt.datetime(local.year, local.month, local.day, tzinfo=BERLIN).astimezone(dt.timezone.utc)


def _ts(x) -> dt.datetime | None:
    """Zeitstempel aus PostgREST („…+00:00“, mit/ohne Bruchteile) oder ISO mit „Z“ → datetime (UTC); ungültig → None."""
    try:
        d = dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def _is_open(m: dict, t: dt.datetime) -> bool:
    if m.get("status") == "offen":
        return True
    if m.get("status") != "in_arbeit":
        return False
    started = _ts(m.get("started_at")) if m.get("started_at") else None
    # als Zeit vergleichen, nicht als Text (PostgREST lässt z. B. „.000000“ weg)
    return started is None or started < t - STALE


def history(db, session_id: str) -> list[dict]:
    rows = db.select("jarvis_messages", {"session_id": f"eq.{session_id}", "order": "created_at.desc",
                                         "limit": str(HISTORY), "select": MSG_COLS}) or []
    return sorted(rows, key=lambda r: str(r.get("created_at")))[-HISTORY:]


def offen(db) -> list[dict]:
    """Sitzungen mit offenen (oder seit 2 h liegengebliebenen) Inhaber-Nachrichten, älteste zuerst."""
    t = now()
    msgs = db.select("jarvis_messages", {"role": "eq.inhaber", "status": "in.(offen,in_arbeit)",
                                         "order": "created_at.asc", "select": MSG_COLS}) or []
    msgs = sorted((m for m in msgs if _is_open(m, t)), key=lambda m: str(m.get("created_at")))
    by_session: dict[str, list[dict]] = {}
    for m in msgs:
        by_session.setdefault(str(m["session_id"]), []).append(m)
    if not by_session:
        return []
    sessions = db.select("jarvis_sessions", {"id": f"in.({','.join(by_session)})",
                                             "select": "id,title,kind,flow_id,archived,created_at"}) or []
    out = []
    for s in sessions:
        if s.get("archived"):  # „Chat leeren“: Inhaber hat die Sitzung abgelegt – nicht mehr bearbeiten
            continue
        item = {"session": {k: s.get(k) for k in ("id", "title", "kind", "flow_id")},
                "offen": by_session[str(s["id"])], "verlauf": history(db, str(s["id"]))}
        if s.get("kind") == "baukasten" and s.get("flow_id"):
            f = (db.select("flows", {"id": f"eq.{s['flow_id']}", "select": "id,name,kind,status,updated_at"}) or [None])[0]
            item["flow"] = f
            item["hinweis"] = "Flow ändern mit scripts/flow_edit.py show/apply (docs/AGENTEN.md, Baukasten-Chat)"
        out.append(item)
    return sorted(out, key=lambda x: str(x["offen"][0].get("created_at")))


def start(db, msg_id: str) -> bool:
    """Atomar übernehmen: nur eine offene (oder seit 2 h liegengebliebene) Nachricht – nie zwei Läufe an derselben."""
    claim = {"status": "in_arbeit", "started_at": now().isoformat()}
    if db.update("jarvis_messages", {"id": msg_id, "status": "offen", "role": "inhaber"}, claim):
        return True
    row = (db.select("jarvis_messages", {"id": f"eq.{msg_id}", "select": "status,started_at"}) or [{}])[0]
    if row.get("status") == "in_arbeit" and _is_open(row, now()):
        return bool(db.update("jarvis_messages", {"id": msg_id, "status": "in_arbeit", "started_at": row.get("started_at")}, claim))
    return False


def antwort(db, session_id: str, body: str, links: list[dict], zwischenstand: bool = False) -> dict:
    s = (db.select("jarvis_sessions", {"id": f"eq.{session_id}", "select": "id,kind,archived"}) or [None])[0]
    if not s:
        raise InputError(f"Sitzung {session_id} unbekannt")
    t = now().isoformat()
    row = db.insert("jarvis_messages", {"session_id": session_id, "role": "jarvis", "body": body, "status": None,
                                        "links": links, "created_at": t})
    done = 0
    if not zwischenstand:
        q = {"session_id": f"eq.{session_id}", "role": "eq.inhaber", "select": "id,created_at"}
        status = "in_arbeit"
        working = db.select("jarvis_messages", {**q, "status": "eq.in_arbeit"}) or []
        if not working:  # ohne „start“ beantwortet: alle bis jetzt offenen Nachrichten dieser Sitzung
            status = "offen"
            working = [m for m in db.select("jarvis_messages", {**q, "status": "eq.offen"}) or []
                       if str(m.get("created_at") or "") <= t]
        for m in working:  # nur, wenn der Status noch stimmt (parallel geändert → nicht anfassen)
            done += len(db.update("jarvis_messages", {"id": m["id"], "status": status}, {"status": "fertig", "done_at": t}) or [])
    return {"id": (row or [{}])[0].get("id"), "fertig": done, "archiviert": bool(s.get("archived"))}


def bericht(db, body: str) -> dict | None:
    """Tagesbericht in die feste Sitzung „Tagesbericht“; None = heute (deutsche Zeit) schon geschrieben."""
    s = (db.select("jarvis_sessions", {"kind": "eq.bericht", "select": "id"}) or [None])[0]
    if not s:
        s = (db.insert("jarvis_sessions", {"title": "Tagesbericht", "kind": "bericht"}) or [None])[0]
    if not s:
        raise RuntimeError("Sitzung Tagesbericht fehlt")
    # Nur echte Tagesberichte zählen (done_at gesetzt) – Antworten auf Rückfragen des Inhabers in dieser Sitzung
    # (`antwort`, done_at leer) sperren den Bericht des Tages nicht.
    since = berlin_day_start(now()).isoformat()
    if db.select("jarvis_messages", {"session_id": f"eq.{s['id']}", "role": "eq.jarvis", "created_at": f"gte.{since}",
                                     "done_at": "not.is.null", "select": "id", "limit": "1"}):
        return None
    t = now().isoformat()
    row = db.insert("jarvis_messages", {"session_id": s["id"], "role": "jarvis", "body": body, "status": None, "links": [],
                                        "created_at": t, "done_at": t})
    return {"id": (row or [{}])[0].get("id"), "session_id": s["id"]}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    try:
        if cmd == "offen":
            print(json.dumps(offen(DB()), ensure_ascii=False, indent=1, default=str))
            return 0
        if cmd == "start" and len(args) == 1:
            if not start(DB(), args[0]):
                print(f"start: {args[0]} ist nicht (mehr) offen – übersprungen")
                return 3
            print(f"start: {args[0]}")
            return 0
        if cmd == "antwort" and len(args) >= 2:
            links = parse_links(args[args.index("--links") + 1] if "--links" in args else None)
            res = antwort(DB(), args[0], _read(args[1]), links, "--zwischenstand" in args)
            print(f"antwort: {json.dumps(res, ensure_ascii=False)}")
            return 0
        if cmd == "bericht" and len(args) == 1:
            res = bericht(DB(), _read(args[0]))
            if res is None:
                print("bericht: heute schon geschrieben – übersprungen")
                return 3
            print(f"bericht: {json.dumps(res, ensure_ascii=False)}")
            return 0
    except InputError as exc:
        print(f"{cmd}: {exc}")
        return 2
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
