#!/usr/bin/env python3
"""Kunden-Werk (Inhaber 01.10.2026: „ein Kunden-Werk … was 24/7 läuft“, Ziel 1 Mio.).

Sucht Käufer (unsere Zielgruppen) und legt sie geprüft in `prospects` ab. Sendet nie Mails – ob und wann
angeschrieben wird, entscheidet weiter config/versand.yaml (zurzeit aus).

  python scripts/kundenwerk.py pool                 # Overture-Auszug: Firmen der Käufer-Branchen mit Website
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
from lib.rules import check_prospect, load_countries, normalize_domain  # noqa: E402

TARGET = 1_000_000  # Inhaber 01.10.2026: „Kundenwerk soll erst bei 1mio Kunden aufhören“
POOL = Path(os.environ.get("KUNDENWERK_POOL", "out/cache/kunden_pool.parquet"))
# Länder, aus denen wir Leads liefern können (Overture-Code -> unser Code); IE/NL/BE/SE: Scout-Sprint 01.10.2026
COUNTRIES = {"US": "US", "GB": "UK", "FR": "FR", "IE": "IE", "NL": "NL", "BE": "BE", "SE": "SE"}
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
}
# Zweite Zielgruppe je Kategorie für Länder, in die die erste nicht mailen darf (Quellen-Scout 03.10.2026, R16b):
# Werbe-/Marketingagenturen bleiben in UK/US eigener Test S12 (getrennt von S2 testbar, config/zielgruppen.yaml);
# in FR/IE/NL/BE/SE gibt es S12 nicht, dort sind sie Käufer für S2 (bauen Websites für kleine Firmen, wie
# b2b_advertising_and_marketing_service/media_agency). Test: 95 Firmen -> 10 ok (FR 7/30, SE 3/15).
SECOND = {"marketing_agency": "S2", "advertising_agency": "S2", "b2b_marketing_consultant": "S2"}
SECOND_COUNTRIES = {"FR", "IE", "NL", "BE", "SE"}  # nicht UK/US: dort bleibt S12 eigener Test, auch im S2-Fokuslauf
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
      ) TO '{POOL}' (FORMAT parquet)""")
    n = con.execute(f"SELECT count(*) FROM '{POOL}'").fetchone()[0]
    log(f"Kunden-Pool {rel}: {n} Firmen mit Website -> {POOL}")
    return POOL


def segment_for(category: str, co: str | None, segments: dict[str, set[str]]) -> tuple[str | None, str | None]:
    """Zielgruppe für Kategorie und Land: erste, wenn sie dort mailen darf, sonst die zweite (SECOND)."""
    if not co:
        return None, None
    for seg in (CATEGORIES.get(category), SECOND.get(category) if co in SECOND_COUNTRIES else None):
        if seg and co in segments.get(seg, set()):
            return seg, co
    return None, None


def candidates(segments: dict[str, set[str]]) -> list[dict]:
    """Pool ohne Ketten (gleicher Name > 3x im Land), geschlossene Firmen und unsichere Einträge;
    nur Zielgruppe/Land-Paare, in die wir mailen dürfen und für die wir Leads liefern."""
    import duckdb
    if not POOL.exists():
        build_pool()
    con = duckdb.connect()
    rows = con.execute(f"""
        WITH base AS (SELECT * FROM '{POOL}'
                      WHERE coalesce(operating_status, 'open') = 'open' AND coalesce(confidence, 0) >= 0.5
                        AND name IS NOT NULL),
             chains AS (SELECT country, lower(name) n FROM base GROUP BY 1, 2 HAVING count(*) > 3)
        SELECT id, name, websites, emails, phones, street, city, postcode, region, country, category FROM base
        WHERE (country, lower(name)) NOT IN (SELECT country, n FROM chains)""").fetchall()
    cols = ["id", "name", "websites", "emails", "phones", "street", "city", "postcode", "region", "country", "category"]
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
    from lib.fokus import rank
    out.sort(key=lambda d: (rank(d["segment"], d["country"]), hashlib.md5(d["domain"].encode()).hexdigest()))
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
        return {"emails": {}, "text": "", "pages": [], "final_domain": "", "html": ""}
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
            "html": "\n".join(pages.values())}


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
        src = f"https://overturemaps.org (Firmeneintrag {d['id']})" if email else None
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
    db = DB()
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

    pool = mine(candidates(segs))
    pool = fill_up(pool, keep, lambda: mine(candidates(all_segs)))
    pool = pool[:args.max]
    if cached and pool:
        pool = drop_stored(db, pool, known)
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    uk = {d["domain"]: d["name"] for d in pool if d["country"] == "UK"}
    if uk:
        from extraktor.sources import uk_ch
        nums = uk_ch.match_by_name(uk, log=log)
        for d in pool:
            d["ch_number"] = nums.get(d["domain"])
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

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, pool))
    with lock:
        flush()
    log(f"fertig: {stats['ok']} neue Käufer per E-Mail, {stats['call_only']} nur Anruf/Brief, "
        f"{stats['rejected']} ohne Kontaktweg, {stats['fehler']} Fehler, {stats['später']} auf den nächsten Lauf verschoben")
    for k, v in sorted(stats.items()):
        if "/" in k:
            log(f"  {k} {v}")
    return 0


# ---------------------------------------------------------------------------
# Nachprüfung über die Registernummer (Quellen-Scout R20, 03.10.2026)
# ---------------------------------------------------------------------------
RECHECK_MARK = "Registernummer-Nachprüfung"
RECHECK_PAIRS = "S2:UK,S2:FR,S1:UK"  # FR bleibt für S1-Mail aus (Inhaber)


def recheck_rows(db, pairs: list[tuple[str, str]], limit: int) -> list[dict]:
    """„Nur Anruf/Brief“-Käufer mit Firmen-E-Mail, die nur an der fehlenden Rechtsform scheitern und noch nicht
    nachgeprüft sind."""
    out: list[dict] = []
    for k, (seg, co) in enumerate(pairs):
        share = (limit - len(out)) // (len(pairs) - k)  # gleichmäßig; was ein Paar nicht braucht, bekommen die übrigen
        q = {"select": "id,segment_id,country,company_name,website,domain,email,source_url,check_reason",
             "segment_id": f"eq.{seg}", "country": f"eq.{co}", "check_status": "eq.call_only",
             "email": "not.is.null", "legal_form": "is.null",
             "and": f"(check_reason.like.*Rechtsform*,check_reason.not.like.*{RECHECK_MARK[:18]}*)",
             "order": "id.asc", "limit": str(share)}
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
    text = regnum.plain_text(html)
    return regnum.fr_sirens(text) if d["country"] == "FR" else regnum.uk_numbers(text)


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
    return out


def cmd_recheck(args) -> int:
    """Käufer „nur Anruf/Brief“ wegen fehlender Rechtsform erneut prüfen: Registernummer auf der eigenen Website,
    vom Register bestätigt (aktive Ltd/PLC/LLP bzw. SAS/SASU/SARL/EURL/SA) -> dieselbe Prüfregel wie immer
    (lib.rules.check_prospect). Ändert nur den Prüfstand dieser Zeilen, löscht nichts, sendet nie."""
    from lib.db import DB
    from enrich import Fetcher
    db = DB()
    cfg = load_countries()
    pairs = [tuple(p.split(":")) for p in args.pairs.split(",") if ":" in p]
    rows = {r["id"]: r for r in recheck_rows(db, pairs, args.max)}
    log(f"Nachprüfung Registernummer: {len(rows)} Käufer ({args.pairs})")
    if not rows:
        return 0
    blocked = {r["value"].lower() for r in db.select_all("suppression", {"select": "value"}) if r.get("value")}
    fetcher = Fetcher()
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    found: dict[int, list[str]] = {}
    done: set[int] = set()
    lock = threading.Lock()

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

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, list(rows)))
    hits = verify_numbers(found, rows, fetcher, log=log)
    stats = Counter()
    today = dt.date.today().strftime("%d.%m.%Y")
    for i in sorted(done):
        r = rows[i]
        h = hits.get(i)
        chk = None
        if h:
            sup = r["domain"] in blocked or (r["email"] or "").lower() in blocked
            chk = check_prospect(email=r["email"], country=r["country"], website=r["website"], legal_form=h["form"],
                                 source_url=r["source_url"], size_note=h["note"], suppressed=sup, cfg=cfg)
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
    args = ap.parse_args(argv)
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
