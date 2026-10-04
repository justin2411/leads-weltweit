#!/usr/bin/env python3
"""Prüft die Mail-DNS-Einträge einer Versand-Domain. Ändert nichts. Rückgabe 1, wenn Pflichteinträge fehlen.

  python scripts/dns_check.py                  Hauptdomain nextgen-profit.de (Strato + Resend, wie bisher)
  python scripts/dns_check.py beispiel.com     weitere Versand-Domain (allgemeine Prüfung, jeder Anbieter)
  python scripts/dns_check.py --alle           Hauptdomain und jede Domain aus den Versand-Postfächern

Weitere Domains (Auftrag 05.10.2026): MX, genau ein SPF ohne „+all“, DMARC, DKIM unter einem bekannten Selektor
(Strato, Google, Microsoft, gängige Namen oder DKIM_SELECTOR). Ob die Signatur wirklich stimmt, prüft erst die
Testmail in scripts/mailbox_test.py; erst dann wird ein Postfach dieser Domain aktiv (lib/mailboxes.active_boxes).
"""
from __future__ import annotations

import os
import sys

import dns.resolver


STRATO_DKIM = ("strato-dkim-0002", "strato-dkim-0003")
MAIN_DOMAIN = "nextgen-profit.de"
# übliche DKIM-Selektoren der Mail-Anbieter (Strato, Google Workspace, Microsoft 365, IONOS, Zoho, cPanel …)
DKIM_SELECTORS = STRATO_DKIM + ("google", "selector1", "selector2", "default", "dkim", "mail", "k1", "s1", "s2",
                                "zmail", "smtp", "key1")


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


def selectors(env=None) -> tuple[str, ...]:
    env = os.environ if env is None else env
    extra = tuple(x.strip() for x in (env.get("DKIM_SELECTOR") or "").split(",") if x.strip())
    return extra + DKIM_SELECTORS


def generic_checks(domain: str, rec=records, sels=None) -> list[tuple[str, bool, list[str]]]:
    """Prüfung einer weiteren Versand-Domain bei beliebigem Anbieter."""
    mx = rec(domain, "MX")
    spf = [t for t in rec(domain, "TXT") if t.startswith("v=spf1")]
    dmarc = [t for t in rec(f"_dmarc.{domain}", "TXT") if t.startswith("v=DMARC1")]
    dkim = []
    for sel in sels or selectors():
        name = f"{sel}._domainkey.{domain}"
        dkim += [f"{sel}: {c}" for c in rec(name, "CNAME")]
        dkim += [f"{sel}: TXT" for t in rec(name, "TXT") if "p=" in t and "p=;" not in t.replace(" ", "")]
        if dkim:
            break
    return [
        ("MX vorhanden (Rückläufer und Antworten kommen an)", bool(mx), mx),
        ("SPF vorhanden", bool(spf), spf),
        ("genau ein SPF-Eintrag", len(spf) == 1, spf),
        ("SPF ohne +all", bool(spf) and not any("+all" in t for t in spf), spf),
        ("DMARC vorhanden", bool(dmarc), dmarc),
        ("DKIM-Schlüssel unter einem bekannten Selektor", bool(dkim), dkim),
    ]


def domain_checks(domain: str, rec=records) -> list[tuple[str, bool, list[str]]]:
    """Hauptdomain: die bisherige strenge Strato/Resend-Prüfung; jede andere Domain: allgemeine Prüfung."""
    return checks(domain, rec) if domain.lower() == MAIN_DOMAIN else generic_checks(domain.lower(), rec)


def domain_ok(domain: str, rec=records) -> tuple[bool, list[str]]:
    """(alles grün, fehlende Punkte) – für scripts/mailbox_test.py."""
    res = domain_checks(domain, rec)
    return all(p for _, p, _ in res), [label for label, p, _ in res if not p]


def all_domains(env=None) -> list[str]:
    from lib.mailboxes import mailboxes
    out = [MAIN_DOMAIN]
    for b in mailboxes(env):
        if b.get("domain") and b["domain"] not in out:
            out.append(b["domain"])
    return out


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--alle" in args:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        domains = all_domains()
    else:
        domains = [(args or [MAIN_DOMAIN])[0]]
    ok = True
    for domain in domains:
        if len(domains) > 1:
            print(f"== {domain}")
        for label, passed, found in domain_checks(domain):
            ok &= passed
            print(f"{'OK ' if passed else 'FEHLT'}  {label}  {found if found else ''}")
    print("Hinweis: ob die Signatur wirklich gültig ist, prüft postfach-test (Schritt 4/5) an einer echten Mail.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
