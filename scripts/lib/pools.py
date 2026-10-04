"""Speicher (signalwerk.lead_pools) beim Bedienen: aus welchem Speicher Proben und Lieferungen kommen
(docs/BAUKASTEN-MASTER.md, Inhaber 04.10.2026: „entscheiden welcher speicher genutzt wird um die kunden zu bedienen“).

Reihenfolge: subscriptions.pool_id (je Kunde) vor pool_routes (je Zielgruppe+Land); ohne Eintrag = Gesamtbestand
(wie bisher). Ist ein Speicher gesetzt, gilt er STRIKT: Kandidaten nur aus diesem Speicher, kein Ausweichen auf den
Gesamtbestand – reicht er nicht für 10 verschiedene Firmen, gibt es keine Probe (Tagescheck meldet „Speicher reicht
nicht“). Die Drei-Stufen-Freigabe läuft unabhängig davon immer (release_gate.py).

Abfrage über PostgREST: Leads mit `lead_pool_items!inner(pool_id)` und Filter `lead_pool_items.pool_id=eq.<id>` –
die Datenbank verbindet über den Primärschlüssel (pool_id, lead_id), ohne alle Speicher-IDs zu laden.
"""
from __future__ import annotations

import re

EMBED = "lead_pool_items!inner(pool_id)"
FILTER = "lead_pool_items.pool_id"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _missing_table(exc: Exception) -> bool:
    s = str(exc)
    return "PGRST205" in s or "42P01" in s or "42703" in s


def routes(db) -> dict[tuple[str, str], str]:
    """(Zielgruppe, Land) -> Speicher-ID. Fehlt die Tabelle (noch), gibt es keine Routen; andere Fehler gehen weiter
    (lieber keine Probe als eine aus dem falschen Bestand)."""
    try:
        rows = db.select("pool_routes", {"select": "segment_id,country,pool_id"}) or []
    except RuntimeError as exc:
        if _missing_table(exc):
            return {}
        raise
    return {(r["segment_id"], r["country"]): str(r["pool_id"]).lower() for r in rows if r.get("pool_id")}


def pool_for(db, seg: str, country: str, sub: dict | None = None, known: dict | None = None) -> str | None:
    """Speicher für ein Abo bzw. eine Probe: subscriptions.pool_id vor pool_routes, sonst None (Gesamtbestand)."""
    pid = (sub or {}).get("pool_id")
    if pid:
        return str(pid).lower()
    return (known if known is not None else routes(db)).get((seg, country))


def restrict(params: dict, pool_id: str | None) -> dict:
    """Lead-Abfrage auf einen Speicher beschränken (pool_id None = unverändert)."""
    if not pool_id:
        return params
    sel = params.get("select") or "*"
    return {**params, "select": f"{sel},{EMBED}", FILTER: f"eq.{pool_id}"}


def strip(rows: list[dict]) -> list[dict]:
    """Eingebettete Speicher-Spalte entfernen (soll nie in Proben, CSV oder Protokolle gelangen)."""
    for r in rows:
        r.pop("lead_pool_items", None)
    return rows


def members(db, pool_id: str, lead_ids: list[str]) -> set[str]:
    """Welche dieser Leads im Speicher liegen."""
    out: set[str] = set()
    ids = sorted(set(lead_ids))
    for i in range(0, len(ids), 100):
        for r in db.select("lead_pool_items", {"pool_id": f"eq.{pool_id}", "lead_id": f"in.({','.join(ids[i:i + 100])})",
                                               "select": "lead_id"}):
            out.add(r["lead_id"])
    return out


def names(db) -> dict[str, str]:
    try:
        return {str(r["id"]).lower(): r.get("name") or "" for r in db.select("lead_pools", {"select": "id,name"}) or []}
    except RuntimeError as exc:
        if _missing_table(exc):
            return {}
        raise


SUPPLY_ROWS = 300  # wie check_sample_supply: neueste freie Firmen je Speicher prüfen


def shortfalls(db) -> list[dict]:
    """Speicher-Zuordnungen (pool_routes und Abos mit pool_id), die keine 10 vollständigen, verschiedenen Firmen mit
    freien Leads (status new) haben: [{pool, name, segment, country, firmen, wer}]."""
    from deliveries import contact_companies
    want: dict[tuple[str, str, str], set[str]] = {}
    for (seg, cc), pid in routes(db).items():
        want.setdefault((pid, seg, cc), set()).add("Route")
    try:
        subs = db.select("subscriptions", {"status": "eq.active", "pool_id": "not.is.null",
                                           "select": "pool_id,segment_id,filters,customers(company_name,country)"}) or []
    except RuntimeError as exc:
        if not _missing_table(exc):
            raise
        subs = []
    for s in subs:
        cc = (s.get("filters") or {}).get("country") or (s.get("customers") or {}).get("country")
        if s.get("pool_id") and cc:
            want.setdefault((str(s["pool_id"]).lower(), s["segment_id"], cc), set()).add(
                (s.get("customers") or {}).get("company_name") or "Kunde")
    if not want:
        return []
    label = names(db)
    out = []
    for (pid, seg, cc), who in sorted(want.items()):
        rows = db.select("leads", restrict({"segment_id": f"eq.{seg}", "country": f"eq.{cc}", "status": "eq.new",
                                            "company_id": "not.is.null", "order": "created_at.desc,id",
                                            "limit": str(SUPPLY_ROWS), "select": "company_id"}, pid))
        ids = sorted({r["company_id"] for r in rows if r.get("company_id")})
        n = len(contact_companies(db, website_optional=(seg == "S2"), only=ids)) if ids else 0
        if n < 10:
            out.append({"pool": pid, "name": label.get(pid) or pid[:8], "segment": seg, "country": cc, "firmen": n,
                        "wer": sorted(who)})
    return out
