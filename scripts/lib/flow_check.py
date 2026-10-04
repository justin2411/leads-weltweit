"""Prüfung eines Baukasten-Flows in Python – gleiche Regeln und Texte wie parseFlow() und problems() in app/lib/flow.ts.

Gebraucht von scripts/flow_edit.py (Baukasten-Chat, Inhaber 04.10.2026: „es soll dann mit meinen worten selber gebaut
werden“): Was die Routine über den Chat baut, wird genauso geprüft wie im Baukasten selbst – ein ungültiger Graph wird
nie gespeichert. Gemeinsame Testfälle mit TypeScript: tests/fixtures/flow_check_cases.json (beide Seiten müssen
dieselben Fehler mit demselben Wortlaut liefern).

parse_flow(x)          -> (flow | None, fehler[])   strenge Strukturprüfung (Typen, Arten, ids, Grenzen)
problems(flow, kind)   -> [{"nodeId", "msg", "level"}]   fachliche Fehler ("error") und Hinweise ("warn")
"""
from __future__ import annotations

import math
import re
from pathlib import Path

from lib.owner_rules import FIELDS, WS

# Beschriftungen wie FIELDS[].label / NODE_META[].label in app/lib/flow.ts (Gleichstand prüft tests/test_flow_edit.py)
FIELD_LABELS: dict[str, str] = {
    "land": "Land", "segment": "Zielgruppe", "signal": "Signal", "dringlichkeit": "Dringlichkeit", "status": "Status",
    "quelle": "Quelle", "alter_tage": "Alter (Tage)", "erfasst_tage": "Erfasst vor (Tagen)", "firma": "Firmenname",
    "rechtsform": "Rechtsform", "ort": "Ort", "region": "Region", "branche": "Branche", "text": "Ereignis-Text",
    "hat_website": "Website vorhanden", "hat_telefon": "Telefon vorhanden", "telefon_art": "Telefon-Art",
    "hat_email": "E-Mail vorhanden", "email_art": "E-Mail-Art", "hat_person": "Ansprechperson", "rolle": "Rolle",
    "vollstaendig": "Daten vollständig", "geprueft": "Freigabe", "email_generisch": "Allgemeine E-Mail",
    "pruefung": "Prüfung", "grund": "Prüfgrund", "spezialisierung": "Spezialisierung", "angeschrieben": "Angeschrieben",
    "punkte": "Punkte",
}
# Art -> (Beschriftung, Ausgänge, hat Eingang, Gruppe)
NODE_META: dict[str, tuple[str, tuple[str, ...], bool, str]] = {
    "quelle": ("Quelle", ("out",), False, "quelle"),
    "filter": ("Filter", ("out",), True, "schritt"),
    "weiche": ("Weiche", ("ja", "nein"), True, "schritt"),
    "punkte": ("Punkte", ("out",), True, "schritt"),
    "top": ("Top", ("out",), True, "schritt"),
    "dubletten": ("Dubletten", ("out",), True, "schritt"),
    "statistik": ("Statistik", ("out",), True, "schritt"),
    "freigabe": ("Freigabe", ("out",), True, "schritt"),
    "pipeline": ("Pipeline", (), True, "ziel"),
    "export": ("Export", (), True, "ziel"),
    "agent": ("Agent", (), True, "ziel"),
    "speicher": ("Speicher", (), True, "ziel"),
    "melden": ("Melden", (), True, "ziel"),
}
# Vergleich -> Anzahl Werte (0, 1, "list", 2) je Feldtyp, wie OPS in flow.ts
ARITY: dict[str, dict[str, object]] = {
    "enum": {"ist": 1, "ist_nicht": 1, "in": "list", "nicht_in": "list"},
    "text": {"enthaelt": 1, "enthaelt_nicht": 1, "ist": 1, "ist_nicht": 1, "beginnt": 1, "vorhanden": 0, "fehlt": 0},
    "num": {"gt": 1, "gte": 1, "lt": 1, "lte": 1, "ist": 1, "zwischen": 2},
    "bool": {"ja": 0, "nein": 0},
}
ALL_OPS = {op for t in ARITY.values() for op in t}
SORTS = ("neueste", "aelteste", "punkte", "dringlichkeit")
TASKS = ("leads", "kaeufer", "quelle", "pruefen", "frage")  # OWNER_KINDS in app/lib/agents.ts
LIMITS = {"nodes": 40, "edges": 80, "conds": 12, "rules": 12, "pts": 100, "n": 5000, "str": 200, "list": 50, "name": 60,
          "title": 60, "min": 10000, "pool": 40}
GESAMTBESTAND = "Gesamtbestand"
ID_RE = re.compile(r"[a-z0-9_-]{1,24}")
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def _agent_count() -> int:
    """AGENT_COUNT aus app/lib/agents.ts (eine Quelle für TS und Python); Datei fehlt → 4."""
    try:
        src = (Path(__file__).resolve().parents[2] / "app" / "lib" / "agents.ts").read_text(encoding="utf-8")
        m = re.search(r"export const AGENT_COUNT\s*=\s*(\d+)", src)
        return int(m.group(1)) if m else 4
    except OSError:
        return 4


AGENT_COUNT = _agent_count()


def _is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _is_int(x) -> bool:
    return _is_num(x) and float(x).is_integer()


def _is_str(x, mx: int = LIMITS["str"]) -> bool:
    # JS zählt UTF-16-Einheiten (String.length)
    return isinstance(x, str) and len(x.encode("utf-16-le")) // 2 <= mx


def _jslen(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _clamp(n) -> float:
    v = max(-10000, min(10000, n))
    return int(v) if float(v).is_integer() else v


# ------------------------------------------------------------------------------------------- Struktur
def _parse_cond(x, where: str, errs: list[str]):
    if not isinstance(x, dict):
        errs.append(f"{where}: Bedingung fehlt")
        return None
    if not _is_str(x.get("f"), 40) or not x.get("f"):
        errs.append(f"{where}: Feld ungültig")
        return None
    if not isinstance(x.get("op"), str) or x["op"] not in ALL_OPS:
        errs.append(f"{where}: Vergleich ungültig")
        return None
    c = {"f": x["f"], "op": x["op"]}
    v = x.get("v")
    if v is None:
        return c
    if _is_str(v) or _is_num(v):
        c["v"] = v
    elif isinstance(v, list) and len(v) == 2 and all(_is_num(e) for e in v):
        c["v"] = [v[0], v[1]]
    elif isinstance(v, list) and len(v) <= LIMITS["list"] and all(_is_str(e) for e in v):
        c["v"] = list(v)
    else:
        errs.append(f"{where}: Wert ungültig")
        return None
    return c


def _parse_node(x, i: int, errs: list[str]):  # noqa: C901 - eine Verzweigung je Bausteinart wie in flow.ts
    w = f"Baustein {i + 1}"
    if not isinstance(x, dict):
        errs.append(f"{w}: kein Objekt")
        return None
    if not isinstance(x.get("id"), str) or not ID_RE.fullmatch(x["id"]):
        errs.append(f"{w}: id ungültig")
        return None
    kind = x.get("kind")
    if not isinstance(kind, str) or kind not in NODE_META:
        errs.append(f"{w}: Art unbekannt")
        return None
    if not _is_num(x.get("x")) or not _is_num(x.get("y")):
        errs.append(f"{w}: Position ungültig")
        return None
    b: dict = {"id": x["id"], "x": _clamp(x["x"]), "y": _clamp(x["y"])}
    t = x.get("title")
    if t is not None and t != "":
        if not _is_str(t, LIMITS["title"]):
            errs.append(f"{w}: Titel zu lang")
            return None
        b["title"] = t

    def bad(m: str):
        errs.append(f"{w}: {m}")
        return None

    def str_list(v, mx: int) -> bool:
        return isinstance(v, list) and len(v) <= mx and all(_is_str(s, 20) for s in v)

    if kind == "quelle":
        if x.get("source") not in ("leads", "kaeufer"):
            return bad("Quelle unbekannt")
        seg = x.get("segment")
        if seg is not None and not _is_str(seg, 20):
            return bad("Zielgruppe ungültig")
        if not str_list(x.get("countries"), LIMITS["list"]) or not str_list(x.get("status"), LIMITS["list"]):
            return bad("Länder/Status ungültig")
        size = x.get("size")
        if isinstance(size, bool) or size not in (1000, 2000, 5000):
            return bad("Stichprobe ungültig")
        return {**b, "kind": "quelle", "source": x["source"], "segment": seg or None, "countries": list(x["countries"]),
                "status": list(x["status"]), "size": int(size)}
    if kind == "filter":
        if x.get("mode") not in ("alle", "eine"):
            return bad("Modus ungültig")
        conds = x.get("conds")
        if not isinstance(conds, list) or len(conds) > LIMITS["conds"]:
            return bad(f"höchstens {LIMITS['conds']} Bedingungen")
        parsed = [_parse_cond(c, f"{w}/{j + 1}", errs) for j, c in enumerate(conds)]
        return {**b, "kind": "filter", "mode": x["mode"], "conds": parsed} if all(p is not None for p in parsed) else None
    if kind == "weiche":
        if x.get("cond") is None:
            return {**b, "kind": "weiche", "cond": None}
        cond = _parse_cond(x["cond"], w, errs)
        return {**b, "kind": "weiche", "cond": cond} if cond else None
    if kind == "punkte":
        rules = x.get("rules")
        if not isinstance(rules, list) or len(rules) > LIMITS["rules"]:
            return bad(f"höchstens {LIMITS['rules']} Regeln")
        mn = x.get("min")
        if mn is not None and not _is_num(mn):
            return bad("Mindestwert ungültig")
        out = []
        for j, r in enumerate(rules):
            if not isinstance(r, dict) or not _is_num(r.get("pts")):
                return bad(f"Regel {j + 1}: Punkte ungültig")
            cond = _parse_cond(r.get("cond"), f"{w}/{j + 1}", errs)
            if not cond:
                return None
            out.append({"cond": cond, "pts": r["pts"]})
        return {**b, "kind": "punkte", "rules": out, "min": mn if _is_num(mn) else None}
    if kind == "top":
        if x.get("sort") not in SORTS:
            return bad("Sortierung ungültig")
        if not _is_num(x.get("n")):
            return bad("Anzahl ungültig")
        return {**b, "kind": "top", "sort": x["sort"], "n": x["n"]}
    if kind == "dubletten":
        if x.get("by") not in ("firma_id", "name"):
            return bad("Dubletten-Art ungültig")
        return {**b, "kind": "dubletten", "by": x["by"]}
    if kind == "statistik":
        if not _is_str(x.get("by"), 40) or not x.get("by"):
            return bad("Feld ungültig")
        return {**b, "kind": "statistik", "by": x["by"]}
    if kind == "pipeline":
        if not _is_str(x.get("name")):
            return bad("Name ungültig")
        return {**b, "kind": "pipeline", "name": x["name"]}
    if kind == "agent":
        if not _is_num(x.get("agent")):
            return bad("Agent ungültig")
        if x.get("task") not in TASKS:
            return bad("Auftragsart ungültig")
        return {**b, "kind": "agent", "agent": x["agent"], "task": x["task"]}
    if kind == "speicher":
        pid = x.get("pool_id")
        if pid is not None and not (isinstance(pid, str) and UUID_RE.fullmatch(pid)):
            return bad("Speicher ungültig")
        if not _is_str(x.get("pool_name"), LIMITS["pool"]):
            return bad("Speicher-Name ungültig")
        return {**b, "kind": "speicher", "pool_id": None if pid is None else pid.lower(), "pool_name": x["pool_name"]}
    return {**b, "kind": kind}  # freigabe, export, melden


def parse_flow(x) -> tuple[dict | None, list[str]]:
    """Wie parseFlow(): (Flow, []) oder (None, Fehler)."""
    if not isinstance(x, dict) or x.get("v") != 1 or isinstance(x.get("v"), bool):
        return None, ["kein Flow (v: 1 fehlt)"]
    nodes_in, edges_in = x.get("nodes"), x.get("edges")
    if not isinstance(nodes_in, list) or not isinstance(edges_in, list):
        return None, ["nodes/edges fehlen"]
    if len(nodes_in) > LIMITS["nodes"]:
        return None, [f"höchstens {LIMITS['nodes']} Bausteine"]
    if len(edges_in) > LIMITS["edges"]:
        return None, [f"höchstens {LIMITS['edges']} Verbindungen"]
    errs: list[str] = []
    nodes = [n for n in (_parse_node(n, i, errs) for i, n in enumerate(nodes_in)) if n is not None]
    ids: set[str] = set()
    for n in nodes:
        if n["id"] in ids:
            errs.append(f"id doppelt: {n['id']}")
        ids.add(n["id"])
    edges, eids = [], set()
    for i, e in enumerate(edges_in):
        w = f"Verbindung {i + 1}"
        if not isinstance(e, dict) or not isinstance(e.get("id"), str) or not ID_RE.fullmatch(e["id"]):
            errs.append(f"{w}: id ungültig")
            continue
        if e["id"] in eids:
            errs.append(f"Verbindung doppelt: {e['id']}")
            continue
        eids.add(e["id"])
        a, z = e.get("from"), e.get("to")
        if not (isinstance(a, str) and ID_RE.fullmatch(a) and isinstance(z, str) and ID_RE.fullmatch(z)):
            errs.append(f"{w}: Enden ungültig")
            continue
        if e.get("port") not in ("out", "ja", "nein"):
            errs.append(f"{w}: Anschluss ungültig")
            continue
        edges.append({"id": e["id"], "from": a, "port": e["port"], "to": z})
    return (None, errs) if errs else ({"v": 1, "nodes": nodes, "edges": edges}, [])


# ------------------------------------------------------------------------------------------- Fachliche Prüfung
def cond_problem(c: dict, source: str | None) -> str | None:
    fd = FIELDS.get(c.get("f"))
    if fd is None:
        return f"Feld unbekannt: {c.get('f')}"
    label = FIELD_LABELS.get(c["f"], c["f"])
    ftype, sources, _gate = fd
    if source and source not in sources:
        return f"„{label}“ gibt es bei {'Leads' if source == 'leads' else 'Käufern'} nicht"
    if c.get("op") not in ARITY[ftype]:
        return f"„{c.get('op')}“ passt nicht zu „{label}“"
    arity, v = ARITY[ftype][c["op"]], c.get("v")
    if arity == 1:
        if ftype == "num":
            return None if _is_num(v) else f"{label}: Zahl fehlt"
        if not _is_str(v):
            return f"{label}: Wert fehlt"
        if ftype == "enum" and v.strip(WS) == "":
            return f"{label}: Wert wählen"
    if arity == "list" and not (isinstance(v, list) and 1 <= len(v) <= LIMITS["list"]
                                and all(_is_str(s) and s != "" for s in v)):
        return f"{label}: 1–{LIMITS['list']} Werte wählen"
    if arity == 2 and not (isinstance(v, list) and len(v) == 2 and all(_is_num(e) for e in v)):
        return f"{label}: zwei Zahlen nötig"
    return None


def _node_conds(n: dict) -> list[dict]:
    k = n["kind"]
    if k == "filter":
        return n["conds"]
    if k == "weiche":
        return [n["cond"]] if n.get("cond") else []
    if k == "punkte":
        return [r["cond"] for r in n["rules"]]
    return []


def _graph(flow: dict):
    by_id: dict[str, dict] = {}
    for n in flow["nodes"]:
        by_id.setdefault(n["id"], n)
    edges = [e for e in flow["edges"] if e["from"] in by_id and e["to"] in by_id
             and e["port"] in NODE_META[by_id[e["from"]]["kind"]][1] and NODE_META[by_id[e["to"]]["kind"]][2]]
    quelle = next((n for n in flow["nodes"] if n["kind"] == "quelle"), None)
    return by_id, edges, quelle


def _reachable(edges: list[dict], start: str, down: bool) -> set[str]:
    seen, todo = {start}, [start]
    while todo:
        cur = todo.pop()
        for e in edges:
            a, b = (e["from"], e["to"]) if down else (e["to"], e["from"])
            if a == cur and b not in seen:
                seen.add(b)
                todo.append(b)
    return seen


def problems(flow: dict, kind: str = "test") -> list[dict]:  # noqa: C901 - Spiegel von problems() in flow.ts
    """Fehler (blockieren Speichern/Übernehmen) und Hinweise, Reihenfolge und Wortlaut wie problems() in flow.ts."""
    out: list[dict] = []

    def err(msg: str, nid: str | None = None):
        out.append({"nodeId": nid, "msg": msg, "level": "error"})

    def warn(msg: str, nid: str | None = None):
        out.append({"nodeId": nid, "msg": msg, "level": "warn"})

    nodes, edges_all = flow["nodes"], flow["edges"]
    if len(nodes) > LIMITS["nodes"]:
        err(f"höchstens {LIMITS['nodes']} Bausteine")
    if len(edges_all) > LIMITS["edges"]:
        err(f"höchstens {LIMITS['edges']} Verbindungen")
    quellen = [n for n in nodes if n["kind"] == "quelle"]
    if len(quellen) != 1:
        err("nur eine Quelle erlaubt" if quellen else "Quelle fehlt", quellen[1]["id"] if len(quellen) > 1 else None)
    source = quellen[0]["source"] if quellen else None
    pipes = [n for n in nodes if n["kind"] == "pipeline"]
    if len(pipes) > 1:
        err("nur ein Pipeline-Baustein erlaubt", pipes[1]["id"])
    if pipes and source == "kaeufer":
        err("Pipeline gilt nur für Leads, nicht für Käufer", pipes[0]["id"])
    if kind == "master" and not any(n["kind"] == "freigabe" for n in nodes):
        warn("Freigabe läuft trotzdem immer (feste Regel)")
    seen: set[str] = set()
    for n in nodes:
        if n["id"] in seen:
            err(f"id doppelt: {n['id']}", n["id"])
        seen.add(n["id"])

    by_id0 = {n["id"]: n for n in reversed(nodes)}  # Map(…) in TS: letzter gewinnt
    for e in edges_all:
        a, b = by_id0.get(e["from"]), by_id0.get(e["to"])
        if not a or not b:
            err("Verbindung zu unbekanntem Baustein", (a or b or {}).get("id"))
            continue
        label, ports, _inp, _grp = NODE_META[a["kind"]]
        if not ports:
            err(f"{label} ist ein Ziel und hat keinen Ausgang", a["id"])
        elif e["port"] not in ports:
            err("falscher Anschluss", a["id"])
        if b["kind"] == "quelle":
            err("in eine Quelle führt nichts hinein", b["id"])

    by_id, edges, quelle = _graph(flow)
    indeg = {nid: 0 for nid in by_id}
    for e in edges:
        indeg[e["to"]] += 1
    todo = [nid for nid, d in indeg.items() if d == 0]
    done = 0
    while todo:
        nid = todo.pop()
        done += 1
        for e in edges:
            if e["from"] == nid:
                indeg[e["to"]] -= 1
                if indeg[e["to"]] == 0:
                    todo.append(e["to"])
    if done < len(by_id):
        err("Kreis im Ablauf – Verbindungen dürfen nicht zurückführen", next((k for k, d in indeg.items() if d > 0), None))

    reach = _reachable(edges, quelle["id"], True) if quelle else set()
    to_pipe = _reachable(edges, pipes[0]["id"], False) if pipes else set()
    outgoing = {e["from"] for e in edges}
    incoming = {e["to"] for e in edges}

    def too_long(s, mx: int, what: str, nid: str):
        if isinstance(s, str) and _jslen(s) > mx:
            err(f"{what}: höchstens {mx} Zeichen", nid)

    src_word = "Leads" if source == "leads" else "Käufern"
    for n in nodes:
        k, nid = n["kind"], n["id"]
        label, _ports, _inp, group = NODE_META[k]
        too_long(n.get("title"), LIMITS["title"], "Titel", nid)
        for c in _node_conds(n):
            p = cond_problem(c, source)
            if p:
                err(p, nid)
            if isinstance(c.get("v"), str):
                too_long(c["v"], LIMITS["str"], "Wert", nid)
            if isinstance(c.get("v"), list) and len(c["v"]) > LIMITS["list"]:
                err(f"höchstens {LIMITS['list']} Werte", nid)
            fd = FIELDS.get(c.get("f"))
            if fd and not fd[2] and nid in to_pipe:
                err(f"„{FIELD_LABELS.get(c['f'], c['f'])}“ darf nicht auf dem Weg zur Pipeline stehen", nid)
        if k == "quelle":
            if len(n["countries"]) > LIMITS["list"] or len(n["status"]) > LIMITS["list"]:
                err(f"höchstens {LIMITS['list']} Werte", nid)
        elif k == "filter":
            if len(n["conds"]) > LIMITS["conds"]:
                err(f"höchstens {LIMITS['conds']} Bedingungen", nid)
            if not n["conds"]:
                warn("Filter ohne Bedingung lässt alles durch", nid)
        elif k == "weiche":
            if not n.get("cond"):
                warn("Weiche ohne Bedingung – alles geht nach „ja“", nid)
        elif k == "punkte":
            if len(n["rules"]) > LIMITS["rules"]:
                err(f"höchstens {LIMITS['rules']} Regeln", nid)
            if any(not _is_int(r["pts"]) or abs(r["pts"]) > LIMITS["pts"] for r in n["rules"]):
                err(f"Punkte: ganze Zahl −{LIMITS['pts']} bis {LIMITS['pts']}", nid)
            if n.get("min") is not None and (not _is_int(n["min"]) or abs(n["min"]) > LIMITS["min"]):
                err("Mindestwert: ganze Zahl", nid)
        elif k == "top":
            if not _is_int(n["n"]) or n["n"] < 1 or n["n"] > LIMITS["n"]:
                err(f"Anzahl 1 bis {LIMITS['n']}", nid)
            if n["sort"] == "dringlichkeit" and source == "kaeufer":
                warn("Käufer haben keine Dringlichkeit", nid)
        elif k == "dubletten":
            if n["by"] == "firma_id" and source == "kaeufer":
                warn("Käufer haben keine Firmen-ID – nach Name prüfen", nid)
        elif k == "statistik":
            fd = FIELDS.get(n["by"])
            if not fd:
                err(f"Feld unbekannt: {n['by']}", nid)
            elif source and source not in fd[1]:
                err(f"„{FIELD_LABELS.get(n['by'], n['by'])}“ gibt es bei {src_word} nicht", nid)
        elif k == "pipeline":
            if len(n["name"].strip(WS)) < 1 or _jslen(n["name"]) > LIMITS["name"]:
                err(f"Name: 1 bis {LIMITS['name']} Zeichen", nid)
        elif k == "agent":
            if not _is_int(n["agent"]) or n["agent"] < 1 or n["agent"] > AGENT_COUNT:
                err(f"Agent 1 bis {AGENT_COUNT}", nid)
        elif k == "speicher":
            if source == "kaeufer":
                err("Speicher nur für Leads, nicht für Käufer", nid)
            pid = n.get("pool_id")
            if pid is not None and not UUID_RE.fullmatch(pid):
                err("Speicher ungültig", nid)
            if pid is not None and (len(n["pool_name"].strip(WS)) < 1 or _jslen(n["pool_name"]) > LIMITS["pool"]):
                err(f"Speicher-Name: 1 bis {LIMITS['pool']} Zeichen", nid)
            if pid is None:
                warn(f"{GESAMTBESTAND} – Speicher wählen, sonst ändert sich nichts", nid)
            elif kind == "test":
                warn("füllt sich nur in Master-Pipeline oder Agent – hier Vorschau", nid)
        elif k == "melden":
            if kind != "agent":
                warn("meldet nur in einem Agenten – hier Vorschau", nid)
        if k in ("top", "dubletten") and nid in to_pipe:
            err(f"{label} entscheidet nach der ganzen Menge – nicht auf dem Weg zur Pipeline", nid)
        if k == "quelle":
            if nid not in outgoing:
                warn("Quelle ist mit nichts verbunden", nid)
            continue
        if group == "ziel" and nid not in incoming:
            warn(f"{label} hat keinen Eingang", nid)
            continue
        if quelle and nid not in reach:
            warn("nicht mit der Quelle verbunden", nid)
        elif group == "schritt" and nid not in outgoing:
            warn("Sackgasse – Ausgang verbinden", nid)
    return out


def errors(flow: dict, kind: str = "test") -> list[str]:
    return [p["msg"] for p in problems(flow, kind) if p["level"] == "error"]
