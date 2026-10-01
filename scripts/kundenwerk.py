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
import os
import re
import sys
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fetch import host_blocked  # noqa: E402
from lib.rules import check_prospect, load_countries, normalize_domain  # noqa: E402

TARGET = 1_000_000  # Inhaber 01.10.2026: „Kundenwerk soll erst bei 1mio Kunden aufhören“
POOL = Path(os.environ.get("KUNDENWERK_POOL", "out/cache/kunden_pool.parquet"))
COUNTRIES = {"US": "US", "GB": "UK", "FR": "FR"}  # Länder, aus denen wir Leads liefern können
# Overture-Kategorie (taxonomy.primary) -> Zielgruppe
CATEGORIES = {
    "employment_agency": "S1",
    "web_designer": "S2",
    "it_service_and_computer_repair": "S3", "information_technology_company": "S3", "it_consultant": "S3",
    "insurance_agency": "S4",
    "accountant": "S5", "bookkeeper": "S5", "tax_service": "S5", "payroll_service": "S5",
    "coworking_space": "S6", "shared_office_space": "S6", "commercial_real_estate": "S6",
    "janitorial_service": "S7", "cleaning_service": "S7", "office_cleaning": "S7",
    "industrial_cleaning_service": "S7",
    "financial_advising": "S9",
    "sign_making": "S10", "b2b_signage_service": "S10",
    "marketing_agency": "S12", "advertising_agency": "S12", "b2b_marketing_consultant": "S12",
    "internet_marketing_service": "S12",
}
NOT_OWN_SITE = re.compile(r"(facebook|instagram|linkedin|twitter|x\.com|yelp|google|wix(site)?\.com|godaddysites|"
                          r"business\.site|yell\.com|pagesjaunes|bark\.com|checkatrade|houzz|tripadvisor|"
                          r"booking\.com|amazon|ebay|etsy|youtube|tiktok|linktr\.ee|square\.site)", re.I)


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Firmenliste
# ---------------------------------------------------------------------------
def build_pool() -> Path:
    """Overture Places (offene Lizenz): Firmen der Käufer-Branchen mit Website in US, GB, FR."""
    import duckdb
    from extraktor.sources import overture
    rel = overture.latest_release()
    xml = requests.get(overture.BUCKET + f"?list-type=2&prefix={rel}theme=places/type=place/", timeout=60).text
    files = [overture.BUCKET + k for k in re.findall(r"<Key>([^<]+parquet)</Key>", xml)]
    POOL.parent.mkdir(parents=True, exist_ok=True)
    cats = ", ".join(f"'{c}'" for c in CATEGORIES)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET threads=16;")
    con.execute(f"""COPY (SELECT id, names.primary AS name, websites, emails, phones,
        addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS postcode,
        addresses[1].region AS region, addresses[1].country AS country, taxonomy.primary AS category,
        confidence, operating_status
      FROM read_parquet({files})
      WHERE taxonomy.primary IN ({cats}) AND addresses[1].country IN ('US','GB','FR') AND len(websites) > 0
      ) TO '{POOL}' (FORMAT parquet)""")
    n = con.execute(f"SELECT count(*) FROM '{POOL}'").fetchone()[0]
    log(f"Kunden-Pool {rel}: {n} Firmen mit Website -> {POOL}")
    return POOL


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
        seg, co = CATEGORIES.get(d["category"]), COUNTRIES.get(d["country"])
        if not seg or not co or co not in segments.get(seg, set()):
            continue
        site = next((w for w in d["websites"] or [] if w and not NOT_OWN_SITE.search(w) and not host_blocked(w)), None)
        dom = normalize_domain(site) if site else ""
        if not dom:
            continue
        out.append({**d, "segment": seg, "country": co, "website": site, "domain": dom})
    # gleichmäßig über Branchen und Länder mischen (fester Schlüssel: jeder Teillauf sieht dieselbe Reihenfolge)
    out.sort(key=lambda d: hashlib.md5(d["domain"].encode()).hexdigest())
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


def cmd_run(args) -> int:
    from lib.db import DB
    db = DB()
    cfg = load_countries()
    generic = {g.lower() for g in cfg.get("generic_local_parts") or []}
    segs = {s["id"]: set(s.get("email_countries") or []) for s in db.select_all("segments", {"select": "id,email_countries"})}
    have = count_ok(db)
    if have >= args.target:
        log(f"Ziel erreicht: {have} geprüfte Käufer (Ziel {args.target}) – nichts zu tun")
        return 0
    known = {r["domain"] for r in db.select_all("prospects", {"select": "domain"}) if r.get("domain")}
    blocked = {r["value"].lower() for r in db.select_all("suppression", {"select": "value"}) if r.get("value")}
    pool = [d for d in candidates(segs) if d["domain"] not in known]
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        pool = pool[i::n]
    pool = pool[:args.max]
    uk = {d["domain"]: d["name"] for d in pool if d["country"] == "UK"}
    if uk:
        from extraktor.sources import uk_ch
        nums = uk_ch.match_by_name(uk, log=log)
        for d in pool:
            d["ch_number"] = nums.get(d["domain"])
    log(f"Käufer: {have} geprüft (Ziel {args.target}), {len(known)} Domains schon bekannt, {len(pool)} neue in diesem Lauf")
    from enrich import Fetcher
    fetcher = Fetcher()  # robots.txt, gesperrte Plattformen, 1 Anfrage/s je Domain
    stats, lock, batch = Counter(), threading.Lock(), []

    def work(d):
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
        f"{stats['rejected']} ohne Kontaktweg, {stats['fehler']} Fehler")
    for k, v in sorted(stats.items()):
        if "/" in k:
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
    sub.add_parser("stand")
    args = ap.parse_args(argv)
    if args.cmd == "pool":
        build_pool()
        return 0
    return cmd_run(args) if args.cmd == "run" else cmd_stand(args)


if __name__ == "__main__":
    sys.exit(main())
