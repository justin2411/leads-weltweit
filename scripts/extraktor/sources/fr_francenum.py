"""FR: Käufer für Webagenturen (S2) aus dem offenen Verzeichnis „Activateurs France Num“ (Wirtschaftsministerium, DGE).

Kunden-Werk (Quellen-Scout 04.10.2026): France Num ist die staatliche Initiative zur Digitalisierung kleiner Firmen;
„Activateurs“ sind private Dienstleister, die TPE/PME bei Website, Online-Sichtbarkeit und Digitalisierung helfen –
genau unsere S2-Käufer. Das Verzeichnis ist offene Daten (data.gouv.fr / data.economie.gouv.fr, Licence Ouverte 2.0,
ohne Schlüssel, ~4.400 Einträge): Name, Typ,
Adresse, Größe und der Link auf die öffentliche Seite des Activateurs auf francenum.gouv.fr. Die eigene Website steht
nur auf dieser Seite („Site internet“); sie wird höflich geholt (Fetcher: robots.txt erlaubt /activateurs/,
1 Abruf/s, jede Seite einmal je Pool-Bau, Zeitbudget, Reihenfolge wechselt monatlich).

Nur private Activateurs der Typen Agentur für Kommunikation/Marketing, digitale Dienstleister (ESN) und
Selbständige (FR: Einzelunternehmer berufsbezogen erlaubt, `countries.yaml`). Nicht: Behörden, Kammern, Verbände,
Banken, Kanzleien, Bildungsträger, Beratungen, Software-Verlage. Geprüft wird danach wie jeder Käufer (eigene
Website, Firmen-E-Mail, Rechtsform über SIRENE, unveränderte Prüfregel). Test 04.10.2026: 220 Seiten -> 192 mit
eigener Website, 173 noch nicht in prospects; 130 geprüft -> 72 mail-fähig (55 %), 58 nur Anruf/Brief.

Abruf (JARVIS-Agent 8, 04.10.2026): nicht über die Export-API von data.economie.gouv.fr (robots.txt: Disallow /api/
für alle Bots außer Googlebot), sondern über die offizielle Tabular-API von data.gouv.fr (tabular-api.data.gouv.fr,
kein robots.txt, gleiche Datei als von data.gouv.fr eingelesene Ressource, Licence Ouverte 2.0). Spaltennamen kommen
dort als Beschriftungen und werden auf die Schlüssel der Export-API abgebildet.
"""
from __future__ import annotations

import hashlib
import html as H
import json
import re
import time
from pathlib import Path

import requests

RESOURCE = "2d889c93-1af2-4bd5-aef3-4c0d6f407a07"  # data.gouv.fr Datensatz 62b3afa267c72a6331a1f848, CSV-Ressource
URL = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE}/data/"
PAGE_SIZE = 50
# Beschriftung in der Tabular-API -> Schlüssel wie in der Export-API (Rest des Moduls bleibt gleich)
LABELS = {"Identifiant de la structure": "identifiant_de_la_structure", "Nom de la structure": "nom_de_la_structure",
          "Type": "type", "Catégorie": "categorie", "Adresse": "adresse", "Code postal": "code_postal",
          "Ville": "ville", "Région": "region", "Lien url (site France Num)": "lien_url_site_france_num"}
CACHE = Path(__file__).resolve().parents[3] / "out" / "cache" / "activateurs_france_num.json"
MAX_AGE = 7 * 86400
# Typ laut Verzeichnis -> Kategorie im Kunden-Werk (FR: marketing_agency über SECOND, die anderen direkt S2)
TYPES = {"Agence de communication, marketing": "marketing_agency",
         "Entreprise de services numériques": "software_development",
         "Indépendant": "internet_marketing_service"}
SOURCE = "https://www.francenum.gouv.fr/activateurs (Activateurs France Num, DGE)"
SITE_LINK = re.compile(r'target="_blank"\s+href="(https?://[^"]+)"\s*>\s*Site internet\s*</a>', re.I)
PAGE = re.compile(r"^https://www\.francenum\.gouv\.fr/activateurs/[a-z0-9-]+/?$")
BUDGET_S = 50 * 60  # Pool-Job hat 150 Minuten; Rest kommt beim nächsten Pool-Bau (andere Reihenfolge)


def as_export(rec: dict) -> dict:
    """Zeile der Tabular-API -> Schlüssel der Export-API (Postleitzahl immer als Text mit 5 Stellen)."""
    out = {key: rec.get(label) for label, key in LABELS.items()}
    cp = out.get("code_postal")
    if cp is not None and not isinstance(cp, str):
        out["code_postal"] = str(int(cp)).zfill(5)
    return out


def _get(url: str, log=print) -> dict:
    for attempt in range(8):
        try:
            r = requests.get(url, timeout=60, headers={"User-Agent": "NextGenProfitBot/0.1"})
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as exc:
            log(f"France Num: Abruf fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/8")
            time.sleep(min(30, 3 * (attempt + 1)))
    raise RuntimeError("France Num (data.gouv.fr) nicht erreichbar")


def _download(log=print) -> list[dict]:
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return json.loads(CACHE.read_text())
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    data, url = [], f"{URL}?page_size={PAGE_SIZE}&page=1"
    while url:
        page = _get(url, log)
        data += [as_export(x) for x in page.get("data") or []]
        url = (page.get("links") or {}).get("next")
        if url:
            time.sleep(1.0)  # höflich: höchstens 1 Abruf/s
    if not data:
        raise RuntimeError("France Num: leere Antwort")
    CACHE.write_text(json.dumps(data, ensure_ascii=False))
    return data


def wanted(x: dict) -> bool:
    """Privater Activateur eines passenden Typs mit eigener France-Num-Seite."""
    return (x.get("categorie") == "Privée" and x.get("type") in TYPES and bool(x.get("nom_de_la_structure"))
            and bool(PAGE.match(x.get("lien_url_site_france_num") or "")))


def website_of(page_html: str) -> str | None:
    """Eigene Website aus der Activateur-Seite (Link „Site internet“)."""
    m = SITE_LINK.search(page_html or "")
    return H.unescape(m.group(1)).strip() if m else None


def row_of(x: dict, web: str | None, not_own_site, normalize_domain, is_freemail) -> dict | None:
    """Verzeichniseintrag + Website -> Zeile im Kunden-Pool oder None (Plattform/Freemail statt eigener Website)."""
    if not wanted(x) or not web or not_own_site.search(web):
        return None
    dom = normalize_domain(web)
    if not dom or is_freemail(dom) or dom.endswith("francenum.gouv.fr"):
        return None
    sid = x.get("identifiant_de_la_structure") or dom
    return {"id": f"francenum:{sid}", "name": x["nom_de_la_structure"][:200], "websites": [web], "emails": [],
            "phones": [], "street": x.get("adresse"), "city": x.get("ville"), "postcode": x.get("code_postal"),
            "region": x.get("region"), "country": "FR", "category": TYPES[x["type"]], "confidence": 1.0,
            "operating_status": "open", "reg_form": None, "reg_note": None,
            "quelle": f"{SOURCE}: {x['lien_url_site_france_num']}"}


def order_key(x: dict, salt: str) -> str:
    """Reihenfolge wechselt je Pool-Bau (Monat): reicht das Zeitbudget nicht, kommen nächstes Mal andere dran."""
    return hashlib.md5((salt + (x.get("identifiant_de_la_structure") or "")).encode()).hexdigest()


def pool_rows(log=print, fetcher=None, budget_s: float = BUDGET_S) -> list[dict]:
    from kundenwerk import NOT_OWN_SITE
    from lib.rules import is_freemail, normalize_domain
    items = [x for x in _download(log) if wanted(x)]
    items.sort(key=lambda x: order_key(x, time.strftime("%Y-%m")))
    if fetcher is None:
        from enrich import Fetcher  # scripts/enrich.py: robots.txt, gesperrte Plattformen, 1 Anfrage/s je Domain
        fetcher = Fetcher()
    end = time.monotonic() + budget_s
    out, seen, done = [], set(), 0
    for x in items:
        if time.monotonic() >= end:
            break
        got = fetcher.get(x["lien_url_site_france_num"])
        done += 1
        row = row_of(x, website_of(got[1]) if got else None, NOT_OWN_SITE, normalize_domain, is_freemail)
        if row and row["websites"][0] not in seen:
            seen.add(row["websites"][0])
            out.append(row)
    log(f"France Num (FR): {len(out)} Activateurs mit eigener Website ({done} von {len(items)} Seiten angesehen)")
    return out
