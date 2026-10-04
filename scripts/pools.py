#!/usr/bin/env python3
"""Speicher füllen mit der Master-Pipeline (docs/BAUKASTEN-MASTER.md, Inhaber 04.10.2026: „einmal die pipeline
festlegen die immer stattfindet als master pipeline“, „ergebnisse in unseren speicher übertragen“).

  python scripts/pools.py fill            # Probelauf: zeigt, was in welche Speicher käme
  python scripts/pools.py fill --apply    # neue Leads seit dem letzten Lauf auswerten und Speicher füllen

Ablauf: die aktive Master-Pipeline (flows.kind = 'master', Status 'aktiv') läuft über alle Leads, die seit dem
letzten Lauf neu sind (Merkzettel signalwerk.job_cursors 'pools:master': created_at + id des letzten Leads und die
Fassung des Flows). Zeilen wie im Baukasten (owner_rules.flat_row aus release_gate.load_items – dieselbe Quelle wie
Stufe 4 der Freigabe), Ablauf wie runFlowRows (owner_rules.run_flow_rows). Was bei einem Speicher-Baustein ankommt,
landet in lead_pool_items (added_by 'master'); doppelte Einträge ignoriert die Datenbank (idempotent).
Wird der Flow geändert, wertet der nächste Lauf die letzten REPLAY_DAYS Tage neu aus (nur Hinzufügen, nie Löschen).

Nie: Versand, Sperrliste, Prüfregeln. Die Drei-Stufen-Freigabe läuft vor jeder Probe/Lieferung unabhängig davon.
Pause im Dashboard: werke_paused „agenten“ (Agenten-Werk).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import owner_rules as R  # noqa: E402
from lib.pools import UUID_RE, _missing_table  # noqa: E402

CURSOR = "pools:master"
PAGE = 1000
MAX_PER_RUN = 20_000      # Leads je Lauf (der Rest folgt im nächsten Lauf über den Merkzettel)
LOOKBACK_HOURS = 6        # ohne Merkzettel (Tabelle fehlt): so weit zurück
REPLAY_DAYS = 7           # Flow geändert: so weit zurück neu auswerten
ADDED_BY = "master"


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def parse_def(d):
    if isinstance(d, str):
        try:
            d = json.loads(d)
        except ValueError:
            return None
    return d if isinstance(d, dict) else None


def load_master(db) -> dict | None:
    """Die aktive Master-Pipeline oder None. Mehrere (sollte der Index verhindern) → keine (lieber nichts tun)."""
    try:
        rows = db.select("flows", {"kind": "eq.master", "status": "eq.aktiv", "select": "id,name,def,updated_at"}) or []
    except RuntimeError as exc:
        if _missing_table(exc):
            return None
        raise
    if len(rows) != 1:
        if rows:
            print(f"WARNUNG: {len(rows)} aktive Master-Pipelines – nichts ausgewertet")
        return None
    r = rows[0]
    return {"id": str(r["id"]), "name": r.get("name") or "", "def": parse_def(r.get("def")),
            "updated_at": str(r.get("updated_at") or "")}


def sound(flow: dict | None) -> str | None:
    """None = auswertbar; sonst Grund. Unbekannte Bausteine ergeben im Python-Ablauf „alles durch“ – dann lieber
    gar nichts in Speicher legen (der Flow wurde mit einer neueren Fassung gespeichert)."""
    if not isinstance(flow, dict):
        return "definition_ungueltig"
    nodes = [n for n in flow.get("nodes") or [] if isinstance(n, dict)]
    q = [n for n in nodes if n.get("kind") == "quelle"]
    if len(q) != 1:
        return "quelle_fehlt"
    if q[0].get("source") != "leads":
        return "quelle_nicht_leads"
    bad = sorted({str(n.get("kind")) for n in nodes if n.get("kind") not in R.OUT_PORTS})
    return f"baustein_unbekannt:{','.join(bad)}" if bad else None


def in_source(q: dict, row: dict) -> bool:
    """Filter der Quelle (Zielgruppe, Länder, Status) – wie flow_lead_rows."""
    seg = q.get("segment")
    countries = q.get("countries") if isinstance(q.get("countries"), list) else []
    status = q.get("status") if isinstance(q.get("status"), list) else []
    return ((not seg or row.get("segment") == seg) and (not countries or row.get("land") in countries)
            and (not status or row.get("status") in status))


def pool_targets(db, flow: dict) -> dict[str, str]:
    """Speicher-Bausteine mit gültigem, existierendem Speicher: node_id -> pool_id."""
    out = {}
    for n in flow.get("nodes") or []:
        if not isinstance(n, dict) or n.get("kind") != "speicher":
            continue
        pid = str(n.get("pool_id") or "").lower()
        if UUID_RE.match(pid):
            out[str(n.get("id"))] = pid
    if not out:
        return {}
    have = {str(r["id"]).lower() for r in db.select("lead_pools", {"id": f"in.({','.join(sorted(set(out.values())))})",
                                                                    "select": "id"}) or []}
    for nid, pid in list(out.items()):
        if pid not in have:
            print(f"WARNUNG: Speicher {pid[:8]} (Baustein {nid}) gibt es nicht – übersprungen")
            del out[nid]
    return out


# ---------------------------------------------------------------------------- Merkzettel
def read_cursor(db, name: str = CURSOR) -> dict | None:
    """{"at", "id", "flow", "flow_updated"}; {} = noch kein Lauf; None = Tabelle fehlt (dann LOOKBACK_HOURS)."""
    try:
        rows = db.select("job_cursors", {"name": f"eq.{name}", "select": "value"}) or []
    except RuntimeError as exc:
        if _missing_table(exc):
            return None
        raise
    v = rows[0].get("value") if rows else None
    return v if isinstance(v, dict) else {}


def write_cursor(db, value: dict, name: str = CURSOR, log=print) -> None:
    try:
        db.insert("job_cursors", {"name": name, "value": value}, upsert_on="name")
    except RuntimeError as exc:
        if not _missing_table(exc):
            raise
        log("Hinweis: Merkzettel job_cursors fehlt (Migration 20261004110000) – nächster Lauf schaut "
            f"{LOOKBACK_HOURS} h zurück")


def start_point(cur: dict | None, master: dict, now: dt.datetime) -> tuple[str, str]:
    """(created_at, id), ab dem (ausschließlich) ausgewertet wird."""
    if cur and cur.get("flow") == master["id"] and cur.get("flow_updated") == master["updated_at"] and cur.get("at"):
        return str(cur["at"]), str(cur.get("id") or "")
    if cur is not None:  # erster Lauf, Flow neu oder geändert: die letzten Tage (neu) auswerten
        return (now - dt.timedelta(days=REPLAY_DAYS)).isoformat(), ""
    return (now - dt.timedelta(hours=LOOKBACK_HOURS)).isoformat(), ""


def new_leads(db, at: str, after_id: str, limit: int) -> list[dict]:
    """Leads nach (at, after_id) in der Reihenfolge (created_at, id): erst Rest mit gleichem created_at, dann später.
    Ganze Ladungen haben oft dieselbe created_at (ein Insert) – ohne id-Schlüssel hinge der Lauf dort fest."""
    out: list[dict] = []
    if after_id:
        out += db.select("leads", {"created_at": f"eq.{at}", "id": f"gt.{after_id}", "order": "id.asc",
                                   "limit": str(limit), "select": "id,created_at"}) or []
    if len(out) < limit:
        out += db.select("leads", {"created_at": f"gt.{at}", "order": "created_at.asc,id.asc",
                                   "limit": str(limit - len(out)), "select": "id,created_at"}) or []
    out.sort(key=lambda r: (str(r.get("created_at") or ""), str(r.get("id"))))
    return out[:limit]


def flat_rows(db, ids: list[str], today: dt.date) -> list[dict]:
    """Baukasten-Zeilen wie flow_lead_rows – aus denselben Daten wie die Freigabe (release_gate.load_items)."""
    from lib.release_gate import load_items
    items = load_items(db, ids)
    checks = {}
    try:
        for i in range(0, len(ids), 100):
            for r in db.select("lead_checks", {"lead_id": f"in.({','.join(ids[i:i + 100])})", "select": "lead_id,result"}):
                checks[r["lead_id"]] = r
    except RuntimeError:
        checks = {}
    return [R.flat_row(it, today, checks.get(it["id"])) for it in items]


def write_items(db, pairs: set[tuple[str, str]], added_by: str) -> int:
    """lead_pool_items schreiben (doppelte ignoriert); Rückgabe = neu eingetragene."""
    rows = [{"pool_id": p, "lead_id": l, "added_by": added_by} for p, l in sorted(pairs)]
    n = 0
    for i in range(0, len(rows), 500):
        n += len(db.insert("lead_pool_items", rows[i:i + 500], upsert_on="pool_id,lead_id", ignore_duplicates=True) or [])
    return n


def fill(db, apply: bool, log=print, now: dt.datetime | None = None, max_leads: int = MAX_PER_RUN) -> dict:
    now = now or now_utc()
    res = {"flow": None, "leads": 0, "rows": 0, "pairs": 0, "neu": 0, "speicher": {}}
    master = load_master(db)
    if master is None:
        log("Keine aktive Master-Pipeline – nichts zu tun")
        return res
    res["flow"] = master["id"]
    why = sound(master["def"])
    if why:
        log(f"Master-Pipeline „{master['name']}“ nicht auswertbar ({why}) – nichts in Speicher gelegt")
        res["fehler"] = why
        return res
    flow = master["def"]
    targets = pool_targets(db, flow)
    if not targets:  # nichts zu füllen: nicht lesen (eine Änderung des Flows wertet später REPLAY_DAYS neu aus)
        log(f"Master-Pipeline „{master['name']}“ hat keinen Speicher-Baustein mit eigenem Speicher – nichts zu tun")
        return res
    q = next(n for n in flow["nodes"] if isinstance(n, dict) and n.get("kind") == "quelle")
    at, last = start_point(read_cursor(db), master, now)
    log(f"Master-Pipeline „{master['name']}“: Leads ab {at}{' / ' + last[:8] if last else ''}, "
        f"{len(targets)} Speicher-Ziel(e)")
    today = now.date()
    pairs: set[tuple[str, str]] = set()
    while res["leads"] < max_leads:
        page = new_leads(db, at, last, min(PAGE, max_leads - res["leads"]))
        if not page:
            break
        res["leads"] += len(page)
        rows = [r for r in flat_rows(db, [p["id"] for p in page], today) if in_source(q, r)]
        res["rows"] += len(rows)
        if rows:
            for nid, got in R.sink_rows(flow, rows, "speicher").items():
                pid = targets.get(nid)
                if pid:
                    for r in got:
                        pairs.add((pid, r["id"]))
        at, last = str(page[-1]["created_at"]), str(page[-1]["id"])
        if len(page) < PAGE:
            break
    res["pairs"] = len(pairs)
    for pid, _ in pairs:
        res["speicher"][pid] = res["speicher"].get(pid, 0) + 1
    if not apply:
        log(f"Probelauf: {res['leads']} neue Leads, {res['rows']} im Bereich der Quelle, {len(pairs)} Speicher-Einträge "
            f"({json.dumps(res['speicher'])}) – nichts geschrieben")
        return res
    res["neu"] = write_items(db, pairs, ADDED_BY) if pairs else 0
    if res["leads"]:  # Merkzettel erst nach dem Schreiben (ein Fehler davor wertet beim nächsten Lauf erneut aus)
        write_cursor(db, {"at": at, "id": last, "flow": master["id"], "flow_updated": master["updated_at"]}, log=log)
    log(f"{res['leads']} neue Leads ausgewertet, {res['rows']} im Bereich, {res['neu']} neu in Speichern "
        f"({len(pairs) - res['neu']} schon drin)")
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["fill"])
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    db = DB()
    if args.apply and stop_if_paused(db, "agenten"):
        return 0
    fill(db, args.apply)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
