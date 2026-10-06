"""UK-Käufer für Webagenturen (S2) aus Companies House „Free Company Data Product“ (JARVIS-Agent 2, 06.10.2026).

Anlass: der Overture-Pool für S2-Käufer in UK ist durchgeprüft. Die kostenlosen Massendaten (BasicCompanyData,
monatlich, ohne Konto/Schlüssel, https://download.companieshouse.gov.uk/en_output.html) nennen alle aktiven
Kapitalgesellschaften mit Branche (SIC), aber keine Website und keine E-Mail.

Weg (scripts/kundenwerk.py uk-register):
1. aktive Ltd/PLC/LLP mit SIC 62012 (Software-/Webentwicklung), 63120 (Webportale), 74100 (Design), 73110 (Werbung)
2. Website nur über die bestehende Anreicherung (enrich.py / lib.websites): Domain-Varianten aus dem Namen, DNS,
   höflicher Abruf (robots.txt, 1 Anfrage/s je Domain); sie zählt nur, wenn die Seite selbst belegt, dass sie zu
   genau dieser Firma gehört (score_match: Registernummer, voller Name, Postleitzahl) – keine Suchmaschinen,
   keine Verzeichnisse
3. die Website nennt Webdesign/-entwicklung (WEB_EVIDENCE; sonst kein ehrlicher S2-Käufer: Scout 04.10.2026 sah
   im SIC-Abgleich viele Küchen-/Möbel-/Produktdesigner)
4. unveränderte Prüfregel (kundenwerk.check_one -> lib.rules.check_prospect: allgemeine Firmen-Adresse auf der
   eigenen Domain, UK nur Kapitalgesellschaften, Sperrliste)

Diese Datei: Filter der Massendaten und Web-Nachweis, ohne Netz (bis auf den Download über uk_ch).
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
import zipfile
from pathlib import Path

from extraktor.sources import uk_ch

# SIC -> Kategorie im Kunden-Werk (alle S2 in kundenwerk.CATEGORIES)
SIC_CATEGORY = {"62012": "software_development", "63120": "software_development", "74100": "graphic_designer",
                "73110": "b2b_advertising_and_marketing_service"}
SIC_ORDER = ("62012", "63120", "74100", "73110")  # erste passende SIC bestimmt die Kategorie
FORMS = uk_ch.CATEGORY_FORM  # Ltd / PLC / LLP (PECR: corporate subscribers)
VERSION = "v1"

# auf Text ohne Akzente, klein geschrieben (wie lib.fr_webfit, englisch)
WEB_EVIDENCE = re.compile(
    r"\bweb ?design(er|ers|s|ing)?\b|\bwebsite (design|development|build(s|ing)?|redesign)s?\b|"
    r"\bweb ?(development|developer|developers|agency|studio)\b|\bwordpress (website|web ?design|development|"
    r"developer|agency|sites?)\b|\b(bespoke|custom|responsive|e-?commerce|ecommerce|shopify|wordpress) websites?\b|"
    r"\b(build|building|create|creating|design|designing|develop|developing) (beautiful |bespoke |custom |modern |"
    r"stunning |professional |responsive |great |your |new )*websites?\b|\bwebsites? for (small )?business(es)?\b|"
    r"\bseo\b|\bsearch engine optimi[sz]ation\b|\bdigital agency\b")


def fold(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t)


def web_evidence(text: str) -> str | None:
    """Erster Nachweis für Webdesign/-entwicklung im Seitentext oder None."""
    m = WEB_EVIDENCE.search(fold(text))
    return m.group(0) if m else None


def category_for(sics: list[str] | set[str]) -> str | None:
    for s in SIC_ORDER:
        if s in sics:
            return SIC_CATEGORY[s]
    return None


def keep_row(status: str, category: str, sics: set[str], name: str) -> bool:
    """Aktive Kapitalgesellschaft mit passender SIC, keine Holding/Immobilien/Fonds (uk_ch.SKIP_NAME)."""
    return (status == "Active" and category in FORMS and bool(sics & set(SIC_CATEGORY))
            and not uk_ch.SKIP_NAME.search(name or ""))


def extract(zip_path: Path) -> list[dict]:
    """BasicCompanyData-ZIP -> kompakte Liste (nur die Felder für Website-Suche und Prüfung)."""
    out = []
    with zipfile.ZipFile(zip_path) as z, z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        head = [h.strip() for h in next(reader)]
        ix = {h: i for i, h in enumerate(head)}
        sic_ix = [i for h, i in ix.items() if h.startswith("SICCode")]
        for row in reader:
            if len(row) < len(head):
                continue
            sics = {row[i].split(" ")[0] for i in sic_ix if row[i]}
            name, cat = row[ix["CompanyName"]], row[ix["CompanyCategory"]]
            if not keep_row(row[ix["CompanyStatus"]], cat, sics, name):
                continue
            street = ", ".join(x for x in (row[ix["RegAddress.AddressLine1"]], row[ix["RegAddress.AddressLine2"]]) if x)
            out.append({"n": row[ix["CompanyNumber"]], "name": name, "form": FORMS[cat],
                        "sic": sorted(sics & set(SIC_CATEGORY)), "street": street,
                        "city": row[ix["RegAddress.PostTown"]], "pc": row[ix["RegAddress.PostCode"]].upper()})
    return out


def load(cache_dir: Path | None = None, log=print) -> list[dict]:
    """Kompakte Liste des aktuellen Monats (Zwischenspeicher), sonst einmal aus den Massendaten bauen."""
    name = uk_ch._latest("en_output.html", r'BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip')
    cache_dir = cache_dir or uk_ch.CACHE
    path = cache_dir / f"s2_buyers-{VERSION}-{name[-14:-4]}.json"
    if path.exists():
        return json.loads(path.read_text())
    rows = extract(uk_ch._download(name))
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    log(f"Companies House {name}: {len(rows)} aktive Ltd/PLC/LLP mit SIC {'/'.join(SIC_ORDER)}")
    return rows
