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

from lib import catalog  # noqa: E402
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
    tagline = ("Pistes exclusives au bon moment pour les prestataires B2B" if lang == "fr"
               else "Exclusive trigger leads for B2B service firms")
    lines = [name, f"{title}, {company}", tagline] if name != company else [company, tagline]
    site = os.environ.get("SENDER_WEBSITE") or "www.nextgen-profit.de"
    lines += [x for x in (site.replace("https://", "").rstrip("/"), os.environ.get("SENDER_PHONE")) if x]
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

    # Aufbau (Schreibregeln Abschnitt 7): Bezug zur Firma, der Moment (warum jetzt), wie leicht es ist, ein kleines Ja.
    # Psychologie ohne Tricks: Timing statt Druck, Einfachheit, echte Exklusivität, Probe als Geschenk, Ja/Nein-Frage.
    if fr:
        first_generic = {"S1": f"J'ai vu que {firm} accompagne les entreprises de la région de {area} dans leurs recrutements.",
                         "S2": f"J'ai vu que {firm} conçoit des sites web pour les entreprises de la région de {area}."}
        first = (f"J'ai vu que {firm} recrute des profils {spec} dans la région de {area}." if seg == "S1" and has_spec
                 else first_generic.get(seg, f"J'ai vu que {firm} accompagne les chefs d'entreprise de la région de {area}."))
        subject, core = {
            "S1": (f"Employeurs à {area} qui peinent à recruter",
                   f"Autour de {area}, certains employeurs ont le même poste ouvert depuis des semaines ou recrutent "
                   "plusieurs personnes à la fois. C'est souvent le moment où ils sont le plus ouverts à un cabinet."),
            "S2": (f"Nouvelles entreprises à {area}",
                   f"Chaque semaine, de nouvelles sociétés sont créées autour de {area}. Dans les premières semaines, "
                   "elles choisissent leur site web, souvent avec la première agence qui les contacte."),
        }.get(seg, (f"Nouveaux dirigeants à {area}",
                    f"Les nouveaux dirigeants autour de {area} se posent leurs premières questions de rémunération, de "
                    "retraite et de prévoyance. Peu ont déjà un conseiller."))
        easy = ("C'est simple : chaque lundi, une courte liste avec l'entreprise, le téléphone, l'e-mail et une phrase "
                "d'accroche. Aucun logiciel, rien à installer, et chaque entreprise ne va qu'à une seule entreprise de "
                "votre secteur.")
        ask = f"Un simple « oui » suffit : je vous envoie un échantillon gratuit de 10 pistes actuelles pour {area} ?"
    elif seg in ("S1", "S2", "S3", "S4", "S5", "S9") or seg not in catalog.entries():
        what = {"S1": ("places {spec} staff", "recruits for employers"), "S2": ("builds {spec}", "builds websites for businesses"),
                "S3": ("provides {spec}", "looks after IT for businesses"), "S4": ("arranges {spec}", "arranges business insurance"),
                "S5": ("offers {spec}", "works with small businesses"), "S9": ("focuses on {spec}", "advises business owners")}
        w = what.get(seg, ("works in {spec}", "works with businesses"))
        first = f"I noticed {firm} {(w[0].format(spec=spec) if has_spec else w[1])} around {area}, so this may be relevant."
        subject, core = {
            "S1": (f"{area} employers struggling to fill roles",
                   f"Some employers around {area} have had the same roles open for weeks, or are hiring several people "
                   "at once. That is usually when they are most open to an agency."),
            "S2": (f"New businesses in {area}",
                   f"Every week new companies are registered around {area}. In their first weeks, owners decide on their "
                   "website, often with whoever reaches them first."),
            "S3": (f"Growing businesses around {area}",
                   f"Companies around {area} that open an office or hire fast soon need IT support. Reaching them in "
                   "that moment makes the first call easy."),
            "S4": (f"New businesses in {area} that need cover",
                   f"A company registered around {area} in the last weeks needs liability, property and employer cover "
                   "soon. The broker who calls first usually gets to quote."),
            "S5": (f"New companies in {area} choosing an accountant",
                   f"Most new directors around {area} choose their accountant in the first weeks. The practice that "
                   "calls at that moment has the easiest conversation."),
            "S9": (f"New company directors in {area}",
                   f"New directors around {area} face their first questions on pay, pensions and protection. Few have "
                   "an adviser yet."),
        }.get(seg, (f"Companies in {area} with a reason to buy",
                    f"Every week, companies around {area} are founded, hire or grow. That is when they choose new suppliers."))
        easy = ("It's simple: every Monday you get a short list with the company, phone number, email and an opening "
                "line. No software, nothing to set up, and each company goes to only one firm in your field.")
        ask = f"No strings attached, a quick \"yes\" is enough: shall I send you a free sample of 10 current leads from {area}?"
    else:
        subject, first, core, _detail, _ask = catalog.draft(seg, firm, area, spec if has_spec else "", brand(), ex)
        easy = ("It's simple: every Monday you get a short list with the company, phone number, email and an opening "
                "line. No software, nothing to set up, and each company goes to only one firm in your field.")
        ask = f"No strings attached, a quick \"yes\" is enough: shall I send you a free sample of 10 current leads from {area}?"

    greet, bye = ("Bonjour,", "Bien cordialement,") if fr else (f"Hello {firm} team,", "Best regards,")
    detail = f"{ex}\n\n{easy}" if ex else easy
    body = f"{greet}\n\n{first}\n\n{core}\n\n{detail}\n\n{ask}\n\n{bye}\n{sender or signature(lang)}"
    if len(subject) > 60:
        subject = subject[:57].rsplit(" ", 1)[0]
    return subject, body, lang


def regional_counts(db) -> dict:
    """(Segment, Land, Käufer-Region) -> Anzahl Leads aus dieser Region."""
    from lib.regions import FR, UK, US, lead_matches
    areas = {"UK": UK, "US": US, "FR": FR}
    county = {}
    for o in db.select_all("observations", {"kind": "eq.incorporation", "select": "company_id,details",
                                            "order": "id"}):
        county[o["company_id"]] = o.get("details") or {}
    out: dict = {}
    for l in db.select_all("leads", {"status": "in.(new,sample)", "order": "id",
                                      "select": "segment_id,country,company_id,watch_companies(address,region,city)"}):
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
    # nur laufende Experimente (gestoppte und abgeschlossene bekommen keine neuen Entwürfe)
    exps = {(e["segment_id"], e["country"]): e for e in db.select("experiments", {"variant": f"eq.{args.variant}"})
            if e.get("decision") != "killed" and e.get("status") != "done"}
    prospects = db.select_all("prospects", {"check_status": "eq.ok", "order": "created_at"})
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
    total = len(db.select_all("messages", {"select": "id"}))
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
        if counts.setdefault(e["id"], len(db.select_all("messages", {"experiment_id": f"eq.{e['id']}", "select": "id"}))) >= planned:
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
