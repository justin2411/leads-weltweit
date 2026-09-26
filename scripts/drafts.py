#!/usr/bin/env python3
"""Entwürfe für geprüfte Käufer schreiben (Status draft, nie gesendet).

  python scripts/drafts.py            # für alle prospects mit check_status=ok ohne Mail im Experiment v1
  python scripts/drafts.py --dry-run  # nur anzeigen

Eine Botschaft pro Experiment (v1): gleicher Kern, individueller erster Satz (Spezialisierung, Ort).
Jeder Entwurf wird gegen die Schreibregeln geprüft; Fehler landen in messages.check_errors.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.rules import brand, lint_draft  # noqa: E402

GENERIC_SPEC = {"recruitment", "general recruitment", "financial advice", "independent financial advice",
                "web design", "small business websites", "unverified", "", "it support", "commercial insurance",
                "accounting"}


def _place(region: str | None) -> tuple[str, str]:
    """(Ort, Großraum) aus 'Stockport, Greater Manchester' bzw. 'Brooklyn, NY'."""
    parts = [p.strip() for p in (region or "").split(",") if p.strip()]
    if not parts:
        return "your area", "your area"
    town = parts[0]
    area = parts[1] if len(parts) > 1 and not re.fullmatch(r"[A-Z]{2}", parts[1]) else town
    return town, area


def _clean_name(name: str) -> str:
    return re.sub(r"\s+(Ltd\.?|Limited|LLP|LLC|Inc\.?|SAS|SARL|SASU|EURL)$", "", name.strip(), flags=re.I)


def signature(lang: str) -> str:
    """Signatur aus Umgebungsvariablen (GitHub-Secrets/Variablen). Nur Angaben, die es wirklich gibt."""
    name = os.environ.get("SENDER_NAME") or brand()
    company = brand()
    title = os.environ.get("SENDER_TITLE") or ("Fondateur" if lang == "fr" else "Founder")
    tagline = ("Signaux de recrutement et de croissance pour les prestataires B2B" if lang == "fr"
               else "Hiring and growth signals for B2B service firms")
    lines = [name, f"{title}, {company}" if name != company else company, tagline]
    lines += [x for x in (os.environ.get("SENDER_WEBSITE"), os.environ.get("SENDER_PHONE")) if x]
    return "\n".join(lines)


def _example_line(example: dict | None, lang: str) -> str:
    """Ein echter Probe-Lead als Beleg (Firma, Ort, Datum, Quelle)."""
    if not example:
        return ""
    if lang == "fr":
        return (f"Un exemple récent : {example['company']}, {example['event_fr']} "
                f"le {example['date_fr']} ({example['source']}).")
    return f"A recent example: {example['company']}, {example['event']} on {example['date']} ({example['source']})."


def build(p: dict, sender: str | None = None, example: dict | None = None) -> tuple[str, str, str]:
    """(Betreff, Text, Sprache) für einen Käufer. example = echter Probe-Lead aus dem Markt des Käufers."""
    seg, country = p["segment_id"], p["country"]
    firm = _clean_name(p["company_name"])
    town, area = _place(p.get("region"))
    spec = (p.get("specialization") or "").strip()
    has_spec = spec.lower() not in GENERIC_SPEC
    fr = country == "FR"
    lang = "fr" if fr else "en"
    ex = _example_line(example, lang)

    if seg == "S1" and not fr:
        subject = f"Hiring signals from {area} employers"
        first = (f"I noticed {firm} places {spec} staff across {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} recruits for employers across {area}, so this may be relevant.")
        core = (f"{brand()} monitors local employers' own careers pages and flags the moments that usually lead "
                "to agency work: roles open for 30+ days, roles re-advertised, or several vacancies at once.")
        detail = ("Each lead shows the company, the role, when we first saw it and the source, "
                  "so your consultants can call with a specific reason.")
        ask = f"Would a free sample of 10 current leads from {area} be useful?"
    elif seg == "S2" and not fr:
        subject = f"Newly registered businesses in {area}"
        first = (f"I noticed {firm} builds {spec} for clients around {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} builds websites for businesses around {area}, so this may be relevant.")
        core = (f"{brand()} tracks official state filings and flags companies registered in the last few weeks. "
                "New owners are usually choosing their website, branding and online presence right now.")
        detail = ex or "Each lead shows the company, the registration date, the county and the official source."
        ask = f"Would a free sample of 10 recent registrations from {area} be useful?"
    elif seg == "S9" and not fr:
        subject = f"New and growing companies in {area}"
        first = (f"I noticed {firm} focuses on {spec} for clients around {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} advises business owners around {area}, so this may be relevant.")
        core = (f"{brand()} flags local companies at the moments when owners look for advice: a new registration, "
                "a hiring push or a new site. That is when pensions, protection and benefits come up.")
        detail = ex or "Each lead shows the company, the event, the date and the official source."
        ask = f"Would a free sample of 10 current leads from {area} be useful?"
    elif seg == "S3" and not fr:
        subject = f"Growing businesses around {area}"
        first = (f"I noticed {firm} provides {spec} to businesses around {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} looks after IT for businesses around {area}, so this may be relevant.")
        core = (f"{brand()} flags local companies at the moments when IT needs change: a new office, a hiring push "
                "or an open IT support role that has not been filled. Those are good reasons for an MSP to call.")
        detail = ex or "Each lead shows the company, what happened, when we saw it and the source."
        ask = f"Would a free sample of 10 current leads from {area} be useful?"
    elif seg == "S4" and not fr:
        subject = f"New and expanding businesses in {area}"
        first = (f"I noticed {firm} arranges {spec} for businesses around {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} arranges business insurance around {area}, so this may be relevant.")
        core = (f"{brand()} tracks official company registrations and local expansion signals. A newly registered "
                "company usually needs liability, property and employer cover in its first weeks.")
        detail = ex or "Each lead shows the company, the registration date, the location and the official source."
        ask = f"Would a free sample of 10 recent leads from {area} be useful?"
    elif seg == "S5" and not fr:
        subject = f"Newly registered companies in {area}"
        first = (f"I noticed {firm} offers {spec} to businesses around {area}, so this may be relevant."
                 if has_spec else f"I noticed {firm} works with small businesses around {area}, so this may be relevant.")
        core = (f"{brand()} tracks official company registrations and employers hiring for finance roles. New "
                "directors are usually choosing an accountant and payroll provider in their first weeks.")
        detail = ex or "Each lead shows the company, the registration date, the location and the official source."
        ask = f"Would a free sample of 10 recent leads from {area} be useful?"
    elif seg == "S1":
        subject = f"Signaux de recrutement à {area}"
        first = (f"J'ai vu que {firm} recrute des profils {spec} dans la région de {area}." if has_spec
                 else f"J'ai vu que {firm} accompagne les entreprises de la région de {area} dans leurs recrutements.")
        core = (f"{brand()} suit les pages carrières des employeurs locaux et repère les moments qui mènent souvent "
                "à un mandat : postes ouverts depuis plus de 30 jours, annonces republiées ou plusieurs postes à la fois.")
        detail = "Chaque piste indique l'entreprise, le poste, la date et la source."
        ask = f"Un échantillon gratuit de 10 pistes actuelles à {area} vous serait-il utile ?"
    elif seg == "S2":
        subject = f"Sociétés nouvellement créées à {area}"
        first = f"J'ai vu que {firm} conçoit des sites web pour les entreprises de la région de {area}."
        core = (f"{brand()} suit les annonces officielles de création au BODACC. Une société qui vient d'être "
                "immatriculée choisit en ce moment son site, son identité visuelle et sa présence en ligne.")
        detail = ex or "Chaque piste indique la société, la date de l'annonce, la ville et la source officielle."
        ask = f"Un échantillon gratuit de 10 créations récentes à {area} vous serait-il utile ?"
    else:  # S9 FR
        subject = f"Nouveaux dirigeants à {area}"
        first = f"J'ai vu que {firm} accompagne les chefs d'entreprise de la région de {area}."
        core = (f"{brand()} repère les entreprises locales au moment où leurs dirigeants cherchent conseil : création "
                "récente, vague de recrutements ou nouveau site. C'est là que se posent les questions de protection "
                "et d'épargne salariale.")
        detail = ex or "Chaque piste indique la société, l'événement, la date et la source officielle."
        ask = f"Un échantillon gratuit de 10 pistes actuelles à {area} vous serait-il utile ?"

    greet, bye = ("Bonjour,", "Bien cordialement,") if fr else (f"Hello {firm} team,", "Best regards,")
    body = f"{greet}\n\n{first}\n\n{core}\n\n{detail}\n\n{ask}\n\n{bye}\n{sender or signature(lang)}"
    if len(subject) > 60:
        subject = subject[:57].rsplit(" ", 1)[0]
    return subject, body, lang


def regional_counts(db) -> dict:
    """(Segment, Land, Käufer-Region) -> Anzahl Leads aus dieser Region."""
    from lib.regions import FR, UK, US, lead_matches
    areas = {"UK": UK, "US": US, "FR": FR}
    county = {}
    for o in db.select("observations", {"kind": "eq.incorporation", "select": "company_id,details",
                                        "limit": "100000"}):
        county[o["company_id"]] = o.get("details") or {}
    out: dict = {}
    for l in db.select("leads", {"status": "in.(new,sample)", "limit": "100000",
                                  "select": "segment_id,country,company_id,watch_companies(address,region)"}):
        for area in areas.get(l["country"], {}):
            if lead_matches(l["country"], area, l["watch_companies"], county.get(l["company_id"])):
                k = (l["segment_id"], l["country"], area)
                out[k] = out.get(k, 0) + 1
    return out


def load_examples(db) -> dict:
    """Je Segment und Land ein echter Probe-Lead (status sample) für den Beleg-Satz."""
    out = {}
    months_fr = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
                 "octobre", "novembre", "décembre"]
    for l in db.select("leads", {"status": "eq.sample", "signal_type": "eq.new_incorporation",
                                  "select": "segment_id,country,event_date,source_name,watch_companies(name,city,region)",
                                  "order": "event_date.desc"}):
        key = (l["segment_id"], l["country"])
        if key in out or not l.get("event_date"):
            continue
        import datetime as _dt
        d = _dt.date.fromisoformat(l["event_date"])
        c = l["watch_companies"]
        src = {"US": "NY Department of State", "FR": "BODACC", "UK": "Companies House"}.get(l["country"], l["source_name"])
        out[key] = {"company": c["name"].title().replace("Llc", "LLC").replace("Inc.", "Inc."),
                    "event": "registered", "event_fr": "immatriculée",
                    "date": f"{d:%-d %B %Y}", "date_fr": f"{d.day} {months_fr[d.month - 1]} {d.year}", "source": src}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--variant", default="v1")
    ap.add_argument("--approve", help="Freigabe des Inhabers (Wortlaut/Datum): Entwürfe ohne Regelverstoß freigeben")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    exps = {(e["segment_id"], e["country"]): e for e in db.select("experiments", {"variant": f"eq.{args.variant}"})}
    prospects = db.select("prospects", {"check_status": "eq.ok"})
    examples = load_examples(db)
    # CLAUDE.md 5.1: ohne mindestens 10 echte Probe-Leads kein Entwurf und kein Versand
    samples = {}
    for l in db.select("leads", {"status": "eq.sample", "select": "segment_id,country"}):
        k = (l["segment_id"], l["country"])
        samples[k] = samples.get(k, 0) + 1
    ready = {k for k, v in samples.items() if v >= 10}
    regional = regional_counts(db)
    print("Probe vorhanden für:", ", ".join(f"{a}/{b}" for a, b in sorted(ready)) or "keine")
    n = bad = 0
    counts: dict[str, int] = {}
    total_cap = int(os.environ.get("MAX_TOTAL_MAILS", "100000"))  # Inhaber 26.09.2026: 250 pro Tag fortlaufend
    total = len(db.select("messages", {"select": "id"}))
    for p in prospects:
        e = exps.get((p["segment_id"], p["country"]))
        if not e or (p["segment_id"], p["country"]) not in ready:
            continue
        from lib.regions import area_of
        if regional.get((p["segment_id"], p["country"], area_of(p.get("region"))), 0) < 10:
            continue  # ehrlich bleiben: nur anschreiben, wo wir 10 Leads aus der Region des Käufers haben
        if total + n >= total_cap:
            print(f"Gesamtgrenze {total_cap} erreicht")
            break
        planned = e.get("planned_count") or 50
        if counts.setdefault(e["id"], len(db.select("messages", {"experiment_id": f"eq.{e['id']}", "select": "id"}))) >= planned:
            continue
        if db.select("messages", {"prospect_id": f"eq.{p['id']}", "experiment_id": f"eq.{e['id']}", "select": "id"}):
            continue
        if db.rpc("is_suppressed", {"p_email": p["email"]}):
            continue
        subject, body, lang = build(p, example=examples.get((p['segment_id'], p['country'])))
        lint = lint_draft(subject, body, lang)
        n += 1
        bad += 0 if lint.ok else 1
        print(f"{p['segment_id']}/{p['country']} {p['email']:<40} {lint.summary()}")
        if not args.dry_run:
            approve = bool(args.approve) and lint.ok
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": e["id"], "to_email": p["email"],
                                   "subject": subject, "body": body, "language": lang,
                                   "status": "approved" if approve else "draft", "check_errors": lint.errors,
                                   **({"approved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                       "approved_by": f"Inhaber: {args.approve}"} if approve else {})})
            counts[e["id"]] = counts.get(e["id"], 0) + 1
    print(f"\n{n} Entwürfe, davon {bad} mit Regelverstoß")
    return 0


if __name__ == "__main__":
    sys.exit(main())
