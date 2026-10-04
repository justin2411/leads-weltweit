#!/usr/bin/env python3
"""Eigene Agenten aus dem Baukasten ausführen (docs/BAUKASTEN-MASTER.md, Inhaber 04.10.2026: „mit dem baukasten eigene
agenten bauen und speichern, die dann für eine bestimmte sache immer angewendet werden“).

  python scripts/agents_run.py            # Probelauf: welche Agenten fällig sind und was sie täten
  python scripts/agents_run.py --apply    # fällige Agenten ausführen
  python scripts/agents_run.py --apply --agent <id>   # einen Agenten sofort (unabhängig vom Auslöser)

Auslöser (custom_agents.trigger): stuendlich | taeglich (at_hour, deutsche Zeit) | neue_leads (seit dem letzten Lauf
neue Leads im Bereich der Quelle). Zeilen über dieselben Datenbank-Funktionen wie der Baukasten (flow_lead_rows /
flow_buyer_rows), Ablauf wie runFlowRows (owner_rules.run_flow_rows). Ziele:
  speicher → lead_pool_items (added_by 'agent:<id8>', nur Leads)
  melden   → kurze Mail an den Inhaber (Anzahl + bis zu 10 Firmen) und Push aufs Handy
  agent    → Auftrag in agent_tasks (Agenten-Routine); ai_brief des Agenten ebenso (Markt aus ai_market, sonst aus
             dem Text oder der Quelle erkannt)
  export   → IDs (höchstens 5000) in agent_runs.result (Download im Dashboard)
  pipeline → wirkt nur als Stufe 4 eines aktiven Flows (release_gate), hier nichts
Jeder Lauf steht in agent_runs; custom_agents.last_run_at/last_result zeigen den letzten. Ein Fehler betrifft nur
diesen Agenten. NIE Versand an Käufer oder Leads, nie Sperrliste, Prüfregeln oder Freigabe ändern.
Pause im Dashboard: werke_paused „agenten“.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import owner_rules as R  # noqa: E402
from lib.pools import UUID_RE  # noqa: E402

BERLIN = ZoneInfo("Europe/Berlin")
PAGE = 1000
SIZES = (1000, 2000, 5000)
EXPORT_MAX = 5000
HOURLY_GAP_MIN = 50       # stündlich: frühestens nach so vielen Minuten wieder
DEFAULT_HOUR = 7          # täglich ohne Stunde: 7 Uhr deutscher Zeit
MARKETS = ("US", "UK", "FR", "IE", "NL", "BE", "SE")   # wie app/lib/agents.ts MARKETS
TASK_KINDS = ("leads", "kaeufer", "quelle", "pruefen", "frage")
AGENT_COUNT = 8           # Agenten des Inhabers A1–A8 (wie app/lib/agents.ts AGENT_COUNT; 9 = Kunden-Agenten)
BRIEF_MAX = 1000
SITE_PATH = "/dashboard/baukasten"

# Markt aus dem Text erkennen (Inhaber 04.10.2026: „er soll uk käufer finden – warum ist dann markt nicht direkt UK
# ausgewählt? … jarvis soll schlau sein“). Nur eindeutige Treffer zählen.
MARKET_WORDS = {
    "US": r"\b(us|usa|amerika\w*|vereinigte[n]? staaten|united states)\b",
    "UK": r"\b(uk|gb|großbritannien|grossbritannien|britisch\w*|england|united kingdom|vereinigte\w* königreich)\b",
    "FR": r"\b(fr|frankreich|französisch\w*|franzoesisch\w*|france)\b",
    "IE": r"\b(ie|irland|irisch\w*|ireland)\b",
    "NL": r"\b(nl|niederlande\w*|niederländisch\w*|holland|holländisch\w*|netherlands)\b",
    "BE": r"\b(be|belgien|belgisch\w*|belgium)\b",
    "SE": r"\b(se|schweden|schwedisch\w*|sweden)\b",
}
KIND_WORDS = (  # erste passende Art gewinnt
    ("kaeufer", r"käufer|kaeufer|kunden|agentur|abnehmer|buyer"),
    ("quelle", r"quelle|datenquelle|source"),
    ("pruefen", r"prüf|pruef|kontroll|stichprobe|check|qualität"),
    ("leads", r"\blead"),
)


def guess_market(text: str | None) -> str | None:
    """Genau ein Markt im Text → dieser, sonst None. „be“/„se“/„ie“/„us“ zählen nur in Großbuchstaben (deutsche/
    englische Wörter wie „uns“ sind ohnehin keine Treffer, aber „be“ ist ein englisches Wort)."""
    t = str(text or "")
    found = set()
    for m, pat in MARKET_WORDS.items():
        for hit in re.finditer(pat, t, re.I):
            w = hit.group(0)
            if len(w) == 2 and w.lower() in ("be", "se", "ie", "us", "fr", "gb", "nl") and w != w.upper():
                continue
            found.add(m)
    return found.pop() if len(found) == 1 else None


def guess_kind(text: str | None) -> str:
    t = str(text or "").lower()
    for kind, pat in KIND_WORDS:
        if re.search(pat, t):
            return kind
    return "frage"


# ---------------------------------------------------------------------------- Auslöser
def _ts(v) -> dt.datetime | None:
    if not v:
        return None
    try:
        d = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def due(agent: dict, now: dt.datetime, has_new=None) -> tuple[bool, str]:
    """(fällig?, Grund). has_new(agent) → bool nur für 'neue_leads' (Datenbankabfrage)."""
    last = _ts(agent.get("last_run_at"))
    trig = agent.get("trigger") or "taeglich"
    if trig == "stuendlich":
        if last and (now - last).total_seconds() / 60 < HOURLY_GAP_MIN:
            return False, "lief diese Stunde schon"
        return True, "stündlich"
    if trig == "taeglich":
        h = agent.get("at_hour")
        h = DEFAULT_HOUR if not isinstance(h, int) or not 0 <= h <= 23 else h
        local = now.astimezone(BERLIN)
        slot = local.replace(hour=h, minute=0, second=0, microsecond=0)
        if local < slot:
            return False, f"heute um {h:02d}:00 Uhr"
        if last and last >= slot.astimezone(dt.timezone.utc):
            return False, "heute schon gelaufen"
        return True, f"täglich {h:02d}:00 Uhr"
    if trig == "neue_leads":
        if last and (now - last).total_seconds() / 60 < HOURLY_GAP_MIN:
            return False, "lief diese Stunde schon"
        if last is None:
            return True, "erster Lauf"
        if has_new is not None and has_new(agent):
            return True, "neue Leads"
        return False, "keine neuen Leads"
    return False, f"Auslöser unbekannt: {trig}"


# ---------------------------------------------------------------------------- Flow und Zeilen
def parse_def(d):
    if isinstance(d, str):
        try:
            d = json.loads(d)
        except ValueError:
            return None
    return d if isinstance(d, dict) else None


def quelle(flow: dict) -> dict | None:
    qs = [n for n in flow.get("nodes") or [] if isinstance(n, dict) and n.get("kind") == "quelle"]
    return qs[0] if len(qs) == 1 and qs[0].get("source") in ("leads", "kaeufer") else None


def source_args(q: dict) -> dict:
    countries = [c for c in (q.get("countries") or []) if isinstance(c, str)] if isinstance(q.get("countries"), list) else []
    status = [s for s in (q.get("status") or []) if isinstance(s, str)] if isinstance(q.get("status"), list) else []
    size = q.get("size") if q.get("size") in SIZES else 1000
    return {"p_segment": q.get("segment") or None, "p_countries": countries, "p_status": status, "p_limit": size}


def load_rows(db, q: dict) -> list[dict]:
    """Zeilen der Quelle seitenweise (PostgREST liefert höchstens 1000 je Abruf), feste Reihenfolge wie flow-data.ts."""
    fn = "flow_lead_rows" if q["source"] == "leads" else "flow_buyer_rows"
    order = "erfasst_tage.asc,id.asc" if q["source"] == "leads" else "alter_tage.asc,id.asc"
    args = source_args(q)
    out, seen = [], set()
    for i in range((args["p_limit"] + PAGE - 1) // PAGE):
        page = db.rpc(fn, args, params={"order": order, "limit": str(PAGE), "offset": str(i * PAGE)}) or []
        for r in page:
            k = str(r.get("id"))
            if k not in seen:
                seen.add(k)
                out.append(r)
        if len(page) < PAGE:
            break
    return out[:args["p_limit"]]


def has_new_leads(db, agent: dict, flow: dict | None) -> bool:
    q = quelle(flow) if flow else None
    if not q or q["source"] != "leads":
        return False
    p = {"created_at": f"gt.{agent.get('last_run_at')}", "select": "id", "limit": "1"}
    if q.get("segment"):
        p["segment_id"] = f"eq.{q['segment']}"
    if isinstance(q.get("countries"), list) and q["countries"]:
        p["country"] = f"in.({','.join(q['countries'])})"
    return bool(db.select("leads", p))


# ---------------------------------------------------------------------------- Ziele
def id8(agent: dict) -> str:
    return str(agent.get("id") or "")[:8].lower()


def market_of(agent: dict, q: dict | None, text: str | None = None) -> str | None:
    """Markt eines Auftrags: ai_market, sonst genau ein Land der Quelle, sonst aus dem Text erkannt."""
    m = str(agent.get("ai_market") or "").strip().upper()
    if m in MARKETS:
        return m
    cs = q.get("countries") if q and isinstance(q.get("countries"), list) else []
    if len(cs) == 1 and cs[0] in MARKETS:
        return cs[0]
    return guess_market(text)


def brief_of(head: str, agent: dict, n_in: int, n_at: int) -> str:
    tail = f" – Agent „{agent.get('name') or id8(agent)}“: {n_in:,} Zeilen geprüft, {n_at:,} am Ziel".replace(",", ".")
    room = BRIEF_MAX - len(tail)
    head = re.sub(r"\s+", " ", head).strip()
    if len(head) > room:
        head = head[:max(0, room - 1)] + "…"
    return (head + tail).strip()[:BRIEF_MAX]


def open_task_exists(db, created_by: str) -> bool:
    """Noch offener/laufender Auftrag dieses Agenten → keinen zweiten anlegen (sonst stapeln sich stündliche)."""
    return bool(db.select("agent_tasks", {"created_by": f"eq.{created_by}", "status": "in.(offen,laeuft)",
                                          "select": "id", "limit": "1"}))


def notify_owner(subject: str, text: str, title: str, body: str, log=print) -> bool:
    """Mail an den Inhaber (Resend an die eigene Adresse, wie deliveries._notify_owner) + Push. Wirft nie."""
    try:
        from deliveries import _notify_owner
        _notify_owner(subject, text)
    except Exception as exc:  # noqa: BLE001 - Meldung darf den Lauf nicht abbrechen
        log(f"  Hinweis: Mail an den Inhaber fehlgeschlagen ({type(exc).__name__})")
        return False
    try:
        from lib.push import notify
        notify(title, body, SITE_PATH, "other")
    except Exception as exc:  # noqa: BLE001 - Push ist Zusatz
        log(f"  Hinweis: Push fehlgeschlagen ({type(exc).__name__})")
    return True


def run_agent(db, agent: dict, apply: bool, log=print) -> dict:
    """Einen Agenten ausführen. Rückgabe = Ergebnis (wie agent_runs.result)."""
    flows = db.select("flows", {"id": f"eq.{agent['flow_id']}", "select": "id,name,def,status,kind"}) or []
    if not flows or flows[0].get("status") == "archiv":
        raise RuntimeError("Flow fehlt oder archiviert")
    flow = parse_def(flows[0].get("def"))
    q = quelle(flow) if flow else None
    if q is None:
        raise RuntimeError("Flow ohne gültige Quelle")
    bad = sorted({str(n.get("kind")) for n in flow.get("nodes") or [] if isinstance(n, dict) and n.get("kind") not in R.OUT_PORTS})
    if bad:
        raise RuntimeError(f"Baustein unbekannt: {', '.join(bad)}")
    rows = load_rows(db, q)
    res = R.run_flow_rows(flow, rows)
    nodes = {str(n.get("id")): n for n in flow.get("nodes") or [] if isinstance(n, dict)}
    out: dict = {"rows_in": len(rows), "ziele": {}}
    tag = f"agent:{id8(agent)}"
    by = f"Agent {agent.get('name') or id8(agent)}"[:60]
    tasks: list[dict] = []
    for nid, n in nodes.items():
        r = res.get(nid) or {}
        if not r.get("connected"):
            continue
        got = r.get("in") or []
        kind = n.get("kind")
        if kind == "speicher":
            pid = str(n.get("pool_id") or "").lower()
            if q["source"] != "leads" or not UUID_RE.match(pid):
                out["ziele"][nid] = {"art": "speicher", "n": len(got), "neu": 0, "hinweis": "kein eigener Speicher"}
                continue
            if not db.select("lead_pools", {"id": f"eq.{pid}", "select": "id"}):
                out["ziele"][nid] = {"art": "speicher", "n": len(got), "neu": 0, "hinweis": "Speicher fehlt"}
                continue
            neu = 0
            if apply and got:
                from pools import write_items
                neu = write_items(db, {(pid, str(x["id"])) for x in got}, tag)
            out["ziele"][nid] = {"art": "speicher", "pool": pid, "n": len(got), "neu": neu}
        elif kind == "melden":
            names = [str(x.get("firma")) for x in got if x.get("firma")][:10]
            sent = False
            if apply and got:
                what = "Leads" if q["source"] == "leads" else "Käufer"
                text = (f"Agent „{agent.get('name')}“: {len(got)} {what}.\n\n" + "\n".join(f"- {x}" for x in names)
                        + ("\n…" if len(got) > len(names) else "") + "\n\nIm Baukasten ansehen: Dashboard › Baukasten")
                sent = notify_owner(f"[Leads] Agent {agent.get('name')}: {len(got)} {what}", text,
                                    f"Agent {agent.get('name')}"[:80], f"{len(got)} {what}: " + ", ".join(names[:3]), log)
            out["ziele"][nid] = {"art": "melden", "n": len(got), "firmen": names, "gesendet": sent}
        elif kind == "agent":
            num = n.get("agent") if isinstance(n.get("agent"), int) and 1 <= n["agent"] <= AGENT_COUNT else 1
            task_kind = n.get("task") if n.get("task") in TASK_KINDS else "frage"
            if got:
                head = f"Baukasten „{flows[0].get('name') or ''}“: {len(got)} Zeilen am Agent-Baustein"
                tasks.append({"agent": num, "kind": task_kind, "market": market_of(agent, q),
                              "brief": brief_of(head, agent, len(rows), len(got)), "created_by": by})
            out["ziele"][nid] = {"art": "agent", "n": len(got)}
        elif kind == "export":
            out["ziele"][nid] = {"art": "export", "n": len(got), "ids": [str(x["id"]) for x in got[:EXPORT_MAX]]}
        elif kind == "pipeline":
            out["ziele"][nid] = {"art": "pipeline", "n": len(got)}
    brief = str(agent.get("ai_brief") or "").strip()
    if brief:
        first = next((n for n in nodes.values() if n.get("kind") == "agent"), None)
        at = sum(v.get("n", 0) for v in out["ziele"].values())
        tasks.append({"agent": first["agent"] if first and isinstance(first.get("agent"), int) and 1 <= first["agent"] <= AGENT_COUNT else 1,
                      "kind": first["task"] if first and first.get("task") in TASK_KINDS else guess_kind(brief),
                      "market": market_of(agent, q, brief), "brief": brief_of(brief, agent, len(rows), at), "created_by": by})
    out["auftraege"] = 0
    if tasks:
        if apply and open_task_exists(db, by):
            out["auftraege_hinweis"] = "letzter Auftrag noch offen"
        else:
            for t in tasks[:3]:  # höchstens 3 Aufträge je Lauf
                if apply:
                    db.insert("agent_tasks", {**t, "status": "offen"})
                out["auftraege"] += 1
            out["auftrag_markt"] = tasks[0]["market"]
    return out


def summary(out: dict) -> dict:
    """Kurzfassung für custom_agents.last_result (ohne Export-IDs und Firmennamen)."""
    z = {nid: {k: v for k, v in x.items() if k not in ("ids", "firmen")} for nid, x in (out.get("ziele") or {}).items()}
    return {"rows_in": out.get("rows_in"), "ziele": z, "auftraege": out.get("auftraege", 0)}


def run(db, apply: bool, log=print, now: dt.datetime | None = None, only: str | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    stats = {"faellig": 0, "ok": 0, "fehler": 0}
    try:
        agents = db.select("custom_agents", {"enabled": "eq.true", "order": "created_at.asc",
                                             "select": "id,name,flow_id,trigger,at_hour,ai_brief,ai_market,last_run_at"}) or []
    except RuntimeError as exc:
        if "PGRST205" in str(exc) or "42P01" in str(exc):
            log("custom_agents fehlt (Migration 20261004100000) – nichts zu tun")
            return stats
        raise
    if only:
        agents = [a for a in agents if str(a["id"]) == only]
    for a in agents:
        if not only:
            def has_new(ag, a=a):
                fl = db.select("flows", {"id": f"eq.{a['flow_id']}", "select": "def"}) or []
                return has_new_leads(db, ag, parse_def(fl[0].get("def")) if fl else None)
            ok, why = due(a, now, has_new)
            if not ok:
                log(f"- {a.get('name')}: nicht fällig ({why})")
                continue
        else:
            why = "Handstart"
        stats["faellig"] += 1
        log(f"> {a.get('name')}: fällig ({why})")
        run_id = None
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        if apply:
            run_id = (db.insert("agent_runs", {"agent_id": a["id"], "started_at": started}) or [{}])[0].get("id")
        try:
            out = run_agent(db, a, apply, log)
            err = None
            stats["ok"] += 1
        except Exception as exc:  # noqa: BLE001 - ein Agent darf die anderen nicht aufhalten
            out, err = {}, f"{type(exc).__name__}: {str(exc)[:300]}"
            stats["fehler"] += 1
        log(f"  {'FEHLER ' + err if err else json.dumps(summary(out), ensure_ascii=False)}")
        if not apply:
            continue
        fin = dt.datetime.now(dt.timezone.utc).isoformat()
        try:
            if run_id:
                db.update("agent_runs", {"id": run_id}, {"finished_at": fin, "rows_in": out.get("rows_in"),
                                                         "result": out, "error": err})
            db.update("custom_agents", {"id": a["id"]}, {"last_run_at": started,
                                                         "last_result": {"error": err} if err else summary(out)})
        except Exception as exc:  # noqa: BLE001
            log(f"  Protokoll nicht gespeichert ({type(exc).__name__})")
    log(f"Agenten: {stats['faellig']} fällig, {stats['ok']} ok, {stats['fehler']} Fehler")
    return stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--agent", help="nur diesen Agenten (sofort)")
    args = ap.parse_args(argv)
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    db = DB()
    if args.apply and stop_if_paused(db, "agenten"):
        return 0
    run(db, args.apply, only=args.agent)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
