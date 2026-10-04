"""FI: Käufer für Webagenturen (S2) aus dem offenen Firmenregister YTJ (Patentti- ja rekisterihallitus, PRH).

Kunden-Werk (JARVIS-Agent 5 „Käuferquellen“, 04.10.2026): Overture kannte in Finnland nur wenige Agenturen (130
mail-fähige Käufer). PRH veröffentlicht alle Firmen des Handelsregisters als offene Daten (avoindata.prh.fi,
Massendownload `all_companies`, ohne Schlüssel, Quellenangabe Pflicht: „PRH/YTJ“): Name, Rechtsform, Haupttätigkeit
(TOL 2025), Adresse, eingetragene Website. Ein Abruf je Pool-Bau (Zwischenspeicher 7 Tage).

Nur aktive Osakeyhtiö (Oy, Rechtsform 16; FI mailt nur Kapitalgesellschaften – Prüfregel unverändert) mit eigener
Website in den Branchen 62.10 Programmierung, 63.10 Hosting/Datenverarbeitung, 73.11 Werbeagenturen,
74.12 Grafikdesign. Die Rechtsform kommt aus dem Register (reg_form „Oy“ + Y-tunnus); die E-Mail muss wie immer auf
der eigenen Website stehen (allgemeine Adresse, unveränderte Prüfregel). Test 04.10.2026: 6.176 neue Domains (nur
1.052 davon überhaupt in Overture), Stichprobe 120 -> 40 mail-fähig (33 %).
"""
from __future__ import annotations

import time
import zipfile
from pathlib import Path

import requests

URL = "https://avoindata.prh.fi/opendata-ytj-api/v3/all_companies"
CACHE = Path(__file__).resolve().parents[3] / "out" / "cache" / "ytj_all_companies.zip"
MAX_AGE = 7 * 86400
# Haupttätigkeit (TOL 2025, erste 4 Ziffern) -> Kategorie im Kunden-Werk (kundenwerk.CATEGORIES/SECOND: alle S2 in FI)
LINES = {"6210": "software_development", "6310": "web_hosting_service", "7311": "advertising_agency",
         "7412": "graphic_designer"}
FORM_OY = "16"  # Osakeyhtiö
SOURCE = "https://avoindata.prh.fi (YTJ, PRH)"


def _download(log=print) -> Path:
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with requests.get(URL, stream=True, timeout=300, headers={"User-Agent": "NextGenProfitBot/0.1"}) as r:
                r.raise_for_status()
                tmp = CACHE.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for block in r.iter_content(1 << 20):
                        f.write(block)
                tmp.replace(CACHE)
                return CACHE
        except requests.RequestException as exc:
            log(f"YTJ: Download fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("YTJ nicht erreichbar")


def address_of(addresses: list[dict] | None) -> tuple[str | None, str | None, str | None]:
    """Besuchsadresse (Typ 1) bevorzugt, sonst Postadresse: (Straße, Ort, PLZ)."""
    best = sorted(addresses or [], key=lambda a: 0 if a.get("type") == 1 else 1)
    for a in best:
        street = " ".join(x for x in (a.get("street"), a.get("buildingNumber")) if x)
        city = next((p.get("city") for p in a.get("postOffices") or [] if p.get("city")), None)
        if street or city:
            return street or None, (city or "").title() or None, a.get("postCode") or None
    return None, None, None


def row_of(bid: str, name: str, line: str, web: str, addresses, not_own_site, normalize_domain, is_freemail) -> dict | None:
    """Ein aktiver Oy-Datensatz -> Zeile im Kunden-Pool oder None."""
    cat = LINES.get((line or "")[:4])
    web = " ".join((web or "").split()).lower()
    if not cat or not web or not name or not_own_site.search(web):
        return None
    dom = normalize_domain(web)
    if not dom or is_freemail(dom):
        return None
    street, city, postcode = address_of(addresses)
    return {"id": f"ytj:{bid}", "name": name[:200], "websites": [web], "emails": [], "phones": [],
            "street": street, "city": city, "postcode": postcode, "region": None, "country": "FI", "category": cat,
            "confidence": 1.0, "operating_status": "open", "reg_form": "Oy",
            "reg_note": f"Y-tunnus {bid} (YTJ/PRH: Osakeyhtiö)", "quelle": f"{SOURCE} Y-tunnus {bid}"}


def pool_rows(log=print) -> list[dict]:
    """Aktive Oy mit Website in den Web-Branchen (DuckDB liest nur die nötigen Felder der ~1,5 GB JSON)."""
    import duckdb
    from kundenwerk import NOT_OWN_SITE
    from lib.rules import is_freemail, normalize_domain
    path = _download(log)
    work = CACHE.parent / "ytj"
    work.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as z:
        member = next(n for n in z.namelist() if n.endswith(".json"))
        z.extract(member, work)
    js = work / member
    prefixes = " OR ".join(f"mainBusinessLine.type LIKE '{p}%'" for p in LINES)
    try:
        con = duckdb.connect()
        con.execute("SET preserve_insertion_order = false")
        rows = con.execute(f"""
            SELECT businessId.value, [x.name FOR x IN names IF x.endDate IS NULL AND x.type = '1'][1],
                   mainBusinessLine.type, website.url, addresses
            FROM read_json('{js}', format='array', maximum_object_size=10000000)
            WHERE website.url IS NOT NULL AND tradeRegisterStatus = '1' AND ({prefixes})
              AND list_contains([f.type FOR f IN companyForms IF f.endDate IS NULL], '{FORM_OY}')""").fetchall()
    finally:
        js.unlink(missing_ok=True)
    out = [r for r in (row_of(b, n, li, w, a, NOT_OWN_SITE, normalize_domain, is_freemail) for b, n, li, w, a in rows) if r]
    log(f"YTJ (FI): {len(out)} aktive Oy mit Website in {len(LINES)} Branchen")
    return out
