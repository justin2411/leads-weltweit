"""Frankreich S2: Umzug / neuer Sitz aus dem BODACC (gleiche offene Schnittstelle wie fr_bodacc.py, ohne Schlüssel).

Meldungen der Familie „modification“ mit Transfert du siège / de l'établissement principal, Nouveau siège,
Nouvel établissement principal – nur Gesellschaften (personne morale), ohne SCI/Holding wie fr_bodacc. Anlass für
Webagenturen: nach einem Umzug müssen Website, Impressum (mentions légales), Google-Profil und Verzeichnisse die
neue Adresse zeigen. Datum = Veröffentlichung im BODACC. Telefon/E-Mail/Website nur über die vorhandene kostenlose
Anreicherung (eigene Website mit SIREN in den mentions légales); hat die Website zusätzlich einen Befund der
Website-Prüfung (veraltet, unsicher, nicht handytauglich), wird das als Kombi-Anlass mitgenannt.
"""
from __future__ import annotations

import datetime as dt
import json
import re

import requests

from extraktor.model import candidate
from extraktor.sources.fr_bodacc import EXPORT, SKIP_ACT, SKIP_FORM, dirigeant

FIELDS = "id,dateparution,commercant,ville,cp,numerodepartement,listepersonnes,modificationsgenerales,url_complete"
MOVE = re.compile(r"transfert d[ue] (?:si[eè]ge|l'[ée]tablissement principal)|nouveau si[eè]ge|"
                  r"nouvel [ée]tablissement principal|modification survenue sur l'adresse du si[eè]ge", re.I)
# Gleichzeitig aufgelöst/aufgegeben: kein Kunde für eine Webagentur
ENDING = re.compile(r"dissolution|cessation|liquidation|radiation|mise en sommeil|transmission universelle", re.I)
SOURCE = "bodacc_move"


def fetch(since: dt.date, until: dt.date | None = None, log=print) -> list[dict]:
    where = (f'familleavis="modification" and dateparution>="{since}" and listepersonnes like "%\\"pm\\"%" and '
             # ODSQL „like“ vergleicht ganze Wörter (ohne Groß/klein): „%ransfert%“ fand 0, „transfert“ 4.613 in 30 Tagen
             f'(modificationsgenerales like "transfert" or modificationsgenerales like "nouveau siège" or '
             f'modificationsgenerales like "nouvel établissement principal" or '
             f'modificationsgenerales like "adresse du siège")')
    if until:
        where += f' and dateparution<="{until}"'
    r = requests.get(EXPORT, params={"where": where, "select": FIELDS}, timeout=300)
    r.raise_for_status()
    rows = [x for x in r.json() if MOVE.search(_json(x.get("modificationsgenerales")).get("descriptif") or "")]
    log(f"FR: {len(rows)} Umzüge (Sitz/Hauptbetrieb) von Gesellschaften im BODACC seit {since}")
    return rows


def _json(v):
    try:
        return json.loads(v) if isinstance(v, str) else (v or {})
    except ValueError:
        return {}


def what_moved(desc: str) -> str:
    return "établissement principal" if re.search(r"[ée]tablissement principal", desc or "", re.I) else "siège"


def to_candidate(r: dict) -> dict | None:
    lp = _json(r.get("listepersonnes")).get("personne") or {}
    if isinstance(lp, list):
        lp = lp[0] if lp else {}
    if lp.get("typePersonne") != "pm":
        return None
    mod = _json(r.get("modificationsgenerales"))
    desc = mod.get("descriptif") or ""
    if not MOVE.search(desc) or ENDING.search(desc):
        return None
    form = lp.get("formeJuridique") or ""
    act = (lp.get("activite") or "").strip()
    if SKIP_FORM.search(form) or SKIP_ACT.search(act):
        return None
    siren = re.sub(r"\D", "", (lp.get("numeroImmatriculation") or {}).get("numeroIdentification") or "")
    if len(siren) != 9:
        return None
    moved = what_moved(desc)
    a = (lp.get("adresseEtablissementPrincipal") if moved == "établissement principal" else None) \
        or lp.get("adresseSiegeSocial") or {}
    street = " ".join(x for x in (a.get("numeroVoie"), a.get("typeVoie"), a.get("nomVoie")) if x)
    if not (street and a.get("codePostal") and a.get("ville")):
        return None
    pub = dt.date.fromisoformat(r["dateparution"][:10])
    person, role = dirigeant(lp.get("administration") or "")
    name = (lp.get("denomination") or r.get("commercant") or "").strip()
    return candidate(
        source=SOURCE, source_id=siren, country="FR", source_url=r.get("url_complete") or "",
        source_date=pub, event_date=pub, name=name, legal_name=name,
        street=street, city=a.get("ville") or "", state="", zip=a.get("codePostal") or "",
        person_name=person, person_role=f"{role} (BODACC)" if role else "",
        facts={"siren": siren, "published_on": pub, "moved": moved, "form": form, "activity": act[:220],
               "effective_on": mod.get("dateEffet"), "department": r.get("numerodepartement"),
               "registry_court": (lp.get("numeroImmatriculation") or {}).get("nomGreffeImmat"),
               "signal_type": "relocation"},
    )
