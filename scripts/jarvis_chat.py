"""JARVIS-Chat für die JARVIS-Routine (Inhaber 04.10.2026: „ich will mit jarvis direkt einen eigenen chat mit
unterschiedlichen sitzungen haben … er soll auch selber jeden tag über einen speziellen chat sagen was er angepasst
hat“). Ablauf: docs/AGENTEN.md, Abschnitt „JARVIS-Chat“. Schreibt nur in signalwerk.jarvis_sessions/jarvis_messages.
Sendet nichts.

  python scripts/jarvis_chat.py offen                        # offene Inhaber-Nachrichten je Sitzung + letzte 20 als Verlauf (JSON);
                                                             # Website-Sitzungen mit dem letzten Website-Check
  python scripts/jarvis_chat.py start <msg_id>               # übernehmen: Status „in_arbeit“ (Exit 3 = schon übernommen)
  python scripts/jarvis_chat.py antwort <session_id> antwort.txt [--links '[{"label": "PR", "url": "https://…"}]'] [--zwischenstand]
                                                             # JARVIS-Antwort speichern; Nachrichten der Sitzung in Arbeit → fertig
  python scripts/jarvis_chat.py bericht bericht.txt          # Tagesbericht als Kurzfassung in den Gehirn-Chat (höchstens einmal
                                                             # je Tag, deutsche Zeit; sonst Exit 3; ≤ 1500 Zeichen)
  python scripts/jarvis_chat.py gehirn-update - [--links '…']  # kurzes Update des Gehirns in den festen Gehirn-Chat (Text von
                                                             # stdin): ≤ 3 Zeilen, ≤ 400 Zeichen, Format „Aufgefallen: … ·
                                                             # Nächster Schritt: … · Brauche: …“; gleicher Text in 6 h → Exit 3;
                                                             # mit „Brauche:“ zusätzlich Web-Push aufs Handy

Gehirn-Chat (Inhaber 04.10.2026: „ein chat den man nicht löschen kann wo mir das gehirn immer updates gibt … sehr kurz
und knapp … was ihm aufgefallen ist, was er als nächstes macht … immer der goldene chat ganz oben“): feste Sitzung
kind 'gehirn' (genau eine, nie archivieren/umbenennen – die Datenbank verhindert es). Nachrichten des Inhabers dort
immer im Gehirn-Modus beantworten (Ziele docs/JARVIS.md, Wissen scripts/brain_knowledge.py list/get).

Datei „-“ = Text von der Standardeingabe. Exit 2 = Eingabe ungültig (Text 1–8000 Zeichen, Links: höchstens 10,
label 1–80 Zeichen, url https://… oder /dashboard…).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import DB  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
HISTORY = 20                 # Nachrichten Verlauf je Sitzung
STALE = dt.timedelta(hours=2)  # „in_arbeit“ seit 2 h ohne Antwort → darf neu übernommen werden
MAX_BODY, MAX_LINKS = 8000, 10
UPDATE_MAX, UPDATE_LINES = 400, 3     # Gehirn-Update: sehr kurz
BERICHT_MAX = 1500                    # Tagesbericht als Kurzfassung
DEDUP = dt.timedelta(hours=6)         # gleicher Update-Text innerhalb 6 h → nicht erneut
GEHIRN_TITLE = "Gehirn"
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


def website_context(db) -> dict | None:
    """Letzter Website-Check (Punkte je Bereich, die wichtigsten Funde) als Zusammenhang für Website-Sitzungen."""
    try:
        row = (db.select("website_checks", {"order": "at.desc", "limit": "1",
                                            "select": "at,site,scores,funde,seiten"}) or [None])[0]
    except Exception:  # Tabelle fehlt (Migration noch nicht angewandt) – Chat geht trotzdem
        return None
    if not row:
        return None
    funde = [f for f in (row.get("funde") or []) if isinstance(f, dict) and f.get("stufe") in ("rot", "gelb")]
    return {"at": row.get("at"), "site": row.get("site"), "scores": row.get("scores") or {}, "funde": funde[:12]}


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
    # "*": mode erst ab Migration 20261004224500
    sessions = db.select("jarvis_sessions", {"id": f"in.({','.join(by_session)})", "select": "*"}) or []
    out = []
    for s in sessions:
        if s.get("archived"):  # „Chat leeren“: Inhaber hat die Sitzung abgelegt – nicht mehr bearbeiten
            continue
        mode = "gehirn" if s.get("kind") == "gehirn" else (s.get("mode") or "assistent")
        item = {"session": {**{k: s.get(k) for k in ("id", "title", "kind", "flow_id")}, "mode": mode},
                "offen": by_session[str(s["id"])], "verlauf": history(db, str(s["id"]))}
        if mode == "gehirn":
            item["hinweis"] = ("Gehirn-Modus: als Kopf antworten – Ziele (docs/JARVIS.md: Umsatz, KPIs, Lead-Qualität), "
                               "aktuelle Zahlen und Wissen (python scripts/brain_knowledge.py list/get) einbeziehen, "
                               "selbst handeln im Rahmen, neue Erkenntnisse mit brain_knowledge.py add notieren; kurz.")
        if s.get("kind") == "baukasten" and s.get("flow_id"):
            f = (db.select("flows", {"id": f"eq.{s['flow_id']}", "select": "id,name,kind,status,updated_at"}) or [None])[0]
            item["flow"] = f
            item["hinweis"] = "Flow ändern mit scripts/flow_edit.py show/apply (docs/AGENTEN.md, Baukasten-Chat)"
        if s.get("kind") == "website":
            item["website_check"] = website_context(db)
            item["hinweis"] = ("Änderungswunsch an der Website: als PR umsetzen (Branch claude/agenten-website-<kurz>), "
                               "Tests/Build grün, selbst mergen, Ergebnis kurz mit Link (docs/AGENTEN.md, Website-Chat)")
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


def gehirn_session(db) -> dict:
    """Feste Sitzung „Gehirn“ (kind 'gehirn', genau eine); fehlt sie, wird sie angelegt."""
    s = (db.select("jarvis_sessions", {"kind": "eq.gehirn", "select": "id"}) or [None])[0]
    if not s:
        s = (db.insert("jarvis_sessions", {"title": GEHIRN_TITLE, "kind": "gehirn", "mode": "gehirn"}) or [None])[0]
    if not s:
        raise RuntimeError("Sitzung Gehirn fehlt")
    return s


def may_archive(session: dict) -> bool:
    """Nur eigene Chats dürfen archiviert/umbenannt werden – nie Gehirn, Tagesbericht, Baukasten oder Website."""
    return session.get("kind") == "chat"


def _norm(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def check_update(text: str) -> str:
    """Gehirn-Update prüfen: 1–400 Zeichen, höchstens 3 Zeilen (leere Zeilen zählen nicht)."""
    lines = [x.strip() for x in str(text or "").replace("\r\n", "\n").split("\n") if x.strip()]
    body = "\n".join(lines)
    if not body:
        raise InputError("Update: Text fehlt")
    if len(lines) > UPDATE_LINES:
        raise InputError(f"Update: höchstens {UPDATE_LINES} Zeilen (sehr kurz: Aufgefallen · Nächster Schritt · Brauche)")
    if len(body) > UPDATE_MAX:
        raise InputError(f"Update: höchstens {UPDATE_MAX} Zeichen (ist {len(body)})")
    return body


def needs_owner(text: str) -> bool:
    """Steht „Brauche:“ im Update (dann Push aufs Handy)?"""
    return bool(re.search(r"(^|[\s·|])brauche\s*:", str(text or ""), re.I))


def gehirn_update(db, body: str, links: list[dict] | None = None, push=None) -> dict | None:
    """Kurzes Update in den Gehirn-Chat; None = gleicher Text in den letzten 6 h schon geschrieben."""
    body = check_update(body)
    s = gehirn_session(db)
    t = now()
    recent = db.select("jarvis_messages", {"session_id": f"eq.{s['id']}", "role": "eq.jarvis",
                                           "created_at": f"gte.{(t - DEDUP).isoformat()}", "select": "id,body"}) or []
    if any(_norm(m.get("body")) == _norm(body) for m in recent):
        return None
    row = db.insert("jarvis_messages", {"session_id": s["id"], "role": "jarvis", "body": body, "status": None,
                                        "links": links or [], "created_at": t.isoformat()})
    pushed = False
    if needs_owner(body):
        if push is None:
            from lib.push import notify as push
        pushed = bool(push("Gehirn braucht dich", body, f"/dashboard/jarvis/chat?s={s['id']}", "other"))
    return {"id": (row or [{}])[0].get("id"), "session_id": s["id"], "push": pushed}


def bericht(db, body: str) -> dict | None:
    """Tagesbericht (Kurzfassung) in den Gehirn-Chat (Inhaber 04.10.2026: Tagesbericht-Meldungen gehen in den
    Gehirn-Chat; die frühere Sitzung „Tagesbericht“ bleibt als normale Sitzung erhalten). None = heute schon geschrieben."""
    if len(body) > BERICHT_MAX:
        raise InputError(f"Tagesbericht: Kurzfassung höchstens {BERICHT_MAX} Zeichen (ist {len(body)})")
    s = gehirn_session(db)
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
        if cmd == "gehirn-update" and len(args) >= 1:
            links = parse_links(args[args.index("--links") + 1] if "--links" in args else None)
            text = sys.stdin.read() if args[0] == "-" else Path(args[0]).read_text(encoding="utf-8")
            res = gehirn_update(DB(), text, links)
            if res is None:
                print("gehirn-update: gleicher Text in den letzten 6 h – übersprungen")
                return 3
            print(f"gehirn-update: {json.dumps(res, ensure_ascii=False)}")
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
