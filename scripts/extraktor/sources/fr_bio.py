"""FR: Premium-Leads für Webagenturen (S2) aus dem „Annuaire officiel des opérateurs bio“ der Agence Bio.

Offizielle offene Schnittstelle (`opendata.agencebio.org/api/gouv/operateurs/`, über api.gouv.fr veröffentlicht,
ohne Schlüssel und ohne Konto; robots.txt ohne Disallow). Die Agence Bio veröffentlicht je Betrieb Name, Gérant,
Adresse, Telefon, E-Mail, Websites, Tätigkeiten und die Zertifikate mit Datum.

Anlass (Quellen-Scout R37, 05.10.2026): `datePremierEngagement` = Tag, an dem sich der Betrieb erstmals bei einer
Bio-Kontrollstelle verpflichtet hat (neu als Bio-Betrieb eingetragen). Höchstens NEW_DAYS Tage alt, mit gültigem
Zertifikat (`etatCertification` ENGAGEE), ohne Website (`siteWebs` ohne URL) = Kombi-Anlass „neu bio + keine Website“
(lib/premium.py, `details.dated_event`). Ob es wirklich keine Website gibt, prüft danach die normale Anreicherung
und die Drei-Stufen-Freigabe. Nur Einträge mit Telefon und vollständiger Adresse (wie RGE).

Abruf: die Schnittstelle kennt keinen Datumsfilter und sortiert nach Name -> einmal am Tag alle ~138 Seiten zu je
1.000 Einträgen, 1 Sekunde Pause, Zwischenspeicher `out/cache/fr_bio.json` (nur frische Einträge, MAX_AGE 20 h).
Ein eigener Bot-Name ist nötig (Python-Standard bekommt 403).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import time
from pathlib import Path

import requests

from extraktor.model import candidate, title_case
from lib import websites as W

SOURCE = "agence_bio"
API = "https://opendata.agencebio.org/api/gouv/operateurs/"
PAGE_URL = "https://annuaire.agencebio.org/"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
CACHE = Path(os.environ.get("EXTRAKTOR_BIO", "out/cache/fr_bio.json"))
MAX_AGE = 20 * 3600
PAGE = 1000
MAX_PAGES = 200
NEW_DAYS = 30  # gespeichert wird bis 30 Tage (Reihenfolge); Premium zählt lib/premium.py nur bis 14 Tage
FORMS = re.compile(r"\b(sarl|sas|sasu|eurl|sa|sci|scop|snc|ei|eirl|earl|gaec|scea)\b", re.I)
NAME_JUNK = re.compile(r"^[\s0.\-]*$")


def _date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(s or "")[:10])
    except ValueError:
        return None


def fresh_age(item: dict, today: dt.date) -> int | None:
    """Alter des Ersteintrags in Tagen, wenn 0 … NEW_DAYS und ein gültiges Zertifikat vorliegt; sonst None."""
    first = _date(item.get("datePremierEngagement"))
    if not first:
        return None
    age = (today - first).days
    if not 0 <= age <= NEW_DAYS:
        return None
    if not any((c or {}).get("etatCertification") == "ENGAGEE" for c in item.get("certificats") or []):
        return None
    return age


def cached() -> list[dict]:
    """Frische Einträge aus dem Zwischenspeicher (vom eigenen Tagesabruf `fr-bio` im Lead-Werk); sonst leer.
    Die Teile des Lead-Werks rufen die Schnittstelle nie selbst ab."""
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else []
    except ValueError:
        return []


def download(log=print, today: dt.date | None = None) -> list[dict]:
    """Tagesabruf: alle Seiten, behalten werden nur frische Einträge (Ersteintrag ≤ NEW_DAYS). Zwischenspeicher
    jünger als MAX_AGE -> kein Abruf (jede Seite höchstens einmal am Tag)."""
    today = today or dt.date.today()
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return cached()
    out, debut, total = [], 0, 0
    for _ in range(MAX_PAGES):
        for attempt in range(3):
            try:
                r = requests.get(API, params={"nb": PAGE, "debut": debut}, headers=UA, timeout=180)
                r.raise_for_status()
                items = r.json().get("items") or []
                break
            except (requests.RequestException, ValueError) as exc:
                log(f"Agence Bio: Seite {debut // PAGE + 1} fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("Agence Bio nicht erreichbar")
        items = [i for i in items if isinstance(i, dict)]
        total += len(items)
        out += [i for i in items if fresh_age(i, today) is not None]
        if len(items) < PAGE:
            break
        debut += PAGE
        time.sleep(1)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    log(f"Agence Bio: {total} Betriebe geladen, {len(out)} neu (≤ {NEW_DAYS} Tage)")
    return out


def _has_site(item: dict) -> bool:
    return any((s or {}).get("url", "").strip() for s in item.get("siteWebs") or [])


def _address(item: dict) -> dict | None:
    """Sitz (Siège social), sonst erste aktive französische Adresse."""
    adrs = [a for a in item.get("adressesOperateurs") or [] if a and a.get("active") is not False
            and (a.get("pays") or "FRANCE").upper() == "FRANCE"]
    adrs.sort(key=lambda a: "Siège social" not in (a.get("typeAdresseOperateurs") or []))
    for a in adrs:
        if (a.get("lieu") or "").strip() and re.fullmatch(r"\d{5}", (a.get("codePostal") or "").strip()) \
                and (a.get("ville") or "").strip() and not NAME_JUNK.match(a.get("lieu") or ""):
            return a
    return None


def _phones(item: dict) -> list[str]:
    out = []
    for k in ("telephoneCommerciale", "telephone", "telephoneNational"):
        v = re.sub(r"\s+", " ", str(item.get(k) or "")).strip()
        if len(re.sub(r"\D", "", v)) >= 9 and v not in out:
            out.append(v)
    return out


def _phone(item: dict) -> str:
    return (_phones(item) or [""])[0]


def companies(items: list[dict], today: dt.date | None = None) -> list[dict]:
    """Frische Betriebe ohne Website mit Telefon, Adresse und Namen (eine Zeile je Agence-Bio-ID)."""
    today = today or dt.date.today()
    out, seen = [], set()
    for i in items:
        if not isinstance(i, dict) or i.get("id") in seen:
            continue
        seen.add(i.get("id"))
        name = (i.get("denominationcourante") or i.get("raisonSociale") or "").strip()
        if NAME_JUNK.match(name) or fresh_age(i, today) is None or _has_site(i):
            continue
        adr, phone = _address(i), _phone(i)
        if adr and phone:
            out.append(dict(i, _adr=adr, _phone=phone, _name=name))
    return out


SMALL = {"de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et", "aux", "lès"}


def city(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    if not (s.isupper() or s.islower()):
        return s
    parts = re.split(r"([ -])", s.lower())
    return "".join(p if p in " -" or (i and p in SMALL) else p[:1].upper() + p[1:] for i, p in enumerate(parts))


def person(raw: str) -> str:
    """'CHEIKH RABAH' -> 'Cheikh Rabah'; Platzhalter ('00000') -> ''."""
    s = re.sub(r"\s+", " ", (raw or "").strip())
    if NAME_JUNK.match(s) or not re.search(r"[A-Za-zÀ-ÿ]{2}", s):
        return ""
    return s if not (s.isupper() or s.islower()) else " ".join(w[:1].upper() + w[1:].lower() for w in s.split(" "))


def to_candidate(d: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    first = _date(d["datePremierEngagement"])
    adr = d["_adr"]
    acts = [a.get("nom") for a in d.get("annuaireActivites") or [] if a and a.get("nom")]
    acts = acts or [a.get("nom") for a in d.get("activites") or [] if a and a.get("nom")]
    siret = re.sub(r"\D", "", d.get("siret") or "")
    who = person(d.get("gerant") or "")
    # Einzelunternehmer: Gérant = Firmenname oder nur ein Wort -> kein eigener Name (die Prüfung nimmt dann die Rolle)
    if who and (len(who.split()) < 2 or W.norm(who) == W.norm(d["_name"])):
        who = ""
    cert = next((c for c in d.get("certificats") or [] if (c or {}).get("etatCertification") == "ENGAGEE"), {})
    return candidate(
        source=SOURCE, source_id=str(d["id"]), country="FR", source_url=PAGE_URL,
        source_date=today, event_date=first,
        name=FORMS.sub(lambda m: m.group(0).upper(), title_case(re.sub(r"\s+", " ", d["_name"]))),
        legal_name=re.sub(r"\s+", " ", (d.get("raisonSociale") or "").strip()),
        street=title_case(re.sub(r"\s+", " ", adr["lieu"]).strip()), city=city(adr["ville"]),
        zip=adr["codePostal"].strip(), phone=d["_phone"],
        phone_alt=next((x for x in _phones(d) if x != d["_phone"]), ""), email=(d.get("email") or "").strip().lower(),
        person_name=who, person_role="Gérant" if who else "",
        facts={"category": ", ".join(acts)[:120], "siret": siret if len(siret) == 14 else "",
               "siren": siret[:9] if len(siret) == 14 else "", "numero_bio": d.get("numeroBio"),
               "checked_on": today,
               "bio_new": {"date": first.isoformat(), "organisme": (cert or {}).get("organisme") or "",
                           "activites": acts[:3]},
               "vente_particuliers": bool((d.get("venteAnnuaire") or {}).get("venteParticuliers"))},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None, skip_phones: set[str] | None = None) -> list[dict]:
    """Bis zu `limit` neue Bio-Betriebe ohne Website, neueste zuerst (exclude = schon gespeicherte Agence-Bio-IDs;
    skip_phones = Telefon-Schlüssel aus overture.phone_key, die schon anderswo stehen)."""
    from extraktor.sources.overture import phone_key
    rows = companies(cached())
    rows.sort(key=lambda d: (d.get("datePremierEngagement") or "", d["id"]), reverse=True)
    skip = skip_phones or set()
    left = [d for d in rows if not (exclude and str(d["id"]) in exclude) and phone_key(d["_phone"]) not in skip]
    out = [to_candidate(d) for d in (left if limit is None else left[:limit])]
    log(f"Agence Bio: {len(rows)} neue Betriebe ohne Website mit Telefon, {len(rows) - len(left)} schon bekannt/"
        f"in Overture, {len(out)} ausgewählt")
    return out


if __name__ == "__main__":  # Tagesabruf (Job `fr-bio` im Lead-Werk)
    download()
