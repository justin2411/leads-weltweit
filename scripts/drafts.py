#!/usr/bin/env python3
"""Entwürfe für geprüfte Käufer schreiben (Status draft, nie gesendet).

  python scripts/drafts.py            # für alle prospects mit check_status=ok ohne Mail im Experiment v1
  python scripts/drafts.py --dry-run  # nur anzeigen

Eine Botschaft pro Experiment (v1): gleicher Kern, individueller erster Satz (Spezialisierung, Ort).
Jeder Entwurf wird gegen die Schreibregeln geprüft; Fehler landen in messages.check_errors.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.rules import lint_draft  # noqa: E402

GENERIC_SPEC = {"recruitment", "general recruitment", "financial advice", "independent financial advice",
                "web design", "small business websites", "unverified", ""}


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


def build(p: dict, sender: str) -> tuple[str, str, str]:
    """(Betreff, Text, Sprache) für einen Käufer."""
    seg, country = p["segment_id"], p["country"]
    firm = _clean_name(p["company_name"])
    town, area = _place(p.get("region"))
    spec = (p.get("specialization") or "").strip()
    has_spec = spec.lower() not in GENERIC_SPEC
    fr = country == "FR"

    if seg == "S1" and not fr:
        first = (f"I saw that {firm} recruits {spec} staff around {area}." if has_spec
                 else f"I saw that {firm} works as a recruitment agency around {area}.")
        subject = f"Stalled vacancies at {area} employers"
        core = (f"We track employers in {area} whose own job adverts have stayed open for 30 days or more, "
                "or who are advertising several roles at once. Both usually mean in-house hiring has stalled, "
                "which is a natural moment for an agency to get in touch.")
        detail = "Each lead names the company, the role, where we found the advert and since when."
        ask = f"Would a free sample of 10 such leads from {area} be useful to you, with no obligation?"
    elif seg == "S2" and not fr:
        first = (f"I saw that {firm} builds websites with a focus on {spec} around {area}." if has_spec
                 else f"I saw that {firm} builds websites for businesses around {area}.")
        subject = f"New businesses registered in {area}"
        core = ("We track new company registrations from public records. Owners who have just registered a "
                "company are usually deciding right now who will build their website and online presence.")
        detail = "Each lead includes the company name, registration date, location and the official source."
        ask = f"Would a free sample of 10 recent registrations from {area} be useful to you, with no obligation?"
    elif seg == "S9" and not fr:
        first = (f"I saw that {firm} offers {spec} to clients around {area}." if has_spec
                 else f"I saw that {firm} advises business owners and employers around {area}.")
        subject = f"New and growing companies in {area}"
        core = ("We track local companies that have just been registered or are hiring for several roles at once. "
                "New directors and growing employers often have open questions about pensions, protection and "
                "benefits, and are still choosing their advisers.")
        detail = "Each lead names the company, what happened, the official source and the date."
        ask = f"Would a free sample of 10 such leads from {area} be useful to you, with no obligation?"
    elif seg == "S1":
        first = (f"J'ai vu que {firm} recrute des profils {spec} dans la région de {area}." if has_spec
                 else f"J'ai vu que {firm} accompagne les entreprises de la région de {area} dans leurs recrutements.")
        subject = f"Postes non pourvus chez des employeurs de {area}"
        core = ("Nous suivons les employeurs locaux dont les offres publiées sur leur propre site restent ouvertes "
                "depuis 30 jours ou plus, ou qui recrutent sur plusieurs postes à la fois. C'est souvent le signe "
                "que le recrutement interne bloque, et un bon moment pour proposer l'aide d'un cabinet.")
        detail = "Chaque piste indique l'entreprise, le poste, la source et la date."
        ask = f"Un échantillon gratuit de 10 pistes de {area}, sans engagement, vous serait-il utile ?"
    elif seg == "S2":
        first = f"J'ai vu que {firm} conçoit des sites web pour les entreprises de la région de {area}."
        subject = f"Nouvelles sociétés créées autour de {area}"
        core = ("Nous suivons les annonces officielles de création de sociétés (BODACC). Une société qui vient "
                "d'être immatriculée doit souvent choisir maintenant qui réalisera son site et sa présence en ligne.")
        detail = "Chaque piste indique la société, la date de l'annonce officielle, la ville et la source."
        ask = f"Un échantillon gratuit de 10 créations récentes autour de {area}, sans engagement, vous serait-il utile ?"
    else:  # S9 FR
        first = f"J'ai vu que {firm} accompagne les chefs d'entreprise de la région de {area}."
        subject = f"Nouveaux dirigeants dans la région de {area}"
        core = ("Nous suivons les annonces officielles de création de sociétés et les employeurs locaux en forte "
                "croissance. Un nouveau dirigeant se pose souvent des questions sur sa protection, sa rémunération "
                "et l'épargne salariale, et choisit encore ses conseillers.")
        detail = "Chaque piste indique la société, l'événement, la source et la date."
        ask = f"Un échantillon gratuit de 10 pistes de {area}, sans engagement, vous serait-il utile ?"

    greet, bye = ("Bonjour,", "Bien cordialement,") if fr else (f"Hello {firm} team,", "Best regards,")
    body = f"{greet}\n\n{first}\n\n{core}\n\n{detail}\n\n{ask}\n\n{bye}\n{sender}"
    if len(subject) > 60:
        subject = subject[:57].rsplit(" ", 1)[0]
    return subject, body, "fr" if fr else "en"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--variant", default="v1")
    args = ap.parse_args(argv)
    from lib.db import DB
    db = DB()
    sender = os.environ.get("SENDER_NAME") or "Signalwerk"
    exps = {(e["segment_id"], e["country"]): e for e in db.select("experiments", {"variant": f"eq.{args.variant}"})}
    prospects = db.select("prospects", {"check_status": "eq.ok"})
    n = bad = 0
    for p in prospects:
        e = exps.get((p["segment_id"], p["country"]))
        if not e:
            continue
        if db.select("messages", {"prospect_id": f"eq.{p['id']}", "experiment_id": f"eq.{e['id']}", "select": "id"}):
            continue
        if db.rpc("is_suppressed", {"p_email": p["email"]}):
            continue
        subject, body, lang = build(p, sender)
        lint = lint_draft(subject, body, lang)
        n += 1
        bad += 0 if lint.ok else 1
        print(f"{p['segment_id']}/{p['country']} {p['email']:<40} {lint.summary()}")
        if not args.dry_run:
            db.insert("messages", {"prospect_id": p["id"], "experiment_id": e["id"], "to_email": p["email"],
                                   "subject": subject, "body": body, "language": lang, "status": "draft",
                                   "check_errors": lint.errors})
    print(f"\n{n} Entwürfe, davon {bad} mit Regelverstoß")
    return 0


if __name__ == "__main__":
    sys.exit(main())
