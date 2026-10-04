"""MX: Käufer für Webagenturen (S2) aus dem amtlichen Unternehmensverzeichnis DENUE (INEGI).

Kunden-Werk (JARVIS-Agent 5 „Käuferquellen“, 04.10.2026): Overture kennt in Mexiko nur einen Teil der Agenturen.
DENUE (Directorio Estadístico Nacional de Unidades Económicas) ist der offene Massendownload des Statistikamts INEGI
(„Términos de Libre Uso de la Información del INEGI“, ohne Schlüssel; robots.txt sperrt /contenidos/masiva nicht;
ein Abruf je Pool-Bau, Zwischenspeicher 7 Tage). Je Betrieb: Name, Tätigkeit (SCIAN), Adresse,
Telefon, E-Mail, Website.

Nur Betriebe der Branchen, die Websites für kleine Firmen bauen oder verkaufen (SCIAN 2023):
541430 Diseño gráfico, 541510 Diseño de sistemas de cómputo, 541810 Agencias de publicidad,
541890 Otros servicios de publicidad. Website = eingetragene Website, sonst die Domain der eingetragenen Firmen-E-Mail
(nie Freemail). Geprüft wird danach wie jeder Käufer im Kunden-Werk (eigene Website, allgemeine Adresse,
unveränderte Prüfregel). Test 04.10.2026: 3.748 Domains, 3.468 noch nicht in prospects, davon nur 632 im
Overture-Pool; Stichprobe 120 -> 29 mail-fähig (24 %).
"""
from __future__ import annotations

import csv
import io
import time
import zipfile
from pathlib import Path

import requests

URL = "https://www.inegi.org.mx/contenidos/masiva/denue/denue_00_54_csv.zip"  # Sektor 54, ganz Mexiko, aktuelle Ausgabe
CACHE = Path(__file__).resolve().parents[3] / "out" / "cache" / "denue_54.zip"
MAX_AGE = 7 * 86400
# SCIAN -> Overture-Kategorie im Kunden-Werk (kundenwerk.CATEGORIES/SECOND: alle S2 in MX)
CODES = {"541430": "graphic_designer", "541510": "software_development", "541810": "advertising_agency",
         "541890": "b2b_advertising_and_marketing_service"}
SOURCE = "https://www.inegi.org.mx/app/mapa/denue/ (DENUE, INEGI)"


def _download(log=print) -> Path:
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with requests.get(URL, stream=True, timeout=180, headers={"User-Agent": "NextGenProfitBot/0.1"}) as r:
                r.raise_for_status()
                tmp = CACHE.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for block in r.iter_content(1 << 20):
                        f.write(block)
                tmp.replace(CACHE)
                return CACHE
        except requests.RequestException as exc:
            log(f"DENUE: Download fehlgeschlagen ({type(exc).__name__}), Versuch {attempt + 1}/3")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("DENUE nicht erreichbar")


def _clean(v: str | None) -> str:
    return " ".join((v or "").split())


def row_of(r: dict, not_own_site, normalize_domain, is_freemail) -> dict | None:
    """Ein DENUE-Datensatz -> Zeile im Kunden-Pool (Spalten wie der Overture-Auszug) oder None."""
    cat = CODES.get((r.get("codigo_act") or "").strip())
    if not cat:
        return None
    www = _clean(r.get("www")).lower()
    email = _clean(r.get("correoelec")).lower()
    site = www if www and not not_own_site.search(www) else ""
    if not site and "@" in email and not is_freemail(email.split("@")[-1]):
        site = email.split("@")[-1]
    dom = normalize_domain(site) if site else ""
    if not dom or is_freemail(dom):
        return None
    name = _clean(r.get("nom_estab")) or _clean(r.get("raz_social"))
    if not name:
        return None
    street = " ".join(x for x in (_clean(r.get("tipo_vial")), _clean(r.get("nom_vial")), _clean(r.get("numero_ext")))
                      if x and x.upper() not in ("NINGUNO", "SN"))
    phone = _clean(r.get("telefono"))
    return {"id": f"denue:{_clean(r.get('id'))}", "name": name[:200], "websites": [site],
            "emails": [email] if "@" in email else [], "phones": [phone] if phone else [],
            "street": street or None, "city": _clean(r.get("municipio")) or None,
            "postcode": _clean(r.get("cod_postal")) or None, "region": _clean(r.get("entidad")) or None,
            "country": "MX", "category": cat, "confidence": 1.0, "operating_status": "open",
            "reg_form": None, "reg_note": None, "quelle": f"{SOURCE} id {_clean(r.get('id'))}"}


def pool_rows(log=print) -> list[dict]:
    """Alle passenden Betriebe mit eigener Website oder Firmen-E-Mail."""
    from kundenwerk import NOT_OWN_SITE
    from lib.rules import is_freemail, normalize_domain
    path = _download(log)
    out: list[dict] = []
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv") and "conjunto_de_datos" in n)
        with z.open(name) as fh:
            for r in csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1")):
                row = row_of(r, NOT_OWN_SITE, normalize_domain, is_freemail)
                if row:
                    out.append(row)
    log(f"DENUE (MX): {len(out)} Betriebe mit Website oder Firmen-E-Mail in {len(CODES)} Branchen")
    return out
