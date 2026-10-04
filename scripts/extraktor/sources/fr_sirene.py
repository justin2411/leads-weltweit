"""FR: Rechtsform einer Firma aus dem offenen Firmenregister (Annuaire des entreprises, recherche-entreprises.api.gouv.fr,
offizielle offene Schnittstelle der DINUM, ohne Schlüssel, Daten aus SIRENE/INSEE).

Kunden-Werk 01.10.2026: In Frankreich dürfen wir nur Kapitalgesellschaften anmailen (Prüfregel unverändert). Die
Rechtsform stand fast nie im Overture-Eintrag, darum blieben französische Käufer „nur Anruf/Brief“. Abgleich wie bei
Companies House: Name + Postleitzahl, nur bei eindeutigem Treffer einer aktiven Firma.
"""
from __future__ import annotations

import re
import time
import unicodedata

import requests

API = "https://recherche-entreprises.api.gouv.fr/search"
# Catégorie juridique (INSEE, Niveau III) -> Rechtsform; nur Kapitalgesellschaften, alles andere bleibt leer
FORMS = [(r"^5498$", "EURL"), (r"^54\d\d$", "SARL"), (r"^5710$", "SAS"), (r"^5720$", "SASU"), (r"^5[56]\d\d$", "SA")]
STOP = re.compile(r"\b(sas|sasu|sarl|eurl|sa|sci|snc|selarl|selas|scp|ste|societe|ets|etablissements)\b")


def _key(name: str) -> str:
    t = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    t = STOP.sub(" ", re.sub(r"[^a-z0-9 ]+", " ", t))
    return " ".join(t.split())


def form_of(code: str | None) -> str | None:
    for pat, form in FORMS:
        if code and re.match(pat, str(code)):
            return form
    return None


class RegisterUnavailable(RuntimeError):
    """Schnittstelle antwortet nicht (429/5xx nach Wiederholungen) – nicht dasselbe wie „kein Treffer“."""


def _fail(strict: bool, status: int | None) -> None:
    if strict:
        raise RegisterUnavailable(f"recherche-entreprises: {status or 'keine Antwort'}")


def lookup(name: str, postcode: str | None, session: requests.Session | None = None,
           strict: bool = False) -> dict | None:
    """Eindeutiger aktiver Treffer {siren, nature_juridique, form, naf} oder None.
    strict: bei gestörter Schnittstelle RegisterUnavailable statt None."""
    s = session or requests
    params = {"q": name, "per_page": 5, "etat_administratif": "A"}
    if postcode:
        params["code_postal"] = postcode
    for attempt in range(3):
        r = s.get(API, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code >= 500:
            _fail(strict, r.status_code)
            return None
        if r.status_code >= 400:
            return None
        break
    else:
        _fail(strict, 429)
        return None
    want = _key(name)
    hits = [x for x in r.json().get("results") or []
            if _key(x.get("nom_raison_sociale") or x.get("nom_complet") or "") == want
            or _key(x.get("nom_complet") or "") == want]
    if len(hits) != 1:
        return None
    h = hits[0]
    return {"siren": h.get("siren"), "nature_juridique": h.get("nature_juridique"),
            "form": form_of(h.get("nature_juridique")), "naf": h.get("activite_principale")}


GENERIC = {"agence", "groupe", "group", "cabinet", "the", "le", "la", "les", "l"}


def _tokens(name: str) -> frozenset[str]:
    """Namensvergleich ohne Reihenfolge und ohne allgemeine Vorsätze („Agence Kalikado“ = „KALIKADO“,
    „GROGNET CELINE“ = „CELINE GROGNET“)."""
    return frozenset(t for t in _key(name).split() if t not in GENERIC)


def naf_lookup(name: str, postcode: str, session: requests.Session | None = None, strict: bool = False) -> dict | None:
    """Nur für den Code NAF (FR-Webdesign-Prüfung): wie lookup, zählt aber auch den Handelsnamen (Enseigne/Sigle)
    eines Betriebs mit dieser Postleitzahl – viele Agenturen treten unter einem anderen Namen auf als die Firma.
    Eindeutiger Treffer -> {siren, naf}, sonst None. Ändert nichts an der Rechtsform-Erkennung (lookup)."""
    s = session or requests
    params = {"q": name, "per_page": 5, "etat_administratif": "A", "code_postal": postcode}
    for attempt in range(3):
        r = s.get(API, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code >= 500:
            _fail(strict, r.status_code)
            return None
        if r.status_code >= 400:
            return None
        break
    else:
        _fail(strict, 429)
        return None
    want = _tokens(name)
    hits = []
    for x in r.json().get("results") or []:
        names = {x.get("nom_raison_sociale"), x.get("nom_complet"), x.get("sigle")}
        for e in x.get("matching_etablissements") or []:
            if e.get("code_postal") == postcode:
                names.update(e.get("liste_enseignes") or [])
                names.add(e.get("nom_commercial"))
        full = x.get("nom_complet") or ""
        names.update(re.findall(r"\(([^)]+)\)", full))
        if want and any(n and _tokens(n) == want for n in names):
            hits.append(x)
    if len(hits) != 1:
        return None
    return {"siren": hits[0].get("siren"), "naf": hits[0].get("activite_principale")}


def by_siren(siren: str, session: requests.Session | None = None, strict: bool = False) -> dict | None:
    """SIREN (z. B. aus den Mentions légales der eigenen Website) -> {siren, name, active, nature_juridique, form}.
    Quellen-Scout R20 (03.10.2026): nur der exakte Treffer zählt."""
    s = session or requests
    for attempt in range(3):
        r = s.get(API, params={"q": siren, "per_page": 5}, timeout=30)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code >= 500:
            _fail(strict, r.status_code)
            return None
        if r.status_code >= 400:
            return None
        break
    else:
        _fail(strict, 429)
        return None
    for h in r.json().get("results") or []:
        if h.get("siren") == siren:
            return {"siren": siren, "name": h.get("nom_complet") or h.get("nom_raison_sociale"),
                    "active": h.get("etat_administratif") == "A",
                    "nature_juridique": h.get("nature_juridique"), "form": form_of(h.get("nature_juridique")),
                    "naf": h.get("activite_principale")}
    return None


def match_by_name(firms: dict[str, tuple[str, str | None]], log=print, pause: float = 1.0,
                  limit: int = 800) -> dict[str, dict]:
    """{Domain: (Name, PLZ)} -> {Domain: Treffer}. Höchstens `limit` Abfragen, `pause` Sekunden Abstand
    (die Schnittstelle erlaubt 7 Abfragen/s für alle Nutzer; parallele Teilläufe bleiben so darunter)."""
    out, session = {}, requests.Session()
    for n, (dom, (name, pc)) in enumerate(firms.items()):
        if n >= limit:
            break
        if len(_key(name)) < 3:
            continue
        try:
            hit = lookup(name, pc, session)
        except (requests.RequestException, ValueError):
            hit = None
        if hit:
            out[dom] = hit
        time.sleep(pause)
    log(f"FR: {len(out)} von {min(len(firms), limit)} Firmen eindeutig im Register, "
        f"davon {sum(1 for h in out.values() if h['form'])} Kapitalgesellschaften")
    return out
