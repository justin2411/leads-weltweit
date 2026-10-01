#!/usr/bin/env python3
"""Käufer-Kandidaten aus einer CSV-Datei übernehmen und auf ihrer Website prüfen.

  python scripts/prospects.py candidates/S2-US-NY.csv

CSV-Spalten: segment,country,company_name,website,region,specialization,size_note,found_via

Für jeden Kandidaten:
  - Startseite und typische Kontaktseiten abrufen (robots.txt, 1x/Tag, keine gesperrten Plattformen)
  - veröffentlichte Firmen-E-Mail-Adresse finden (allgemeine Adressen bevorzugt, nur eigene Domain)
  - Rechtsform aus Impressum/Fußzeile ablesen (Ltd, LLP, LLC, Inc ...)
  - als prospect speichern (unchecked); danach `outreach.py check --db`
Keine Personennamen, keine Kontaktformulare.
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fetch import FetchRefused, polite_get  # noqa: E402
from lib.rules import load_countries, normalize_domain  # noqa: E402

CONTACT_PATHS = ["", "/contact", "/contact-us", "/contact/", "/contact-us/", "/about", "/about-us", "/imprint",
                 "/legal", "/privacy-policy"]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
SKIP_EMAIL = re.compile(r"\.(png|jpg|jpeg|gif|svg|webp)$|example\.|sentry|wixpress|domain\.com|yourdomain|email\.com", re.I)

LEGAL_PATTERNS = {
    "UK": [(r"\bLLP\b", "LLP"), (r"\b(Ltd\.?|Limited)\b", "Ltd"), (r"\bPLC\b", "PLC")],
    "IE": [(r"\bDAC\b", "DAC"), (r"\b(Ltd\.?|Limited)\b", "Ltd")],
    "FR": [(r"\bSASU\b", "SASU"), (r"\bSAS\b", "SAS"), (r"\bSARL\b", "SARL"), (r"\bEURL\b", "EURL"),
           (r"\bS\.A\.\b|\bSA\b(?= au capital)", "SA")],
    "US": [(r"\bL\.?L\.?C\.?\b", "LLC"), (r"\b(Inc\.?|Incorporated)\b", "Inc"), (r"\bCorp(oration)?\b", "Corp")],
    # Scout-Sprint 01.10.2026: Kapitalgesellschaften wie in lib/rules.COMPANY_FORMS
    "NL": [(r"\bB\.\s?V\.?(?=\W|$)", "BV"), (r"\bN\.\s?V\.?(?=\W|$)", "NV")],
    "BE": [(r"\bB\.?V\.?(?=\W|$)", "BV"), (r"\bS\.?R\.?L\.?(?=\W|$)", "SRL"), (r"\bN\.?V\.?(?=\W|$)", "NV"),
           (r"\bS\.?A\.?(?=\W|$)", "SA"), (r"\bBVBA\b", "BVBA"), (r"\bSPRL\b", "SPRL")],
    "SE": [(r"\bAB\b", "AB"), (r"\bAktiebolag(et)?\b", "AB")],
}
SE_ORGNR_AB = re.compile(r"(org\.?\s*nr\.?|organisationsnummer|org\.?\s*nummer)\s*:?\s*5\d{5}-?\d{4}\b", re.I)
FR_LEGAL_TEXT = [
    (r"soci[ée]t[ée] par actions simplifi[ée]e unipersonnelle", "SASU"),
    (r"soci[ée]t[ée] par actions simplifi[ée]e", "SAS"),
    (r"entreprise unipersonnelle [àa] responsabilit[ée] limit[ée]e", "EURL"),
    (r"soci[ée]t[ée] [àa] responsabilit[ée] limit[ée]e", "SARL"),
    (r"\b(SASU|SAS|SARL|EURL|SA)\b[^<\n]{0,20}au capital", None),
    (r"forme juridique\s*:?\s*(SASU|SAS|SARL|EURL|SA)\b", None),
]
UK_REGISTERED = re.compile(r"(company (registration )?(no\.?|number)|registered in (england|scotland|wales))[^0-9]{0,30}(\d{6,8}|SC\d{6})", re.I)


def pick_email(emails: set[str], domain: str, generic: set[str]) -> tuple[str | None, bool]:
    own = sorted(e for e in emails if normalize_domain(e.split("@")[1]) == domain or e.split("@")[1].endswith("." + domain))
    gen = [e for e in own if e.split("@")[0] in generic]
    order = ["info", "hello", "contact", "enquiries", "office", "studio", "team", "sales", "mail", "admin"]
    gen.sort(key=lambda e: order.index(e.split("@")[0]) if e.split("@")[0] in order else 99)
    if gen:
        return gen[0], True
    return (own[0], False) if own else (None, False)


def detect_legal_form(country: str, name: str, text: str) -> tuple[str | None, str | None]:
    """Rechtsform und (UK) Registernummer, wie auf der Website veröffentlicht."""
    reg = UK_REGISTERED.search(text)
    reg_no = reg.group(5) if reg else None
    # Firmenname mit Rechtsform in der Nähe von ©/Registered/Company bevorzugen
    for pat, form in LEGAL_PATTERNS.get(country, []):
        if re.search(pat, name, re.I):
            return form, reg_no
    for pat, form in LEGAL_PATTERNS.get(country, []):
        m = re.search(r"(©|&copy;|copyright|registered|company)[^<\n]{0,120}" + pat, text, re.I)
        if m:
            return form, reg_no
    if country in ("NL", "BE", "SE"):
        # Impressum/Fußzeile: Rechtsform neben KvK-, BTW-/TVA- oder Organisationsnummer (Scout-Sprint 01.10.2026)
        ctx = (r"(kvk|kamer van koophandel|btw|tva|ondernemingsnummer|num[ée]ro d'entreprise|org\.?\s*nr|"
               r"organisationsnummer|bedrijfsgegevens|handelsregister)")
        for pat, form in LEGAL_PATTERNS.get(country, []):
            if re.search(ctx + r"[^<\n]{0,120}" + pat, text, re.I) or re.search(pat + r"[^<\n]{0,120}" + ctx, text, re.I):
                return form, None
        # SE: Organisationsnummer 5xxxxx-xxxx = Aktiebolag (Bolagsverket-Nummernkreis)
        if country == "SE" and SE_ORGNR_AB.search(text):
            return "AB", None
    if country == "FR":
        # Mentions légales (Pflichtangaben): „SAS au capital de …“, „Forme juridique : SARL“, ausgeschriebene Formen
        for pat, form in FR_LEGAL_TEXT:
            m = re.search(pat, text, re.I)
            if m:
                return form or m.group(1).upper(), None
    return (("Ltd" if reg_no else None), reg_no) if country == "UK" else (None, None)


def scan(website: str, session: requests.Session, generic: set[str] | None = None) -> dict:
    base = website if website.startswith("http") else "https://" + website
    emails: dict[str, str] = {}
    text_all = ""
    pages = []
    for path in CONTACT_PATHS:
        url = urljoin(base.rstrip("/") + "/", path.lstrip("/")) if path else base
        try:
            r = polite_get(url, last_fetched=None, session=session)
        except (FetchRefused, requests.RequestException) as e:
            pages.append(f"{url}: {e.__class__.__name__}")
            continue
        if r.status_code >= 400 or "html" not in r.headers.get("content-type", "html"):
            continue
        html = r.text
        text_all += "\n" + html[-20000:] + "\n" + html[:5000]
        pages.append(r.url)
        for e in EMAIL_RE.findall(html.replace("&#64;", "@").replace("%40", "@")):
            e = e.lower().strip(".")
            if not SKIP_EMAIL.search(e):
                emails.setdefault(e, r.url)
        dom = normalize_domain(urlparse(base).hostname or "")
        has_generic = any(e.split("@")[0] in (generic or set()) and e.endswith(dom) for e in emails)
        # Startseite + mind. eine Kontakt-/Impressumsseite (für Rechtsform), dann aufhören
        if has_generic and path and len(pages) >= 2:
            break
    return {"emails": emails, "text": text_all, "pages": pages,
            "final_domain": normalize_domain(urlparse(base).hostname or "")}


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="+")
    ap.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts speichern")
    ap.add_argument("--max", type=int, default=0, help="pro Datei aufhören, sobald so viele Adressen gefunden sind")
    args = ap.parse_args(argv)

    cfg = load_countries()
    generic = {g.lower() for g in cfg.get("generic_local_parts") or []}
    db = None
    if not args.dry_run:
        from lib.db import DB
        db = DB()
    session = requests.Session()
    found = missing = 0
    for path in args.csv:
        found_here = 0
        with open(path, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if args.max and found_here >= args.max:
                    break
                domain = normalize_domain(row["website"])
                if db and db.select("prospects", {"domain": f"eq.{domain}", "select": "id"}):
                    continue  # schon geprüft
                res = scan(row["website"], session, generic)
                email, is_gen = pick_email(set(res["emails"]), domain, generic)
                legal, reg_no = detect_legal_form(row["country"], row["company_name"], res["text"])
                status = f"{email or '-':<40} {'allg.' if is_gen else 'pers.' if email else '':<6} {legal or '?':<5}"
                print(f"{row['company_name'][:38]:<40} {status} {reg_no or ''}")
                if not email:
                    missing += 1
                    continue
                found += 1
                found_here += 1
                if db:
                    size_note = row.get("size_note") or None
                    if reg_no:
                        size_note = f"{size_note or ''} | Company No. {reg_no} (Website)".strip(" |")
                    db.insert("prospects", {
                        "segment_id": row["segment"], "company_name": row["company_name"], "legal_form": legal,
                        "country": row["country"], "region": row.get("region") or None, "website": row["website"],
                        "domain": domain, "email": email, "email_is_generic": is_gen,
                        "specialization": row.get("specialization") or None, "size_note": size_note,
                        "source_url": res["emails"][email],
                    }, upsert_on="domain", ignore_duplicates=True)
    print(f"\n{found} mit veröffentlichter Adresse, {missing} ohne")
    return 0


if __name__ == "__main__":
    sys.exit(main())
