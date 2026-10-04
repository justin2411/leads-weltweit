"""FR: Leads für Webagenturen (S2) aus der offiziellen „Liste des entreprises RGE“ (ADEME, Licence Ouverte / Open
Licence, offene data-fair-Schnittstelle ohne Schlüssel, robots.txt von data.ademe.fr erlaubt alles).

RGE = „Reconnu Garant de l'Environnement“: Handwerks- und Baufirmen mit staatlich anerkannter Qualifikation für
Energiesanierung (Dämmung, Heizung, Fenster, Photovoltaik …), ~59.000 Firmen (SIRET) mit Adresse, Telefon und
E-Mail, die die Firmen selbst für das öffentliche Verzeichnis (France Rénov') angeben. ~22.600 davon nennen **keine
Website** – genau das S2-Signal („kein eigener Webauftritt“), wie bei Overture: ob es wirklich keine Website gibt,
prüft danach die normale Anreicherung (Domains aus dem Namen) und die Drei-Stufen-Freigabe.

Abruf: ~16 Seiten zu je 10.000 Zeilen, höchstens einmal am Tag (Zwischenspeicher `out/cache/fr_rge.json`),
1 Sekunde Pause zwischen den Seiten. Quelle im Lead: Datensatz-Seite bei ADEME. Quellen-Scout 04.10.2026.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import time
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

SOURCE = "rge"
DATASET = "liste-des-entreprises-rge-2"
URL = (f"https://data.ademe.fr/data-fair/api/v1/datasets/{DATASET}/lines?format=csv&size=10000"
       "&select=siret,nom_entreprise,adresse,code_postal,commune,telephone,email,site_internet,domaine,"
       "lien_date_debut,lien_date_fin")
PAGE_URL = f"https://data.ademe.fr/datasets/{DATASET}"
CACHE = Path(os.environ.get("EXTRAKTOR_RGE", "out/cache/fr_rge.json"))
MAX_AGE = 20 * 3600
NEXT = re.compile(r"<([^>]+)>;\s*rel=next")
FORMS = re.compile(r"\b(sarl|sas|sasu|eurl|sa|sci|scop|snc|ei|eirl)\b", re.I)


def download(log=print) -> list[dict]:
    """Alle Zeilen (eine je Qualifikation) – aus dem Zwischenspeicher, wenn jünger als MAX_AGE."""
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    rows, url, pages = [], URL, 0
    while url and pages < 60:
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=120, headers={"User-Agent": "NextGenProfitBot/0.1"})
                r.raise_for_status()
                break
            except requests.RequestException as exc:
                log(f"RGE: Seite {pages + 1} fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("ADEME RGE nicht erreichbar")
        rows += list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
        m = NEXT.search(r.headers.get("link", ""))
        url, pages = (m.group(1) if m else None), pages + 1
        time.sleep(1)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    log(f"RGE: {len(rows)} Zeilen in {pages} Seiten geladen")
    return rows


def companies(rows: list[dict], today: dt.date | None = None) -> list[dict]:
    """Eine Zeile je SIRET mit gültiger Qualifikation, ohne Website, mit Telefon und vollständiger Adresse.
    Die Fachgebiete (domaine) einer Firma werden zusammengefasst."""
    today = today or dt.date.today()
    by: dict[str, dict] = {}
    for x in rows:
        siret = re.sub(r"\D", "", x.get("siret") or "")
        if len(siret) != 14:
            continue
        end = (x.get("lien_date_fin") or "")[:10]
        if end and end < today.isoformat():
            continue  # Qualifikation abgelaufen
        d = by.setdefault(siret, dict(x, siret=siret, domaines=[]))
        dom = (x.get("domaine") or "").strip()
        if dom and dom not in d["domaines"]:
            d["domaines"].append(dom)
        if (x.get("site_internet") or "").strip():
            d["site_internet"] = x["site_internet"]
    return [d for d in by.values()
            if not (d.get("site_internet") or "").strip() and (d.get("telephone") or "").strip()
            and (d.get("adresse") or "").strip() and re.fullmatch(r"\d{5}", (d.get("code_postal") or "").strip())
            and (d.get("commune") or "").strip() and (d.get("nom_entreprise") or "").strip()]


SMALL = {"de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et", "aux", "lès", "les"}


def city(s: str) -> str:
    """'SAUVETERRE-DE-BEARN' -> 'Sauveterre-de-Bearn' (kleine Wörter klein, außer am Anfang)."""
    s = re.sub(r"\s+", " ", s.strip())
    if not s.isupper():
        return s
    parts = re.split(r"([ -])", s.lower())
    return "".join(p if p in " -" or (i and p in SMALL) else p[:1].upper() + p[1:] for i, p in enumerate(parts))


def to_candidate(d: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    street = re.sub(r"\s+", " ", d["adresse"]).strip()
    return candidate(
        source=SOURCE, source_id=d["siret"], country="FR", source_url=PAGE_URL,
        source_date=today, event_date=today,
        name=FORMS.sub(lambda m: m.group(0).upper(), title_case(re.sub(r"\s+", " ", d["nom_entreprise"]).strip())),
        legal_name="",
        street=title_case(street), city=city(d["commune"]), zip=d["code_postal"].strip(),
        phone=d["telephone"].strip(), email=(d.get("email") or "").strip().lower(),
        facts={"category": re.sub(r"\s+", " ", ", ".join(d.get("domaines") or []))[:120], "siret": d["siret"], "siren": d["siret"][:9],
               "rge_since": (d.get("lien_date_debut") or "")[:10], "checked_on": today},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None, skip_phones: set[str] | None = None) -> list[dict]:
    """Bis zu `limit` RGE-Firmen ohne Website (exclude = schon bekannte SIRETs; skip_phones = Telefon-Schlüssel aus
    overture.phone_key, die schon anderswo stehen). Reihenfolge fest nach SIRET; Gespeichertes sortiert das Lead-Werk
    über die Datenbank aus (Quelle „rge“, ID = SIRET)."""
    from extraktor.sources.overture import phone_key
    rows = companies(download(log))
    rows.sort(key=lambda d: d["siret"])
    skip = skip_phones or set()
    left = [d for d in rows if not (exclude and d["siret"] in exclude) and phone_key(d["telephone"]) not in skip]
    out = [to_candidate(d) for d in (left if limit is None else left[:limit])]
    log(f"RGE: {len(rows)} Firmen ohne Website mit Telefon, {len(rows) - len(left)} schon in Overture/bekannt, "
        f"{len(out)} ausgewählt")
    return out
