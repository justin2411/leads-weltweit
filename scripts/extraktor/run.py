#!/usr/bin/env python3
"""Extraktor: Leads aus kostenlosen amtlichen Quellen holen, kostenlos anreichern, doppelt prüfen, ausgeben.

  python scripts/extraktor/run.py --segments S1,S2,S4,S5,S9 --per 100 --out out/extraktor
  python scripts/extraktor/run.py --segments S4 --per 20 --fmcsa-days 14 --out /tmp/x      # klein testen
  python scripts/extraktor/run.py ... --db        # Sperrliste/Dubletten aus Supabase prüfen (SUPABASE_URL/KEY)

Ausgabe in --out:
  leads_gruen.csv   lieferbar: Qualitätskontrolle grün UND Signalkontrolle bestanden
  leads_alle.csv    jeder bearbeitete Kandidat mit Ampel und Gründen (gelb = noch anreichern, rot = nie liefern)
  bericht.json      Trichter je Branche (Kandidaten -> angereichert -> grün/gelb/rot)
"""
from __future__ import annotations

import argparse
import re
import csv
import datetime as dt
import json
import os
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests  # noqa: E402

from extraktor import enrich as E  # noqa: E402
from extraktor import filters, qc, sc, segments  # noqa: E402
from extraktor.model import CSV_COLUMNS  # noqa: E402
from extraktor.sources import fmcsa, formd, fr_bodacc, overture, uk_ch, website_check  # noqa: E402
from lib import websites as W  # noqa: E402
from lib.laender import active, producing  # noqa: E402

FORM_D_SEGMENTS = ("S1", "S5", "S9")
FMCSA_SEGMENTS = ("S4", "S2", "S5")
# Scout-Sprint 01.10.2026: S2 (Firmen ohne Website, Overture) auch in den übrigen Mail-Ländern aus countries.yaml
S2_EXTRA = ("IE", "NL", "BE", "SE")
# Neue Mail-Länder (Inhaber 04.10.2026, docs/KALTMAIL-RECHT.md): S2 ohne Website aus Overture, nur mit E-Mail
S2_NEW = active(("FI", "SG", "HK", "MX", "BR"))  # HK raus (Inhaber 05.10.2026, lib/laender)


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Kandidaten je Branche
# ---------------------------------------------------------------------------
def load_fmcsa(days: int, stats: Counter) -> tuple[list[dict], Counter]:
    since = dt.date.today() - dt.timedelta(days=days)
    rows = fmcsa.fetch(since)
    log(f"FMCSA: {len(rows)} aktive Neuzugänge seit {since}")
    cands = [fmcsa.to_candidate(r) for r in rows]
    long_since = dt.date.today() - dt.timedelta(days=120)
    extra = fmcsa.contact_rows(long_since)
    shared = filters.shared_contacts(cands, extra)
    oos = fmcsa.out_of_service(dt.date.today() - dt.timedelta(days=540))
    log(f"FMCSA: Sammel-Kontakte über {len(extra)} Neuzugänge seit {long_since} gezählt, {len(oos)} offene Stilllegungen")
    for c in cands:
        if c["source_id"] in oos:
            c["facts"]["out_of_service"] = oos[c["source_id"]]
    out = []
    for c in cands:
        why = filters.pre_filter(c)
        if why:
            stats[f"fmcsa_filtered:{why}"] += 1
            continue
        out.append(c)
    out = filters.dedupe(out)
    stats["fmcsa_candidates"] = len(out)
    return out, shared


def load_formd(days: int, max_docs: int, stats: Counter) -> list[dict]:
    cands = formd.fetch(days=days, max_docs=max_docs, log=log)
    out = []
    for c in cands:
        why = filters.pre_filter(c)
        if why:
            stats[f"formd_filtered:{why}"] += 1
            continue
        out.append(c)
    out = filters.dedupe(out)
    stats["formd_candidates"] = len(out)
    return out


EU_SEGMENTS = ("S4", "S5", "S9")


def _worth(c: dict) -> bool:
    """Neugründung mit Chance auf eine eigene Website: unterscheidbarer Name (sonst findet die Domain-Suche nichts
    Eindeutiges)."""
    return W.name_is_distinctive(c["name"]) and len(W.core_words(c["name"])) <= 4


def load_uk(days: int, stats: Counter, max_pool: int) -> list[dict]:
    rows = uk_ch.incorporations(dt.date.today() - dt.timedelta(days=days), log=log)
    cands = [c for c in (uk_ch.to_candidate(r) for r in rows) if not filters.pre_filter(c) and _worth(c)]
    cands = filters.dedupe(cands)
    # neueste zuerst, ohne Formations-Agent-Adresse (c/o) zuerst
    cands.sort(key=lambda c: (c["facts"]["care_of"], -c["facts"]["incorporated_on"].toordinal()))
    cands = cands[:max_pool]
    owners = uk_ch.owners({c["source_id"] for c in cands}, log=log)
    for c in cands:
        o = owners.get(c["source_id"])
        if o:
            c["person_name"], c["person_role"] = o["name"], o["role"]
    stats["uk_candidates"] = len(cands)
    return cands


def load_fr(days: int, stats: Counter) -> list[dict]:
    rows = fr_bodacc.fetch(dt.date.today() - dt.timedelta(days=days), log=log)
    cands = [c for c in (fr_bodacc.to_candidate(r) for r in rows) if c]
    cands = [c for c in cands if not filters.pre_filter(c) and _worth(c)]
    cands = filters.dedupe(cands)
    cands.sort(key=lambda c: (not c.get("person_name"), -c["facts"]["published_on"].toordinal()))
    stats["fr_candidates"] = len(cands)
    return cands


def load_overture_s2(country: str, limit: int, stats: Counter, exclude: set[str] | None = None,
                     min_conf: float = overture.S2_HIGH_CONF) -> list[dict]:
    """S2 UK/FR: Firmen ohne Website aus Overture; UK: Inhaber über Firmenregister + PSC, wo eindeutig.
    exclude: schon gespeicherte Overture-IDs (das Lead-Werk arbeitet sich so durch den ganzen Bestand)."""
    rows = overture.no_website(country, limit, log=log, exclude=exclude, min_conf=min_conf)
    cands = [overture.to_candidate(d, country) for d in rows]
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c)])
    if country == "UK":
        import os
        os.environ.setdefault("EXTRAKTOR_KEEP_PSC", "1")
        numbers = uk_ch.match_companies(cands, log=log)
        owners = uk_ch.owners(set(numbers.values()), log=log)
        for c in cands:
            num = numbers.get(c["source_id"])
            if num:
                c["facts"]["company_number"] = num
                o = owners.get(num)
                if o:
                    c["person_name"], c["person_role"] = o["name"], o["role"]
    stats[f"overture_{country}"] = len(cands)
    return cands


def load_rge(limit: int, stats: Counter, exclude: set[str] | None = None) -> list[dict]:
    """S2 FR: Firmen aus dem RGE-Verzeichnis der ADEME ohne Website (Quellen-Scout 04.10.2026). Firmen, deren Telefon
    schon in Overture FR steht, bleiben draußen: mit Website dort = hat doch eine Website, ohne = bearbeitet s2-fr.
    exclude: schon gespeicherte SIRETs. Erst filtern, dann begrenzen (sonst verdrängen unpassende Firmen die übrigen)."""
    from extraktor.sources import fr_rge
    cands = fr_rge.load(None, log=log, exclude=exclude, skip_phones=overture.phones("FR"))
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c) and segments.fits("S2", c)[0]])[:limit]
    stats["rge_FR"] = len(cands)
    return cands


def load_bio(limit: int, stats: Counter, exclude: set[str] | None = None) -> list[dict]:
    """S2 FR Premium: neue Bio-Betriebe (Agence Bio, Ersteintrag ≤ 30 Tage) ohne Website (Quellen-Scout R37).
    Telefon schon in Overture FR = dort schon bearbeitet. exclude: schon gespeicherte Agence-Bio-IDs."""
    from extraktor.sources import fr_bio
    cands = fr_bio.load(None, log=log, exclude=exclude, skip_phones=overture.phones("FR"))
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c) and segments.fits("S2", c)[0]])[:limit]
    stats["bio_FR"] = len(cands)
    return cands


def load_diag(limit: int, stats: Counter, exclude: set[str] | None = None) -> list[dict]:
    """S2 FR Premium: neu zertifizierte Diagnostiqueurs immobiliers (DGALN-Verzeichnis, erstmals im Verzeichnis,
    ≤ 30 Tage) ohne Website (Quellen-Scout R40). exclude: schon gespeicherte IDs."""
    from extraktor.sources import fr_diag
    cands = fr_diag.load(None, log=log, exclude=exclude, skip_phones=overture.phones("FR"))
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c) and segments.fits("S2", c)[0]])[:limit]
    stats["diag_FR"] = len(cands)
    return cands


def load_charity(limit: int, stats: Counter, exclude: set[str] | None = None) -> list[dict]:
    """S2 UK Premium: neu registrierte Charities (Charity Commission, ≤ 30 Tage) ohne Website (Quellen-Scout R38).
    Telefon schon in Overture UK = dort schon bearbeitet. exclude: schon gespeicherte Charity-Nummern."""
    from extraktor.sources import uk_charity
    cands = uk_charity.load(None, log=log, exclude=exclude, skip_phones=overture.phones("UK"))
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c) and segments.fits("S2", c)[0]])[:limit]
    stats["charity_UK"] = len(cands)
    return cands


def load_web(country: str, limit: int, stats: Counter, part: tuple[int, int] | None = None,
             min_conf: float = website_check.HIGH_CONF, no_phone: bool = False) -> list[dict]:
    """S2 Website-Prüfung: Overture-Firmen MIT Website, die dieser Teil in den letzten RECHECK_DAYS noch nicht
    geprüft hat (Gedächtnis im Zwischenspeicher, keine Datenbank-Abfrage je Firma). part: eigener Anteil (--shard)."""
    seen = website_check.recently_checked()
    rows = website_check.with_website(country, limit, log=log, exclude=seen, part=part, min_conf=min_conf,
                                      no_phone=no_phone)
    cands = filters.dedupe([c for c in (website_check.to_candidate(d, country) for d in rows) if not filters.pre_filter(c)])
    stats[f"overture_web_{country}"] = len(cands)
    stats[f"overture_web_{country}_skipped_recent"] = len(seen)
    return cands


def process_web(c: dict, fetcher) -> str:
    """Startseite prüfen und Befunde in den Kandidaten schreiben; gibt den Grund zurück, wenn es keinen Lead gibt."""
    res = website_check.confirmed_only(c, website_check.inspect(c, fetcher))
    website_check.remember(c["source_id"])
    website_check.count(res)
    if not res["findings"]:
        return f"no_finding:{res['note'] or 'site_ok'}"
    final = res["final_url"] or c["facts"]["listed_website"]
    dom = W.site_domain(final)
    c["website"] = f"{'https' if final.startswith('https') else 'http'}://{dom}"
    c["facts"].update(findings=res["findings"], signal_type=website_check.primary(res["findings"]),
                      domain=dom, checked_on=dt.date.today())
    c["evidence"]["website"] = {"method": "overture_listing", "score": 0, "evidence": res["belongs"]}
    site_emails = W.emails_on_page(res["html"]) if res["html"] else []
    if not c.get("email") or (not E.is_freemail(c["email"]) and E.email_domain(c["email"]) != dom):
        e = E.pick_email(site_emails, dom)
        if not e and res["html"] and fetcher is not None:
            # nur bei einem Befund: Kontakt-/Impressumsseite der eigenen Website (robots.txt, Drosselung wie immer)
            for sub in W.subpage_links(res["html"], final, limit=2):
                got = fetcher.get(sub)
                if got:
                    e = E.pick_email(W.emails_on_page(got[1]), dom)
                    if e:
                        break
        if e:
            c["email"] = e
            c["evidence"]["email_from"] = "website"
    if res["html"]:
        c["evidence"]["site_phones"] = W.phones_on_page(res["html"], c["country"])[0][:5]
        if not c.get("phone") and c["evidence"]["site_phones"]:
            # Eintrag ohne Telefon (--web-no-phone): Nummer von der eigenen, als Firmenseite belegten Startseite
            c["phone"] = c["evidence"]["site_phones"][0]
            c["evidence"]["phone_from"] = "website"
    if c.get("email"):
        from enrich import mx_ok
        c["evidence"]["mx"] = mx_ok(E.email_domain(c["email"]))
    return ""


SKIP_SPONSOR = re.compile(r"\b(care|nursing|home|homes|healthcare|domiciliary|church|school|academy|trust|nhs|council|"
                          r"university|college|restaurant|takeaway|cafe|kebab|curry|pizza|grill)\b", re.I)
FR_HIRING_CATS = ("professional_service", "b2b_service", "software", "it_service", "engineering", "consultant",
                  "marketing", "financial_service", "logistics", "manufacturing", "technology")


def load_jobs(country: str, probe_limit: int, workers: int, stats: Counter) -> list[dict]:
    """S1: Firmen mit offenen Stellen über die öffentlichen Job-Schnittstellen der Bewerber-Systeme."""
    from extraktor.sources import jobs
    try:
        names = [{"name": n, "city": ""} for n in jobs.cc_slugs(log=log)]
    except Exception as exc:  # noqa: BLE001 - Common Crawl ist nicht überall erreichbar
        log(f"Common Crawl nicht erreichbar ({type(exc).__name__}) – Ersatzliste")
        names = []
    if not names and country == "UK":
        names = [dict(r, sponsor=True) for r in jobs.sponsors_uk(log=log) if not SKIP_SPONSOR.search(r["name"])]
    if not names and country == "FR":
        import duckdb
        cats = " OR ".join("category LIKE '%" + c + "%'" for c in FR_HIRING_CATS)
        rows = duckdb.connect().execute(
            f"SELECT DISTINCT name, city FROM '{overture.CACHE}' WHERE country='FR' AND len(websites)>0 AND ({cats}) "
            "LIMIT ?", [probe_limit * 2]).fetchall()
        names = [{"name": n, "city": c or ""} for n, c in rows if n]
    names = [n for n in names if W.name_is_distinctive(n["name"])][:probe_limit]
    log(f"S1/{country}: prüfe {len(names)} Firmen auf offene Stellen")
    session = requests.Session()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        hits = [(n, h) for n, h in ex.map(lambda n: (n, jobs.probe(n["name"], country, session)), names) if h]
    cands = filters.dedupe([jobs.to_candidate(n, h, country) for n, h in hits])
    if country == "UK" and cands:
        import os
        os.environ.setdefault("EXTRAKTOR_KEEP_PSC", "1")
        nums = uk_ch.match_by_name({c["source_id"]: c["name"] for c in cands}, log=log)
        owners = uk_ch.owners(set(nums.values()), log=log)
        for c in cands:
            num = nums.get(c["source_id"])
            if num:
                c["facts"]["company_number"] = num
                if owners.get(num):
                    c["person_name"], c["person_role"] = owners[num]["name"], owners[num]["role"]
    stats[f"jobs_{country}"] = len(cands)
    log(f"S1/{country}: {len(cands)} Firmen mit Stellen im Land")
    return cands


def load_careers(country: str, probe_limit: int, workers: int, fetcher, stats: Counter) -> list[dict]:
    """S1: Firmen mit offenen Stellen auf der eigenen Karriereseite (Firmenliste: Web Data Commons).
    UK: Registernummer von der eigenen Website (sonst eindeutiger Name) -> Sitz und Eigentümer aus Companies House."""
    from extraktor.sources import careers
    seen, today = careers.load_seen(), dt.date.today()
    doms = careers.today_slice(careers.domains(country, log=log), seen, probe_limit, today)
    log(f"S1/{country}: prüfe {len(doms)} Karriereseiten")
    with ThreadPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(lambda d: (d, careers.scan(d, country, fetcher)), doms))
    why = Counter(r["why"] for _, r in res if not r["ok"])
    cands = []
    for d, r in res:
        if r["ok"]:
            cands.append(careers.to_candidate(d, r, country, seen, today))
            careers.remember(seen, d, r["jobs"], today)
    careers.save_seen(seen)
    log(f"S1/{country}: {len(cands)} Firmen mit Stellen im Land; ausgeschlossen: {dict(why.most_common(8))}")
    stats[f"careers_{country}"] = len(cands)
    stats[f"careers_{country}_excluded"] = dict(why)
    if country == "UK" and cands:
        import os
        os.environ.setdefault("EXTRAKTOR_KEEP_PSC", "1")
        nums = {c["source_id"]: c["facts"]["registry_numbers"][0] for c in cands if c["facts"]["registry_numbers"]}
        nums.update({k: v for k, v in uk_ch.match_by_name(
            {c["source_id"]: c["name"] for c in cands if c["source_id"] not in nums}, log=log).items()})
        info = uk_ch.details(set(nums.values()), log=log)
        owners = uk_ch.owners(set(info), log=log)
        for c in cands:
            num = nums.get(c["source_id"])
            if not num or num not in info:
                continue
            c["facts"]["company_number"] = num
            c["legal_name"] = info[num]["legal_name"]
            if not (c.get("street") and c.get("zip")):
                c.update(street=info[num]["street"], city=info[num]["city"], zip=info[num]["zip"])
            if owners.get(num):
                c["person_name"], c["person_role"] = owners[num]["name"], owners[num]["role"]
    return cands


def load_tender(days: int, max_pages: int, stats: Counter, cf_pages: int = 0) -> list[dict]:
    """S1/UK: KMU mit gewonnenem öffentlichem Auftrag (Find a Tender). Companies-House-Nummer aus der Meldung ->
    fehlende Sitzadresse aus dem Register, Eigentümer (PSC) als Ansprechperson."""
    from extraktor.sources import uk_find_tender
    cands = uk_find_tender.load(dt.date.today() - dt.timedelta(days=days), max_pages, log=log, cf_pages=cf_pages)
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c)])
    nums = {c["facts"]["company_number"] for c in cands if c["facts"]["company_number"]}
    if nums:
        info, owners = tender_registry(nums)
        for c in cands:
            num = c["facts"]["company_number"]
            if num not in info:
                continue
            c["legal_name"] = info[num]["legal_name"]
            # Contracts Finder nennt keinen Ort (Adresse als eine Zeile): dann die Sitzadresse aus dem Register
            if not (c.get("street") and c.get("zip") and c.get("city")):
                c.update(street=info[num]["street"], city=info[num]["city"], zip=info[num]["zip"])
            if not c.get("person_name") and owners.get(num):
                c["person_name"], c["person_role"] = owners[num]["name"], owners[num]["role"]
    stats["find_tender_candidates"] = len(cands)
    return cands


TENDER_CH = Path("out/cache/find_tender_ch.json")


def tender_registry(nums: set[str], path: Path = TENDER_CH) -> tuple[dict, dict]:
    """Sitz und Eigentümer je Firmennummer, höchstens einmal am Tag aus den Companies-House-Massendaten
    (Tages-Zwischenspeicher: das Lead-Werk läuft alle ~80 Minuten, die Massendaten ändern sich täglich)."""
    today = dt.date.today().isoformat()
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if d.get("day") == today and nums <= set(d.get("nums") or []):
            log(f"UK: Register-Angaben für {len(nums)} Firmennummern aus dem Tages-Zwischenspeicher")
            return d["info"], d["owners"]
    except (OSError, ValueError, KeyError):
        pass
    import os
    os.environ.setdefault("EXTRAKTOR_KEEP_PSC", "1")
    info = uk_ch.details(nums, log=log)
    owners = uk_ch.owners(set(info), log=log)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"day": today, "nums": sorted(nums), "info": info, "owners": owners}, default=str),
                    encoding="utf-8")
    return info, owners


def load_ct(days: int, stats: Counter) -> list[dict]:
    """US/Connecticut: Neugründungen mit E-Mail aus dem offenen Firmenregister, Inhaber aus der Principals-Tabelle."""
    from extraktor.sources import ct_registry
    rows = ct_registry.fetch(dt.date.today() - dt.timedelta(days=days), log=log)
    people = ct_registry.principals([r["id"] for r in rows], log=log)
    cands = [ct_registry.to_candidate(r, people.get(r["id"])) for r in rows]
    cands = filters.dedupe([c for c in cands if not filters.pre_filter(c)])
    stats["ct_candidates"] = len(cands)
    return cands


def ct_pools(segs: list[str], cands: list[dict]) -> dict[str, list[dict]]:
    """Jede CT-Firma in genau eine Branche: Freemail ohne eigene Domain -> S2, sonst abwechselnd S4/S5/S9."""
    p: dict[str, list[dict]] = defaultdict(list)
    rest = [s for s in ("S4", "S5", "S9") if s in segs]
    for i, c in enumerate(cands):
        order = (["S2"] if "S2" in segs else []) + (rest[i % len(rest):] + rest[:i % len(rest)] if rest else [])
        for seg in order:
            if segments.fits(seg, c)[0]:
                p[seg].append(c)
                break
    return p


def eu_pools(segs: list[str], cands: list[dict], country: str) -> dict[str, list[dict]]:
    """UK/FR-Neugründungen abwechselnd auf S4/S5/S9 verteilen (jede Firma nur einmal), nur mit Ansprechperson."""
    p: dict[str, list[dict]] = defaultdict(list)
    wanted = [s for s in EU_SEGMENTS if s in segs]
    for i, c in enumerate(cands):
        if not c.get("person_name"):
            continue
        order = wanted[i % len(wanted):] + wanted[:i % len(wanted)] if wanted else []
        for seg in order:
            if segments.fits(seg, c)[0]:
                p[f"{seg}/{country}"].append(c)
                break
    return p


def pools(segs: list[str], fm: list[dict], fd: list[dict], distinct: bool) -> dict[str, list[dict]]:
    """Kandidaten je Branche, vor der Anreicherung. FMCSA: eigene Domain -> S4, Freemail -> S2.
    Form D: S1 (ab $1M) vor S5 (junge kleine Firmen) vor S9 (Geschäftsführung) – mit distinct jede Firma nur einmal."""
    p: dict[str, list[dict]] = defaultdict(list)
    for i, c in enumerate(fm):
        own = c.get("email") and not E.is_freemail(c["email"])
        if own:
            # eigene Domain: abwechselnd S4 und S5 (jede Firma nur einmal), S4 zuerst wenn nur eine passt
            order = ("S4", "S5") if i % 2 == 0 else ("S5", "S4")
            for seg in order:
                if seg in segs and segments.fits(seg, c)[0]:
                    p[seg].append(c)
                    break
        elif "S2" in segs and c.get("email") and segments.fits("S2", c)[0]:
            p["S2"].append(c)
    used = set()
    for seg in [s for s in FORM_D_SEGMENTS if s in segs]:
        for c in fd:
            # S9 ist ein Personen-Lead (Geschäftsführer) – darf dieselbe Firma wie S1/S5 nutzen
            if distinct and seg != "S9" and c["source_id"] in used:
                continue
            if segments.fits(seg, c)[0]:
                p[seg].append(c)
                if distinct:
                    used.add(c["source_id"])
    # Form D vor FMCSA in S5 (Kapital = stärkeres Signal); Telefon und Person zuerst
    for seg in FORM_D_SEGMENTS:
        p[seg].sort(key=lambda c: (c["source"] != "sec_form_d", not c.get("phone"), not c.get("person_name")))
    return p


# ---------------------------------------------------------------------------
# Einen Kandidaten bearbeiten
# ---------------------------------------------------------------------------
def process(c: dict, seg: str, fetcher, shared: Counter, guard: filters.Guard) -> dict:
    c = {**c, "evidence": {}, "facts": dict(c["facts"])}
    # Website-Prüfung: Sperrliste erst bei einem Befund prüfen (Datenbank schonen: die meisten Seiten sind in Ordnung)
    why = None if c["source"] == website_check.SOURCE else guard.problem(c)
    if why:
        return {**c, "segment": seg, "ampel": "skip", "qc": {"status": "skip", "blocking": [why], "missing": [],
                                                              "warnings": [], "evidence": []},
                "sc": {"status": "skip", "problems": []}}
    try:
        if c["source"] == website_check.SOURCE:
            why = process_web(c, fetcher)
            why = why or guard.problem(c)  # mit der E-Mail von der Website gegen die Sperrliste
            if why:  # Website ohne Befund: kein Lead, nichts speichern (nur im Gedächtnis, nicht erneut prüfen)
                return {**c, "segment": seg, "ampel": "skip", "qc": {"status": "skip", "blocking": [why], "missing": [],
                                                                      "warnings": [], "evidence": []},
                        "sc": {"status": "skip", "problems": []}}
        else:
            E.enrich(c, fetcher, need_website=True)
    except Exception as exc:  # noqa: BLE001 - ein Fehler bei einer Firma darf den Lauf nicht beenden
        c["evidence"]["enrich_error"] = f"{type(exc).__name__}: {exc}"[:200]
        if c["source"] == website_check.SOURCE:
            return {**c, "segment": seg, "ampel": "skip", "qc": {"status": "skip", "blocking": ["check_error"],
                                                                  "missing": [], "warnings": [], "evidence": []},
                    "sc": {"status": "skip", "problems": []}}
    t = segments.texts(seg, c)
    q = qc.run(c, seg, shared)
    s = sc.run(c, seg, t)
    return {**c, **t, "segment": seg, "qc": q, "sc": s}


def ampel(l: dict) -> str:
    if l["qc"]["status"] == "skip":
        return "skip"
    if l["qc"]["status"] == "red" or l["sc"]["status"] == "fail":
        return "red"
    return "green" if l["qc"]["status"] == "green" else "yellow"


def fair_deadline(deadline: float, left: int, now: float | None = None) -> float:
    """Frist für die nächste Branche/das nächste Land: gerechter Anteil an der Restzeit (Restzeit / offene Branchen).
    Ohne das verbrauchten die ersten Länder einer Linie (FI, SG) das ganze Zeitfenster und die letzten (MX, BR)
    kamen nie dran (Agent 6, 04.10.2026). Wer früher fertig ist, gibt seine Restzeit an die folgenden weiter;
    die letzte Branche bekommt die ganze Restzeit. 0 = keine Frist."""
    if not deadline:
        return 0
    now = time.monotonic() if now is None else now
    return now + max(0.0, deadline - now) / max(1, left)


def run_segment(seg: str, pool: list[dict], per: int, fetcher, shared: Counter, guard: filters.Guard,
                workers: int, max_tries: int, progress=None, deadline: float = 0) -> list[dict]:
    """Kandidaten in Wellen parallel bearbeiten, bis `per` grüne Leads da sind, der Vorrat leer ist oder die
    Frist (`deadline`, time.monotonic(); 0 = keine) abgelaufen ist."""
    done, i, started = [], 0, time.monotonic()
    queue = pool[:max_tries]
    with ThreadPoolExecutor(max_workers=workers) as ex:
        while i < len(queue) and sum(l["ampel"] == "green" for l in done) < per:
            if deadline and time.monotonic() >= deadline:
                log(f"  {seg}: Zeitfenster vorbei, Rest im nächsten Lauf")
                break
            need = per - sum(l["ampel"] == "green" for l in done)
            batch = queue[i:i + max(workers, min(workers * 3, need * 3))]
            i += len(batch)
            for l in ex.map(lambda c: process(c, seg, fetcher, shared, guard), batch):
                l["ampel"] = ampel(l)
                done.append(l)
            log(f"  {seg}: {len(done)} bearbeitet, {sum(l['ampel'] == 'green' for l in done)} grün")
            if progress and len(done) % 500 < len(batch):
                progress(done)  # Zwischenstand sichern (große Läufe)
    log(f"{seg}: {len(done)} bearbeitet, {sum(l['ampel'] == 'green' for l in done)} grün "
        f"({time.monotonic() - started:.0f} s)")
    return done


# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------
def dated_event(l: dict) -> str:
    """Beleg eines datierten Ereignisses ohne Website-Befund (RGE: neue Qualifikation laut ADEME) für
    lib/premium.py (`details.dated_event`); sonst leer."""
    ch = (l.get("facts") or {}).get("charity_new") or {}
    if ch.get("date"):
        return json.dumps({"dated_event": {"kind": "charity_registration", "date": ch["date"],
                                           "type": ch.get("type") or ""},
                           "checked_on": str(l["facts"].get("checked_on") or "")}, ensure_ascii=False)
    dg = (l.get("facts") or {}).get("diag_new") or {}
    if dg.get("date"):
        return json.dumps({"dated_event": {"kind": "diagnostiqueur_certification", "date": dg["date"],
                                           "organisme": dg.get("organisme") or ""},
                           "checked_on": str(l["facts"].get("checked_on") or "")}, ensure_ascii=False)
    bio = (l.get("facts") or {}).get("bio_new") or {}
    if bio.get("date"):
        return json.dumps({"dated_event": {"kind": "bio_first_engagement", "date": bio["date"],
                                           "organisme": bio.get("organisme") or ""},
                           "checked_on": str(l["facts"].get("checked_on") or "")}, ensure_ascii=False)
    new = (l.get("facts") or {}).get("rge_new") or {}
    if not new.get("date"):
        return ""
    return json.dumps({"dated_event": {"kind": "rge_qualification", "date": new["date"],
                                       "domaines": new.get("domaines") or []},
                       "checked_on": str(l["facts"].get("checked_on") or "")}, ensure_ascii=False)


def row(l: dict) -> dict:
    q, s = l["qc"], l["sc"]
    return {
        "ampel": l["ampel"], "segment": l["segment"], "country": l["country"], "company": l["name"],
        "legal_name": l["legal_name"], "contact_name": l.get("person_name"), "contact_role": l.get("person_role"),
        "phone": l.get("phone"), "phone_type": l.get("phone_type", ""),
        "phone_note": l.get("phone_note", ""), "email": l.get("email"),
        "email_type": l.get("email_type", ""), "website": l.get("website"), "street": l.get("street"),
        "city": l.get("city"), "state": l.get("state"), "zip": l.get("zip"), "signal": l.get("signal"),
        "signal_date": l.get("signal_date"), "company_info": l.get("company_info"), "opener": l.get("opener"),
        "urgency": l.get("urgency"), "urgency_reason": l.get("urgency_reason"), "source": l["source"],
        "source_id": l["source_id"], "source_url": l["source_url"], "qc": q["status"],
        "qc_notes": "; ".join(q["blocking"] + [f"missing:{m}" for m in q["missing"]] + q["warnings"]
                              + [f"+{e}" for e in q["evidence"]]),
        "sc": s["status"], "sc_notes": "; ".join(s["problems"]),
        "signal_type": (l.get("facts") or {}).get("signal_type", ""),
        "signal_evidence": json.dumps({"findings": l["facts"]["findings"], "checked_on": str(l["facts"]["checked_on"]),
                                       "listed_website": l["facts"].get("listed_website")}, ensure_ascii=False)
        if (l.get("facts") or {}).get("findings") else dated_event(l),
    }


def write(out: Path, leads: list[dict], per: int) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    rows = [row(l) for l in leads if l["ampel"] != "skip"]
    with open(out / "leads_alle.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    greens, per_seg = [], Counter()
    for r in rows:
        k = f"{r['segment']}/{r['country']}"
        if r["ampel"] == "green" and per_seg[k] < per:
            per_seg[k] += 1
            greens.append(r)
    with open(out / "leads_gruen.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        w.writerows(greens)
    return dict(per_seg)


def funnel(leads: list[dict], pools_: dict[str, list[dict]]) -> dict:
    rep = {}
    for seg in sorted({f"{l['segment']}/{l['country']}" for l in leads} | {k if "/" in k else f"{k}/US" for k in pools_}):
        ls = [l for l in leads if f"{l['segment']}/{l['country']}" == seg]
        reasons = Counter()
        for l in ls:
            if l["ampel"] == "red":
                reasons.update(x.split(" (")[0].split(":")[0] for x in l["qc"]["blocking"] + l["sc"]["problems"])
            if l["ampel"] == "yellow":
                reasons.update(f"missing:{m}" for m in l["qc"]["missing"])
        pool = len(pools_.get(seg, pools_.get(seg.replace("/US", ""), [])))
        rep[seg] = {"pool": pool, "processed": len(ls),
                    **Counter(l["ampel"] for l in ls), "top_reasons": reasons.most_common(8), "stufen": stages(ls, pool),
                    "premium": premium_count(ls)}
    return rep


def premium_count(ls: list[dict]) -> int:
    """Grüne Leads mit Premium-Stufe (lib/premium.py, gleiche Rechnung wie beim Speichern) – für den Autopilot."""
    from extraktor.store import _premium
    n = 0
    for l in ls:
        if l.get("ampel") != "green":
            continue
        try:
            r = {k: (v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v) for k, v in row(l).items()}
            n += _premium(r)["premium"]["tier"] == "premium"
        except Exception:  # noqa: BLE001 - Zählen darf nie einen Lauf stören
            continue
    return n


GUARD_REASONS = ("already", "suppressed", "public", "placeholder", "outside", "shared", "duplicate", "chain", "junk")


def stages(ls: list[dict], pool: int) -> dict:
    """Trichter für das Dashboard (Inhaber 03.10.2026: Filter „wirklich wie ein trichter“): wie viele Kandidaten
    nach jedem Prüfer übrig sind – Sicherheitsfilter, Befund/Signal gefunden, Kontaktdaten stimmig, Signal und
    Texte geprüft, vollständig (grün)."""
    guard = nofind = qc_red = sc_red = yellow = 0
    for l in ls:
        if l["ampel"] == "skip":
            why = (l["qc"].get("blocking") or [""])[0]
            if str(why).startswith(GUARD_REASONS):
                guard += 1
            else:
                nofind += 1
        elif l["qc"]["status"] == "red":
            qc_red += 1
        elif l["sc"]["status"] == "fail":
            sc_red += 1
        elif l["ampel"] == "yellow":
            yellow += 1
    n = len(ls)
    out = {"kandidaten": max(pool, n), "bearbeitet": n}
    out["sicherheitsfilter"] = n - guard
    out["befund"] = out["sicherheitsfilter"] - nofind
    out["kontaktdaten"] = out["befund"] - qc_red
    out["signal"] = out["kontaktdaten"] - sc_red
    out["gruen"] = out["signal"] - yellow
    return out


def main(argv=None) -> int:
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--segments", default="S1,S2,S4,S5,S9")
    ap.add_argument("--per", type=int, default=100, help="grüne Leads je Branche")
    ap.add_argument("--fmcsa-days", type=int, default=30)
    ap.add_argument("--formd-days", type=int, default=21)
    ap.add_argument("--formd-max-docs", type=int, default=5000)
    ap.add_argument("--max-tries", type=int, default=1500, help="höchstens so viele Kandidaten je Branche anreichern")
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--no-distinct", action="store_true", help="eine Form-D-Firma darf in mehreren Branchen stehen")
    ap.add_argument("--db", action="store_true", help="Sperrliste und vorhandene Leads aus Supabase prüfen")
    ap.add_argument("--countries", default="US", help="US,UK,FR")
    ap.add_argument("--uk-days", type=int, default=30)
    ap.add_argument("--ct-days", type=int, default=0, help="US/Connecticut-Register: Neugründungen der letzten N Tage (0 = aus)")
    ap.add_argument("--fr-days", type=int, default=30)
    ap.add_argument("--eu-pool", type=int, default=15000, help="UK: höchstens so viele Neugründungen vorab auswählen")
    ap.add_argument("--s1-probe", type=int, default=3000, help="S1 UK/US: so viele Karriereseiten prüfen")
    ap.add_argument("--s2-limit", type=int, default=3000, help="S2 UK/FR: so viele Overture-Firmen ohne Website laden")
    ap.add_argument("--s2-min-conf", type=float, default=0.6,
                    help="S2 ohne Website: Overture-Konfidenz ab (UK/FR zweite Stufe 0.4, nie tiefer)")
    ap.add_argument("--rge", type=int, default=0,
                    help="S2 FR: so viele Firmen ohne Website aus dem RGE-Verzeichnis (ADEME) laden (0 = aus)")
    ap.add_argument("--bio", type=int, default=0,
                    help="S2 FR: so viele neue Bio-Betriebe ohne Website aus dem Agence-Bio-Verzeichnis (0 = aus)")
    ap.add_argument("--diag", type=int, default=None,
                    help="S2 FR: so viele neu zertifizierte Diagnostiqueurs ohne Website (DGALN-Verzeichnis, 0 = aus; "
                         "ohne Angabe 2000, wenn --bio läuft = Linie s2-ukfr)")
    ap.add_argument("--charity", type=int, default=0,
                    help="S2 UK: so viele neu registrierte Charities ohne Website (Charity Commission, 0 = aus)")
    ap.add_argument("--store", action="store_true", help="grüne Leads direkt in die Datenbank schreiben (mit --db)")
    ap.add_argument("--no-raw", action="store_true",
                    help="Speicher-Bremse ab 7 GB (werk_plan.py): nur grüne Leads speichern, keinen Rohbestand")
    ap.add_argument("--shard", default="", help="i/n: nur jeden n-ten Kandidaten ab i (parallele Teilläufe)")
    ap.add_argument("--out", default="out/extraktor")
    ap.add_argument("--us-overture", action="store_true",
                    help="S2 US: Firmen ohne Website aus Overture (Fokus Webagenturen, 02.10.2026)")
    ap.add_argument("--lca", action="store_true",
                    help="S1 US: Arbeitgeber mit Fachkräfte-Bedarf aus den DOL-LCA-Daten (Quellen-Scout 02.10.2026)")
    ap.add_argument("--tender-days", type=int, default=0,
                    help="S1 UK: KMU mit gewonnenem öffentlichem Auftrag (Find a Tender), letzte N Tage (0 = aus)")
    ap.add_argument("--tender-pages", type=int, default=30, help="Find a Tender: höchstens so viele Abrufe (je 100)")
    ap.add_argument("--award-days", type=int, default=0,
                    help="S1 US: kleine Firmen mit neuem Bundesauftrag (USAspending.gov), letzte N Tage (0 = aus)")
    ap.add_argument("--award-pages", type=int, default=20, help="USAspending: höchstens so viele Abrufe (je 100)")
    ap.add_argument("--cf-pages", type=int, default=0, help="Contracts Finder dazu: höchstens so viele Abrufe (je 100, 0 = aus)")
    ap.add_argument("--web-check", action="store_true",
                    help="S2: Firmen MIT Website prüfen (unsicher, nicht handytauglich, veraltet, kaputt) statt ohne Website")
    ap.add_argument("--web-min-conf", type=float, default=website_check.HIGH_CONF,
                    help="Website-Prüfung: Overture-Konfidenz ab (Standard 0.6; UK/FR 0.4 = zweite Stufe, nur belegte Befunde)")
    ap.add_argument("--web-no-phone", action="store_true",
                    help="Website-Prüfung UK/FR: auch Firmen ohne Telefon im Eintrag (Nummer von der eigenen Website)")
    ap.add_argument("--radar", type=int, default=0,
                    help="S2: Veränderungs-Radar – so viele bekannte Firmen mit Website je Land neu prüfen (0 = aus)")
    ap.add_argument("--radar-countries", default="US,UK,FR", help="Länder für --radar, optional mit Zeitgewicht (FR,UK:2,US)")
    ap.add_argument("--deadline-min", type=float, default=0,
                    help="nach N Minuten keine neuen Kandidaten mehr anfangen, Ergebnisse speichern (0 = aus)")
    args = ap.parse_args(argv)
    if args.diag is None:
        args.diag = 2000 if args.bio > 0 else 0
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    countries = [x.strip().upper() for x in args.countries.split(",") if x.strip()]
    # nur aktive Märkte befüllen (config/fokus.yaml, lib/laender; Inhaber 05.10.2026), HK nie
    ruht = [c for c in countries if c not in producing(countries)]
    countries = producing(countries)
    if ruht:
        log(f"Ruhende Märkte ausgelassen (nicht im Fokus): {','.join(ruht)}")
    segs = [s.strip().upper() for s in args.segments.split(",") if s.strip()]
    stats = Counter()

    guard = filters.Guard(None)
    hb = None
    if args.db:
        from lib.db import DB
        from lib.heartbeat import Heartbeat
        from lib.owner_settings import stop_if_paused
        db0 = DB()
        if args.store and stop_if_paused(db0, "lead-werk", log):  # Schalter im Dashboard (Inhaber 03.10.2026)
            return 0
        if args.store:  # Lebenszeichen fürs Dashboard (läuft/steht)
            hb = Heartbeat(db0, "lead-werk", os.environ.get("RUN_PART") or args.shard or ",".join(countries)).__enter__()
        guard = filters.Guard(DB(), preload=("overture",) + (("rge",) if args.rge else ())
                                + (("agence_bio",) if args.bio else ())
                                + (("charity_commission",) if args.charity else ())
                                + (("diagnostiqueurs",) if args.diag else ()))
        log(f"Datenbank: {len(guard.known)} Firmen schon bekannt")
    us = "US" in countries
    # --fmcsa-days 0 / --formd-days 0 = Quelle aus (Teile anderer Quellen laden sie nicht mit: spart Zeit und
    # nimmt ihnen das Risiko, an einer langsamen fremden Schnittstelle zu scheitern)
    fm, shared = (load_fmcsa(args.fmcsa_days, stats)
                  if us and args.fmcsa_days > 0 and any(s in segs for s in FMCSA_SEGMENTS) else ([], Counter()))
    fd = (load_formd(args.formd_days, args.formd_max_docs, stats)
          if us and args.formd_days > 0 and any(s in segs for s in FORM_D_SEGMENTS) else [])
    p = pools(segs, fm, fd, distinct=not args.no_distinct) if us else {}
    if us and args.ct_days:
        for k, v in ct_pools(segs, load_ct(args.ct_days, stats)).items():
            p.setdefault(k, [])
            p[k] = v + p[k]
    from enrich import Fetcher
    fetcher = Fetcher()
    if "UK" in countries and any(s in segs for s in EU_SEGMENTS):
        p.update(eu_pools(segs, load_uk(args.uk_days, stats, args.eu_pool), "UK"))
    if "FR" in countries and any(s in segs for s in EU_SEGMENTS):
        p.update(eu_pools(segs, load_fr(args.fr_days, stats), "FR"))
    for co in ("UK", "US"):
        # S1 aus Karriereseiten; FR nicht (Code du travail L5331-1, Inhaber 01.10.2026)
        if co in countries and "S1" in segs and args.s1_probe > 0:
            try:
                got = [c for c in load_careers(co, args.s1_probe, args.workers * 2, fetcher, stats)
                       if segments.fits("S1", c)[0]]
            except Exception as e:  # noqa: BLE001 - eine ausgefallene Quelle darf die anderen nicht stoppen
                log(f"S1/{co}: Karriereseiten übersprungen ({type(e).__name__}: {str(e)[:200]})")
                got = []
            key = "S1" if co == "US" else "S1/UK"  # US-Pools haben keinen Länder-Zusatz
            p[key] = got + p.get(key, [])
    if us and args.lca and "S1" in segs:
        # S1/US: Arbeitgeber mit Fachkräfte-Bedarf aus den DOL-LCA-Daten (Zwischenspeicher aus dem Job „us-auszug“)
        from extraktor.sources import us_dol_lca
        got = [c for c in filters.dedupe([c for c in us_dol_lca.load(log=log) if not filters.pre_filter(c)])
               if segments.fits("S1", c)[0]]
        stats["dol_lca_candidates"] = len(got)
        p["S1"] = got + p.get("S1", [])
    if us and args.award_days > 0 and "S1" in segs:
        # S1/US: kleine Firmen mit neuem Bundesauftrag (USAspending.gov, Quellen-Scout 04.10.2026)
        from extraktor.sources import us_usaspending
        try:
            got = [c for c in filters.dedupe([c for c in us_usaspending.load(
                       dt.date.today() - dt.timedelta(days=args.award_days), args.award_pages, log=log)
                       if not filters.pre_filter(c)]) if segments.fits("S1", c)[0]]
        except Exception as e:  # noqa: BLE001 - eine ausgefallene Quelle darf die anderen nicht stoppen
            log(f"S1/US: USAspending übersprungen ({type(e).__name__}: {str(e)[:200]})")
            got = []
        stats["us_award_candidates"] = len(got)
        p["S1"] = got + p.get("S1", [])
    if "UK" in countries and args.tender_days > 0 and "S1" in segs:
        # S1/UK: KMU mit gewonnenem öffentlichem Auftrag (Find a Tender, Quellen-Scout 02.10.2026)
        try:
            got = [c for c in load_tender(args.tender_days, args.tender_pages, stats, args.cf_pages) if segments.fits("S1", c)[0]]
        except Exception as e:  # noqa: BLE001 - eine ausgefallene Quelle darf die anderen nicht stoppen
            log(f"S1/UK: Find a Tender übersprungen ({type(e).__name__}: {str(e)[:200]})")
            got = []
        p["S1/UK"] = got + p.get("S1/UK", [])
    if args.web_check and "S2" in segs:
        website_check.load_seen()
        part = tuple(int(x) for x in args.shard.split("/")) if args.shard else None
        for co in countries:
            p[f"S2/{co}"] = load_web(co, args.s2_limit, stats, part, args.web_min_conf, args.web_no_phone)
    for co in ("UK", "FR") + S2_EXTRA + S2_NEW + (("US",) if args.us_overture else ()):
        if co in countries and "S2" in segs and not args.web_check and args.s2_limit > 0:
            known = {i for s_, i in guard.known if s_ == "overture"}
            # mehr laden als bearbeitet wird: der Abgleich mit der Datenbank (unten) wirft Gespeicherte noch raus
            p[f"S2/{co}"] = [c for c in load_overture_s2(co, args.s2_limit * 4, stats, known, args.s2_min_conf)
                             if segments.fits("S2", c)[0]]
    if "FR" in countries and "S2" in segs and args.rge > 0:
        # nach Overture anhängen: im gemeinsamen Teil zuerst die Overture-Firmen, dann RGE – außer RGE-Firmen mit
        # neuer Qualifikation (datiertes Ereignis, Premium-Jagd 05.10.2026): die kommen ganz nach vorn
        rge = load_rge(args.rge, stats, {i for s_, i in guard.known if s_ == "rge"})
        new = [c for c in rge if c["facts"].get("rge_new")]
        stats["rge_new_FR"] = len(new)
        p["S2/FR"] = new + p.get("S2/FR", []) + [c for c in rge if not c["facts"].get("rge_new")]
    if "FR" in countries and "S2" in segs and args.bio > 0:
        # neue Bio-Betriebe (datiertes Ereignis, Quellen-Scout R37): ganz nach vorn, wie neue RGE-Qualifikationen
        bio = load_bio(args.bio, stats, {i for s_, i in guard.known if s_ == "agence_bio"})
        p["S2/FR"] = bio + p.get("S2/FR", [])
    if "FR" in countries and "S2" in segs and args.diag > 0:
        # neu zertifizierte Diagnostiqueurs (datiertes Ereignis, Quellen-Scout R40): ganz nach vorn
        dg = load_diag(args.diag, stats, {i for s_, i in guard.known if s_ == "diagnostiqueurs"})
        p["S2/FR"] = dg + p.get("S2/FR", [])
    if "UK" in countries and "S2" in segs and args.charity > 0:
        # neu registrierte Charities (datiertes Ereignis, Quellen-Scout R38): ganz nach vorn
        ch = load_charity(args.charity, stats, {i for s_, i in guard.known if s_ == "charity_commission"})
        p["S2/UK"] = ch + p.get("S2/UK", [])
    if guard.known:
        p = {k: [c for c in v if (c["source"], c["source_id"]) not in guard.known] for k, v in p.items()}
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        # fest nach Quell-ID verteilt: parallele Teile bekommen nie dieselbe Firma, auch wenn ihre Listen abweichen
        import hashlib
        part = lambda c: int(hashlib.md5(f"{c['source']}:{c['source_id']}".encode()).hexdigest(), 16) % n == i
        p = {k: [c for c in v if part(c)] for k, v in p.items()}
    if guard.db is not None:
        # nach dem Aufteilen gezielt nachschlagen: nur Firmen, die noch nicht gespeichert sind
        before = sum(len(v) for v in p.values())
        # Website-Prüfung: kein Abgleich je Firma (Datenbank schonen) – das Gedächtnis des Teils verhindert doppelte
        # Prüfungen, der eindeutige Domain-Index beim Speichern doppelte Firmen
        web = website_check.SOURCE
        p = {k: [c for c in v if c["source"] == web] + guard.drop_known([c for c in v if c["source"] != web])
             for k, v in p.items()}
        log(f"Datenbank-Abgleich: {before - sum(len(v) for v in p.values())} schon gespeichert, übersprungen")
    keys = [k for k in p if p[k]]
    log("Kandidaten je Branche: " + ", ".join(f"{k} {len(p[k])}" for k in keys))

    out = Path(args.out)
    leads, failed = [], []
    radar_rep = {}
    if args.radar > 0 and "S2" in segs and guard.db is not None:
        from lib import radar
        rc, rw = radar.parse_countries(args.radar_countries)
        # Radar bekommt seinen Anteil am Zeitfenster wie eine weitere Branche
        shard = tuple(int(x) for x in args.shard.split("/")) if args.shard else (0, 1)
        radar_rep = radar.run(guard.db, rc, args.radar, fetcher, deadline=fair_deadline(deadline, len(keys) + 1),
                              workers=args.workers, log=log, apply=args.store, shard=shard, weights=rw)
        stats["radar"] = radar_rep
    for n, key in enumerate(keys):
        if deadline and time.monotonic() >= deadline:
            log(f"{key}: Zeitfenster vorbei, Branche im nächsten Lauf")
            continue
        seg = key.split("/")[0]
        key_deadline = fair_deadline(deadline, len(keys) - n)  # jedes Land bekommt seinen Anteil am Zeitfenster
        part = run_segment(seg, p.get(key, []), args.per, fetcher, shared, guard, args.workers, args.max_tries,
                           progress=lambda part: (write(out, leads + part, args.per),
                                                  hb and hb.update(processed=len(leads) + len(part),
                                                                   green=sum(l["ampel"] == "green" for l in leads + part))),
                           deadline=key_deadline)
        leads += part
        if args.store and guard.db is not None:
            from extraktor.store import store_new
            try:
                log(f"{key}: Datenbank {store_new(guard.db, guard, [row(l) for l in part if l['ampel'] != 'skip'], raw=not args.no_raw)}")
            except Exception as exc:  # noqa: BLE001 - eine Branche darf die übrigen nicht mitreißen
                failed.append(key)
                log(f"{key}: Speichern fehlgeschlagen ({type(exc).__name__}: {str(exc)[:200]}), weiter mit der nächsten")
        write(out, leads, args.per)  # nach jeder Branche sichern (Abbruch kostet nur die laufende Branche)
        if args.web_check:
            website_check.save_seen()
    sc.batch_unique([l for l in leads if l["ampel"] in ("green", "yellow")])
    for l in leads:
        l["ampel"] = ampel(l)

    per_seg = write(out, leads, args.per)
    if args.web_check:
        stats["website_check"] = dict(website_check.COUNTS)
    rep = {"date": dt.date.today().isoformat(), "stats": stats, "green_written": per_seg,
           "segments": funnel(leads, p), "web_requests": fetcher.requests}
    for co, r in radar_rep.items():  # Radar im Trichter: geprüft = bearbeitet, neue Ereignis-Leads = grün
        if isinstance(r, dict) and r.get("geprueft"):
            seg = rep["segments"].setdefault(f"S2/{co}", {"pool": 0, "processed": 0, "green": 0, "top_reasons": []})
            seg["pool"] += r.get("kandidaten", 0)
            seg["processed"] += r.get("geprueft", 0)
            seg["green"] = seg.get("green", 0) + r.get("neue_leads", 0)
            seg["premium"] = seg.get("premium", 0) + r.get("premium", 0)
            seg["radar"] = r
    (out / "bericht.json").write_text(json.dumps(rep, indent=2, default=str, ensure_ascii=False), encoding="utf-8")
    if guard.db is not None:  # Zähler je Lauf fürs Dashboard „Werke“ (Inhaber 03.10.2026)
        from lib.run_stats import record, rows_from_lead_report
        record(guard.db, "lead-werk", rows_from_lead_report(rep["segments"]), started_at, log)
    if hb:
        hb.update(processed=len(leads), green=sum(l["ampel"] == "green" for l in leads))
        hb.__exit__(None, None, None)
    log(f"fertig: {per_seg} grüne Leads -> {out}/leads_gruen.csv")
    for seg, r in rep["segments"].items():
        log(f"  {seg}: Vorrat {r['pool']}, bearbeitet {r['processed']}, grün {r.get('green', 0)}, "
            f"gelb {r.get('yellow', 0)}, rot {r.get('red', 0)} – {r['top_reasons'][:4]}")
    return 1 if failed else 0  # rot im Actions-Lauf, aber erst nachdem alle übrigen Branchen gespeichert sind


if __name__ == "__main__":
    sys.exit(main())
