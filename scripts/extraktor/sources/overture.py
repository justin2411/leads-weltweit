"""Overture Maps Places (offene Daten, CDLA-Permissive-2.0 / Apache-2.0; Quellen u. a. Meta, Microsoft, Foursquare).

Für S2 (Webagenturen): lokale Firmen mit Telefon (oft auch E-Mail und Facebook-Seite), aber ohne eigene Website.
Ob es wirklich keine Website gibt, prüft danach enrich.py (Domains aus dem Namen) – erst dann steht
„keine Website gefunden“ im Lead.

Abruf: DuckDB liest die Parquet-Dateien direkt per HTTPS (nur benötigte Spalten/Zeilengruppen) und legt einen
Auszug für GB/FR lokal ab (`out/cache/overture_gb_fr.parquet`, ~600 MB). Namensnennung: „© Overture Maps Foundation“.
"""
from __future__ import annotations

import datetime as dt
import os
import re
from pathlib import Path

import requests

from extraktor.model import candidate

BUCKET = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/"
CACHE = Path(os.environ.get("EXTRAKTOR_OVERTURE", "out/cache/overture_gb_fr.parquet"))
COUNTRY = {"GB": "UK", "FR": "FR"}
# keine Käuferziele: Behörden, Schulen, Kirchen, Vereine, Parks …
# Filialen von Ketten/Franchise-Marken: die Marke hat längst eine Website (kein S2-Anlass)
BRANDS = re.compile(r"\b(euro ?spar|spar|premier|costcutter|londis|budgens|nisa|one stop|co-?op|tesco|sainsbury'?s|"
                    r"asda|morrisons|iceland|lidl|aldi|carrefour|intermarch[ée]|franprix|monoprix|leclerc|"
                    r"super u|casino|auchan|subway|domino'?s|greggs|starbucks|costa|mcdonald'?s|kfc|burger king|"
                    r"papa john'?s|pizza hut|shell|esso|texaco|bp|total(energies)?|post office|boots|"
                    r"lloyds pharmacy|superdrug|specsavers|william hill|ladbrokes|coral|paddy power|"
                    r"premier inn|travelodge|ibis|best western)\b", re.I)
SKIP_CAT = re.compile(r"place_of_worship|government|school|place_of_learning|park|community|sport_league|"
                      r"social_or_community|hospital|public_|military|embassy|cemetery|library|post_office|"
                      r"atm|bank|charity|non_profit|political|police|fire_station", re.I)
SOCIAL = {"facebook.com": "Facebook", "instagram.com": "Instagram", "linkedin.com": "LinkedIn", "tiktok.com": "TikTok",
          "x.com": "X", "twitter.com": "X", "youtube.com": "YouTube"}


def latest_release() -> str:
    xml = requests.get(BUCKET + "?list-type=2&prefix=release/&delimiter=/", timeout=60).text
    return sorted(re.findall(r"<Prefix>(release/[^<]+/)</Prefix>", xml))[-1]


def build_cache(log=print) -> Path:
    """GB/FR-Auszug (alle Firmen mit Telefon) aus der neuesten Overture-Veröffentlichung."""
    import duckdb
    rel = latest_release()
    xml = requests.get(BUCKET + f"?list-type=2&prefix={rel}theme=places/type=place/", timeout=60).text
    files = [BUCKET + k for k in re.findall(r"<Key>([^<]+parquet)</Key>", xml)]
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET threads=16;")
    con.execute(f"""COPY (SELECT id, names.primary AS name, phones, emails, socials, websites,
        addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS postcode,
        addresses[1].region AS region, addresses[1].country AS country, basic_category AS category,
        taxonomy.primary AS cat2, confidence, operating_status, [s.dataset FOR s IN sources] AS datasets,
        [s.update_time FOR s IN sources] AS updated
      FROM read_parquet({files})
      WHERE bbox.xmin BETWEEN -8.7 AND 9.6 AND bbox.ymin BETWEEN 41.3 AND 60.9
        AND addresses[1].country IN ('GB','FR') AND len(phones) > 0) TO '{CACHE}' (FORMAT parquet)""")
    log(f"Overture: Auszug {rel} -> {CACHE}")
    return CACHE


def no_website(country: str, limit: int, log=print, exclude: set[str] | None = None) -> list[dict]:
    """Firmen ohne Website (Telefon vorhanden), E-Mail und Social-Media-Seite zuerst, Ketten/Behörden ausgenommen."""
    import duckdb
    if not CACHE.exists():
        build_cache(log)
    con = duckdb.connect()
    cc = {"UK": "GB", "FR": "FR"}[country]
    rows = con.execute(f"""
        WITH base AS (SELECT * FROM '{CACHE}' WHERE country = ?),
             chains AS (SELECT lower(name) n FROM base GROUP BY 1 HAVING count(*) > 3)
        SELECT id, name, phones, emails, socials, street, city, postcode, category, datasets, updated, confidence
        FROM base
        WHERE (websites IS NULL OR len(websites) = 0)
          AND coalesce(operating_status, 'open') NOT IN ('permanently_closed', 'temporarily_closed')
          AND name IS NOT NULL AND lower(name) NOT IN (SELECT n FROM chains)
          AND coalesce(confidence, 0) >= 0.6
        ORDER BY (len(emails) > 0) DESC, (len(socials) > 0) DESC, confidence DESC
        LIMIT ?""", [cc, limit * 3 + len(exclude or ())]).fetchall()
    cols = ["id", "name", "phones", "emails", "socials", "street", "city", "postcode", "category", "datasets",
            "updated", "confidence"]
    out = []
    for r in rows:
        d = dict(zip(cols, r))
        if (exclude and d["id"] in exclude) or SKIP_CAT.search(d["category"] or "none") or not (d["street"] and d["postcode"]):
            continue
        if BRANDS.search(d["name"] or ""):
            continue
        out.append(d)
        if len(out) >= limit:
            break
    log(f"Overture {country}: {len(out)} Firmen ohne Website (Telefon vorhanden) ausgewählt")
    return out


def social_kind(urls: list[str] | None) -> str:
    for u in urls or []:
        for host, label in SOCIAL.items():
            if host in (u or ""):
                return label
    return ""


def to_candidate(d: dict, country: str) -> dict:
    upd = max((u for u in (d.get("updated") or []) if u), default="")
    return candidate(
        source="overture", source_id=d["id"], country=country,
        source_url=f"https://explore.overturemaps.org/#16/0/0?id={d['id']}",
        source_date=dt.date.today(), event_date=dt.date.today(),
        name=re.sub(r"\s+", " ", d["name"]).strip(), legal_name="",
        street=d["street"] or "", city=d["city"] or "", state="", zip=(d["postcode"] or "").upper(),
        phone=(d["phones"] or [""])[0], email=((d.get("emails") or [""])[0] or "").lower(),
        facts={"category": (d["category"] or "").replace("_", " "), "social": social_kind(d.get("socials")),
               "social_url": (d.get("socials") or [""])[0], "listed_by": [x for x in (d.get("datasets") or []) if x],
               "listing_updated": upd[:10], "checked_on": dt.date.today()},
    )
