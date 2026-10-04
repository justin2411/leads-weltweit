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
# stil“): US-Firmen MIT Website. Bis 03.10.2026 je Monat nur eine Hälfte (fest nach ID) – im Oktober war die
# Hälfte nach ~1,5 Tagen abgearbeitet und die 21 Teile liefen leer (Scout R22). Jetzt der ganze Bestand (~1 GB);
# das Gedächtnis der Teile (120 Tage) überspringt die schon geprüfte Hälfte
CACHE_US_WEB = Path(os.environ.get("EXTRAKTOR_OVERTURE_US_WEB", "out/cache/overture_us_web.parquet"))
# Neue Mail-Länder (Inhaber 04.10.2026: „nimm also auch andere länder mit auf die passend sind“, docs/KALTMAIL-RECHT.md):
# FI, SG, HK, MX, BR – nur Firmen OHNE Website und MIT E-Mail (wie US: sonst Millionen Rohbestand ohne Nutzen,
# BR allein hätte 4,7 Mio. Orte mit Telefon). Test 04.10.2026 siehe docs/QUELLEN-SCOUT.md
CACHE_NEW = Path(os.environ.get("EXTRAKTOR_OVERTURE_NEW", "out/cache/overture_fi_sg_hk_mx_br.parquet"))
# Website-Prüfung UK/FR, zweite Quelle (Scout 04.10.2026: UK/FR-Vorrat mit Telefon abgearbeitet): Firmen MIT Website,
# aber OHNE Telefon im Eintrag (~125.000 UK, ~110.000 FR mit Adresse) – die Nummer kommt dann von der eigenen Website
CACHE_WEB_NOPHONE = Path(os.environ.get("EXTRAKTOR_OVERTURE_WEB_NOPHONE", "out/cache/overture_gb_fr_web_ohne_tel.parquet"))
# Website-Prüfung US, zweite Stufe (Scout 04.10.2026: der US-Auszug ab 0,6 mit Telefon war nach ~12 h mit 21 Teilen
# durchgeprüft, 120 Tage Pause je Firma): genau die Ergänzung zum ersten Auszug – Website, Konfidenz 0,4–0,6 (mit oder
# ohne Telefon) oder ab 0,6 ohne Telefon. Keine Überschneidung mit overture_us_web.parquet
CACHE_US_WEB2 = Path(os.environ.get("EXTRAKTOR_OVERTURE_US_WEB2", "out/cache/overture_us_web_zweite.parquet"))
COUNTRY = {"GB": "UK", "FR": "FR", "IE": "IE", "NL": "NL", "BE": "BE", "SE": "SE", "US": "US",
           "FI": "FI", "SG": "SG", "HK": "HK", "MX": "MX", "BR": "BR"}
# Auszug -> (Overture-Ländercodes, Bounding-Box xmin, xmax, ymin, ymax – oder mehrere Boxen, je Land eine)
GROUPS = {CACHE: (("GB", "FR"), (-8.7, 9.6, 41.3, 60.9)),
          CACHE_NORTH: (("IE", "NL", "BE", "SE"), (-10.7, 24.2, 49.4, 69.1)),
          CACHE_US: (("US",), (-180.0, -60.0, 15.0, 72.0)),
          CACHE_US_WEB: (("US",), (-180.0, -60.0, 15.0, 72.0)),
          CACHE_WEB_NOPHONE: (("GB", "FR"), (-8.7, 9.6, 41.3, 60.9)),
          CACHE_US_WEB2: (("US",), (-180.0, -60.0, 15.0, 72.0)),
          CACHE_NEW: (("FI", "SG", "HK", "MX", "BR"), ((19.0, 31.6, 59.6, 70.1), (103.55, 104.1, 1.15, 1.48),
                                                       (113.8, 114.45, 22.13, 22.58), (-118.5, -86.6, 14.4, 32.8),
                                                       (-74.1, -34.7, -33.9, 5.4)))}
# Länder, in denen S2 ohne Website nur Firmen MIT E-Mail nimmt (US und die neuen Länder)
EMAIL_ONLY = {"US", "FI", "SG", "HK", "MX", "BR"}
# Hongkong hat keine Postleitzahlen: dort reicht Straße + Ort (qc.postcode_ok prüft HK nicht)
NO_POSTCODE = {"HK"}
# zusätzliche Bedingung je Auszug
ONLY_NO_WEBSITE = {CACHE_US, CACHE_NEW}
EXTRA_WHERE = {CACHE_US: "AND (websites IS NULL OR len(websites) = 0)",
               CACHE_US_WEB: "AND len(websites) > 0 AND coalesce(confidence, 0) >= 0.6",
               CACHE_NEW: "AND (websites IS NULL OR len(websites) = 0) AND len(emails) > 0",
               CACHE_WEB_NOPHONE: "AND len(websites) > 0",
               CACHE_US_WEB2: "AND len(websites) > 0 AND coalesce(confidence, 0) >= 0.4 "
                              "AND (coalesce(confidence, 0) < 0.6 OR phones IS NULL OR len(phones) = 0)"}
# Auszüge OHNE Telefon-Pflicht (alle anderen: nur Firmen mit Telefon)
NO_PHONE = {CACHE_WEB_NOPHONE}
# Auszüge mit und ohne Telefon (die Bedingung steht in EXTRA_WHERE)
ANY_PHONE = {CACHE_US_WEB2}


def boxes(box) -> tuple:
    """Eine Bounding-Box oder mehrere (je Land eine) -> Tupel von Boxen."""
    return (box,) if isinstance(box[0], (int, float)) else tuple(box)


def box_where(box) -> str:
    return "(" + " OR ".join(f"(bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1})"
                             for x0, x1, y0, y1 in boxes(box)) + ")"


def code(country: str) -> str:
    """Unser Ländercode -> Overture (ISO): UK -> GB."""
    return "GB" if country == "UK" else country


def cache_for(country: str) -> Path:
    cc = code(country)
    return next(p for p, (codes, _) in GROUPS.items() if cc in codes and p not in NO_PHONE | ANY_PHONE)  # US: der Auszug ohne Website
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
                    r"willys|pressbyr[åa]n|7-eleven|systembolaget|apoteket|max hamburgare|"
                    # FI/SG/HK/MX/BR (neue Länder 04.10.2026)
                    r"k-market|k-supermarket|k-citymarket|s-market|prisma|r-kioski|alko|neste|"
                    r"fairprice|cheers|guardian|watsons|wellcome|parknshop|mannings|"
                    r"oxxo|pemex|bodega aurrera|soriana|chedraui|elektra|coppel|banco azteca|farmacias guadalajara|"
                    r"farmacias del ahorro|farmacias similares|drogasil|droga raia|pague menos|ipiranga|petrobras|"
                    r"casas bahia|magazine luiza|o botic[aá]rio|cacau show|lojas americanas)\b", re.I)
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
    codes, box = GROUPS[path]
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
      WHERE {box_where(box)}
        AND addresses[1].country IN ({listed})
        AND {"(phones IS NULL OR len(phones) = 0)" if path in NO_PHONE else "TRUE" if path in ANY_PHONE else "len(phones) > 0"}
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
          AND (NOT ? OR len(emails) > 0)  -- US/neue Länder: nur mit E-Mail (sonst Millionen Rohbestand ohne Nutzen)
        ORDER BY (len(emails) > 0) DESC, (len(socials) > 0) DESC, confidence DESC
        LIMIT ?""", [cc, country in EMAIL_ONLY, limit * 3 + len(exclude or ())]).fetchall()
    cols = ["id", "name", "phones", "emails", "socials", "street", "city", "postcode", "category", "datasets",
            "updated", "confidence", "region"]
    out = []
    for r in rows:
        d = dict(zip(cols, r))
        if (exclude and d["id"] in exclude) or SKIP_CAT.search(d["category"] or "none") or not (d["street"] and (d["postcode"] or country in NO_POSTCODE)):
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
        # HK: keine Postleitzahlen (Overture führt dort Platzhalter wie „000000“) -> leer
        zip="" if country in NO_POSTCODE else (d["postcode"] or "").upper(),
        phone=(d["phones"] or [""])[0], email=((d.get("emails") or [""])[0] or "").lower(),
        facts={"category": (d["category"] or "").replace("_", " "), "social": social_kind(d.get("socials")),
               "social_url": (d.get("socials") or [""])[0], "listed_by": [x for x in (d.get("datasets") or []) if x],
               "listing_updated": upd[:10], "checked_on": dt.date.today()},
    )
