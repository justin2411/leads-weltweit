#!/usr/bin/env python3
"""Prüft die Mail-DNS-Einträge von nextgen-profit.de (Empfang bei Strato, Versand Strato + Resend).

  python scripts/dns_check.py [domain]

Ändert nichts. Rückgabe 1, wenn Pflichteinträge fehlen.
"""
from __future__ import annotations

import sys

import dns.resolver


STRATO_DKIM = ("strato-dkim-0002", "strato-dkim-0003")


def records(name: str, rtype: str) -> list[str]:
    try:
        return [r.to_text().strip('"') for r in dns.resolver.resolve(name, rtype)]
    except Exception:  # noqa: BLE001 - fehlender Eintrag = leere Liste
        return []


def checks(domain: str, rec=records) -> list[tuple[str, bool, list[str]]]:
    """Alle Prüfungen als (Bezeichnung, bestanden, gefundene Einträge); rec(name, rtype) ist austauschbar (Tests)."""
    mx = rec(domain, "MX")
    spf = [t for t in rec(domain, "TXT") if t.startswith("v=spf1")]
    dmarc = [t for t in rec(f"_dmarc.{domain}", "TXT") if t.startswith("v=DMARC1")]
    # Strato-DKIM (eingerichtet 02.10.2026): Selektoren zeigen per CNAME auf Strato, dort liegt der Schlüssel
    dkim = [c for sel in STRATO_DKIM for c in rec(f"{sel}._domainkey.{domain}", "CNAME") if "strato.de" in c]
    return [
        ("MX zeigt auf Strato (smtpin.rzone.de)", any("rzone.de" in m for m in mx), mx),
        ("SPF erlaubt Strato (smtp.rzone.de)", any("rzone.de" in t for t in spf), spf),
        ("genau ein SPF-Eintrag", len(spf) == 1, spf),
        ("DMARC vorhanden", bool(dmarc), dmarc),
        ("Strato-DKIM (CNAME auf strato.de)", bool(dkim), dkim),
        ("Resend-DKIM unverändert", bool(rec(f"resend._domainkey.{domain}", "TXT")), []),
        ("Resend-Rückläufer (send) unverändert", bool(rec(f"send.{domain}", "MX")), []),
    ]


def main(argv=None) -> int:
    domain = (argv or sys.argv[1:] or ["nextgen-profit.de"])[0]
    checks_ = checks(domain)
    ok = True
    for label, passed, found in checks_:
        ok &= passed
        print(f"{'OK ' if passed else 'FEHLT'}  {label}  {found if found else ''}")
    print("Hinweis: ob die Signatur wirklich gültig ist, prüft postfach-test (Schritt 4) an einer echten Mail.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
