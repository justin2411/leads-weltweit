"""Freigegebene Erstmails mit hohem Rückläufer-Risiko zurückstellen (Bounce-Analyse 05.10.2026, nur strenger).

Merkmale aus den echten Rückläufern:
  5.1.3  Adresse verletzt die RFC-Syntax           -> zurück auf draft, Grund in check_errors
  5.4.1  Empfänger bei Microsoft 365, Adresse nicht frisch (≤ 7 Tage) wörtlich auf der eigenen Website belegt
                                                     -> zurück auf draft, Grund in check_errors
Nichts wird gelöscht. Mit --bestaetigen N werden bis zu N zurückgestellte Microsoft-365-Entwürfe (Adresse auf der
eigenen Firmendomain) einmal auf der Website nachgeprüft: gefunden -> wieder freigegeben (Fund wird gespeichert),
nicht gefunden -> blockiert wie bei der Frischeprüfung im Versand. Jeder Entwurf wird so höchstens einmal abgerufen.

  python scripts/zurueckstellen.py                 # nur zählen
  python scripts/zurueckstellen.py --apply         # zurückstellen
  python scripts/zurueckstellen.py --apply --seit-stunden 3 --bestaetigen 20
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import freshness  # noqa: E402
from lib.deliverability import is_m365, mx_hosts  # noqa: E402

SEL = "id,to_email,check_errors,approved_at,prospects(id,website,domain,source_url,checked_at)"


def reasons(m: dict, m365: bool, now: dt.datetime | None = None) -> list[str]:
    """Zurückstell-Gründe einer freigegebenen Erstmail (leer = bleibt freigegeben)."""
    from kundenwerk import address_ok
    p = m.get("prospects") or {}
    out = []
    if not address_ok(m.get("to_email") or ""):
        out.append(freshness.SYNTAX_REASON)
    elif m365 and not freshness.m365_proof_ok(m["to_email"], p, now):
        out.append(freshness.M365_REASON)
    return out


def m365_map(emails: list[str], workers: int = 16) -> dict[str, bool]:
    doms = sorted({e.rsplit("@", 1)[-1].strip().lower() for e in emails if "@" in (e or "")})
    with ThreadPoolExecutor(workers) as ex:
        return dict(zip(doms, ex.map(lambda d: is_m365(mx_hosts(d)), doms)))


def hold(db, apply: bool, since_hours: float | None) -> dict:
    q = {"status": "eq.approved", "kind": "eq.initial", "sent_at": "is.null", "select": SEL, "order": "id"}
    if since_hours:
        q["approved_at"] = "gte." + (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=since_hours)).isoformat()
    rows = db.select_all("messages", q)
    ms = m365_map([m.get("to_email") or "" for m in rows])
    stats = {"geprueft": len(rows), "m365_empfaenger": 0, "syntax": 0, "m365": 0}
    for m in rows:
        dom = (m.get("to_email") or "").rsplit("@", 1)[-1].lower()
        stats["m365_empfaenger"] += bool(ms.get(dom))
        why = reasons(m, bool(ms.get(dom)))
        if not why:
            continue
        stats["syntax" if why[0] == freshness.SYNTAX_REASON else "m365"] += 1
        if apply:
            db.update("messages", {"id": m["id"]}, {"status": "draft",
                                                   "check_errors": freshness.keep_holds(m.get("check_errors"), why)})
    return stats


def confirm(db, apply: bool, limit: int) -> dict:
    """Zurückgestellte Microsoft-365-Entwürfe einmal auf der Website nachprüfen (höflicher Abruf, robots.txt)."""
    out = {"bestaetigt": 0, "nicht_gefunden": 0}
    if limit <= 0:
        return out
    rows = [m for m in db.select_all("messages", {"status": "eq.draft", "kind": "eq.initial", "sent_at": "is.null",
                                                   "check_errors": "cs.{\"" + freshness.M365_REASON + "\"}",
                                                   "select": SEL, "order": "approved_at.asc.nullslast"})
            if freshness.own_domain_address(m.get("to_email") or "", m.get("prospects") or {})][:limit]
    from enrich import Fetcher
    fetcher = Fetcher()
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for m in rows:
        p = m["prospects"]
        found, url = freshness.confirm_on_website(m["to_email"], p.get("website") or "", fetcher)
        ok = found and freshness.host_of(url or "") == m["to_email"].rsplit("@", 1)[-1].lower()
        out["bestaetigt" if ok else "nicht_gefunden"] += 1
        print(f"{'BESTÄTIGT' if ok else 'NICHT GEFUNDEN'} {m['to_email']}")
        if not apply:
            continue
        rest = [x for x in (m.get("check_errors") or []) if x != freshness.M365_REASON]
        if ok:
            db.update("prospects", {"id": p["id"]}, {"source_url": url, "checked_at": now})
            # nur zurück auf freigegeben, wenn kein anderer Prüffehler/Zurückstell-Grund mehr offen ist
            db.update("messages", {"id": m["id"]}, {"check_errors": rest, **({"status": "approved"} if not rest else {})})
        else:
            db.update("messages", {"id": m["id"]}, {"status": "blocked", "check_errors": rest,
                                                   "blocked_reason": "Frischeprüfung: Adresse nicht (mehr) auf der Website"})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--seit-stunden", type=float, default=None, help="nur in den letzten N Stunden freigegebene")
    ap.add_argument("--bestaetigen", type=int, default=0, help="bis zu N Microsoft-365-Entwürfe auf der Website prüfen")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    s = hold(db, args.apply, args.seit_stunden)
    print(f"{s['geprueft']} freigegebene Erstmails geprüft, {s['m365_empfaenger']} an Microsoft 365; zurückgestellt: "
          f"{s['syntax']} Syntax (5.1.3), {s['m365']} Microsoft 365 ohne frischen Beleg (5.4.1)"
          + ("" if args.apply else " – Probelauf, mit --apply speichern"))
    c = confirm(db, args.apply, args.bestaetigen)
    if args.bestaetigen:
        print(f"Website-Nachprüfung: {c['bestaetigt']} bestätigt (wieder frei), {c['nicht_gefunden']} nicht gefunden")
    return 0


if __name__ == "__main__":
    sys.exit(main())
