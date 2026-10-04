#!/usr/bin/env python3
"""Offene Erstmail-Entwürfe mit der Adressprüfung (lib/address_risk.py) prüfen, nur strenger.

Betroffene Entwürfe (draft/approved, noch nicht gesendet) werden auf blocked mit Grund gesetzt. Nichts wird
gelöscht, die Sperrliste bleibt unverändert. DNS-unklare Adressen bleiben unverändert (der Versand prüft erneut).

  python scripts/adresspruefung.py            # nur zählen
  python scripts/adresspruefung.py --apply    # blockieren
"""
from __future__ import annotations

import argparse
import collections
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import address_risk  # noqa: E402


def scan(rows: list[dict], check=address_risk.check, workers: int = 16) -> dict[str, list[str]]:
    """Gründe je Nachricht-ID (nur betroffene). DNS je Domain einmal (Zwischenspeicher in mx_hosts/has_dmarc)."""
    emails = {m["id"]: (m.get("to_email") or "").strip().lower() for m in rows}
    by_dom: dict[str, str] = {}
    for e in emails.values():
        by_dom.setdefault(e.rsplit("@", 1)[-1], e)
    # Domains parallel vorwärmen, danach je Adresse (Lokalteil zählt bei Microsoft 365)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(check, by_dom.values()))
    out = {}
    for mid, e in emails.items():
        why = check(e)
        if why and why != [address_risk.UNKLAR]:
            out[mid] = why
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    rows = db.select_all("messages", {"status": "in.(draft,approved)", "kind": "eq.initial", "sent_at": "is.null",
                                      "select": "id,to_email,status", "order": "id"})
    hits = scan(rows)
    grund = collections.Counter(w[0] for w in hits.values())
    status = collections.Counter(m["status"] for m in rows if m["id"] in hits)
    print(f"{len(rows)} offene Erstmails geprüft, {len(hits)} betroffen ({dict(status)})")
    for g, n in grund.most_common():
        print(f"  {n:5}  {g}")
    if args.apply:
        for mid, why in hits.items():
            db.update("messages", {"id": mid}, {"status": "blocked", "blocked_reason": "Adressprüfung: " + "; ".join(why)})
        print(f"{len(hits)} Entwürfe auf blocked gesetzt (Grund gespeichert, nichts gelöscht)")
    else:
        print("Probelauf – mit --apply speichern")
    return 0


if __name__ == "__main__":
    sys.exit(main())
