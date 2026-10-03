"""Stufe 4 der Freigabe – Inhaber-Regeln aus dem Baukasten (Inhaber 03.10.2026: „wenn es mir gefällt, hänge ich es an
die große Pipeline, die dann bei allen neuen Leads genutzt wird“).

Ein Flow (signalwerk.flows, Status 'aktiv') mit Quelle „leads“ und einem Pipeline-Baustein ist eine Regel: jeder Lead im
Bereich der Quelle (Zielgruppe, Länder) muss den Pipeline-Baustein erreichen, sonst fällt er in Stufe 4 durch
(Grund „regel:xxxxxxxx“ = erste 8 Zeichen der Flow-ID). Regeln machen die Freigabe nur strenger: sie können nichts
freigeben, was Stufe 1–3 zurückhalten, und schalten keine Prüfung, Sperre oder Abmeldung ab.

Die Bedingungs- und Graph-Semantik ist identisch mit app/lib/flow.ts (evalCond, reaches, inScope, pipelineCheck) –
hier nur je Lead (kein top/dubletten über Mengen). Der Python-Teil vertraut der gespeicherten Definition nie blind:
unbekannte Bausteine, Felder oder Operatoren ergeben False; enthält der Weg zur Pipeline so etwas (oder ein Feld, das
für die Pipeline nicht taugt, oder top/dubletten), gilt die Regel als defekt und hält jeden Lead in ihrem Bereich zurück.
Rücknahme: flow_release_held(flow) gibt die zurückgehaltenen Leads einer Regel wieder frei (Status 'new').
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import unicodedata

# key -> (Typ, Quellen, für die Pipeline nutzbar) – wie FIELDS in app/lib/flow.ts
FIELDS: dict[str, tuple[str, tuple[str, ...], bool]] = {
    "land": ("enum", ("leads", "kaeufer"), True),
    "segment": ("enum", ("leads", "kaeufer"), True),
    "signal": ("enum", ("leads",), True),
    "dringlichkeit": ("enum", ("leads",), True),
    "status": ("enum", ("leads",), False),
    "quelle": ("text", ("leads",), True),
    "alter_tage": ("num", ("leads", "kaeufer"), True),
    "erfasst_tage": ("num", ("leads",), True),
    "firma": ("text", ("leads", "kaeufer"), True),
    "rechtsform": ("text", ("leads", "kaeufer"), True),
    "ort": ("text", ("leads",), True),
    "region": ("text", ("leads", "kaeufer"), True),
    "branche": ("text", ("leads",), True),
    "text": ("text", ("leads",), True),
    "hat_website": ("bool", ("leads", "kaeufer"), True),
    "hat_telefon": ("bool", ("leads", "kaeufer"), True),
    "telefon_art": ("enum", ("leads",), True),
    "hat_email": ("bool", ("leads", "kaeufer"), True),
    "email_art": ("enum", ("leads",), True),
    "hat_person": ("bool", ("leads",), True),
    "rolle": ("text", ("leads",), True),
    "vollstaendig": ("bool", ("leads",), True),
    "geprueft": ("enum", ("leads",), False),
    "punkte": ("num", ("leads", "kaeufer"), True),
    "email_generisch": ("bool", ("kaeufer",), False),
    "pruefung": ("enum", ("kaeufer",), False),
    "grund": ("text", ("kaeufer",), False),
    "spezialisierung": ("text", ("kaeufer",), False),
    "angeschrieben": ("bool", ("kaeufer",), False),
}
OPS: dict[str, set[str]] = {
    "enum": {"ist", "ist_nicht", "in", "nicht_in"},
    "text": {"enthaelt", "enthaelt_nicht", "ist", "ist_nicht", "beginnt", "vorhanden", "fehlt"},
    "num": {"gt", "gte", "lt", "lte", "ist", "zwischen"},
    "bool": {"ja", "nein"},
}
OUT_PORTS = {"quelle": ("out",), "filter": ("out",), "punkte": ("out",), "top": ("out",), "dubletten": ("out",),
             "statistik": ("out",), "weiche": ("ja", "nein"), "pipeline": (), "export": (), "agent": ()}
SINKS = {"pipeline", "export", "agent"}
COND_NODES = {"filter", "weiche", "punkte"}

_warned: set[str] = set()


def _warn(msg: str, log=print) -> None:
    if msg not in _warned:
        _warned.add(msg)
        log(f"Inhaber-Regeln: {msg}")


# ---------------------------------------------------------------------------- Bedingungen
def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    return re.sub("[̀-ͯ]", "", s).lower().strip()


def missing(x) -> bool:
    return x is None or (isinstance(x, str) and x.strip() == "")


def _sv(v) -> str:
    """String(v) wie in TS (None -> "")."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _num(v) -> float | None:
    if isinstance(v, bool):
        return float(v)
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def eval_cond(cond, row: dict) -> bool:
    if not isinstance(cond, dict):
        return False
    fd = FIELDS.get(cond.get("f")) if isinstance(cond.get("f"), str) else None
    op = cond.get("op")
    if fd is None or op not in OPS[fd[0]]:
        return False
    typ, x, v = fd[0], row.get(cond["f"]), cond.get("v")
    if typ == "bool":
        return (x is True) if op == "ja" else (x is not True)
    if typ == "enum":
        if op in ("in", "nicht_in"):
            if not isinstance(v, list):
                return False
            vals = [_sv(e) for e in v]
            return (not missing(x) and _sv(x) in vals) if op == "in" else (missing(x) or _sv(x) not in vals)
        hit = not missing(x) and _sv(x) == _sv(v)
        return hit if op == "ist" else not hit
    if typ == "text":
        if op == "vorhanden":
            return not missing(x)
        if op == "fehlt":
            return missing(x)
        if op in ("enthaelt", "enthaelt_nicht"):
            nv = norm(_sv(v))
            hit = not missing(x) and (nv == "" or nv in norm(_sv(x)))
            return hit if op == "enthaelt" else not hit
        if op in ("ist", "ist_nicht"):
            hit = not missing(x) and norm(_sv(x)) == norm(_sv(v))
            return hit if op == "ist" else not hit
        return not missing(x) and norm(_sv(x)).startswith(norm(_sv(v)))  # beginnt
    # num
    if not _finite(x):
        return False
    if op == "zwischen":
        if not isinstance(v, list) or len(v) != 2:
            return False
        a, b = _num(v[0]), _num(v[1])
        return a is not None and b is not None and a <= x <= b
    n = _num(v)
    if n is None:
        return False
    return {"gt": x > n, "gte": x >= n, "lt": x < n, "lte": x <= n, "ist": x == n}[op]


# ---------------------------------------------------------------------------- Graph (je Lead)
def _nodes(flow: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for n in flow.get("nodes") or [] if isinstance(flow, dict) else []:
        if isinstance(n, dict) and isinstance(n.get("id"), str) and n["id"] not in out:
            out[n["id"]] = n
    return out


def _quelle(flow: dict) -> dict | None:
    qs = [n for n in _nodes(flow).values() if n.get("kind") == "quelle"]
    return qs[0] if len(qs) == 1 else None


def _edges(flow: dict, nodes: dict[str, dict]) -> list[tuple[str, str, str]]:
    """Gültige Kanten (von, Port, nach); falsche Ports, Senken als Start und Kanten in die Quelle tragen nichts."""
    out = []
    for e in flow.get("edges") or [] if isinstance(flow, dict) else []:
        if not isinstance(e, dict):
            continue
        a, b, port = nodes.get(e.get("from")), nodes.get(e.get("to")), e.get("port")
        if a is None or b is None or b.get("kind") == "quelle":
            continue
        if port in OUT_PORTS.get(a.get("kind"), ()):
            out.append((a["id"], port, b["id"]))
    return out


def _order(flow: dict) -> tuple[dict[str, dict], list[tuple[str, str, str]], list[str]] | None:
    """Knoten, Kanten und topologische Reihenfolge ab der Quelle; None bei fehlender/mehrfacher Quelle oder Zyklus."""
    nodes = _nodes(flow)
    q = _quelle(flow)
    if q is None:
        return None
    edges = _edges(flow, nodes)
    seen, stack = {q["id"]}, [q["id"]]
    while stack:
        cur = stack.pop()
        for a, _, b in edges:
            if a == cur and b not in seen:
                seen.add(b)
                stack.append(b)
    sub = [(a, p, b) for a, p, b in edges if a in seen]
    indeg = {n: 0 for n in seen}
    for _, _, b in sub:
        indeg[b] += 1
    ready = [n for n in nodes if n in seen and indeg[n] == 0]
    order: list[str] = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for a, _, b in sub:
            if a == cur:
                indeg[b] -= 1
                if indeg[b] == 0:
                    ready.append(b)
    if len(order) != len(seen):
        return None  # Zyklus
    return nodes, sub, order


def _process(node: dict, r: dict) -> dict[str, dict]:
    kind = node.get("kind")
    if kind in ("quelle", "statistik", "dubletten"):
        return {"out": r}
    if kind == "filter":
        conds = node.get("conds")
        if not isinstance(conds, list):
            return {}
        if not conds:
            return {"out": r}
        mode = node.get("mode")
        if mode == "alle":
            ok = all(eval_cond(c, r) for c in conds)
        elif mode == "eine":
            ok = any(eval_cond(c, r) for c in conds)
        else:
            ok = False
        return {"out": r} if ok else {}
    if kind == "weiche":
        c = node.get("cond")
        return {"ja": r} if c is None or eval_cond(c, r) else {"nein": r}
    if kind == "punkte":
        p = r.get("punkte") if _finite(r.get("punkte")) else 0
        for rule in node.get("rules") or []:
            if isinstance(rule, dict) and _finite(rule.get("pts")) and eval_cond(rule.get("cond"), r):
                p += rule["pts"]
        r = {**r, "punkte": p}
        mn = node.get("min")
        if mn is None:
            return {"out": r}
        return {"out": r} if _finite(mn) and p >= mn else {}
    if kind == "top":
        n = node.get("n")
        return {"out": r} if _finite(n) and n >= 1 else {}
    return {}  # Senken und Unbekanntes geben nichts weiter


def walk(flow: dict, row: dict) -> set[str]:
    """IDs aller Bausteine, bei denen dieser eine Lead ankommt (Quelle eingeschlossen)."""
    o = _order(flow)
    if o is None:
        return set()
    nodes, edges, order = o
    inbox: dict[str, list[dict]] = {order[0]: [dict(row)]} if order else {}
    got: set[str] = set()
    for nid in order:
        arr = inbox.get(nid)
        if not arr:
            continue
        got.add(nid)
        r = dict(arr[0])
        pts = [a.get("punkte") for a in arr if _finite(a.get("punkte"))]
        if pts:
            r["punkte"] = max(pts)
        outs = _process(nodes[nid], r)
        for a, port, b in edges:
            if a == nid and port in outs:
                inbox.setdefault(b, []).append(outs[port])
    return got


def reaches(flow: dict, row: dict, target_id: str) -> bool:
    return target_id in walk(flow, row)


def pipeline_node(flow: dict) -> dict | None:
    return next((n for n in _nodes(flow).values() if n.get("kind") == "pipeline"), None)


def in_scope(flow: dict, row: dict) -> bool:
    q = _quelle(flow)
    if q is None or q.get("source") != "leads":
        return False
    seg = q.get("segment")
    countries = q.get("countries") if isinstance(q.get("countries"), list) else []
    return (not seg or row.get("segment") == seg) and (not countries or row.get("land") in countries)


def pipeline_check(flow: dict, row: dict) -> bool:
    if not in_scope(flow, row):
        return True
    p = pipeline_node(flow)
    return p is not None and reaches(flow, row, p["id"])


def rule_tag(flow_id: str) -> str:
    return "s4:regel:" + str(flow_id)[:8].lower()


# ---------------------------------------------------------------------------- Zeile aus einem Freigabe-Lead
def _s(v):
    """Wert wie jsonb ->> bzw. Textspalte: None bleibt None, Skalare als Text."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _filled(v) -> bool:
    return v is not None and str(v).strip() != ""


def _day(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def flat_row(item: dict, today: dt.date, lead_check: dict | None = None) -> dict:
    """Lead-Zeile mit genau den Feldern des Baukastens (wie signalwerk.flow_lead_rows) aus einem release_gate-Item."""
    co = item.get("company") or {}
    ct = item.get("contact_raw") if "contact_raw" in item else item.get("contact")
    pp = item.get("person_raw") if "person_raw" in item else item.get("person")
    qu = item.get("quality_raw") if "quality_raw" in item else {}
    ct, pp, qu = ct if isinstance(ct, dict) else {}, pp if isinstance(pp, dict) else {}, qu if isinstance(qu, dict) else {}
    created = _day(item.get("created_at"))
    base = _day(item.get("event_date")) or _day(item.get("source_date")) or created
    res = (lead_check or {}).get("result")
    return {
        "id": str(item.get("id")), "cid": _s(item.get("company_id")),
        "land": _s(item.get("country")), "segment": _s(item.get("segment_id")), "signal": _s(item.get("signal_type")),
        "dringlichkeit": _s(item.get("urgency")), "status": _s(item.get("status")), "quelle": _s(item.get("source_name")),
        "alter_tage": (today - base).days if base else None,
        "erfasst_tage": (today - created).days if created else None,
        "firma": _s(co.get("name")), "rechtsform": _s(co.get("legal_form")), "ort": _s(co.get("city")),
        "region": _s(co.get("region")), "branche": _s(co.get("industry")), "text": _s(item.get("event_summary")),
        "hat_website": _filled(co.get("website")),
        "hat_telefon": _filled(co.get("phone_main")) or _filled(ct.get("phone")),
        "telefon_art": _s(ct.get("phone_type")),
        "hat_email": _filled(ct.get("email")),
        "email_art": _s(ct.get("email_type")),
        "hat_person": _filled(pp.get("name")),
        "rolle": _s(pp.get("role")),
        "vollstaendig": (_s(qu.get("complete")) or "").lower() == "true",
        "geprueft": res if res in ("released", "failed") else None,
    }


# ---------------------------------------------------------------------------- Regeln laden und anwenden
def _cond_ok(c) -> str | None:
    """None = Bedingung taugt für die Pipeline; sonst Grund."""
    if not isinstance(c, dict) or not isinstance(c.get("f"), str):
        return "bedingung_ungueltig"
    fd = FIELDS.get(c["f"])
    if fd is None or "leads" not in fd[1]:
        return f"feld_unbekannt:{c['f']}"
    if not fd[2]:
        return f"feld_nicht_fuer_pipeline:{c['f']}"
    if c.get("op") not in OPS[fd[0]]:
        return f"operator_unbekannt:{c.get('op')}"
    return None


def broken_reason(flow: dict) -> str | None:
    """Prüft den Weg zur Pipeline: alles, was dort zweifelhaft ist, macht die Regel defekt (= strenger)."""
    if not isinstance(flow, dict):
        return "definition_ungueltig"
    q, p = _quelle(flow), pipeline_node(flow)
    if q is None or p is None:
        return "quelle_oder_pipeline_fehlt"
    if q.get("source") != "leads":
        return "quelle_nicht_leads"
    o = _order(flow)
    if o is None:
        return "zyklus"
    nodes, edges, order = o
    to_p, stack = {p["id"]}, [p["id"]]  # Bausteine, von denen aus die Pipeline erreichbar ist
    while stack:
        cur = stack.pop()
        for a, _, b in edges:
            if b == cur and a not in to_p:
                to_p.add(a)
                stack.append(a)
    for nid in order:
        if nid not in to_p:
            continue
        n = nodes[nid]
        kind = n.get("kind")
        if kind not in OUT_PORTS:
            return f"baustein_unbekannt:{kind}"
        if kind in ("top", "dubletten"):
            return f"mengen_baustein_vor_pipeline:{kind}"
        conds = []
        if kind == "filter":
            if n.get("mode") not in ("alle", "eine") or not isinstance(n.get("conds"), list):
                return "filter_ungueltig"
            conds = n["conds"]
        elif kind == "weiche" and n.get("cond") is not None:
            conds = [n["cond"]]
        elif kind == "punkte":
            rules = n.get("rules")
            if not isinstance(rules, list) or not all(isinstance(r, dict) and _finite(r.get("pts")) for r in rules):
                return "punkte_ungueltig"
            if n.get("min") is not None and not _finite(n.get("min")):
                return "punkte_ungueltig"
            conds = [r.get("cond") for r in rules]
        for c in conds:
            why = _cond_ok(c)
            if why:
                return why
    return None


def load_rules(db, log=print) -> list[dict]:
    """Aktive Flows mit Pipeline-Baustein und Quelle „leads“. Fehlt die Tabelle (noch), gibt es keine Regeln;
    jeder andere Fehler wird weitergereicht (lieber kein Lauf als eine übergangene Regel)."""
    try:
        rows = db.select("flows", {"status": "eq.aktiv", "select": "id,name,def", "order": "id"})
    except RuntimeError as exc:
        if "PGRST205" in str(exc) or "42P01" in str(exc):
            return []
        raise
    out = []
    for r in rows or []:
        d = r.get("def")
        if isinstance(d, str):
            try:
                d = json.loads(d)
            except ValueError:
                d = None
        q = _quelle(d) if isinstance(d, dict) else None
        if q is None or q.get("source") != "leads" or pipeline_node(d) is None:
            continue
        why = broken_reason(d)
        if why:
            _warn(f"Regel „{r.get('name')}“ ({str(r.get('id'))[:8]}) defekt ({why}) – hält alle Leads ihres Bereichs zurück", log)
        out.append({"id": str(r.get("id")), "name": r.get("name") or "", "flow": d, "broken": why})
    return sorted(out, key=lambda x: x["id"])


def check(rules: list[dict], item: dict, today: dt.date, log=print) -> list[str]:
    """Gründe „regel:xxxxxxxx“ für jede aktive Regel, die dieser Lead nicht besteht (leer = alle bestanden)."""
    if not rules:
        return []
    row = flat_row(item, today)
    out = []
    for rule in rules:
        flow = rule.get("flow")
        try:
            if not in_scope(flow, row):
                continue
            ok = not rule.get("broken") and pipeline_check(flow, row)
        except Exception as exc:  # noqa: BLE001 - im Zweifel zurückhalten
            _warn(f"Regel {str(rule.get('id'))[:8]} nicht auswertbar: {type(exc).__name__}", log)
            ok = False
        if not ok:
            out.append(rule_tag(rule.get("id") or "").split(":", 1)[1])
    return out
