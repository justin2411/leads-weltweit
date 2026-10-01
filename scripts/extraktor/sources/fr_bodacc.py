"""Frankreich: Gründungen von Gesellschaften aus dem BODACC (amtliches Bekanntmachungsblatt, offene Schnittstelle,
kostenlos, ohne Schlüssel). Je Meldung: Firma, SIREN, Rechtsform, Kapital, Sitz, Tätigkeit, Geschäftsführung.

Kein Telefon, keine E-Mail im Register: die kommen nur von der eigenen Website (mentions légales mit SIREN).
https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/
"""
from __future__ import annotations

import datetime as dt
import json
import re

import requests

from extraktor.model import candidate

EXPORT = ("https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/"
          "exports/json")
FIELDS = "id,dateparution,commercant,ville,cp,numerodepartement,registre,tribunal,listepersonnes,listeetablissements,acte,url_complete"
# Keine Leads: Immobilien-/Holding-Gesellschaften (SCI, sociétés civiles), reine Beteiligungen
SKIP_FORM = re.compile(r"soci[ée]t[ée] civile|\bsci\b|\bscpi\b|\bscm\b|groupement", re.I)
SKIP_ACT = re.compile(r"prise de participation|holding|acquisition.{0,40}immobili|location de (biens|tous biens)|"
                      r"gestion de patrimoine immobilier|marchand de biens", re.I)
COMPANY_WORDS = re.compile(r"\b(sté|société|sas|sasu|sarl|eurl|sa|holding|groupe|cabinet|sci)\b", re.I)


def fetch(since: dt.date, until: dt.date | None = None, log=print) -> list[dict]:
    where = f'familleavis="creation" and dateparution>="{since}" and listepersonnes like "%\\"pm\\"%"'
    if until:
        where += f' and dateparution<="{until}"'
    r = requests.get(EXPORT, params={"where": where, "select": FIELDS}, timeout=300)
    r.raise_for_status()
    rows = r.json()
    log(f"FR: {len(rows)} Gründungen von Gesellschaften im BODACC seit {since}")
    return rows


def _json(v):
    try:
        return json.loads(v) if isinstance(v, str) else (v or {})
    except ValueError:
        return {}


ENTRY = re.compile(r"([^:;]+?)\s*:\s*([^;:]+?)(?=\s*[;.]\s*[A-ZÉ][^:;.]{0,80}:|\s*;|$)")
ROLES = ("Président", "Gérant", "Directeur général", "Directeur Général", "Co-gérant")


def dirigeant(admin: str) -> tuple[str, str]:
    """('Prénom Nom', Rolle) der ersten natürlichen Person, z. B. aus
    'Président : LEQUIN Michel, Jean' oder 'Gérant : DUMAS Daniel nom d'usage : DUMAS' oder '… : Samyn, Thomas'."""
    admin = (admin or "").replace("\xa0", " ")
    admin = re.sub(r"\s*nom d'usage\s*:\s*[^.;]*", "", admin)
    for roles, who in ENTRY.findall(admin):
        role = next((r for r in ROLES if r.lower() in roles.lower()), "")
        who = who.strip(" .,")
        if not role or not who or COMPANY_WORDS.search(who):
            continue
        head, _, rest = who.partition(",")
        parts = head.split()
        last = [p for p in parts if p.isupper() and len(p) > 1]
        first = [p for p in parts if not p.isupper()]
        if last and first:
            return f"{first[0]} {' '.join(w.title() for w in last)}", role.replace("Général", "général")
        if len(parts) == 1 and rest.strip():  # 'Samyn, Thomas' = Nom, Prénom
            return f"{rest.strip().split()[0].title()} {parts[0].title()}", role.replace("Général", "général")
    return "", ""


def to_candidate(r: dict) -> dict | None:
    lp = _json(r.get("listepersonnes")).get("personne") or {}
    if isinstance(lp, list):
        lp = lp[0] if lp else {}
    if lp.get("typePersonne") != "pm":
        return None
    form = lp.get("formeJuridique") or ""
    et = _json(r.get("listeetablissements")).get("etablissement") or {}
    if isinstance(et, list):
        et = et[0] if et else {}
    act = (et.get("activite") or "").strip()
    if SKIP_FORM.search(form) or SKIP_ACT.search(act) or not act:
        return None
    siren = re.sub(r"\D", "", (lp.get("numeroImmatriculation") or {}).get("numeroIdentification") or "")
    if len(siren) != 9:
        return None
    acte = _json(r.get("acte"))
    start = acte.get("dateCommencementActivite")
    pub = dt.date.fromisoformat(r["dateparution"][:10])
    a = lp.get("adresseSiegeSocial") or {}
    street = " ".join(x for x in (a.get("numeroVoie"), a.get("typeVoie"), a.get("nomVoie")) if x)
    person, role = dirigeant(lp.get("administration") or "")
    cap = (lp.get("capital") or {}).get("montantCapital")
    try:
        cap = int(float(cap)) if cap else None
    except ValueError:
        cap = None
    name = (lp.get("denomination") or r.get("commercant") or "").strip()
    return candidate(
        source="bodacc", source_id=siren, country="FR", source_url=r.get("url_complete") or "",
        source_date=pub, event_date=pub, name=name, legal_name=name,
        street=street, city=a.get("ville") or r.get("ville") or "", state="",
        zip=a.get("codePostal") or r.get("cp") or "",
        person_name=person, person_role=f"{role} (BODACC)" if role else "",
        facts={"siren": siren, "published_on": pub, "started_on": start, "form": form, "capital": cap,
               "activity": act[:220], "registry_court": (lp.get("numeroImmatriculation") or {}).get("nomGreffeImmat"),
               "department": r.get("numerodepartement")},
    )
