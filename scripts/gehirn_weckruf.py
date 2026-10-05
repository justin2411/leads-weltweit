"""Gehirn-Weckruf (Inhaber 05.10.2026: „ja bitte“): wichtige Ereignisse wecken das Gehirn sofort.

`sammeln()` liest nur bestehende Tabellen und legt je Ereignis eine Zeile in `signalwerk.gehirn_weckruf` an
(unique kind+ref, doppelte werden ignoriert). Nur Ereignisse der letzten 48 h, ohne Test- und Inhaber-Verkehr
(gleiche Regeln wie das Dashboard):

  antwort    inbound_replies, menschliche Antwort (ohne Abwesenheitsnotiz; Bounces/Auto-Antworten speichert der
             Antwort-Assistent dort gar nicht), nicht vom Inhaber
  probe      sample_requests mit is_test = false, nicht von der Inhaber-Adresse
  checkout   page_events_echt (= page_events ohne is_test), type = checkout_started
  kunde      customers / subscriptions, ohne Stripe-Testmodus (deliveries.is_test_customer)
  notbremse  email_events type = complained, oder die Notbremse greift (outreach.notbremse)

Die JARVIS-Runden der Hauptsitzung (alle 15 min) lesen die offenen Ereignisse:

  python scripts/gehirn_weckruf.py offen             # JSON der offenen Ereignisse ([] = nichts zu tun)
  python scripts/gehirn_weckruf.py erledigt 12       # ein Ereignis abhaken
  python scripts/gehirn_weckruf.py erledigt alle     # alle offenen abhaken

`offen` liefert [], wenn in den letzten 20 min schon eine Ereignis-Sitzung lief (handled_at < 20 min).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

TABLE = "gehirn_weckruf"
FENSTER_H = 48
PAUSE_MIN = 20
KURZ_MAX = 120


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat()


def kurz(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= KURZ_MAX else text[:KURZ_MAX - 1].rstrip() + "…"


def owner_addresses() -> set[str]:
    """Adressen des Inhabers aus der Umgebung (wie app/lib/owner-address.ts), nie im Code."""
    out = set()
    for var in ("OWNER_EMAIL", "SALE_NOTIFY_EMAIL"):
        for a in (os.environ.get(var) or "").split(","):
            if a.strip():
                out.add(a.strip().lower())
    return out


def is_test_customer(c: dict) -> bool:
    """Wie deliveries.is_test_customer / dashboard-logic.isTestCustomer: Kauf im Stripe-Testmodus."""
    return (c.get("status") == "trial"
            and (bool(c.get("stripe_customer_id")) or "Stripe-Testmodus" in (c.get("notes") or "")))


def _antworten(db, since: str, owner: set[str]) -> list[dict]:
    rows = db.select("inbound_replies", {"received_at": f"gte.{since}",
                                         "select": "id,from_email,intent,summary_de,subject", "limit": "200"})
    out = []
    for r in rows:
        if r.get("intent") == "out_of_office" or (r.get("from_email") or "").lower() in owner:
            continue
        txt = r.get("summary_de") or r.get("subject") or ""
        out.append({"kind": "antwort", "ref": str(r["id"]),
                    "kurz": kurz(f"Antwort ({r.get('intent') or 'neu'}) von {r.get('from_email')}: {txt}")})
    return out


def _proben(db, since: str, owner: set[str]) -> list[dict]:
    rows = db.select("sample_requests", {"created_at": f"gte.{since}", "is_test": "eq.false",
                                         "select": "id,company_name,email,country,segment_id,status", "limit": "200"})
    out = []
    for r in rows:
        if (r.get("email") or "").lower() in owner:
            continue
        out.append({"kind": "probe", "ref": str(r["id"]),
                    "kurz": kurz(f"Probe-Anfrage {r.get('segment_id') or ''}/{r.get('country') or ''}: "
                                 f"{r.get('company_name') or r.get('email')} (Status {r.get('status')})")})
    return out


def _checkouts(db, since: str) -> list[dict]:
    rows = db.select("page_events_echt", {"created_at": f"gte.{since}", "type": "eq.checkout_started",
                                          "select": "id,variant_id,created_at", "limit": "200"})
    return [{"kind": "checkout", "ref": str(r["id"]), "kurz": kurz(f"Checkout gestartet (Seite {r.get('variant_id')})")}
            for r in rows]


def _kunden(db, since: str) -> list[dict]:
    cols = "id,company_name,status,notes,stripe_customer_id,country"
    out, cust = [], {}
    for c in db.select("customers", {"created_at": f"gte.{since}", "select": cols, "limit": "200"}):
        cust[str(c["id"])] = c
        if not is_test_customer(c) and c.get("status") != "cancelled":
            out.append({"kind": "kunde", "ref": f"customer:{c['id']}",
                        "kurz": kurz(f"Neuer Kunde: {c.get('company_name')} ({c.get('country') or '?'})")})
    subs = db.select("subscriptions", {"created_at": f"gte.{since}", "status": "in.(active,past_due,trialing)",
                                       "select": "id,customer_id,package,segment_id,status", "limit": "200"})
    for s in subs:
        cid = str(s.get("customer_id"))
        c = cust.get(cid)
        if c is None:
            rows = db.select("customers", {"id": f"eq.{cid}", "select": cols})
            c = rows[0] if rows else None
        if c is None or is_test_customer(c):
            continue
        out.append({"kind": "kunde", "ref": f"subscription:{s['id']}",
                    "kurz": kurz(f"Neues Abo {s.get('package') or ''} {s.get('segment_id') or ''}: "
                                 f"{c.get('company_name')}")})
    return out


def notbremse_grund(db) -> str | None:
    """Greift die Notbremse gerade? (gleiche Rechnung wie der Versand, outreach.notbremse)"""
    import outreach
    return outreach.notbremse(db)


def _notbremse(db, since: str, now: dt.datetime) -> list[dict]:
    out = []
    for e in db.select("email_events", {"created_at": f"gte.{since}", "type": "eq.complained",
                                        "select": "id,note", "limit": "200"}):
        out.append({"kind": "notbremse", "ref": f"complaint:{e['id']}",
                    "kurz": kurz(f"Spam-Beschwerde: {e.get('note') or e['id']}")})
    try:
        grund = notbremse_grund(db)
    except Exception as exc:  # noqa: BLE001 - Beschwerden oben zählen trotzdem
        print(f"Notbremse nicht prüfbar: {type(exc).__name__}: {str(exc)[:160]}", file=sys.stderr)
        grund = None
    if grund:  # einmal je Tag (UTC) melden, solange sie greift
        out.append({"kind": "notbremse", "ref": f"stopp:{now.date().isoformat()}",
                    "kurz": kurz(f"Notbremse aktiv: {grund}")})
    return out


def erkennen(db, now: dt.datetime | None = None) -> list[dict]:
    """Alle Ereignisse der letzten 48 h (ohne zu schreiben). Ein Fehler in einer Quelle stoppt die anderen nicht."""
    now = now or _now()
    since = _iso(now - dt.timedelta(hours=FENSTER_H))
    owner = owner_addresses()
    out: list[dict] = []
    for name, fn in (("antwort", lambda: _antworten(db, since, owner)), ("probe", lambda: _proben(db, since, owner)),
                     ("checkout", lambda: _checkouts(db, since)), ("kunde", lambda: _kunden(db, since)),
                     ("notbremse", lambda: _notbremse(db, since, now))):
        try:
            out += fn()
        except Exception as exc:  # noqa: BLE001
            print(f"Weckruf-Quelle {name} nicht lesbar: {type(exc).__name__}: {str(exc)[:160]}", file=sys.stderr)
    return out


def sammeln(db=None, now: dt.datetime | None = None) -> int:
    """Neue Ereignisse in gehirn_weckruf eintragen (insert … on conflict do nothing). Gibt die Zahl neuer Zeilen."""
    if db is None:
        from lib.db import DB
        db = DB()
    rows = erkennen(db, now)
    if not rows:
        return 0
    new = db.insert(TABLE, rows, upsert_on="kind,ref", ignore_duplicates=True) or []
    return len(new)


def offen(db, now: dt.datetime | None = None) -> list[dict]:
    """Offene Ereignisse; leer, wenn in den letzten 20 min schon eine Ereignis-Sitzung etwas abgehakt hat."""
    now = now or _now()
    recent = db.select(TABLE, {"handled_at": f"gte.{_iso(now - dt.timedelta(minutes=PAUSE_MIN))}",
                               "select": "id", "limit": "1"})
    if recent:
        return []
    return db.select(TABLE, {"handled_at": "is.null", "select": "id,kind,ref,kurz,created_at",
                             "order": "created_at.asc", "limit": "100"})


def erledigt(db, ziel: str, now: dt.datetime | None = None) -> int:
    stamp = {"handled_at": _iso(now or _now())}
    if ziel == "alle":
        return len(db.update(TABLE, {"handled_at": None}, stamp) or [])
    return len(db.update(TABLE, {"id": int(ziel), "handled_at": None}, stamp) or [])


def main(argv=None, db=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("offen", help="offene Ereignisse als JSON")
    sub.add_parser("sammeln", help="nur Ereignisse eintragen")
    e = sub.add_parser("erledigt", help="Ereignis(se) abhaken")
    e.add_argument("ziel", help="ID oder 'alle'")
    args = ap.parse_args(argv)
    if args.cmd == "erledigt" and args.ziel != "alle" and not args.ziel.isdigit():
        ap.error("erledigt braucht eine ID oder 'alle'")
    if db is None:
        from lib.db import DB
        db = DB()
    if args.cmd == "erledigt":
        print(json.dumps({"erledigt": erledigt(db, args.ziel)}))
        return 0
    try:
        n = sammeln(db)
    except Exception as exc:  # noqa: BLE001 - offene Ereignisse trotzdem zeigen
        print(f"Sammeln fehlgeschlagen: {type(exc).__name__}: {str(exc)[:160]}", file=sys.stderr)
        n = 0
    if args.cmd == "sammeln":
        print(json.dumps({"neu": n}))
        return 0
    print(json.dumps(offen(db), ensure_ascii=False, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
