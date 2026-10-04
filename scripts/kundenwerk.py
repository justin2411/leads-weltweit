#!/usr/bin/env python3
"""Kunden-Werk (Inhaber 01.10.2026: „ein Kunden-Werk … was 24/7 läuft“, Ziel 1 Mio.).

Sucht Käufer (unsere Zielgruppen) und legt sie geprüft in `prospects` ab. Sendet nie Mails – ob und wann
angeschrieben wird, entscheidet weiter config/versand.yaml (zurzeit aus).

  python scripts/kundenwerk.py pool                 # Overture-Auszug + offene Register (MX DENUE, FI YTJ) mit Website
  python scripts/kundenwerk.py run --shard 0/4 --max 3000
  python scripts/kundenwerk.py stand                # Zählung je Branche und Land

Weg je Firma (wie scripts/prospects.py): eigene Website -> veröffentlichte Firmen-E-Mail (nur eigene Domain,
allgemeine Adressen bevorzugt), Rechtsform/Registernummer -> Prüfregeln (lib.rules.check_prospect: Land erlaubt,
keine Freemail, UK nur Kapitalgesellschaften, Sperrliste …). Jede geprüfte Domain wird gespeichert (auch ohne
Treffer, check_status = rejected), damit sie nicht erneut abgerufen wird. Ziel: TARGET Käufer im Bestand (ok = E-Mail erlaubt, call_only = nur Anruf/Brief).
Keine Kontaktformulare, keine Personennamen, robots.txt, gesperrte Plattformen ausgeschlossen.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fetch import host_blocked  # noqa: E402
from lib.rules import check_prospect, country_rules, load_countries, normalize_domain  # noqa: E402

TARGET = 1_000_000  # Inhaber 01.10.2026: „Kundenwerk soll erst bei 1mio Kunden aufhören“
POOL = Path(os.environ.get("KUNDENWERK_POOL", "out/cache/kunden_pool.parquet"))
# Länder, aus denen wir Leads liefern können (Overture-Code -> unser Code); IE/NL/BE/SE: Scout-Sprint 01.10.2026
# FI/SG/HK/MX/BR: neue Mail-Länder (Inhaber 04.10.2026, docs/KALTMAIL-RECHT.md, Test in docs/QUELLEN-SCOUT.md)
COUNTRIES = {"US": "US", "GB": "UK", "FR": "FR", "IE": "IE", "NL": "NL", "BE": "BE", "SE": "SE",
             "FI": "FI", "SG": "SG", "HK": "HK", "MX": "MX", "BR": "BR"}
# Overture-Kategorie (taxonomy.primary) -> Zielgruppe
CATEGORIES = {
    "employment_agency": "S1",
    "web_designer": "S2",
    # Fokus Webagenturen (Inhaber 02.10.2026): auch Grafik-/Social-Media-/Hosting-/Online-Marketing-Agenturen bauen
    # Websites für kleine Firmen und kaufen „Firmen ohne Website“
    "graphic_designer": "S2", "social_media_agency": "S2", "web_hosting_service": "S2",
    "it_service_and_computer_repair": "S3", "information_technology_company": "S3", "it_consultant": "S3",
    "insurance_agency": "S4",
    "accountant": "S5", "bookkeeper": "S5", "tax_service": "S5", "payroll_service": "S5",
    "coworking_space": "S6", "shared_office_space": "S6", "commercial_real_estate": "S6",
    "janitorial_service": "S7", "cleaning_service": "S7", "office_cleaning": "S7",
    "industrial_cleaning_service": "S7",
    "financial_advising": "S9",
    "sign_making": "S10", "b2b_signage_service": "S10",
    "marketing_agency": "S12", "advertising_agency": "S12", "b2b_marketing_consultant": "S12",
    "internet_marketing_service": "S2",
    # Erweiterung 02.10.2026 (Kunden-Werk hatte alle bisherigen Kandidaten geprüft): nur eindeutige Kategorien,
    # geprüft an Stichproben; zusammen ~180.000 Orte mit Website, geschätzt ~90.000 neue Domains
    "software_development": "S2", "b2b_advertising_and_marketing_service": "S2", "media_agency": "S2",
    "e_commerce_service": "S2",
    "temp_agency": "S1", "b2b_executive_search_consultants": "S1",
    "auto_insurance": "S4", "life_insurance": "S4", "home_and_rental_insurance": "S4",
    "carpet_cleaning": "S7", "window_washing": "S7", "pressure_washing": "S7",
    "investing": "S9", "investment_management_company": "S9",
    "namens_pool_kreativstudio": "S2",  # = CREATIVE (keine Overture-Kategorie), nur UK, nur mit Companies-House-Branche (creative_fit), sonst verworfen
}
# Zweite Zielgruppe je Kategorie für Länder, in die die erste nicht mailen darf (Quellen-Scout 03.10.2026, R16b):
# Werbe-/Marketingagenturen bleiben in UK/US eigener Test S12 (getrennt von S2 testbar, config/zielgruppen.yaml);
# in FR/IE/NL/BE/SE gibt es S12 nicht, dort sind sie Käufer für S2 (bauen Websites für kleine Firmen, wie
# b2b_advertising_and_marketing_service/media_agency). Test: 95 Firmen -> 10 ok (FR 7/30, SE 3/15).
SECOND = {"marketing_agency": "S2", "advertising_agency": "S2", "b2b_marketing_consultant": "S2"}
SECOND_COUNTRIES = {"FR", "IE", "NL", "BE", "SE", "FI", "SG", "HK", "MX", "BR"}  # nicht UK/US: dort bleibt S12 eigener Test, auch im S2-Fokuslauf
# Namens-Pool (JARVIS-Agent „Käufer finden · UK/FR“, 04.10.2026): Overture-Orte AUSSERHALB der Kategorien oben
# (Kategorie leer oder allgemein wie professional_service/design_service), deren Name eindeutig eine Webagentur nennt.
# Test 04.10.2026 (ohne Speichern): UK 10/150, FR 3/48 mail-fähig; Rest meist Einzelunternehmer (nur Anruf/Brief).
NAME_WEB = {
    "GB": r"(?i)\b(web ?design(er|ers|s)?|website(s| design| designer| development)?|web ?develop(er|ers|ment)|"
          r"web (agency|studio|solutions|services)|digital (agency|studio)|seo)\b",
    "FR": r"(?i)(\bweb ?design|\bagence (web|digitale|de communication|communication|marketing|webmarketing)|"
          r"cr[ée]ation (de )?sites?|sites? (internet|web)|d[ée]veloppeu?r web|\bwebmaster|\bweb ?agency|\bgraphiste|"
          r"\bstudio (web|graphique|de cr[ée]ation)|\bseo\b|\bwebmarketing)",
}
# Englischer Namensfilter auch für US (JARVIS-Agent „Käufer finden · Mail-Länder“, 04.10.2026): Test 100 neue
# Domains -> 34 mail-fähig (US: keine Rechtsform-/Adressregel), Pool US ~950 neue Domains.
NAME_WEB_EN = "'GB', 'US'"
# UK zusätzlich Kreativ-/Designstudios, aber nur wenn Companies House sie eindeutig (Name) als aktive Firma mit
# Branche Webentwicklung/Design führt (SIC 62012 Software-/Webentwicklung, 63120 Webportale, 74100 Design).
# Test 04.10.2026: 100 -> 49 mail-fähig (alle Ltd laut Register).
NAME_CREATIVE_GB = r"(?i)\b(web|websites?|digital|creative|creatives|design|designs|studio|branding|brand|graphics?|seo|media|pixel|online)\b"
NAME_EXCLUDE = (r"(?i)(architect|interior|kitchen|furniture|landscap|garden|fashion|bridal|engineer|\bcad\b|3d|joinery|"
                r"bathroom|print|sign|embroider|theatr|lighting|exhibition|product design|packaging|jewel|textile|tattoo|"
                r"photograph|wedding|cake|floral|flower)")
# allgemeine Overture-Grundkategorien (basic_category), in denen solche Agenturen landen; leer zählt mit
NAME_NEUTRAL = ("design_service", "professional_service", "corporate_or_business_office", "technical_service",
                "b2b_office_and_professional_service", "b2b_service", "media_service")
CREATIVE = "namens_pool_kreativstudio"  # vorläufige Kategorie, wird im Lauf über Companies House bestätigt oder verworfen
CH_SIC_S2 = {"62012": "software_development", "63120": "software_development", "74100": "graphic_designer"}
NOT_OWN_SITE = re.compile(r"(facebook|instagram|linkedin|twitter|x\.com|yelp|google|wix(site)?\.com|godaddysites|"
                          r"business\.site|yell\.com|pagesjaunes|bark\.com|checkatrade|houzz|tripadvisor|"
                          r"booking\.com|amazon|ebay|etsy|youtube|tiktok|linktr\.ee|square\.site)", re.I)


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Firmenliste
# ---------------------------------------------------------------------------
def build_pool() -> Path:
    """Overture Places (offene Lizenz): Firmen der Käufer-Branchen mit Website in den Ländern aus COUNTRIES."""
    import duckdb
    from extraktor.sources import overture
    rel = overture.latest_release()
    xml = requests.get(overture.BUCKET + f"?list-type=2&prefix={rel}theme=places/type=place/", timeout=60).text
    files = [overture.BUCKET + k for k in re.findall(r"<Key>([^<]+parquet)</Key>", xml)]
    POOL.parent.mkdir(parents=True, exist_ok=True)
    cats = ", ".join(f"'{c}'" for c in CATEGORIES)
    listed = ", ".join(f"'{c}'" for c in COUNTRIES)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET threads=16;")
    con.execute(f"""COPY (SELECT id, names.primary AS name, websites, emails, phones,
        addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS postcode,
        addresses[1].region AS region, addresses[1].country AS country, taxonomy.primary AS category,
        confidence, operating_status
      FROM read_parquet({files})
      WHERE taxonomy.primary IN ({cats}) AND addresses[1].country IN ({listed}) AND len(websites) > 0
      UNION ALL
      SELECT id, names.primary AS name, websites, emails, phones,
        addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS postcode,
        addresses[1].region AS region, addresses[1].country AS country, {name_category_sql()} AS category,
        confidence, operating_status
      FROM read_parquet({files})
      WHERE {name_pool_where(cats)}
      ) TO '{POOL}' (FORMAT parquet)""")
    n = con.execute(f"SELECT count(*) FROM '{POOL}'").fetchone()[0]
    log(f"Kunden-Pool {rel}: {n} Firmen mit Website -> {POOL}")
    add_register_rows(con, POOL)
    return POOL


# Offene Register als zusätzliche Käuferquellen (JARVIS-Agent 5 „Käuferquellen“, 04.10.2026): gleiche Spalten wie der
# Overture-Auszug, dazu Rechtsform laut Register (reg_form/reg_note) und Herkunft (quelle). Fällt eine Quelle aus,
# bleibt der Pool trotzdem (Overture) – nächster Pool-Bau versucht es erneut.
REGISTER_SOURCES = ("mx_denue", "fi_ytj")  # fr_francenum aus: Export-API laut robots.txt (Disallow /api/) gesperrt, 04.10.2026
REGISTER_COLUMNS = ("reg_form", "reg_note", "quelle")
POOL_COLUMNS = {"id": "VARCHAR", "name": "VARCHAR", "websites": "VARCHAR[]", "emails": "VARCHAR[]",
                "phones": "VARCHAR[]", "street": "VARCHAR", "city": "VARCHAR", "postcode": "VARCHAR",
                "region": "VARCHAR", "country": "VARCHAR", "category": "VARCHAR", "confidence": "DOUBLE",
                "operating_status": "VARCHAR", "reg_form": "VARCHAR", "reg_note": "VARCHAR", "quelle": "VARCHAR"}


def register_rows(log=log) -> list[dict]:
    import importlib
    rows: list[dict] = []
    for name in REGISTER_SOURCES:
        try:
            mod = importlib.import_module(f"extraktor.sources.{name}")
            rows += mod.pool_rows(log=log)
        except Exception as exc:  # noqa: BLE001 - eine Quelle darf den Pool nicht verhindern
            log(f"Register-Quelle {name} übersprungen: {type(exc).__name__}: {str(exc)[:120]}")
    return rows


def add_register_rows(con, pool: Path, rows: list[dict] | None = None) -> int:
    """Register-Zeilen an den Pool anhängen (UNION ALL BY NAME: Overture-Zeilen haben reg_form/quelle = NULL)."""
    rows = register_rows() if rows is None else rows
    if not rows:
        return 0
    tmp_json = pool.with_suffix(".register.json")
    tmp_pool = pool.with_suffix(".tmp.parquet")
    tmp_json.write_text("\n".join(json.dumps({k: r.get(k) for k in POOL_COLUMNS}, ensure_ascii=False) for r in rows))
    cols = "{" + ", ".join(f"'{k}': '{v}'" for k, v in POOL_COLUMNS.items()) + "}"
    con.execute(f"""COPY (SELECT * FROM '{pool}' UNION ALL BY NAME
                         SELECT * FROM read_json('{tmp_json}', format='newline_delimited', columns={cols}))
                    TO '{tmp_pool}' (FORMAT parquet)""")
    tmp_pool.replace(pool)
    tmp_json.unlink()
    log(f"Kunden-Pool: +{len(rows)} Firmen aus offenen Registern ({', '.join(REGISTER_SOURCES)})")
    return len(rows)


def _q(rx: str) -> str:
    return rx.replace("'", "''")


def name_pool_where(cats: str) -> str:
    """Namens-Pool: Orte außerhalb unserer Kategorien mit Website, deren Name eine Webagentur nennt (GB/US/FR) bzw.
    in GB ein Kreativ-/Designstudio (Bestätigung über Companies House im Lauf)."""
    neutral = ", ".join(f"'{c}'" for c in NAME_NEUTRAL)
    return (f"(taxonomy.primary IS NULL OR taxonomy.primary NOT IN ({cats})) AND len(websites) > 0 "
            f"AND names.primary IS NOT NULL AND (basic_category IS NULL OR basic_category IN ({neutral})) AND ("
            f"(addresses[1].country IN ({NAME_WEB_EN}) AND regexp_matches(names.primary, '{_q(NAME_WEB['GB'])}'))"
            f" OR (addresses[1].country = 'GB' AND regexp_matches(names.primary, '{_q(NAME_CREATIVE_GB)}') "
            f"AND NOT regexp_matches(names.primary, '{_q(NAME_EXCLUDE)}'))"
            f" OR (addresses[1].country = 'FR' AND regexp_matches(names.primary, '{_q(NAME_WEB['FR'])}')))")


def name_category_sql() -> str:
    """Kategorie für den Namens-Pool: SEO -> internet_marketing_service, Webagentur -> web_designer, sonst CREATIVE."""
    return (f"CASE WHEN regexp_matches(names.primary, '(?i)\\bseo\\b') THEN 'internet_marketing_service' "
            f"WHEN regexp_matches(names.primary, '{_q(NAME_WEB['GB'])}') OR regexp_matches(names.primary, '{_q(NAME_WEB['FR'])}') "
            f"THEN 'web_designer' ELSE '{CREATIVE}' END")


def creative_fit(d: dict, hit: dict | None) -> bool:
    """Kreativstudio aus dem Namens-Pool (nur UK): zählt nur mit eindeutigem Companies-House-Treffer, dessen Branche
    (SIC) Web-/Softwareentwicklung oder Design ist; dann echte Kategorie setzen."""
    if d.get("category") != CREATIVE:
        return True
    if d.get("country") != "UK" or not hit:
        return False
    for sic in sorted(hit.get("sic") or ()):
        if sic in CH_SIC_S2:
            d["category"] = CH_SIC_S2[sic]
            return True
    return False


def segment_for(category: str, co: str | None, segments: dict[str, set[str]]) -> tuple[str | None, str | None]:
    """Zielgruppe für Kategorie und Land: erste, wenn sie dort mailen darf, sonst die zweite (SECOND)."""
    if not co:
        return None, None
    for seg in (CATEGORIES.get(category), SECOND.get(category) if co in SECOND_COUNTRIES else None):
        if seg and co in segments.get(seg, set()):
            return seg, co
    return None, None


def candidates(segments: dict[str, set[str]], hinten: set[str] | None = None) -> list[dict]:
    """Pool ohne Ketten (gleicher Name > 3x im Land), geschlossene Firmen und unsichere Einträge;
    nur Zielgruppe/Land-Paare, in die wir mailen dürfen und für die wir Leads liefern."""
    import duckdb
    if not POOL.exists():
        build_pool()
    con = duckdb.connect()
    have = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM '{POOL}'").fetchall()}
    # Pool ohne Register-Spalten (älterer Zwischenspeicher): ohne sie weiter
    extra = "".join(f", {c}" for c in REGISTER_COLUMNS) if set(REGISTER_COLUMNS) <= have else ""
    rows = con.execute(f"""
        WITH base AS (SELECT * FROM '{POOL}'
                      WHERE coalesce(operating_status, 'open') = 'open' AND coalesce(confidence, 0) >= 0.5
                        AND name IS NOT NULL),
             chains AS (SELECT country, lower(name) n FROM base GROUP BY 1, 2 HAVING count(*) > 3)
        SELECT id, name, websites, emails, phones, street, city, postcode, region, country, category{extra} FROM base
        WHERE (country, lower(name)) NOT IN (SELECT country, n FROM chains)""").fetchall()
    cols = ["id", "name", "websites", "emails", "phones", "street", "city", "postcode", "region", "country", "category",
            *(REGISTER_COLUMNS if extra else ())]
    out = []
    for r in rows:
        d = dict(zip(cols, r))
        seg, co = segment_for(d["category"], COUNTRIES.get(d["country"]), segments)
        if not seg:
            continue
        site = next((w for w in d["websites"] or [] if w and not NOT_OWN_SITE.search(w) and not host_blocked(w)), None)
        dom = normalize_domain(site) if site else ""
        if not dom:
            continue
        out.append({**d, "segment": seg, "country": co, "website": site, "domain": dom})
    # gleichmäßig über Branchen und Länder mischen (fester Schlüssel: jeder Teillauf sieht dieselbe Reihenfolge)
    # Fokus-Tests zuerst (config/fokus.yaml), innerhalb gleichmäßig gemischt
    # Selbstoptimierung (scripts/selbstopt.py): Kategorien mit schwacher ok-Quote zuletzt prüfen (nichts fällt weg)
    from lib.fokus import rank
    hinten = hinten or set()
    out.sort(key=lambda d: (rank(d["segment"], d["country"]), (d.get("category") or "") in hinten,
                            hashlib.md5(d["domain"].encode()).hexdigest()))
    seen, uniq = set(), []
    for d in out:
        if d["domain"] not in seen:
            seen.add(d["domain"])
            uniq.append(d)
    return uniq


# ---------------------------------------------------------------------------
# Prüfen und speichern
# ---------------------------------------------------------------------------
def site_scan(website: str, fetcher) -> dict:
    """Startseite + Kontakt-/Impressums-/Über-uns-Seiten (lib.websites), E-Mails auch verschleiert („[at]“)."""
    from lib import websites as W
    base = website if website.startswith("http") else "https://" + website
    home = fetcher.get(base) or fetcher.get(base.replace("http://", "https://", 1))
    if not home:
        return {"emails": {}, "text": "", "pages": [], "final_domain": "", "html": "", "loaded": False}
    pages = {home[0]: home[1]}
    for sub in W.subpage_links(home[1], home[0], limit=4):
        got = fetcher.get(sub)
        if got:
            pages[got[0]] = got[1]
    emails: dict[str, str] = {}
    for url, html in pages.items():
        for e in W.emails_on_page(html):
            emails.setdefault(e.lower().strip("."), url)
    text = "\n".join(h[-20000:] + "\n" + h[:5000] for h in pages.values())
    return {"emails": emails, "text": text, "pages": list(pages), "final_domain": W.site_domain(home[0]),
            "html": "\n".join(pages.values()), "loaded": True}


def listed_email_usable(d: dict, res: dict, email: str, fetcher) -> bool:
    """Firmen-E-Mail aus dem Eintrag (Overture/Register) nur, wenn sie heute noch zustellbar wirkt: Domain hat MX
    und die Website ist nicht tot (gleiche Kriterien wie die Dauerprüfung: kein_mx, website_nicht_erreichbar).
    Overture-Einträge sind oft veraltet – FR 04.10.2026: 6 von 28 geprüften Overture-Käufern so markiert."""
    from lib.rules import email_domain
    if mx_check(email_domain(email)) is False:
        return False
    if res.get("loaded", True) or not d.get("website"):
        return True
    from dauerpruefung import site_state
    return site_state(d["website"], getattr(fetcher, "session", None)) != "tot"


def mx_check(domain: str) -> bool | None:
    from lib.release_gate import mx_cached
    return mx_cached(domain)


def check_one(d: dict, fetcher, cfg: dict, generic: set[str], blocked: set[str]) -> dict:
    import prospects as P
    res = site_scan(d["website"], fetcher)
    email, is_gen = P.pick_email(set(res["emails"]), d["domain"], generic)
    if not email and res.get("final_domain") and res["final_domain"] != d["domain"]:
        # Website leitet auf die heutige Domain der Firma um: deren Adresse zählt
        email, is_gen = P.pick_email(set(res["emails"]), res["final_domain"], generic)
    src = res["emails"].get(email) if email else None
    if not email:
        # Firmen-E-Mail aus dem eigenen Eintrag der Firma (Overture), nur auf der eigenen Domain
        listed = {e.lower().strip() for e in d.get("emails") or [] if e}
        email, is_gen = P.pick_email(listed, d["domain"], generic)
        if email and not listed_email_usable(d, res, email, fetcher):
            email, is_gen = None, None
        src = (d.get("quelle") or f"https://overturemaps.org (Firmeneintrag {d['id']})") if email else None
    legal, reg_no = P.detect_legal_form(d["country"], d["name"], res["text"])
    size_note = f"Company No. {reg_no} (Website)" if reg_no else None
    if d.get("ch_number") and not legal:
        # UK: eindeutiger Name im Firmenregister -> Kapitalgesellschaft (PECR: nur „corporate subscribers“)
        legal, size_note = "Ltd", f"Company No. {d['ch_number']} (Companies House, Name)"
    if (d.get("fr_reg") or {}).get("form") and not legal:
        # FR: eindeutiger Treffer im Firmenregister (Annuaire des entreprises / SIRENE)
        legal, size_note = d["fr_reg"]["form"], f"SIREN {d['fr_reg']['siren']} (Annuaire des entreprises, Name + PLZ)"
    if (d.get("ie_reg") or {}).get("form") and not legal:
        # IE: eindeutiger Name im Firmenregister (CRO Open Data) -> Kapitalgesellschaft
        legal, size_note = d["ie_reg"]["form"], f"Company No. {d['ie_reg']['number']} (CRO, Name)"
    if d.get("reg_form") and not legal:
        # offenes Register (z. B. FI YTJ: Osakeyhtiö) nennt die Rechtsform der Firma mit dieser Website
        legal, size_note = d["reg_form"], d.get("reg_note")
    suppressed = d["domain"] in blocked or bool(email and email.lower() in blocked)
    chk = check_prospect(email=email, country=d["country"], website=d["website"], legal_form=legal,
                         source_url=src, size_note=size_note,
                         suppressed=suppressed, cfg=cfg)
    addr = ", ".join(x for x in (d.get("street"), d.get("city"), d.get("postcode")) if x)
    phone = company_phone(d, res)
    if chk.ok:
        status, reason = "ok", chk.summary()
    elif phone or addr:
        # Inhaber 01.10.2026: „so viele leads besorgen … wie es geht“ – nicht per Mail erlaubt/erreichbar,
        # aber per Anruf oder Brief (UK: vor Anrufen gegen TPS/CTPS prüfen)
        status, reason = "call_only", "nur Anruf/Brief – " + chk.summary()
    else:
        status, reason = "rejected", chk.summary()
    return {
        "segment_id": d["segment"], "company_name": d["name"][:200], "legal_form": legal, "country": d["country"],
        "region": d.get("region") or None, "website": d["website"], "domain": d["domain"], "email": email,
        "email_is_generic": is_gen if email else None, "published_address": addr or None,
        "specialization": d["category"].replace("_", " "), "size_note": size_note,
        "source_url": src or d["website"],
        "phone": phone, "check_status": status, "check_reason": reason[:500],
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def company_phone(d: dict, res: dict) -> str | None:
    """Firmennummer: von der eigenen Website, sonst aus dem Firmeneintrag (Overture); im Landesformat geprüft."""
    from lib import websites as W
    found, _ = W.phones_on_page(res.get("html") or "", d["country"])
    for raw in list(found) + list(d.get("phones") or []):
        e164, _kind = W.normalize_phone(raw, d["country"])
        if e164:
            return e164
    return None


def count_ok(db) -> int:
    """Käufer im Bestand: per E-Mail (ok) oder per Anruf/Brief (call_only)."""
    r = db.s.get(f"{db.base}/prospects", params={"select": "id", "check_status": "in.(ok,call_only)", "limit": "1"},
                 headers={"Prefer": "count=exact"}, timeout=db.timeout)
    return int((r.headers.get("content-range") or "*/0").split("/")[-1] or 0)


def known_domains(db, domains: list[str], batch: int = 150) -> set[str]:
    """Welche dieser Domains stehen schon in prospects? Paketweise über den eindeutigen Index auf domain."""
    out: set[str] = set()
    for k in range(0, len(domains), batch):
        part = [x.replace('"', "") for x in domains[k:k + batch]]
        q = {"select": "domain", "domain": "in.(" + ",".join(f'"{x}"' for x in part) + ")"}
        for attempt in range(5):
            try:
                rows = db.select("prospects", q)
                break
            except RuntimeError as exc:  # Zeitüberschreitung unter Last: kurz warten, nochmal
                if "57014" not in str(exc) or attempt == 4:
                    raise
                time.sleep(3 * (attempt + 1))
        out.update(r["domain"] for r in rows if r.get("domain"))
    return out


KNOWN = Path(os.environ.get("KUNDENWERK_KNOWN", "out/cache/kunden_known.json"))


def _pages(db, q: dict, key: str, start: str = "") -> list[dict]:
    """Seitenweise nach `key` (Index) blättern; Zeitüberschreitungen unter Last mit Pause wiederholen."""
    out, last = [], start
    while True:
        qq = {**q, "order": f"{key}.asc", "limit": "1000", **({key: f"gt.{last}"} if last else {})}
        for attempt in range(6):
            try:
                rows = db.select("prospects", qq)
                break
            except RuntimeError as exc:
                if "57014" not in str(exc) or attempt == 5:
                    raise
                time.sleep(5 * (attempt + 1))
        out += rows
        if len(rows) < 1000:
            return out
        last = rows[-1][key]


def refresh_known(db, path: Path = KNOWN) -> set[str]:
    """Bekannte Käufer-Domains im Zwischenspeicher halten: einmal alle (nach domain), danach nur neue
    (nach created_at, Index prospects_created_at_idx). Alle ~190.000 bei jedem Start zu laden dauerte unter
    Last ~20 min und brach ab (02.10.2026)."""
    import datetime as dt
    data = json.loads(path.read_text()) if path.exists() else None
    now = dt.datetime.now(dt.timezone.utc)
    if data:
        domains = set(data["domains"])
        since = (dt.datetime.fromisoformat(data["since"]) - dt.timedelta(hours=1)).isoformat()
        new = _pages(db, {"select": "domain,created_at"}, "created_at", since)
        domains.update(r["domain"] for r in new if r.get("domain"))
        log(f"Bekannte Käufer: {len(domains)} (+{len(new)} seit {since[:16]})")
    else:
        domains = {r["domain"] for r in _pages(db, {"select": "domain"}, "domain") if r.get("domain")}
        log(f"Bekannte Käufer: {len(domains)} (komplett geladen)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"since": now.isoformat(), "domains": sorted(domains)}))
    return domains


def cmd_known(args) -> int:
    from lib.db import DB
    refresh_known(DB())
    return 0


def drop_stored(db, pool: list[dict], known: set[str]) -> list[dict]:
    """Gegenprobe vor dem Prüfen: Domains, die schon in prospects stehen, aber im Zwischenspeicher fehlen
    (Scout R17, 03.10.2026: 512.049 bekannt vs. 512.426 Zeilen), raus. Sonst wurden sie jeden Lauf neu geprüft,
    beim Speichern still verworfen (ignore_duplicates) und trotzdem als „neue Käufer“ gezählt."""
    try:
        stored = known_domains(db, [d["domain"] for d in pool])
    except RuntimeError as exc:  # Gegenprobe ist Kür: lieber weiterprüfen als stillstehen
        log(f"Gegenprobe bekannte Käufer übersprungen: {str(exc)[:80]}")
        return pool
    if stored:
        known.update(stored)
        log(f"Gegenprobe: {len(stored)} Domains standen schon in prospects (fehlten im Zwischenspeicher)")
    return [d for d in pool if d["domain"] not in stored]


FALLBACK_MIN = 500  # weniger neue Fokus-Käufer als das: Werk nimmt die übrigen Zielgruppen dazu


def fill_up(pool: list[dict], keep: set[str], more) -> list[dict]:
    """Das Werk steht nie still (Inhaber 02.10.2026: „es soll nie still stehen“): ist die Fokus-Liste durchgeprüft,
    kommen die übrigen Zielgruppen hinten dran. Fokus bleibt vorn; es wird nur geprüft und gespeichert, nie gesendet."""
    if not keep or len(pool) >= FALLBACK_MIN:
        return pool
    extra = [d for d in more() if d["segment"] not in keep]
    log(f"Fokus {','.join(sorted(keep))}: nur {len(pool)} neue Käufer, weiter mit den übrigen Zielgruppen ({len(extra)})")
    return pool + extra


def cmd_run(args) -> int:
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    db = DB()
    if stop_if_paused(db, "kunden-werk", log):
        return 0
    cfg = load_countries()
    generic = {g.lower() for g in cfg.get("generic_local_parts") or []}
    all_segs = {s["id"]: set(s.get("email_countries") or []) for s in db.select_all("segments", {"select": "id,email_countries"})}
    segs, keep = all_segs, set()
    if args.segments:
        # Fokus (02.10.2026: nur Webagenturen): andere Zielgruppen zuerst auslassen
        keep = {x.strip().upper() for x in args.segments.split(",") if x.strip()}
        segs = {k: v for k, v in all_segs.items() if k in keep}
    have = count_ok(db)
    if have >= args.target:
        log(f"Ziel erreicht: {have} geprüfte Käufer (Ziel {args.target}) – nichts zu tun")
        return 0
    blocked = {r["value"].lower() for r in db.select_all("suppression", {"select": "value"}) if r.get("value")}
    cached = KNOWN.exists()
    known: set[str] = set(json.loads(KNOWN.read_text())["domains"]) if cached else set()

    def mine(rows: list[dict]) -> list[dict]:
        """Nur dieser Teil (fest nach Domain verteilt) und nur Domains, die noch nicht in prospects stehen.
        Gezielt nachschlagen statt alle Domains zu laden: das Laden aller ~190.000 Domains brach unter Last ab
        (02.10.2026, 57014 bei offset 189000) und das Werk stand still."""
        if args.shard:
            i, n = (int(x) for x in args.shard.split("/"))
            rows = [d for d in rows if int(hashlib.md5(d["domain"].encode()).hexdigest(), 16) % n == i]
        if not cached:  # ohne Zwischenspeicher: gezielt nachschlagen (langsam unter Last)
            known.update(known_domains(db, [d["domain"] for d in rows if d["domain"] not in known]))
        return [d for d in rows if d["domain"] not in known]

    # Selbstoptimierung (scripts/selbstopt.py): schwache Käufer-Kategorien zuletzt prüfen
    from lib.selbstopt_state import kategorien_hinten
    hinten = kategorien_hinten(db)
    if hinten:
        log(f"Selbstoptimierung: zuletzt geprüft {', '.join(sorted(hinten))}")
    pool = mine(candidates(segs, hinten))
    pool = fill_up(pool, keep, lambda: mine(candidates(all_segs, hinten)))
    # Dashboard (Inhaber 03.10.2026): Kunden-Werk je Land abschaltbar
    from lib.owner_settings import ack, load as load_owner_settings
    owner = load_owner_settings(db)
    ack(db, "kunden-werk", ["buyer_countries_off"], owner)
    off = set(owner["buyer_countries_off"] or [])
    if off:
        before = len(pool)
        pool = [d for d in pool if d["country"] not in off]
        log(f"Im Dashboard ausgeschaltet: {', '.join(sorted(off))} ({before - len(pool)} Kandidaten ausgelassen)")
    pool = pool[:args.max]
    if cached and pool:
        pool = drop_stored(db, pool, known)
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    uk = {d["domain"]: d["name"] for d in pool if d["country"] == "UK"}
    if uk:
        from extraktor.sources import uk_ch
        nums = uk_ch.match_by_name(uk, log=log, with_sic=True)
        for d in pool:
            hit = nums.get(d["domain"])
            d["ch_number"] = hit["number"] if hit else None
        before = len(pool)
        pool = [d for d in pool if creative_fit(d, nums.get(d["domain"]))]
        if before > len(pool):
            log(f"Namens-Pool UK: {before - len(pool)} Kreativstudios ohne passende Companies-House-Branche ausgelassen")
    ie = {d["domain"]: d["name"] for d in pool if d["country"] == "IE"}
    if ie:
        from extraktor.sources import ie_cro
        ie_hits = ie_cro.match_by_name(ie, log=log)
        for d in pool:
            d["ie_reg"] = ie_hits.get(d["domain"])
    fr = {d["domain"]: (d["name"], d.get("postcode")) for d in pool if d["country"] == "FR"}
    if fr:
        # FR: Rechtsform aus dem offenen Firmenregister (SIRENE), sonst blieben fast alle „nur Anruf/Brief“
        from extraktor.sources import fr_sirene
        # Abstand wächst mit der Zahl paralleler Teile: alle zusammen bleiben unter 7 Abfragen/s
        n = int(args.shard.split("/")[1]) if args.shard else 1
        hits = fr_sirene.match_by_name(fr, log=log, pause=max(1.0, n / 6))
        for d in pool:
            d["fr_reg"] = hits.get(d["domain"])
    log(f"Käufer: {have} geprüft (Ziel {args.target}), {len(known)} Domains schon bekannt, {len(pool)} neue in diesem Lauf")
    from enrich import Fetcher
    fetcher = Fetcher()  # robots.txt, gesperrte Plattformen, 1 Anfrage/s je Domain
    stats, lock, batch = Counter(), threading.Lock(), []

    def work(d):
        if deadline and time.monotonic() >= deadline:
            stats["später"] += 1  # Zeitfenster vorbei: kommt im nächsten Lauf wieder dran
            return
        try:
            row = check_one(d, fetcher, cfg, generic, blocked)
        except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
            stats["fehler"] += 1
            log(f"Fehler {d['domain']}: {type(exc).__name__}")
            return
        with lock:
            stats[f"{row['check_status']}"] += 1
            stats[f"{row['segment_id']}/{row['country']}:{row['check_status']}"] += 1
            batch.append(row)
            if len(batch) >= 50:
                flush()

    def flush():
        rows = batch[:]
        batch.clear()
        if rows:
            db.insert("prospects", rows, upsert_on="domain", ignore_duplicates=True)

    from lib.heartbeat import Heartbeat
    with Heartbeat(db, "kunden-werk", f"pruefen {args.shard or '-'}") as hb, ThreadPoolExecutor(max_workers=args.workers) as ex:
        for k, _ in enumerate(ex.map(work, pool)):
            if k % 200 == 0:
                hb.update(processed=k, green=stats["ok"])
    with lock:
        flush()
    log(f"fertig: {stats['ok']} neue Käufer per E-Mail, {stats['call_only']} nur Anruf/Brief, "
        f"{stats['rejected']} ohne Kontaktweg, {stats['fehler']} Fehler, {stats['später']} auf den nächsten Lauf verschoben")
    for k, v in sorted(stats.items()):
        if "/" in k:
            log(f"  {k} {v}")
    from lib.run_stats import record, rows_from_buyer_stats
    record(db, "kunden-werk", rows_from_buyer_stats(dict(stats), len(pool)), started_at, log)
    return 0


# ---------------------------------------------------------------------------
# Nachprüfung über die Registernummer (Quellen-Scout R20, 03.10.2026)
# ---------------------------------------------------------------------------
RECHECK_MARK = "Registernummer-Nachprüfung"
# FR bleibt für S1-Mail aus (Inhaber); SE/FI seit 04.10.2026 über EU VIES, NL über KVK (zuerst, KVK 1/min).
# Es zählen nur Länder mit allowed und company_forms_only (recheck_rows): NL wirkt erst, wenn der Inhaber NL wieder
# freigibt; BE/IE sind seit 04.10.2026 „nie“ und stehen deshalb nicht in der Liste.
RECHECK_PAIRS = "S2:NL,S2:UK,S2:FR,S1:UK,S2:SE,S2:FI"


def recheck_rows(db, pairs: list[tuple[str, str]], limit: int, cfg: dict | None = None,
                 caps: dict[str, int] | None = None) -> list[dict]:
    """„Nur Anruf/Brief“-Käufer mit Firmen-E-Mail, die nur an der fehlenden Rechtsform scheitern und noch nicht
    nachgeprüft sind. Länder ohne company_forms_only (FR seit 04.10.2026) brauchen keine Registernummer mehr –
    dort reicht die Regel-Nachprüfung (cmd_rules); Länder ohne Mail-Freigabe bringen nichts. In Ländern mit generic_only nur allgemeine Adressen (sonst
    scheitert die Prüfung ohnehin); `caps` begrenzt einzelne Länder (NL: KVK-Grenze 1/min)."""
    cfg = cfg or load_countries()
    pairs = [(seg, co) for seg, co in pairs
             if country_rules(cfg, co).get("allowed") and country_rules(cfg, co).get("company_forms_only")]
    out: list[dict] = []
    for k, (seg, co) in enumerate(pairs):
        share = (limit - len(out)) // (len(pairs) - k)  # gleichmäßig; was ein Paar nicht braucht, bekommen die übrigen
        share = min(share, (caps or {}).get(co, share))  # NL: so viele, wie die KVK-Grenze (1/min) im Lauf schafft
        q = {"select": "id,segment_id,country,company_name,website,domain,email,source_url,check_reason",
             "segment_id": f"eq.{seg}", "country": f"eq.{co}", "check_status": "eq.call_only",
             "email": "not.is.null", "legal_form": "is.null",
             "and": f"(check_reason.like.*Rechtsform*,check_reason.not.like.*{RECHECK_MARK[:18]}*)",
             "order": "id.asc", "limit": str(share)}
        if country_rules(cfg, co).get("generic_only"):
            q["email_is_generic"] = "is.true"
        if share > 0:
            out += db.select("prospects", q)
    return out


def reg_numbers(d: dict, fetcher) -> list[str]:
    """Registernummern von der eigenen Website: Startseite + Kontakt/Impressum/AGB; FR zusätzlich /mentions-legales."""
    from lib import regnum
    res = site_scan(d["website"], fetcher)
    html = res["html"]
    if d["country"] == "FR" and res["pages"] and not any(re.search(r"mentions|legal", p, re.I) for p in res["pages"]):
        got = fetcher.get(res["pages"][0].rstrip("/") + "/mentions-legales")
        if got:
            html += "\n" + got[1]
    return regnum.numbers_for(d["country"], regnum.plain_text(html))


def verify_numbers(found: dict[int, list[str]], rows: dict[int, dict], fetcher, log=print) -> dict[int, dict]:
    """{Zeilen-ID: Nummern} -> {Zeilen-ID: Registertreffer} – nur aktive Kapitalgesellschaften."""
    out: dict[int, dict] = {}
    uk = {n for i, ns in found.items() if rows[i]["country"] == "UK" for n in ns}
    if uk:
        from extraktor.sources import uk_ch
        reg = uk_ch.by_number(uk, log=log)
        for i, ns in found.items():
            if rows[i]["country"] != "UK":
                continue
            for n in ns:
                h = reg.get(n)
                if h and h["status"] == "Active" and h["form"]:
                    out[i] = {"form": h["form"], "note": f"Company No. {n} (Website + Companies House: {h['name'][:80]})"}
                    break
    from extraktor.sources import fr_sirene
    session = requests.Session()
    for i, ns in found.items():
        if rows[i]["country"] != "FR":
            continue
        for n in ns[:2]:
            h = fetcher.api("recherche-entreprises.api.gouv.fr", 0.3, fr_sirene.by_siren, n, session)
            if h and h["active"] and h["form"]:
                out[i] = {"form": h["form"], "note": f"SIREN {n} (Mentions légales + Annuaire des entreprises: {(h['name'] or '')[:80]})"}
                break
    out.update(verify_vies(found, rows, fetcher, session))
    return out


VIES_LABEL = {"BE": "Ondernemingsnummer/BTW", "SE": "Org.nr", "IE": "VAT No.", "FI": "Y-tunnus"}


def verify_vies(found: dict[int, list[str]], rows: dict[int, dict], fetcher, session=None) -> dict[int, dict]:
    """BE/SE/IE/FI: Nummer von der eigenen Website -> EU VIES (gültig + eingetragener Name mit Rechtsform)."""
    from extraktor.sources import eu_registers as EU
    out: dict[int, dict] = {}
    for i, ns in found.items():
        co = rows[i]["country"]
        if co not in VIES_LABEL:
            continue
        for n in ns[:2]:
            try:
                h = fetcher.api("ec.europa.eu", EU.VIES_INTERVAL, EU.vies, co, n, session)
            except requests.RequestException:
                h = None
            if h and h["valid"] and h["form"]:
                out[i] = {"form": h["form"], "note": f"{VIES_LABEL[co]} {co}{n} (Website + EU VIES: {h['name'][:80]})"}
                break
    return out


class KvkQueue:
    """NL: KVK-Nummern nacheinander prüfen, höchstens eine Abfrage je 61 s (Grenze der KVK), im Hintergrund,
    während die übrigen Websites gelesen werden; hört am Zeitfenster auf (Rest kommt im nächsten Lauf)."""

    def __init__(self, deadline: float, max_lookups: int, log=print):
        import queue
        self.q: "queue.Queue[tuple[int, list[str]] | None]" = queue.Queue()
        self.deadline, self.left, self.log = deadline, max_lookups, log
        self.hits: dict[int, dict] = {}
        self.asked: set[int] = set()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def put(self, i: int, numbers: list[str]) -> None:
        self.q.put((i, numbers))

    def _run(self) -> None:
        from extraktor.sources import eu_registers as EU
        session, last = requests.Session(), 0.0
        while True:
            item = self.q.get()
            if item is None:
                return
            i, ns = item
            for n in ns[:1]:  # eine Nummer je Firma: die erste auf der Seite (Grenze 1/min)
                if self.left <= 0 or (self.deadline and time.monotonic() + EU.KVK_INTERVAL >= self.deadline):
                    continue
                wait = last + EU.KVK_INTERVAL - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                last = time.monotonic()
                self.left -= 1
                try:
                    h = EU.kvk(n, session)
                except requests.RequestException:
                    h = None
                if h is None:
                    continue  # Störung: Firma bleibt offen und kommt im nächsten Lauf wieder
                self.asked.add(i)
                if h["active"] and h["form"]:
                    self.hits[i] = {"form": h["form"], "note": f"KvK {n} (Website + KVK Open Dataset: {h['form']}, actief)"}

    def finish(self, wait_until: float) -> dict[int, dict]:
        """Auf die Warteschlange warten, längstens bis wait_until (monotonic)."""
        self.q.put(None)
        self.thread.join(timeout=max(0.0, wait_until - time.monotonic()))
        return dict(self.hits)


def cmd_recheck(args) -> int:
    """Käufer „nur Anruf/Brief“ wegen fehlender Rechtsform erneut prüfen: Registernummer auf der eigenen Website,
    vom Register bestätigt (aktive Ltd/PLC/LLP bzw. SAS/SASU/SARL/EURL/SA) -> dieselbe Prüfregel wie immer
    (lib.rules.check_prospect). Ändert nur den Prüfstand dieser Zeilen, löscht nichts, sendet nie."""
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    from enrich import Fetcher
    db = DB()
    if stop_if_paused(db, "kunden-werk", log):
        return 0
    cfg = load_countries()
    try:
        rules_recheck(db, cfg, dry_run=args.dry_run)  # ohne Abruf, vorher: FR-Einzelunternehmer (Inhaber 04.10.2026)
    except RuntimeError as exc:  # z. B. 57014 unter Last: die Registernummer-Nachprüfung läuft trotzdem
        log(f"Regel-Nachprüfung übersprungen (nächster Lauf): {str(exc)[-120:]}")
    pairs = [tuple(p.split(":")) for p in args.pairs.split(",") if ":" in p]
    # NL: ca. ein Drittel nennt eine KVK-Nummer; mehr Firmen lesen, als die KVK-Grenze prüfen kann, wäre vergeblich
    rows = {r["id"]: r for r in recheck_rows(db, pairs, args.max, cfg, {"NL": args.kvk_max * 3})}
    log(f"Nachprüfung Registernummer: {len(rows)} Käufer ({args.pairs})")
    if not rows:
        return 0
    blocked = {r["value"].lower() for r in db.select_all("suppression", {"select": "value"}) if r.get("value")}
    fetcher = Fetcher()
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    found: dict[int, list[str]] = {}
    done: set[int] = set()
    lock = threading.Lock()
    kq = KvkQueue(deadline, args.kvk_max, log) if any(r["country"] == "NL" for r in rows.values()) else None

    def work(i):
        if deadline and time.monotonic() >= deadline:
            return
        try:
            ns = reg_numbers(rows[i], fetcher)
        except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
            log(f"Fehler {rows[i]['domain']}: {type(exc).__name__}")
            return
        with lock:
            done.add(i)
            if ns:
                found[i] = ns
        if ns and kq and rows[i]["country"] == "NL":
            kq.put(i, ns)

    from lib.heartbeat import Heartbeat
    with Heartbeat(db, "kunden-werk", "nachpruefen") as hb, ThreadPoolExecutor(max_workers=args.workers) as ex:
        for k, _ in enumerate(ex.map(work, list(rows))):
            if k % 100 == 0:
                hb.update(processed=k, green=len(found))
    hits = verify_numbers(found, rows, fetcher, log=log)
    if kq:
        # ohne Zeitfenster höchstens so lange, wie die erlaubten KVK-Abfragen dauern
        hits.update(kq.finish(deadline or time.monotonic() + (args.kvk_max + 1) * 61))
        open_nl = {i for i in found if rows[i]["country"] == "NL" and i not in kq.asked}
        if open_nl:
            log(f"NL: {len(open_nl)} KVK-Nummern noch nicht abgefragt (Grenze 1/min) – nächster Lauf")
        done -= open_nl  # nicht als nachgeprüft markieren, kommen wieder
    stats = Counter()
    stats_ok: dict[int, bool] = {}
    today = dt.date.today().strftime("%d.%m.%Y")
    for i in sorted(done):
        r = rows[i]
        h = hits.get(i)
        chk = None
        if h:
            sup = r["domain"] in blocked or (r["email"] or "").lower() in blocked
            chk = check_prospect(email=r["email"], country=r["country"], website=r["website"], legal_form=h["form"],
                                 source_url=r["source_url"], size_note=h["note"], suppressed=sup, cfg=cfg)
        stats_ok[i] = bool(chk and chk.ok)
        if chk and chk.ok:
            vals = {"check_status": "ok", "legal_form": h["form"], "size_note": h["note"][:300],
                    "check_reason": f"{chk.summary()} | {RECHECK_MARK} {today}"[:500],
                    "checked_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            stats[f"{r['segment_id']}/{r['country']}:ok"] += 1
        else:
            why = ("Register bestätigt, Prüfung: " + chk.summary()) if chk else (
                f"Nummer {', '.join(found[i][:2])} nicht als aktive Kapitalgesellschaft bestätigt" if i in found
                else "keine Nummer auf der Website")
            tail = f" | {RECHECK_MARK} {today}: {why}"
            vals = {"check_reason": ((r["check_reason"] or "")[:max(0, 500 - len(tail))] + tail)[:500]}
            stats[f"{r['segment_id']}/{r['country']}:bleibt"] += 1
        if args.dry_run:
            continue
        try:
            db.update("prospects", {"id": i}, vals)
        except RuntimeError as exc:  # eine Zeile darf den Lauf nicht beenden; sie kommt im nächsten Lauf wieder
            stats["Speicherfehler"] += 1
            log(f"Speicherfehler {r['domain']}: {str(exc)[:80]}")
    log(f"fertig: {len(done)} geprüft, {len(found)} mit Registernummer, {len(hits)} vom Register bestätigt"
        f"{' (Probelauf, nichts gespeichert)' if args.dry_run else ''}")
    for k, v in sorted(stats.items()):
        log(f"  {k} {v}")
    if not args.dry_run:  # Trichter der Nachprüfung fürs Dashboard (geprüft -> Nummer -> Register -> mail-fähig)
        from lib.run_stats import record
        per: dict[tuple[str, str], Counter] = {}
        for i in done:
            k = (rows[i]["segment_id"], rows[i]["country"])
            c = per.setdefault(k, Counter())
            c["geprueft"] += 1
            c["nummer"] += i in found
            c["register"] += i in hits
            c["ok"] += stats_ok.get(i, False)
        record(db, "kunden-werk", [{"segment_id": s, "country": co, "candidates": c["geprueft"], "processed": c["geprueft"],
                                    "yellow": c["register"], "green": c["ok"], "red": c["geprueft"] - c["ok"], "reasons": {},
                                    "extra": {"teil": "nachpruefen", "stufen": {"geprueft": c["geprueft"], "nummer": c["nummer"],
                                                                                "register": c["register"], "ok": c["ok"]}}}
                                   for (s, co), c in sorted(per.items())], None, log)
    return 0


# ---------------------------------------------------------------------------
# Regel-Nachprüfung ohne Abruf (Inhaber 04.10.2026 nach Anwaltsberatung: Einzelunternehmer in FR erlaubt)
# ---------------------------------------------------------------------------
RULES_MARK = "Regel-Nachprüfung"


def rules_recheck_rows(db, cfg: dict) -> list[dict]:
    """Käufer mit Firmen-E-Mail, die (nur Anruf/Brief oder abgelehnt) an der Rechtsform gescheitert sind, in Ländern,
    die heute keine Kapitalgesellschaft mehr verlangen (company_forms_only: false)."""
    lands = sorted(c for c, r in (cfg.get("countries") or {}).items()
                   if isinstance(r, dict) and r.get("allowed") and not country_rules(cfg, c).get("company_forms_only"))
    if not lands:
        return []
    return db.select_all("prospects", {
        "select": "id,segment_id,country,email,website,legal_form,source_url,size_note,domain,check_status,check_reason",
        "country": f"in.({','.join(lands)})", "check_status": "in.(call_only,rejected)", "email": "not.is.null",
        "check_reason": "like.*Rechtsform*", "order": "id.asc"})


def rules_recheck_values(r: dict, cfg: dict, blocked: set[str], today: str) -> dict:
    """Neue Prüfwerte für eine Zeile: dieselbe Prüfregel wie immer (lib.rules.check_prospect) mit den gespeicherten
    Daten. Besteht sie, wird der Käufer mail-fähig (ok); sonst bleibt der Status, nur der Prüfgrund wird aktuell
    (enthält dann kein „Rechtsform“ mehr, die Zeile wird nicht erneut geprüft)."""
    sup = (r.get("domain") or "").lower() in blocked or (r.get("email") or "").lower() in blocked
    chk = check_prospect(email=r["email"], country=r["country"], website=r.get("website"), legal_form=r.get("legal_form"),
                         source_url=r.get("source_url"), size_note=r.get("size_note"), suppressed=sup, cfg=cfg)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    tail = f" | {RULES_MARK} {today}"
    if chk.ok:
        return {"check_status": "ok", "check_reason": (chk.summary() + tail)[:500], "checked_at": now}
    head = "nur Anruf/Brief – " if r["check_status"] == "call_only" else ""
    return {"check_reason": (head + chk.summary())[:500 - len(tail)] + tail, "checked_at": now}


def rules_recheck(db, cfg: dict, dry_run: bool = False) -> Counter:
    """Einmalig nötig, aber idempotent: läuft in jedem Kunden-Werk-Lauf (Teil „nachpruefen“) und findet nach dem
    ersten Lauf nichts mehr. Ruft keine Website ab, sendet nie, löscht nichts."""
    rows = rules_recheck_rows(db, cfg)
    stats: Counter = Counter()
    if not rows:
        log("Regel-Nachprüfung: nichts zu tun")
        return stats
    blocked = {r["value"].lower() for r in db.select_all("suppression", {"select": "value"}) if r.get("value")}
    today = dt.date.today().strftime("%d.%m.%Y")
    for r in rows:
        vals = rules_recheck_values(r, cfg, blocked, today)
        stats[f"{r['segment_id']}/{r['country']}:{'ok' if vals.get('check_status') == 'ok' else 'bleibt'}"] += 1
        if dry_run:
            continue
        try:
            db.update("prospects", {"id": r["id"]}, vals)
        except RuntimeError as exc:  # eine Zeile darf den Lauf nicht beenden; sie kommt im nächsten Lauf wieder
            stats["Speicherfehler"] += 1
            log(f"Speicherfehler {r.get('domain')}: {str(exc)[:80]}")
    log(f"Regel-Nachprüfung (Einzelunternehmer): {len(rows)} Käufer geprüft"
        f"{' (Probelauf, nichts gespeichert)' if dry_run else ''}")
    for k, v in sorted(stats.items()):
        log(f"  {k} {v}")
    return stats


def cmd_rules(args) -> int:
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    db = DB()
    if stop_if_paused(db, "kunden-werk", log):
        return 0
    rules_recheck(db, load_countries(), dry_run=args.dry_run)
    return 0


def cmd_stand(args) -> int:
    from lib.db import DB
    db = DB()
    rows = db.select_all("prospects", {"select": "segment_id,country,check_status"})
    c = Counter((r["segment_id"], r["country"], r["check_status"]) for r in rows)
    print(f"Käufer im Bestand: {sum(v for k, v in c.items() if k[2] in ('ok', 'call_only'))} von Ziel {TARGET} "
          f"(E-Mail {sum(v for k, v in c.items() if k[2] == 'ok')})")
    for (seg, co, st), v in sorted(c.items()):
        print(f"  {seg}/{co} {st}: {v}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("pool")
    r = sub.add_parser("run")
    r.add_argument("--shard", default="")
    r.add_argument("--max", type=int, default=3000)
    r.add_argument("--workers", type=int, default=16)
    r.add_argument("--target", type=int, default=TARGET)
    r.add_argument("--segments", default="", help="nur diese Zielgruppen prüfen, z. B. S2 (leer = alle)")
    r.add_argument("--deadline-min", type=float, default=0,
                   help="nach N Minuten keine neuen Firmen mehr anfangen, Ergebnisse speichern (0 = aus)")
    sub.add_parser("stand")
    sub.add_parser("known")
    n = sub.add_parser("nachpruefen", help="nur Anruf/Brief wegen Rechtsform: Registernummer der Website prüfen")
    n.add_argument("--pairs", default=RECHECK_PAIRS, help="Zielgruppe:Land, z. B. S2:UK,S2:FR")
    n.add_argument("--max", type=int, default=2000)
    n.add_argument("--workers", type=int, default=16)
    n.add_argument("--deadline-min", type=float, default=0)
    n.add_argument("--dry-run", action="store_true", help="nur zählen, nichts speichern")
    n.add_argument("--kvk-max", type=int, default=75, help="NL: höchstens so viele KVK-Abfragen (je 61 s) im Lauf")
    g = sub.add_parser("regeln", help="an der Rechtsform gescheiterte Käufer mit der heutigen Länderregel neu prüfen")
    g.add_argument("--dry-run", action="store_true", help="nur zählen, nichts speichern")
    args = ap.parse_args(argv)
    if args.cmd == "regeln":
        return cmd_rules(args)
    if args.cmd == "pool":
        build_pool()
        return 0
    if args.cmd == "known":
        return cmd_known(args)
    if args.cmd == "nachpruefen":
        return cmd_recheck(args)
    return cmd_run(args) if args.cmd == "run" else cmd_stand(args)


if __name__ == "__main__":
    sys.exit(main())
