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
from extraktor.sources import fmcsa, formd, fr_bodacc, overture, uk_ch  # noqa: E402
from lib import websites as W  # noqa: E402

FORM_D_SEGMENTS = ("S1", "S5", "S9")
FMCSA_SEGMENTS = ("S4", "S2", "S5")
# Scout-Sprint 01.10.2026: S2 (Firmen ohne Website, Overture) auch in den übrigen Mail-Ländern aus countries.yaml
S2_EXTRA = ("IE", "NL", "BE", "SE")


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


def load_overture_s2(country: str, limit: int, stats: Counter, exclude: set[str] | None = None) -> list[dict]:
    """S2 UK/FR: Firmen ohne Website aus Overture; UK: Inhaber über Firmenregister + PSC, wo eindeutig.
    exclude: schon gespeicherte Overture-IDs (das Lead-Werk arbeitet sich so durch den ganzen Bestand)."""
    rows = overture.no_website(country, limit, log=log, exclude=exclude)
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
    why = guard.problem(c)
    if why:
        return {**c, "segment": seg, "ampel": "skip", "qc": {"status": "skip", "blocking": [why], "missing": [],
                                                              "warnings": [], "evidence": []},
                "sc": {"status": "skip", "problems": []}}
    try:
        E.enrich(c, fetcher, need_website=True)
    except Exception as exc:  # noqa: BLE001 - ein Fehler bei einer Firma darf den Lauf nicht beenden
        c["evidence"]["enrich_error"] = f"{type(exc).__name__}: {exc}"[:200]
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
        rep[seg] = {"pool": len(pools_.get(seg, pools_.get(seg.replace("/US", ""), []))), "processed": len(ls),
                    **Counter(l["ampel"] for l in ls), "top_reasons": reasons.most_common(8)}
    return rep


def main(argv=None) -> int:
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
    ap.add_argument("--store", action="store_true", help="grüne Leads direkt in die Datenbank schreiben (mit --db)")
    ap.add_argument("--shard", default="", help="i/n: nur jeden n-ten Kandidaten ab i (parallele Teilläufe)")
    ap.add_argument("--out", default="out/extraktor")
    ap.add_argument("--deadline-min", type=float, default=0,
                    help="nach N Minuten keine neuen Kandidaten mehr anfangen, Ergebnisse speichern (0 = aus)")
    args = ap.parse_args(argv)
    deadline = time.monotonic() + args.deadline_min * 60 if args.deadline_min else 0
    countries = [x.strip().upper() for x in args.countries.split(",") if x.strip()]
    segs = [s.strip().upper() for s in args.segments.split(",") if s.strip()]
    stats = Counter()

    guard = filters.Guard(None)
    if args.db:
        from lib.db import DB
        guard = filters.Guard(DB())
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
        if co in countries and "S1" in segs:
            try:
                got = [c for c in load_careers(co, args.s1_probe, args.workers * 2, fetcher, stats)
                       if segments.fits("S1", c)[0]]
            except Exception as e:  # noqa: BLE001 - eine ausgefallene Quelle darf die anderen nicht stoppen
                log(f"S1/{co}: Karriereseiten übersprungen ({type(e).__name__}: {str(e)[:200]})")
                got = []
            key = "S1" if co == "US" else "S1/UK"  # US-Pools haben keinen Länder-Zusatz
            p[key] = got + p.get(key, [])
    for co in ("UK", "FR") + S2_EXTRA:
        if co in countries and "S2" in segs:
            known = {i for s_, i in guard.known if s_ == "overture"}
            p[f"S2/{co}"] = [c for c in load_overture_s2(co, args.s2_limit, stats, known) if segments.fits("S2", c)[0]]
    if guard.known:
        p = {k: [c for c in v if (c["source"], c["source_id"]) not in guard.known] for k, v in p.items()}
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        # fest nach Quell-ID verteilt: parallele Teile bekommen nie dieselbe Firma, auch wenn ihre Listen abweichen
        import hashlib
        part = lambda c: int(hashlib.md5(f"{c['source']}:{c['source_id']}".encode()).hexdigest(), 16) % n == i
        p = {k: [c for c in v if part(c)] for k, v in p.items()}
    keys = [k for k in p if p[k]]
    log("Kandidaten je Branche: " + ", ".join(f"{k} {len(p[k])}" for k in keys))

    out = Path(args.out)
    leads, failed = [], []
    for key in keys:
        if deadline and time.monotonic() >= deadline:
            log(f"{key}: Zeitfenster vorbei, Branche im nächsten Lauf")
            continue
        seg = key.split("/")[0]
        part = run_segment(seg, p.get(key, []), args.per, fetcher, shared, guard, args.workers, args.max_tries,
                           progress=lambda part: write(out, leads + part, args.per), deadline=deadline)
        leads += part
        if args.store and guard.db is not None:
            from extraktor.store import store_new
            try:
                log(f"{key}: Datenbank {store_new(guard.db, guard, [row(l) for l in part if l['ampel'] != 'skip'])}")
            except Exception as exc:  # noqa: BLE001 - eine Branche darf die übrigen nicht mitreißen
                failed.append(key)
                log(f"{key}: Speichern fehlgeschlagen ({type(exc).__name__}: {str(exc)[:200]}), weiter mit der nächsten")
        write(out, leads, args.per)  # nach jeder Branche sichern (Abbruch kostet nur die laufende Branche)
    sc.batch_unique([l for l in leads if l["ampel"] in ("green", "yellow")])
    for l in leads:
        l["ampel"] = ampel(l)

    per_seg = write(out, leads, args.per)
    rep = {"date": dt.date.today().isoformat(), "stats": stats, "green_written": per_seg,
           "segments": funnel(leads, p), "web_requests": fetcher.requests}
    (out / "bericht.json").write_text(json.dumps(rep, indent=2, default=str, ensure_ascii=False), encoding="utf-8")
    log(f"fertig: {per_seg} grüne Leads -> {out}/leads_gruen.csv")
    for seg, r in rep["segments"].items():
        log(f"  {seg}: Vorrat {r['pool']}, bearbeitet {r['processed']}, grün {r.get('green', 0)}, "
            f"gelb {r.get('yellow', 0)}, rot {r.get('red', 0)} – {r['top_reasons'][:4]}")
    return 1 if failed else 0  # rot im Actions-Lauf, aber erst nachdem alle übrigen Branchen gespeichert sind


if __name__ == "__main__":
    sys.exit(main())
