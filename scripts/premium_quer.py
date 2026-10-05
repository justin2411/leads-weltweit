#!/usr/bin/env python3
"""Quer-Verwertung frischer Neugründungen für Buchhaltung S5 (Branchen-Test 05.10.2026, Inhaber: „Neugründungen … die
natürlich auch und welche du noch findest“).

Das Lead-Werk legt jede neue Firma nur EINER Zielgruppe zu (Companies House UK abwechselnd S4/S5/S9, FMCSA ohne eigene
Domain -> S2 Webagenturen). Eine Neugründung ist aber für jede Zielgruppe ein echter Anlass: wer heute eine Ltd
gründet oder als Spedition mit Fahrern startet, braucht auch Buchhaltung und Lohn. Dieses Skript legt für solche
Firmen einen eigenen S5-Lead an – aus denselben amtlichen Daten, die schon gespeichert und geprüft sind (kein neuer
Abruf, keine neue Firma, kein Rohbestand):

  UK  Companies House-Neugründung (Lead S4/S9, Quelle „Companies House“, Signal incorporation)
  US  US DOT/FMCSA-Neuzulassung mit mindestens 1 Fahrzeug und 1 Fahrer (Lead S2/S4, Profil mit Flotte)

Nur Firmen mit Ansprechperson, Telefon und E-Mail, Ereignis ≤ 14 Tage, Ausgangs-Lead frei (Status new) und bisher ohne
S5-Lead. Gespeichert wird nur, was die Premium-Bewertung (lib/premium.py) als premium einstuft. Danach entscheidet die
Drei-Stufen-Freigabe (scripts/premium_freigabe.py) wie bei jedem anderen Lead. Sendet nichts, löscht nichts.

  python scripts/premium_quer.py US,UK            # Probelauf: zählen und Beispiele zeigen
  python scripts/premium_quer.py US,UK --apply    # S5-Leads speichern (höchstens --max je Land)
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import premium as P  # noqa: E402

TARGET = "S5"
UK_REASON = "A new limited company must keep records from day one and file its first accounts and confirmation statement."
US_REASON = "New transport businesses set up payroll, bookkeeping and fuel/tax registrations in the first months."

# UK: „NAME (company no. 123) was incorporated on 25 September 2026 – activity.“ (S4) bzw.
#     „Person – owner of NAME, incorporated on 30 September 2026 (company no. 123).“ (S9)
UK_S4 = re.compile(r"^(?P<name>.+?) \(company no\. (?P<no>\w+)\) was incorporated on (?P<date>\d{1,2} \w+ \d{4})"
                   r"(?: – (?P<act>.+?))?\.?$")
UK_S9 = re.compile(r"owner of (?P<name>.+?), incorporated on (?P<date>\d{1,2} \w+ \d{4}) \(company no\. (?P<no>\w+)\)")
# US: „NAME (USDOT 123), registered on October 3, 2026, …“ und Profil „… a for-hire interstate carrier …
#     Fleet: 1 power unit and 4 drivers …“
US_HEAD = re.compile(r"^(?P<name>.+?) \(USDOT (?P<dot>\d+)\),? registered on (?P<date>\w+ \d{1,2}, \d{4})")
US_KIND = re.compile(r"\bis an? (?P<kind>(?:for-hire|private|exempt)[\w -]*?carrier)\b", re.I)
US_FLEET = re.compile(r"Fleet: (?P<pu>\d+) power units? and (?P<dr>\d+) drivers?", re.I)


def plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def uk_lead(base: dict) -> dict | None:
    s = (base.get("event_summary") or "").strip()
    m = UK_S4.match(s) or UK_S9.search(s)
    if not m:
        return None
    name, no, date = m.group("name").strip(), m.group("no"), m.group("date")
    act = (m.groupdict().get("act") or "").strip().rstrip(".")
    summary = f"{name} (company no. {no}) was incorporated on {date}" + (f" – {act}." if act else ".")
    return {"signal_type": "incorporation", "event_summary": summary, "urgency": "medium", "urgency_reason": UK_REASON,
            "opener": f"Congratulations on incorporating {name} – who is looking after your bookkeeping, VAT and first "
                      f"year-end accounts?"}


def us_lead(base: dict, profile: str) -> dict | None:
    m = US_HEAD.match((base.get("event_summary") or "").strip())
    f = US_FLEET.search(profile or "")
    if not m or not f:
        return None
    pu, dr = int(f.group("pu")), int(f.group("dr"))
    if pu < 1 or dr < 1:  # wie segments.fits(S5, FMCSA): ohne Fahrer keine Lohnabrechnung
        return None
    k = US_KIND.search(profile or "")
    kind = k.group("kind") if k else "motor carrier"
    name, dot, date = m.group("name").strip(), m.group("dot"), m.group("date")
    fleet = f"{plural(pu, 'power unit')} and {plural(dr, 'driver')}"
    return {"signal_type": "new_company",
            "event_summary": f"{name} (USDOT {dot}) registered on {date} as a {kind} with {fleet} – a new transport "
                             f"business with drivers on the road.",
            "urgency": "medium", "urgency_reason": US_REASON,
            "opener": f"Congratulations on launching {name} – with {plural(dr, 'driver')} starting out, who is setting up "
                      f"your payroll and bookkeeping?"}


def _chunks(xs: list, n: int = 100):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def candidates(db, country: str, today: dt.date, limit: int) -> list[dict]:
    """Frische Premium-Ausgangs-Leads anderer Zielgruppen (Status new), neueste zuerst."""
    since = (today - dt.timedelta(days=P.PREMIUM_MAX_AGE - 1)).isoformat()  # mind. 1 Tag Premium übrig
    if country == "UK":
        q = {"source_name": "eq.Companies House", "segment_id": "in.(S4,S9)", "signal_type": "eq.incorporation"}
    else:
        q = {"source_name": "like.FMCSA*", "segment_id": "in.(S2,S4)"}
    rows = db.select("leads", {**q, "country": f"eq.{country}", "status": "eq.new", "premium->>tier": "eq.premium",
                               "event_date": f"gte.{since}", "order": "event_date.desc,id", "limit": str(limit),
                               "select": "id,company_id,segment_id,event_summary,event_date,source_name,source_url,"
                                         "source_date,observation_ids"})
    seen, out = set(), []
    for r in rows:  # je Firma nur ein Ausgangs-Lead
        if r["company_id"] not in seen:
            seen.add(r["company_id"])
            out.append(r)
    return out


def build(db, country: str, today: dt.date, limit: int) -> tuple[list[dict], dict]:
    from collections import Counter
    stats = Counter()
    base = candidates(db, country, today, limit)
    stats["ausgang"] = len(base)
    cids = [b["company_id"] for b in base]
    have, obs = set(), {}
    for part in _chunks(cids):
        for r in db.select("leads", {"company_id": f"in.({','.join(part)})", "segment_id": f"eq.{TARGET}",
                                     "select": "company_id"}):
            have.add(r["company_id"])
        for o in db.select("observations", {"company_id": f"in.({','.join(part)})", "kind": "eq.other",
                                            "key": "in.(contact,person,profile)", "select": "company_id,key,details"}):
            obs.setdefault(o["company_id"], {})[o["key"]] = o.get("details") or {}
    rows = []
    for b in base:
        cid = b["company_id"]
        if cid in have:
            stats["hat_schon_s5"] += 1
            continue
        o = obs.get(cid, {})
        ct, pe = o.get("contact") or {}, o.get("person") or {}
        if not (ct.get("phone") and ct.get("email") and pe.get("name")):
            stats["ohne_kontakt_oder_person"] += 1
            continue
        txt = uk_lead(b) if country == "UK" else us_lead(b, (o.get("profile") or {}).get("company_info") or "")
        if not txt:
            stats["nicht_passend"] += 1
            continue
        lead = {"company_id": cid, "segment_id": TARGET, "country": country, "event_date": b["event_date"],
                "source_name": b["source_name"], "source_url": b["source_url"], "source_date": b.get("source_date"),
                "observation_ids": b.get("observation_ids") or [], "status": "new", **txt}
        cols = P.columns({**lead, "details": {}, "person_name": pe.get("name"), "phone": ct.get("phone"),
                          "email": ct.get("email")}, today)
        if cols["premium"]["tier"] != "premium":  # nur Premium speichern (Inhaber 05.10.2026), kein Rohbestand
            stats["nicht_premium"] += 1
            continue
        rows.append({**lead, **cols})
    stats["neu_premium"] = len(rows)
    return rows, dict(stats)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("countries", help="US,UK")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--max", type=int, default=120, help="höchstens so viele neue S5-Leads je Land und Lauf")
    ap.add_argument("--pool", type=int, default=1000, help="so viele Ausgangs-Leads je Land ansehen")
    args = ap.parse_args(argv)
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    db = DB()
    if args.apply and stop_if_paused(db, "lead-werk", print):  # Werke-Schalter im Dashboard gilt auch hier
        return 0
    today = dt.datetime.now(dt.timezone.utc).date()
    for c in [x.strip().upper() for x in args.countries.split(",") if x.strip()]:
        if c not in ("US", "UK"):
            print(f"{c}: keine Quer-Verwertung (nur US/UK)")
            continue
        rows, stats = build(db, c, today, args.pool)
        rows = rows[:args.max]
        for r in rows[:2]:
            print(f"  {c} Beispiel: {r['event_summary'][:90]}… | {r['opener'][:70]}…")
        if args.apply:
            for part in _chunks(rows, 50):
                db.insert("leads", part, upsert_on="company_id,segment_id,signal_type,event_date",
                          ignore_duplicates=True)
        print(f"{TARGET}/{c}: {stats}, {'gespeichert' if args.apply else 'würde speichern'} {len(rows)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
