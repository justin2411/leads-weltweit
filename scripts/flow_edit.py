"""Baukasten-Chat: Flows über den Chat ändern (Inhaber 04.10.2026: „im baukasten egal ob bei master pipeline oder
testflows auch text reinschreiben … es soll dann mit meinen worten selber gebaut werden … feedback ob es so übernommen
wurde … die anpassungen bleiben aber immer bestehen außer ich lösche das element“). Werkzeug der JARVIS-Routine
(docs/AGENTEN.md, Abschnitt „Baukasten-Chat“). Sendet nichts, löscht nichts, schaltet nie etwas scharf.

  python scripts/flow_edit.py show <flow_id>                     # Flow als JSON (def, Vorschlag, Prüfung)
  python scripts/flow_edit.py apply <flow_id> graph.json [--notiz "kurz, was geändert"] [--version <updated_at>]
  python scripts/flow_edit.py probe <flow_id> [graph.json]       # Zahlen aus der Stichprobe je Baustein (wie im Baukasten)

apply prüft wie der Baukasten (parseFlow + problems aus app/lib/flow.ts, in Python scripts/lib/flow_check.py):
jeder Fehler → Exit 2 mit Grund, nichts gespeichert. Dann:
  - Test-Flow (Entwurf/aus) und Agenten-Flow: direkt gespeichert (flows.def, neue Fassung, updated_at neu).
  - Master-Pipeline und Test-Flows, die schon in der Pipeline laufen (Status „aktiv“): nur als Vorschlag
    (flows.pending_def) – gilt erst, wenn der Inhaber im Baukasten „Übernehmen“ bzw. „Speichern“ klickt. Nie
    eigenständig aktivieren: diese Flows betreffen alle neuen Leads.
Jede Änderung → owner_log („über Chat geändert“, created_by „JARVIS-Chat“). --version = updated_at aus show: hat der
Inhaber inzwischen selbst gespeichert, wird nichts überschrieben (Exit 3, neu lesen).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import DB  # noqa: E402
from lib.flow_check import NODE_META, parse_flow, problems  # noqa: E402

BY = "JARVIS-Chat"
COLS = "id,name,kind,status,def,updated_at"


class EditError(ValueError):
    """Eingabe abgelehnt (Exit 2)."""


class Conflict(RuntimeError):
    """Inzwischen geändert (Exit 3)."""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _def(x):
    if isinstance(x, str):
        try:
            return json.loads(x)
        except ValueError:
            return None
    return x


def load(db, flow_id: str) -> dict:
    row = (db.select("flows", {"id": f"eq.{flow_id}", "select": COLS}) or [None])[0]
    if not row:
        raise EditError(f"Flow {flow_id} unbekannt")
    try:  # Vorschlag-Spalten erst ab Migration 20261004130000
        extra = (db.select("flows", {"id": f"eq.{flow_id}", "select": "pending_def,pending_at,pending_note"}) or [{}])[0]
    except RuntimeError:
        extra = {}
    return {**row, "def": _def(row.get("def")), "pending_def": _def(extra.get("pending_def")),
            "pending_at": extra.get("pending_at"), "pending_note": extra.get("pending_note")}


def kind_of(row: dict) -> str:
    return row.get("kind") if row.get("kind") in ("test", "master", "agent") else "test"


def is_live(row: dict) -> bool:
    """Gilt schon für neue Leads: Master-Pipeline oder angeschlossener Test-Flow → nur Vorschlag."""
    return kind_of(row) == "master" or row.get("status") == "aktiv"


def check(flow_in, row: dict) -> tuple[dict, list[str]]:
    """(geprüfter Flow, Hinweise) oder EditError mit allen Gründen – wie der Baukasten beim Speichern/Übernehmen."""
    flow, errs = parse_flow(flow_in)
    if flow is None:
        raise EditError("Flow ungültig: " + " · ".join(errs[:5]))
    kind = kind_of(row)
    probs = problems(flow, kind)
    bad = [p["msg"] for p in probs if p["level"] == "error"]
    if bad:
        raise EditError("erst Fehler beheben: " + " · ".join(bad[:5]))
    q = next((n for n in flow["nodes"] if n["kind"] == "quelle"), None)
    if kind == "master" and (not q or q["source"] != "leads"):
        raise EditError("Master-Pipeline gilt nur für Leads")
    if kind == "test" and row.get("status") == "aktiv":
        if not any(n["kind"] == "pipeline" for n in flow["nodes"]):
            raise EditError("läuft in der Pipeline – Pipeline-Baustein muss bleiben")
        if not q or q["source"] != "leads":
            raise EditError("Pipeline gilt nur für Leads")
    return flow, [p["msg"] for p in probs if p["level"] == "warn"]


def apply(db, flow_id: str, flow_in, note: str = "", version: str | None = None) -> dict:
    row = load(db, flow_id)
    if row.get("status") == "archiv":
        raise EditError("Flow ist archiviert – Inhaber holt ihn zurück oder legt einen neuen an")
    if version and str(row.get("updated_at")) != version:
        raise Conflict("inzwischen geändert – mit show neu lesen")
    flow, warns = check(flow_in, row)
    note = " ".join(str(note or "").split())[:500]
    old = row.get("pending_def") if is_live(row) and row.get("pending_def") else row.get("def")
    if isinstance(old, dict) and json.dumps(old, sort_keys=True) == json.dumps(flow, sort_keys=True):
        return {"modus": "unveraendert", "updated_at": row.get("updated_at"), "warnungen": warns}
    match = {"id": row["id"], "updated_at": row["updated_at"], "status": row["status"]}
    live = is_live(row)
    if live:
        vals = {"pending_def": flow, "pending_at": now(), "pending_note": note or None}
    else:  # alter Vorschlag (z. B. Flow inzwischen von der Pipeline gelöst) ist damit erledigt
        vals = {"def": flow, **({"pending_def": None, "pending_at": None, "pending_note": None} if row.get("pending_def") else {})}
    done = db.update("flows", match, vals)
    if not done:
        raise Conflict("inzwischen geändert – mit show neu lesen")
    kind = kind_of(row)
    db.insert("owner_log", {
        "action": f"{'master' if kind == 'master' else 'flow'}:chat{'-vorschlag' if live else ''}", "target": row["id"],
        "old_value": {"name": row.get("name"), "nodes": len((row.get("def") or {}).get("nodes") or [])},
        "new_value": {"nodes": len(flow["nodes"]), "edges": len(flow["edges"]), "modus": "vorschlag" if live else "gespeichert",
                      "notiz": note or "über Chat geändert"},
        "created_by": BY})
    return {"modus": "vorschlag" if live else "gespeichert", "updated_at": (done[0] or {}).get("updated_at"),
            "bausteine": len(flow["nodes"]), "warnungen": warns}


def probe(db, row: dict, flow: dict) -> dict:
    """Zahlen je Baustein aus der Stichprobe (gleiche Datenbank-Funktionen und Rechnung wie der Baukasten)."""
    from agents_run import load_rows, quelle  # noqa: PLC0415 - nur hier gebraucht
    from lib.owner_rules import run_flow_rows  # noqa: PLC0415
    q = quelle(flow)
    if not q:
        raise EditError("Quelle fehlt")
    rows = load_rows(db, q)
    res = run_flow_rows(flow, rows)
    out = []
    for n in flow.get("nodes") or []:
        r = res.get(n.get("id")) or {}
        item = {"id": n.get("id"), "art": NODE_META.get(n.get("kind"), (n.get("kind"),))[0], "titel": n.get("title"),
                "verbunden": bool(r.get("connected")), "ein": len(r.get("in") or []), "aus": len(r.get("out") or [])}
        if n.get("kind") == "weiche":
            item.update(ja=len(r.get("ja") or []), nein=len(r.get("nein") or []))
        out.append(item)
    return {"flow": row["id"], "stichprobe": len(rows), "quelle": q.get("source"), "bausteine": out}


def _read_json(path: str):
    text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except ValueError as exc:
        raise EditError(f"kein JSON: {exc}") from exc


def _opt(args: list[str], name: str) -> str | None:
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    try:
        if cmd == "show" and len(args) == 1:
            db = DB()
            row = load(db, args[0])
            flow, errs = parse_flow(row.get("def"))
            row["pruefung"] = problems(flow, kind_of(row)) if flow else [{"msg": e, "level": "error"} for e in errs]
            row["gilt_fuer_neue_leads"] = is_live(row)
            print(json.dumps(row, ensure_ascii=False, indent=1, default=str))
            return 0
        if cmd == "apply" and len(args) >= 2:
            res = apply(DB(), args[0], _read_json(args[1]), _opt(args, "--notiz") or "", _opt(args, "--version"))
            print(json.dumps(res, ensure_ascii=False))
            return 0
        if cmd == "probe" and len(args) in (1, 2):
            db = DB()
            row = load(db, args[0])
            src = _read_json(args[1]) if len(args) == 2 else (row.get("pending_def") or row.get("def"))
            flow, errs = parse_flow(src)
            if flow is None:
                raise EditError("Flow ungültig: " + " · ".join(errs[:5]))
            print(json.dumps(probe(db, row, flow), ensure_ascii=False, indent=1))
            return 0
    except EditError as exc:
        print(f"{cmd}: abgelehnt – {exc}")
        return 2
    except Conflict as exc:
        print(f"{cmd}: {exc}")
        return 3
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
