"""Overture Maps Places (offene Daten, CDLA-Permissive-2.0 / Apache-2.0; Quellen u. a. Meta, Microsoft, Foursquare).

Für S2 (Webagenturen): lokale Firmen mit Telefon (oft auch E-Mail und Facebook-Seite), aber ohne eigene Website.
Ob es wirklich keine Website gibt, prüft danach enrich.py (Domains aus dem Namen) – erst dann steht
„keine Website gefunden“ im Lead.

Abruf: DuckDB liest die Parquet-Dateien direkt per HTTPS (nur benötigte Spalten/Zeilengruppen) und legt einen
Auszüge lokal ab (`out/cache/overture_gb_fr.parquet`, ~600 MB; `overture_ie_nl_be_se.parquet` für IE/NL/BE/SE). Namensnennung: „© Overture Maps Foundation“.
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
# Scout-Sprint 01.10.2026: weitere Mail-Länder aus countries.yaml (allowed) mit eigenem, kleinerem Auszug
CACHE_NORTH = Path(os.environ.get("EXTRAKTOR_OVERTURE_NORTH", "out/cache/overture_ie_nl_be_se.parquet"))
# Fokus Webagenturen (Inhaber 02.10.2026): US-Auszug nur mit Firmen OHNE Website (sonst zu groß), ~2,5 Mio. Firmen
CACHE_US = Path(os.environ.get("EXTRAKTOR_OVERTURE_US", "out/cache/overture_us_s2.parquet"))
# Website-Prüfung S2 (Inhaber 02.10.2026: „sehr alte Websites oder fehlende Sicherheit“, dann „im ganz großen
# stil“): US-Firmen MIT Website, je Monat die andere Hälfte (fest nach ID), damit der Auszug handlich bleibt
# (~0,5 GB) und die Teile jeden Monat neue Firmen bekommen
CACHE_US_WEB = Path(os.environ.get("EXTRAKTOR_OVERTURE_US_WEB", "out/cache/overture_us_web.parquet"))
COUNTRY = {"GB": "UK", "FR": "FR", "IE": "IE", "NL": "NL", "BE": "BE", "SE": "SE", "US": "US"}
# Auszug -> (Overture-Ländercodes, Bounding-Box xmin, xmax, ymin, ymax)
GROUPS = {CACHE: (("GB", "FR"), (-8.7, 9.6, 41.3, 60.9)),
          CACHE_NORTH: (("IE", "NL", "BE", "SE"), (-10.7, 24.2, 49.4, 69.1)),
          CACHE_US: (("US",), (-180.0, -60.0, 15.0, 72.0)),
          CACHE_US_WEB: (("US",), (-180.0, -60.0, 15.0, 72.0))}
# zusätzliche Bedingung je Auszug
ONLY_NO_WEBSITE = {CACHE_US}
EXTRA_WHERE = {CACHE_US: "AND (websites IS NULL OR len(websites) = 0)",
               CACHE_US_WEB: "AND len(websites) > 0 AND hash(id) % 2 = "
                             f"{dt.date.today().month % 2} AND coalesce(confidence, 0) >= 0.6"}


def code(country: str) -> str:
    """Unser Ländercode -> Overture (ISO): UK -> GB."""
    return "GB" if country == "UK" else country


def cache_for(country: str) -> Path:
    cc = code(country)
    return next(p for p, (codes, _) in GROUPS.items() if cc in codes)  # US: der Auszug ohne Website
# keine Käuferziele: Behörden, Schulen, Kirchen, Vereine, Parks …
# Filialen von Ketten/Franchise-Marken: die Marke hat längst eine Website (kein S2-Anlass)
BRANDS = re.compile(r"\b(euro ?spar|spar|premier|costcutter|londis|budgens|nisa|one stop|co-?op|tesco|sainsbury'?s|"
                    r"asda|morrisons|iceland|lidl|aldi|carrefour|intermarch[ée]|franprix|monoprix|leclerc|"
                    r"super u|casino|auchan|subway|domino'?s|greggs|starbucks|costa|mcdonald'?s|kfc|burger king|"
                    r"papa john'?s|pizza hut|shell|esso|texaco|bp|total(energies)?|post office|boots|"
                    r"lloyds pharmacy|superdrug|specsavers|william hill|ladbrokes|coral|paddy power|"
                    r"premier inn|travelodge|ibis|best western|"
                    # IE/NL/BE/SE (Scout-Sprint 01.10.2026)
                    # (nur eindeutige Kettennamen; Allerweltswörter wie „Action“ oder „Plus“ würden echte Firmen treffen)
                    r"dunnes stores|supervalu|applegreen|circle k|albert heijn|jumbo supermarkt|kruidvat|etos|"
                    r"blokker|delhaize|colruyt|carrefour express|ica (?:kvantum|supermarket|maxi|nära)|hemk[öo]p|"
                    r"willys|pressbyr[åa]n|7-eleven|systembolaget|apoteket|max hamburgare)\b", re.I)
SKIP_CAT = re.compile(r"place_of_worship|government|school|place_of_learning|park|community|sport_league|"
                      r"social_or_community|hospital|public_|military|embassy|cemetery|library|post_office|"
                      r"atm|bank|charity|non_profit|political|police|fire_station", re.I)
SOCIAL = {"facebook.com": "Facebook", "instagram.com": "Instagram", "linkedin.com": "LinkedIn", "tiktok.com": "TikTok",
          "x.com": "X", "twitter.com": "X", "youtube.com": "YouTube"}


def latest_release() -> str:
    xml = requests.get(BUCKET + "?list-type=2&prefix=release/&delimiter=/", timeout=60).text
    return sorted(re.findall(r"<Prefix>(release/[^<]+/)</Prefix>", xml))[-1]


def build_cache(log=print, path: Path = CACHE) -> Path:
    """Länder-Auszug (alle Firmen mit Telefon) aus der neuesten Overture-Veröffentlichung."""
    import duckdb
    codes, (x0, x1, y0, y1) = GROUPS[path]
    rel = latest_release()
    xml = requests.get(BUCKET + f"?list-type=2&prefix={rel}theme=places/type=place/", timeout=60).text
    files = [BUCKET + k for k in re.findall(r"<Key>([^<]+parquet)</Key>", xml)]
    path.parent.mkdir(parents=True, exist_ok=True)
    listed = ",".join(f"'{c}'" for c in codes)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET threads=16;")
    con.execute(f"""COPY (SELECT id, names.primary AS name, phones, emails, socials, websites,
        addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS postcode,
        addresses[1].region AS region, addresses[1].country AS country, basic_category AS category,
        taxonomy.primary AS cat2, confidence, operating_status, [s.dataset FOR s IN sources] AS datasets,
        [s.update_time FOR s IN sources] AS updated
      FROM read_parquet({files})
      WHERE bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1}
        AND addresses[1].country IN ({listed}) AND len(phones) > 0
        {EXTRA_WHERE.get(path, "")}) TO '{path}' (FORMAT parquet)""")
    log(f"Overture: Auszug {rel} ({'/'.join(codes)}) -> {path}")
    return path


def no_website(country: str, limit: int, log=print, exclude: set[str] | None = None) -> list[dict]:
    """Firmen ohne Website (Telefon vorhanden), E-Mail und Social-Media-Seite zuerst, Ketten/Behörden ausgenommen."""
    import duckdb
    path = cache_for(country)
    if not path.exists():
        build_cache(log, path)
    con = duckdb.connect()
    cc = code(country)
    rows = con.execute(f"""
        WITH base AS (SELECT * FROM '{path}' WHERE country = ?),
             chains AS (SELECT lower(name) n FROM base GROUP BY 1 HAVING count(*) > 3)
        SELECT id, name, phones, emails, socials, street, city, postcode, category, datasets, updated, confidence, region
        FROM base
        WHERE (websites IS NULL OR len(websites) = 0)
          AND coalesce(operating_status, 'open') NOT IN ('permanently_closed', 'temporarily_closed')
          AND name IS NOT NULL AND lower(name) NOT IN (SELECT n FROM chains)
          AND coalesce(confidence, 0) >= 0.6
          AND (? <> 'US' OR len(emails) > 0)  -- US: nur mit E-Mail (sonst Millionen Rohbestand ohne Nutzen)
        ORDER BY (len(emails) > 0) DESC, (len(socials) > 0) DESC, confidence DESC
        LIMIT ?""", [cc, cc, limit * 3 + len(exclude or ())]).fetchall()
    cols = ["id", "name", "phones", "emails", "socials", "street", "city", "postcode", "category", "datasets",
            "updated", "confidence", "region"]
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
        street=d["street"] or "", city=d["city"] or "", state=(d.get("region") or "") if country == "US" else "",
        zip=(d["postcode"] or "").upper(),
        phone=(d["phones"] or [""])[0], email=((d.get("emails") or [""])[0] or "").lower(),
        facts={"category": (d["category"] or "").replace("_", " "), "social": social_kind(d.get("socials")),
               "social_url": (d.get("socials") or [""])[0], "listed_by": [x for x in (d.get("datasets") or []) if x],
               "listing_updated": upd[:10], "checked_on": dt.date.today()},
    )
