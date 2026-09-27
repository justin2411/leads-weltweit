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


LAND = {"UK": "the UK", "US": "the US", "IE": "Ireland", "NL": "the Netherlands", "SE": "Sweden", "BE": "Belgium", "FR": "France"}


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
    # Leads aus dem ganzen Land (Inhaber 27.09.2026), keine Region im Text
    area = LAND.get(country, "your country")
    spec = (p.get("specialization") or "").strip()
    has_spec = spec.lower() not in GENERIC_SPEC
    fr = country == "FR"
    lang = "fr" if fr else "en"
    ex = _example_line(example, lang)

    # Aufbau (Inhaber 27.09.2026, Richtung "C, auf den Punkt"): persönlich vom Gründer, klarer Nutzen
    # (Leads, mit denen der Käufer Umsatz machen kann, weil die Firmen einen konkreten Anlass haben),
    # Lieferung und Exklusivität in einem Satz, Probe als fertiges Geschenk, Ja/Nein-Frage.
    me = (os.environ.get("SENDER_NAME") or "").split(" ")[0]
    if fr:
        need, kind, subject = {
            "S1": (f"des employeurs de toute la France qui ont en ce moment un vrai besoin de recrutement, par exemple un poste "
                   "ouvert depuis des semaines ou plusieurs embauches à la fois", "cabinet",
                   "Employeurs en France qui cherchent de l'aide pour recruter"),
            "S2": (f"des entreprises de toute la France tout juste créées qui ont encore besoin de leur site web", "agence",
                   "Nouvelles entreprises en France sans site web"),
        }.get(seg, (f"des dirigeants de toute la France qui viennent de créer leur entreprise et se posent leurs premières "
                    "questions de retraite et de prévoyance", "cabinet", "Nouveaux dirigeants en France"))
        intro = (f"Je suis {me}, fondateur de {brand()}." if me else f"Je suis le fondateur de {brand()}.")
        first = f"{intro} Nous livrons des pistes qui se transforment en chiffre d'affaires : {need}."
        core = (f"Elles arrivent chaque lundi en briefing PDF et en tableau, avec téléphone, e-mail, interlocuteur et une "
                f"phrase d'accroche. Chaque piste ne va qu'à "
                f"une seule {'agence' if kind == 'agence' else 'entreprise'} de votre secteur.")
        ask = f"J'ai préparé pour vous un échantillon gratuit de 10 pistes actuelles de toute la France. Je vous l'envoie ?"
        greet, bye = "Bonjour,", "Bien cordialement,"
    else:
        need, kind, subject = {
            "S1": (f"employers across {area} with a real need for recruitment help right now, such as roles open for weeks "
                   "or several hires at once", "agency", f"Employers across {area} who need recruitment help"),
            "S2": (f"companies across {area} that were just founded and still need their website", "web agency",
                   f"New businesses across {area} that need a website"),
            "S3": (f"companies across {area} that are growing fast and will soon need IT support", "IT firm",
                   f"Growing businesses across {area}"),
            "S4": (f"new businesses across {area} that need their first liability, property and employer cover", "broker",
                   f"New businesses across {area} that need cover"),
            "S5": (f"companies across {area} that were just founded and still need an accountant", "practice",
                   f"New companies across {area} needing an accountant"),
            "S9": (f"new company directors across {area} facing pension and protection questions for the first time",
                   "advice firm", f"New company directors across {area}"),
        }.get(seg, (f"companies across {area} with a concrete reason to buy right now", "firm",
                    f"Companies across {area} with a reason to buy"))
        intro = f"I'm {me}, founder of {brand()}." if me else f"I'm the founder of {brand()}."
        first = f"{intro} We deliver leads you can turn into revenue: {need}."
        core = (f"They arrive every Monday as a short PDF briefing and a spreadsheet, each with phone, email, the contact person "
                f"and an opening line. Each lead goes to one {kind} only.")
        ask = f"I've put together a free sample of 10 current leads from across {area} for you. Shall I send it over?"
        greet, bye = f"Hi {firm} team,", "Best regards,"
    parts = [greet, first] + ([ex] if ex else []) + [core, ask, f"{bye}\n{sender or signature(lang)}"]
    body = "\n\n".join(parts)
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


def refresh(db, dry_run: bool = False) -> int:
    """Offene Entwürfe neu schreiben (gleicher Käufer, aktueller Text). Verstößt der neue Text gegen eine Regel,
    geht ein freigegebener Entwurf zurück auf draft – nie umgekehrt."""
    n = back = 0
    for m in db.select_all("messages", {"status": "in.(draft,approved)", "sent_at": "is.null", "order": "id",
                                         "select": "id,status,subject,body,prospects(*)"}):
        p = m.get("prospects")
        if not p:
            continue
        subject, body, lang = build(p)
        if subject == m["subject"] and body == m["body"]:
            continue
        lint = lint_draft(subject, body, lang)
        upd = {"subject": subject, "body": body, "language": lang, "check_errors": lint.errors}
        if m["status"] == "approved" and not lint.ok:
            upd["status"] = "draft"
            back += 1
        n += 1
        if not dry_run:
            db.update("messages", {"id": m["id"]}, upd)
    print(f"{n} Entwürfe neu geschrieben, {back} wegen Regelverstoß zurück auf draft")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--variant", default="v1")
    ap.add_argument("--approve", help="Freigabe des Inhabers (Wortlaut/Datum): Entwürfe ohne Regelverstoß freigeben")
    ap.add_argument("--refresh", action="store_true",
                    help="offene Entwürfe (draft/approved, nicht gesendet) auf den aktuellen Text bringen")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    if args.refresh:
        return refresh(db, dry_run=args.dry_run)
    # nur laufende Experimente (gestoppte und abgeschlossene bekommen keine neuen Entwürfe)
    exps = {(e["segment_id"], e["country"]): e for e in db.select("experiments", {"variant": f"eq.{args.variant}"})
            if e.get("decision") != "killed" and e.get("status") != "done"}
    prospects = db.select_all("prospects", {"check_status": "eq.ok", "order": "created_at"})
    # CLAUDE.md 5.1: ohne mindestens 10 echte Probe-Leads kein Entwurf und kein Versand
    samples = {}
    for l in db.select("leads", {"status": "eq.sample", "select": "segment_id,country"}):
        k = (l["segment_id"], l["country"])
        samples[k] = samples.get(k, 0) + 1
    ready = {k for k, v in samples.items() if v >= 10}
    print("Probe vorhanden für:", ", ".join(f"{a}/{b}" for a, b in sorted(ready)) or "keine")
    n = bad = 0
    counts: dict[str, int] = {}
    total_cap = int(os.environ.get("MAX_TOTAL_MAILS", "100000"))  # Inhaber 26.09.2026: 250 pro Tag fortlaufend
    total = len(db.select_all("messages", {"select": "id"}))
    for p in prospects:
        e = exps.get((p["segment_id"], p["country"]))
        if not e or (p["segment_id"], p["country"]) not in ready:
            continue
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
        subject, body, lang = build(p)
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
