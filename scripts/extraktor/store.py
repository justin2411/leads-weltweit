#!/usr/bin/env python3
"""Extraktor-Ergebnis in die Datenbank übernehmen – nur grüne Leads, nur mit --apply (Lead-Werk schreibt direkt).

  python scripts/extraktor/store.py out/extraktor/leads_alle.csv            # Probelauf: zeigt, was passieren würde
  python scripts/extraktor/store.py out/extraktor/leads_alle.csv --apply

Schreibt in die bestehenden Tabellen (keine Migration nötig), so dass Proben und Lieferungen die Leads als
vollständig erkennen (deliveries.contact_companies):
  watch_companies           Firma (registry_source = Quelle, registry_id = Quell-ID)
  observations other/contact   Telefon + E-Mail     other/person  Ansprechperson     other/quality  Prüfergebnis
  observations other/profile   Firmeninfo           filing/<ereignis>  das Ereignis mit Quelle und Datum
  leads                     Signal, Dringlichkeit, Einstiegssatz, Branche
Firmen, die schon da sind (gleiche Quelle + ID), werden übersprungen. Geschrieben wird in Blöcken.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extraktor.sources.overture import BRANDS  # noqa: E402

SOURCE_NAME = {
    "fmcsa": "FMCSA Company Census (US DOT)", "sec_form_d": "SEC EDGAR Form D",
    "companies_house": "Companies House", "bodacc": "BODACC (Bulletin officiel)",
    "overture": "Overture Maps (business listing)", "careers": "Careers page (company website)",
    "ats_jobs": "Careers page (applicant tracking system)",
    "overture_web": "Website check (company homepage)",
    "find_tender": "UK public contract award notice (Find a Tender / Contracts Finder)",
}
EVENT_KEY = {"fmcsa": "fmcsa_registration", "sec_form_d": "form_d", "companies_house": "incorporation",
             "bodacc": "immatriculation", "overture": "no_website", "careers": "open_roles", "ats_jobs": "open_roles",
             "overture_web": "website_check",
             "find_tender": "contract_award"}
INDUSTRY = {"fmcsa": "Motor carrier"}


def signal_type(seg: str, source: str, given: str = "") -> str:
    if given:  # Website-Prüfung: no_https / website_not_mobile / website_outdated / website_broken
        return given
    if source in ("careers", "ats_jobs"):
        return "jobs_open"
    if source in ("companies_house", "bodacc"):
        return "incorporation"
    if source == "find_tender":
        return "contract_award"
    if seg == "S2":
        return "no_website"
    return {"S4": "new_fleet", "S1": "funding_growth", "S5": "funding_new_company" if source == "sec_form_d"
            else "new_company", "S9": "funding_executive"}.get(seg, "signal")


def company_row(r: dict) -> dict:
    from lib.websites import site_domain
    addr = ", ".join(x for x in (r["street"], r["city"], f"{r['state']} {r['zip']}".strip()) if x)
    return {"name": r["company"], "legal_form": None, "country": r["country"], "region": r["state"] or None,
            "city": r["city"], "address": addr, "website": r["website"] or None,
            "domain": site_domain(r["website"]) if r["website"] else None, "phone_main": r["phone"] or None,
            "registry_source": r["source"], "registry_id": r["source_id"], "industry": INDUSTRY.get(r["source"]),
            "active": True, "notes": f"Extraktor {dt.date.today()}"}


def _evidence(r: dict) -> dict:
    """Belege der Website-Prüfung (Befunde mit Prüfdatum) für das Ereignis; leer bei anderen Quellen."""
    import json
    raw = r.get("signal_evidence") or ""
    return json.loads(raw) if raw else {}


def _obs(cid: str, today: str, **kw) -> dict:
    # Blockweise Inserts brauchen in jeder Zeile dieselben Spalten
    base = {"company_id": cid, "first_seen": today, "last_seen": today, "source_name": "Extraktor",
            "title": None, "source_url": None, "posted_on": None}
    return {**base, **kw}


def _insert_companies(db, part: list[dict], make) -> tuple[list[dict], list[str]]:
    """Firmen anlegen; Firmen, deren Website-Domain schon in der Datenbank steht (oder doppelt im Block), werden
    übersprungen (eindeutiger Index watch_companies_domain_uq). Gibt (geschriebene Zeilen, ihre IDs) zurück."""
    dom = lambda r: company_row(r)["domain"]  # noqa: E731
    seen, keep = set(), []
    for r in part:
        d = dom(r)
        if d and d in seen:
            continue
        if d:
            seen.add(d)
        keep.append(r)
    if seen:
        listed = ",".join(f'"{d}"' for d in sorted(seen))
        have = {c["domain"] for c in db.select("watch_companies", {"domain": f"in.({listed})", "select": "domain"})}
        keep = [r for r in keep if dom(r) not in have]
    if not keep:
        return [], []
    try:
        return keep, [c["id"] for c in db.insert("watch_companies", [make(r) for r in keep])]
    except RuntimeError as e:
        if "23505" not in str(e):
            raise
    # ein paralleler Teillauf war schneller: einzeln schreiben, Doppelte auslassen
    rows, ids = [], []
    for r in keep:
        try:
            ids.append(db.insert("watch_companies", [make(r)])[0]["id"])
            rows.append(r)
        except RuntimeError as e:
            if "23505" not in str(e):
                raise
    return rows, ids


TIMEOUT = "57014"  # Postgres: canceling statement due to statement timeout
MIN_CHUNK = 5


def store_many(db, rows: list[dict], today: str | None = None, chunk: int = 100) -> int:
    """Grüne Zeilen (CSV-Format) blockweise schreiben; gibt die Zahl neuer Leads zurück.
    Bricht die Datenbank einen Block wegen Zeitüberschreitung ab (viele parallele Teilläufe), wird er wieder
    entfernt und in halben Blöcken neu geschrieben (01.10.2026: so gingen ~8.100 grüne S2-Leads verloren)."""
    today = today or dt.date.today().isoformat()
    n = 0
    for i in range(0, len(rows), chunk):
        n += _store_block(db, rows[i:i + chunk], today)
    return n


def _store_block(db, block: list[dict], today: str, once=None) -> int:
    once = once or _store_block_once
    try:
        return once(db, block, today)
    except RuntimeError as e:
        if TIMEOUT not in str(e) or len(block) <= MIN_CHUNK:
            raise
    except requests.Timeout:
        # Antwort kam nicht rechtzeitig (02.10.2026: S2/UK, 799 grüne Leads): Block ist entfernt bzw. schon
        # gespeicherte Firmen werden beim Neuversuch über die Domain erkannt -> kleiner neu schreiben
        if len(block) <= MIN_CHUNK:
            raise
    half = len(block) // 2
    return _store_block(db, block[:half], today, once) + _store_block(db, block[half:], today, once)


def _store_block_once(db, block: list[dict], today: str) -> int:
    part, ids = _insert_companies(db, block, company_row)
    if not ids:
        return 0
    try:
        obs = []
        for cid, r in zip(ids, part):
            src = SOURCE_NAME.get(r["source"], r["source"])
            obs += [
                _obs(cid, today, kind="other", key="contact", source_url=r["website"] or None,
                     details={"phone": r["phone"], "email": r["email"], "phone_type": r["phone_type"],
                              "email_type": r["email_type"], "phone_note": r.get("phone_note"), "source": r["source"]}),
                _obs(cid, today, kind="other", key="person",
                     details={"name": r["contact_name"] or None, "role": r["contact_role"] or None, "source": src}),
                _obs(cid, today, kind="other", key="quality",
                     details={"complete": True, "blocking": False, "qc": r["qc"], "sc": r["sc"],
                              "notes": r["qc_notes"], "checked_on": today, "by": "extraktor"}),
                _obs(cid, today, kind="other", key="profile", details={"company_info": r["company_info"]}),
                _obs(cid, today, kind="filing", key=EVENT_KEY.get(r["source"], r["source"]), title=r["signal"],
                     source_name=src, source_url=r["source_url"], posted_on=r["signal_date"],
                     details={"source_id": r["source_id"], **_evidence(r)}),
            ]
        written = db.insert("observations", obs)
        ev = {o["company_id"]: o["id"] for o in written if o["kind"] == "filing"}
        leads = [{"company_id": cid, "segment_id": r["segment"], "country": r["country"],
                  "signal_type": signal_type(r["segment"], r["source"], r.get("signal_type") or ""), "event_summary": r["signal"],
                  "event_date": r["signal_date"], "source_name": SOURCE_NAME.get(r["source"], r["source"]),
                  "source_url": r["source_url"], "source_date": r["signal_date"], "urgency": r["urgency"],
                  "urgency_reason": r["urgency_reason"], "opener": r["opener"],
                  "observation_ids": [ev[cid]] if cid in ev else [], "status": "new"}
                 for cid, r in zip(ids, part)]
        db.insert("leads", leads)
    except Exception:
        # Block unvollständig: angelegte Firmen wieder entfernen, damit keine Firma ohne Lead stehen bleibt
        ids_in = ",".join(ids)
        db.s.delete(f"{db.base}/leads", params={"company_id": f"in.({ids_in})"}, timeout=db.timeout)
        db.s.delete(f"{db.base}/observations", params={"company_id": f"in.({ids_in})"}, timeout=db.timeout)
        db.s.delete(f"{db.base}/watch_companies", params={"id": f"in.({ids_in})"}, timeout=db.timeout)
        raise
    return len(leads)


def store_raw(db, rows: list[dict], today: str | None = None, chunk: int = 200) -> int:
    """Rohbestand kompakt (Inhaber 01.10.2026: „wenn da etwas fehlt sollen die Leads trotzdem noch irgendwo abgelegt
    werden“; 03.10.2026: „nicht mehr neu speichern“ = nicht mehr als Firma + 5 Beobachtungen, ~2,6 KB je Firma):
    gelbe (unvollständige) und rote (widersprüchliche) Kandidaten als EINE Zeile in signalwerk.raw_candidates mit
    allen gefundenen Daten, OHNE Firma und OHNE Lead – nie geliefert. `missing` nennt, was fehlt, damit eine spätere
    Anreicherung ansetzen kann. Schon vorhandene (Quelle + ID) bleiben unverändert."""
    today = today or dt.date.today().isoformat()
    n = 0
    for i in range(0, len(rows), chunk):
        n += _store_block(db, rows[i:i + chunk], today, _store_raw_once)
    return n


def raw_row(r: dict, today: str) -> dict:
    from lib.websites import site_domain
    notes = r["qc_notes"].split("; ") if r.get("qc_notes") else []
    keep = {"phone": "phone", "email": "email", "phone_type": "phone_type", "email_type": "email_type",
            "website": "website", "street": "street", "city": "city", "state": "region", "zip": "postcode",
            "contact_name": "contact_name", "contact_role": "contact_role", "signal": "signal",
            "signal_date": "signal_date", "signal_type": "signal_type", "source_url": "source_url", "urgency": "urgency",
            "urgency_reason": "urgency_reason", "opener": "opener", "company_info": "company_info"}
    data = {to: r.get(k) for k, to in keep.items() if r.get(k) not in (None, "", [], {})}
    data.update({"qc": r.get("qc"), "sc": r.get("sc"), "checked_on": today,
                 "problems": [x for x in notes if not x.startswith(("missing:", "+"))]
                 + ([r["sc_notes"]] if r.get("sc_notes") else [])})
    return {"source": r["source"], "source_id": str(r["source_id"]), "segment_id": r.get("segment"),
            "country": r.get("country"), "ampel": "red" if r.get("ampel") == "red" else "yellow",
            "name": r.get("company"), "domain": site_domain(r["website"]) if r.get("website") else None,
            "missing": [x[8:] for x in notes if x.startswith("missing:")], "data": data}


def _store_raw_once(db, block: list[dict], today: str) -> int:
    rows = [raw_row(r, today) for r in block]
    return len(db.insert("raw_candidates", rows, upsert_on="source,source_id", ignore_duplicates=True) or [])


def store_new(db, guard, rows: list[dict], raw: bool = True) -> dict:
    """Noch unbekannte Firmen (Quelle + ID) schreiben: grüne als Lead, gelbe/rote in den Rohbestand (kompakt).
    Je Firma ein Eintrag; grün geht vor (erste Branche gewinnt). raw=False: Speicher-Bremse ab 7 GB (--no-raw) –
    dann nur grüne Leads."""
    rows = [{k: (v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v) for k, v in r.items()} for r in rows]
    order = {"green": 0, "yellow": 1, "red": 2}
    rows = sorted((r for r in rows if r.get("ampel") in order), key=lambda r: order[r["ampel"]])
    new, raw_rows, seen = [], [], set()
    for r in rows:
        k = (r["source"], r["source_id"])
        if k in guard.known or k in seen:
            continue
        if r["source"] in ("overture", "overture_web") and BRANDS.search(r["company"] or ""):
            continue  # Filiale einer Kette (ältere Läufe ohne Markenfilter)
        seen.add(k)
        (new if r["ampel"] == "green" else raw_rows).append(r)
    n = store_many(db, new) if new else 0
    m = store_raw(db, raw_rows) if raw_rows and raw else 0
    guard.known.update(seen)
    return {"neu": n, "rohbestand": m, "schon_da": len({(r["source"], r["source_id"]) for r in rows}) - n - m}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="+")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    rows = [r for p in args.csv for r in csv.DictReader(open(p, encoding="utf-8"))]
    from extraktor.filters import Guard
    from lib.db import DB
    db = DB()
    guard = Guard(db, preload=())
    guard.drop_known([{"source": r["source"], "source_id": r["source_id"]} for r in rows])  # füllt guard.known
    if not args.apply:
        green = {(r["source"], r["source_id"]) for r in rows if r["ampel"] == "green"}
        print({"neu": len(green - guard.known), "schon_da": len(green & guard.known)}, "(Probelauf – mit --apply schreiben)")
        return 0
    print(store_new(db, guard, rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
