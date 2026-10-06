"""Frankreich: Gründungen von Gesellschaften aus dem BODACC (amtliches Bekanntmachungsblatt).

ABGESCHALTET (05.10.2026, CLAUDE.md §2 „robots.txt beachten“): bodacc-datadila.opendatasoft.com und www.bodacc.fr
sperren in robots.txt `/api/` für alle Bots außer Googlebot – auch die Export-Schnittstelle, die hier genutzt wurde.
`fetch()` ruft deshalb nichts mehr ab und liefert eine leere Liste (Hinweis im Log); bestehende Leads bleiben.
Geprüfte Ersatzquellen (Logbuch docs/QUELLEN-SCOUT.md): DILA-Rohdaten echanges.dila.gouv.fr/OPENDATA/BODACC
(06.10.2026 von GitHub erreichbar, kein robots.txt: dort laufen seit Scout R63 die Umzüge, fr_bodacc_moves.py), Ressourcen-Downloads auf
static.data.gouv.fr (robots.txt: Disallow /resources) und files.data.gouv.fr (Disallow /), Recherche d'entreprises
(erlaubt, aber ohne Filter/Sortierung nach Gründungsdatum, kein Gründungs-Feed). Die Umwandlung einer
BODACC-Meldung in einen Kandidaten (`to_candidate`, `dirigeant`) bleibt für eine erlaubte Quelle im selben Format.

Kein Telefon, keine E-Mail im Register: die kommen nur von der eigenen Website (mentions légales mit SIREN).
"""
from __future__ import annotations

import datetime as dt
import json
import re

from extraktor.model import candidate

# Die bisherige Schnittstelle ist laut robots.txt gesperrt (siehe oben); hier nie wieder eintragen.
DISABLED_REASON = ("BODACC abgeschaltet: robots.txt von bodacc-datadila.opendatasoft.com und bodacc.fr sperrt /api/ "
                   "für alle Bots außer Googlebot (CLAUDE.md §2). Keine erlaubte Ersatzquelle mit Gründungs-Feed, "
                   "siehe docs/QUELLEN-SCOUT.md")
# Keine Leads: Immobilien-/Holding-Gesellschaften (SCI, sociétés civiles), reine Beteiligungen
SKIP_FORM = re.compile(r"soci[ée]t[ée] civile|\bsci\b|\bscpi\b|\bscm\b|groupement", re.I)
SKIP_ACT = re.compile(r"prise de participation|holding|acquisition.{0,40}immobili|location de (biens|tous biens)|"
                      r"gestion de patrimoine immobilier|marchand de biens", re.I)
COMPANY_WORDS = re.compile(r"\b(sté|société|sas|sasu|sarl|eurl|sa|holding|groupe|cabinet|sci)\b", re.I)


def fetch(since: dt.date, until: dt.date | None = None, log=print) -> list[dict]:
    """Abgeschaltet (robots.txt): ruft nichts ab, schreibt den Grund ins Log und liefert keine Meldungen."""
    log(f"FR: {DISABLED_REASON} (Zeitraum ab {since} übersprungen)")
    return []


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
