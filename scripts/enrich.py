#!/usr/bin/env python3
"""Lead-Anreicherung: Website finden und prüfen, Firmenkontakte auslesen, Vollständigkeit bewerten.

  python scripts/enrich.py run [--limit 150] [--workers 6] [--all-segments]   # schreibt in die Datenbank
  python scripts/enrich.py report [--note]                                    # Vollständigkeit je Land/Segment
  python scripts/enrich.py try --json firmen.json                             # Probelauf ohne Datenbank
  python scripts/enrich.py try --name "ACME PLUMBING LTD" --country UK --address "M1 1AA" --registry-id 12345678

Ablauf je Firma (neueste Leads zuerst, Länder/Segmente mit Live-Landingpage zuerst):
  1. Website: vorhandene prüfen oder Kandidaten aus dem Firmennamen (DNS, dann höflicher Abruf, robots.txt).
     Übernommen wird nur, was die Seite selbst belegt (Registernummer, PLZ, voller Name, passende Vorwahl).
  2. Kontakte von der geprüften Website: zentrale Telefonnummer (Landesvorwahl passend), Rollenadresse
     (info@ … auf der eigenen Domain, MX geprüft), Adresse, ggf. Registernummer.
  3. Register: vollständige Adresse (Companies House / recherche-entreprises), Ansprechperson (lib.people),
     sonst Geschäftsführer/Gérant aus Impressum/mentions légales.
  4. Qualität: vollständig ja/nein mit Gründen (observations key 'quality').

Speichert wie watch.py: observations kind='other', key 'website' | 'contact' | 'person' | 'quality'.
Keine Suchmaschinen, keine Plattformen (lib.fetch.BLOCKED_HOSTS), höchstens ein Abruf je Seite und Tag
(jede Firma wird höchstens alle RECHECK_DAYS Tage angefasst, Seiten werden im Lauf zwischengespeichert).
Umgebungsvariablen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANIES_HOUSE_API_KEY (optional).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import websites as W  # noqa: E402
from lib.kurz import insert_decisions  # noqa: E402
from lib.fetch import FetchRefused, host_blocked, polite_get  # noqa: E402

TODAY = dt.date.today()
NOW = dt.datetime.now(dt.timezone.utc)
RECHECK_DAYS = 30
MAX_EXAMINED = 4           # höchstens so viele erreichbare Kandidaten-Domains je Firma laden
DEFAULT_LIVE = {(c, s) for c in ("UK", "US", "FR") for s in ("S1", "S2", "S4", "S5", "S9")}


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Netz: DNS, MX, höflicher Abruf mit Zwischenspeicher und Drosselung je Domain
# ---------------------------------------------------------------------------
def resolves(domain: str) -> bool:
    try:
        socket.getaddrinfo(domain, 443)
        return True
    except (OSError, UnicodeError):
        return False


def mx_ok(domain: str) -> bool | None:
    """True = MX vorhanden, False = Domain nimmt sicher keine Mail an, None = nicht prüfbar."""
    try:
        import dns.resolver
    except ImportError:
        return None
    try:
        return len(list(dns.resolver.resolve(domain, "MX", lifetime=8))) > 0
    except Exception as e:  # noqa: BLE001
        return False if type(e).__name__ in ("NXDOMAIN", "NoAnswer") else None


class Fetcher:
    """polite_get (robots.txt, gesperrte Plattformen) + 1 Anfrage/Sekunde je Domain + Zwischenspeicher im Lauf."""

    def __init__(self, per_ip: float = 0.0):
        self.session = requests.Session()
        self.cache: dict[str, tuple[str, str] | None] = {}
        self.last: dict[str, float] = {}
        self.lock = threading.Lock()
        self.requests = 0
        # Zusätzlich Abstand je Server-IP (0 = aus). Geparkte Domains liegen zu Hunderten auf wenigen IPs eines
        # Parkdienstes (z. B. Above.com 103.224.182.x); viele parallele Abrufe dorthin laufen in Zeitüberschreitungen.
        self.per_ip = float(per_ip or 0.0)
        self.ips: dict[str, str] = {}

    def _ip(self, url: str) -> str:
        host = (urlparse(url).hostname or "").lower()
        if not host:
            return ""
        if host not in self.ips:
            try:
                self.ips[host] = socket.getaddrinfo(host, None)[0][4][0]
            except (OSError, UnicodeError, IndexError):
                self.ips[host] = ""
        return self.ips[host]

    def _throttle(self, url: str) -> None:
        dom = W.site_domain(url)
        ip = self._ip(url) if self.per_ip > 0 else ""
        with self.lock:
            now = time.monotonic()
            at = max(now, self.last.get(dom, 0.0) + 1.0)
            if ip:
                at = max(at, self.last.get("ip:" + ip, 0.0) + self.per_ip)
                self.last["ip:" + ip] = at
            self.last[dom] = at
        if at > time.monotonic():
            time.sleep(at - time.monotonic())

    def api(self, host: str, interval: float, fn, *args):
        """Register-Schnittstelle mit festem Abstand je Host (Ratenlimits: recherche-entreprises 7/s,
        Companies House 600 je 5 Min.) und einem zweiten Versuch nach kurzer Pause."""
        for attempt in (1, 2):
            with self.lock:
                now = time.monotonic()
                at = max(now, self.last.get(host, 0.0) + interval)
                self.last[host] = at
            if at > time.monotonic():
                time.sleep(at - time.monotonic())
            try:
                return fn(*args)
            except requests.RequestException:
                if attempt == 2:
                    raise
                time.sleep(3)

    def get(self, url: str) -> tuple[str, str] | None:
        """(End-URL nach Weiterleitungen, HTML) oder None."""
        if url in self.cache:
            return self.cache[url]
        res = None
        if not host_blocked(url):
            self._throttle(url)
            try:
                r = polite_get(url, last_fetched=None, session=self.session)
                self.requests += 1
                ctype = r.headers.get("content-type", "")
                if r.status_code < 400 and ("html" in ctype or not ctype) and not host_blocked(r.url):
                    res = (r.url, r.text[:600000])
            except (FetchRefused, requests.RequestException, UnicodeError):
                res = None
        self.cache[url] = res
        return res


# ---------------------------------------------------------------------------
# Eine Website ansehen, Website finden
# ---------------------------------------------------------------------------
def examine(url: str, company: dict, fetcher: Fetcher, force_deep: bool = False) -> dict | None:
    home = fetcher.get(url)
    if not home and url.startswith("https://") and not url.startswith("https://www."):
        home = fetcher.get("https://www." + url[8:])
    if not home:
        return None
    final, html = home
    pages = {final: html}
    if force_deep or W.worth_deeper_look(company, html, final):
        for sub in W.subpage_links(html, final):
            got = fetcher.get(sub)
            if got:
                pages[got[0]] = got[1]
    check = W.score_match(company, pages, final)
    root = f"https://{W.site_domain(final)}" if final.startswith("https") else f"http://{W.site_domain(final)}"
    return {"url": root, "final_url": final, "pages": list(pages), **check,
            "contacts": W.extract_contacts(pages, final, company.get("country") or "", W.postcode_of(company))}


def find_website(company: dict, fetcher: Fetcher) -> dict:
    """{'method', 'site' (examine-Ergebnis oder None), 'checked'}"""
    given = (company.get("website") or "").strip()
    if given:
        url = given if given.startswith("http") else "https://" + given
        # Von Hand importierte Arbeitgeber (Karriereseiten) haben die Website aus eigener Recherche.
        method = "recheck" if company.get("registry_source") else "given"
        site = examine(url, company, fetcher, force_deep=True)
        # Belege reichen dort schwächer (Name + Ort), Weiterleitung auf fremde Marke oder Widerspruch reicht nicht.
        if site and method == "given" and not site["conflicts"] and site["score"] >= 25:
            site["verified"] = True
            site["evidence"] = site["evidence"] + ["imported_with_careers_page"]
        return {"method": method, "site": site, "checked": [W.site_domain(url)]}
    checked, best, examined = [], None, 0
    for dom in W.domain_candidates(company.get("name") or "", company.get("country") or "", company.get("industry")):
        checked.append(dom)
        if not resolves(dom):
            continue
        site = examine("https://" + dom, company, fetcher)
        if site is None:
            continue
        examined += 1
        if best is None or site["score"] > best["score"]:
            best = site
        if site["verified"] or examined >= MAX_EXAMINED:
            break
    return {"method": "candidate", "site": best, "checked": checked}


def registry_lookups(company: dict, src: str | None, rid: str, fetcher: "Fetcher", ch_key: str | None, out: dict,
                     person_known: bool) -> None:
    from lib import people, registry
    session = fetcher.session
    FR, CH = ("recherche-entreprises", 0.35), ("companies-house", 0.6)
    try:
        if not rid:
            return
        if (registry.is_postcode_only(company.get("address")) or not company.get("address")) and "registry_address" not in out:
            if src == "companies_house" and ch_key:
                out["registry_address"] = fetcher.api(*CH, registry.uk_address, rid, ch_key, session)
            elif src == "bodacc_siren":
                out["registry_address"] = (fetcher.api(*FR, registry.fr_company, rid, session) or {}).get("address")
        if not person_known and "person_registry" not in out:
            if src == "companies_house" and ch_key:
                out["person_registry"] = fetcher.api(*CH, people.uk_officer, rid, ch_key, session)
            elif src == "bodacc_siren":
                out["person_registry"] = fetcher.api(*FR, people.fr_dirigeant, rid, session)
            elif src == "ny_dos":
                out["person_registry"] = fetcher.api("data.ny.gov", 0.3, people.ny_contact, rid, company.get("name") or "", session)
    except requests.RequestException as e:
        out["registry_error"] = str(e)[:200]


def enrich_one(company: dict, fetcher: Fetcher, ch_key: str | None, person_known: bool | str) -> dict:
    """Alles Netzwerk für eine Firma; schreibt nichts. Ergebnis für apply() oder zum Ausdrucken.
    person_known: False oder der bekannte Name der Ansprechperson."""
    out: dict = {"company_id": company.get("id"), "name": company.get("name"), "country": company.get("country")}
    src, rid = company.get("registry_source"), (company.get("registry_id") or "").strip()
    # 1. Register zuerst: Ansprechperson dient auch als Beleg für die Website (Name auf der Seite)
    registry_lookups(company, src, rid, fetcher, ch_key, out, bool(person_known))
    pname = person_known if isinstance(person_known, str) else (out.get("person_registry") or {}).get("name")
    found = find_website({**company, "_person_name": pname or ""}, fetcher)
    site = found["site"]
    out["website_check"] = {
        "method": found["method"], "checked_domains": found["checked"][:12],
        "url": site["url"] if site else None, "verified": bool(site and site["verified"]),
        "score": site["score"] if site else 0, "evidence": site["evidence"] if site else [],
        "conflicts": site["conflicts"] if site else [], "pages": (site or {}).get("pages", [])[:4],
        "checked_on": TODAY.isoformat(),
    }
    contacts = {}
    if site and site["verified"]:
        c = site["contacts"]
        contacts = {"phone": c["phone"], "phone_mobile": W.is_mobile(c["phone"]) if c["phone"] else None,
                    "email": c["email"], "address_on_site": c["address"],
                    "source_url": site["final_url"], "checked_on": TODAY.isoformat()}
        if c["email"]:
            contacts["email_mx"] = mx_ok(c["email"].rsplit("@", 1)[-1])
            if contacts["email_mx"] is False:
                contacts["email"] = None
        if not rid and len(site["registry_numbers"]) == 1:
            out["registry_id_found"] = site["registry_numbers"][0]
            src = {"UK": "companies_house", "FR": "bodacc_siren"}.get(company.get("country"))
            registry_lookups(company, src, out["registry_id_found"], fetcher, ch_key, out, bool(person_known))
        out["person_site"] = c["person"]
    out["contacts"] = contacts
    return out


# ---------------------------------------------------------------------------
# Datenbank
# ---------------------------------------------------------------------------
def _obs(db, company_id: str, key: str, details: dict, source_name: str, source_url: str | None = None) -> None:
    db.insert("observations", {"company_id": company_id, "kind": "other", "key": key, "first_seen": TODAY.isoformat(),
                               "last_seen": TODAY.isoformat(), "source_name": source_name, "source_url": source_url,
                               "details": details}, upsert_on="company_id,kind,key")


def _other_obs(db, ids: list[str], key: str) -> dict[str, dict]:
    out = {}
    for i in range(0, len(ids), 100):
        for r in db.select("observations", {"company_id": f"in.({','.join(ids[i:i + 100])})", "kind": "eq.other",
                                            "key": f"eq.{key}", "select": "company_id,details,last_seen,source_url"}):
            out[r["company_id"]] = r
    return out


def apply(db, company: dict, res: dict, prev_contact: dict | None, prev_person: dict | None) -> dict:
    """Ergebnis schreiben. Nichts wird gelöscht; vorhandene Werte werden nur ergänzt."""
    cid = company["id"]
    wc = res["website_check"]
    upd: dict = {"website_checked_at": NOW.isoformat()}
    _obs(db, cid, "website", wc, "Website-Prüfung (Domain aus Firmenname, Beleg auf der Seite)", wc.get("url"))
    if wc["verified"] and wc["url"] and not company.get("website"):
        upd["website"] = wc["url"]
        dom = W.site_domain(wc["url"])
        if not db.select("watch_companies", {"domain": f"eq.{dom}", "select": "id"}):
            upd["domain"] = dom
    c = res.get("contacts") or {}
    if c:
        old = (prev_contact or {}).get("details") or {}
        merged = {**old, **{k: v for k, v in c.items() if v is not None}}
        _obs(db, cid, "contact", merged, "Company website", c.get("source_url"))
        company_phone = merged.get("phone")
        if company_phone and not company.get("phone_main"):
            upd["phone_main"] = company_phone
        res["contact_merged"] = merged
    addr = res.get("registry_address")
    if not addr and wc["verified"] and c.get("address_on_site"):
        addr = c["address_on_site"]
    if addr and (not company.get("address") or _extends(company.get("address"), addr)):
        upd["address"] = addr[:300]
    if res.get("registry_id_found") and not company.get("registry_id"):
        src = {"UK": "companies_house", "FR": "bodacc_siren"}.get(company.get("country"))
        if src and not db.select("watch_companies", {"registry_source": f"eq.{src}",
                                                     "registry_id": f"eq.{res['registry_id_found']}", "select": "id"}):
            upd.update({"registry_source": src, "registry_id": res["registry_id_found"]})
    try:
        db.update("watch_companies", {"id": cid}, upd)
    except RuntimeError:  # eindeutige Domain/Registernummer schon bei einer anderen Zeile (Dublette) -> ohne sie
        for k in ("domain", "registry_source", "registry_id"):
            upd.pop(k, None)
        db.update("watch_companies", {"id": cid}, upd)
    company.update(upd)
    person = res.get("person_registry") or res.get("person_site")
    if not ((prev_person or {}).get("details") or {}).get("name"):
        if person:
            _obs(db, cid, "person", {"name": person["name"], "role": person["role"]}, person.get("source") or "Register")
        elif "person_registry" in res and not prev_person:
            _obs(db, cid, "person", {"name": None, "role": None}, company.get("registry_source") or "register")
    else:
        person = prev_person["details"]
    q = W.assess(company, res.get("contact_merged") or (prev_contact or {}).get("details"), person, wc, TODAY.isoformat())
    _obs(db, cid, "quality", {**q, "checked_on": TODAY.isoformat()}, "Lead-Prüfung (enrich.py)")
    return q


def _extends(old: str | None, new: str) -> bool:
    """Neue Adresse enthält die alte (z. B. nur PLZ) und ist länger."""
    from lib.registry import is_postcode_only
    if not old:
        return True
    o = old.replace(" ", "").upper()
    return is_postcode_only(old) and o in new.replace(" ", "").upper() and len(new) > len(old)


def live_pairs(db) -> set[tuple[str, str]]:
    try:
        rows = db.select("landing_pages", {"status": "eq.live", "select": "country,segment_id"})
        return {(r["country"].upper(), r["segment_id"]) for r in rows} or DEFAULT_LIVE
    except RuntimeError:
        return DEFAULT_LIVE


def select_companies(db, limit: int, all_segments: bool = False) -> list[dict]:
    """Firmen mit offenen Leads: zuerst mit Website ohne Prüfung, dann neueste Leads; nur Live-Seiten-Paare."""
    pairs = live_pairs(db)
    cutoff = (TODAY - dt.timedelta(days=RECHECK_DAYS)).isoformat()
    done = {o["company_id"] for o in db.select_all("observations", {"kind": "eq.other", "key": "eq.website",
                                                                     "last_seen": f"gte.{cutoff}", "select": "company_id",
                                                                     "order": "id"})}
    q = {"status": "in.(new,sample)", "select": "company_id,country,segment_id,event_date",
         "order": "event_date.desc.nullslast,id"}
    if not all_segments:
        q["segment_id"] = f"in.({','.join(sorted({s for _, s in pairs}))})"
    order, seen = [], set()
    for l in db.select_all("leads", q):
        if l["company_id"] in seen or l["company_id"] in done:
            continue
        if not all_segments and (l["country"], l["segment_id"]) not in pairs:
            continue
        seen.add(l["company_id"])
        order.append(l["company_id"])
    cos: dict[str, dict] = {}
    cols = "id,name,country,region,city,address,website,phone_main,registry_source,registry_id"
    # Firmen mit bekannter Website zuerst – auch wenn ihre Leads älter sind (sonst kämen Arbeitgeber mit
    # Karriereseite nie dran, weil tausende Neugründungen neuer sind).
    wanted = set(order)
    for c in db.select_all("watch_companies", {"website": "not.is.null", "active": "eq.true", "select": cols,
                                               "order": "id"}):
        if c["id"] in wanted:
            cos[c["id"]] = c
    for i in range(0, min(len(order), limit * 4), 100):
        for c in db.select("watch_companies", {"id": f"in.({','.join(order[i:i + 100])})", "active": "eq.true",
                                               "select": cols}):
            cos[c["id"]] = c
    ranked = [cos[i] for i in order if i in cos]
    ranked.sort(key=lambda c: 0 if c.get("website") else 1)  # stabil: innerhalb der Gruppe neueste zuerst
    return ranked[:limit]


def cmd_run(args) -> None:
    from lib.db import DB
    db = DB()
    ch_key = os.environ.get("COMPANIES_HOUSE_API_KEY") or None
    before = completeness(db)
    companies = select_companies(db, args.limit, args.all_segments)
    ids = [c["id"] for c in companies]
    prev_contact, prev_person = _other_obs(db, ids, "contact"), _other_obs(db, ids, "person")
    log(f"{len(companies)} Firmen zur Anreicherung (davon {sum(1 for c in companies if c.get('website'))} mit Website)")
    fetcher = Fetcher()
    stats = Counter()
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(enrich_one, c, fetcher, ch_key, ((prev_person.get(c["id"]) or {}).get("details") or {})
                            .get("name") or False): c for c in companies}
        for fut in as_completed(futs):
            c = futs[fut]
            try:
                res = fut.result()
                had_site = bool(c.get("website"))
                q = apply(db, c, res, prev_contact.get(c["id"]), prev_person.get(c["id"]))
            except Exception as e:  # noqa: BLE001 – eine Firma reißt den Lauf nicht mit
                stats["errors"] += 1
                log(f"  FEHLER {c.get('name')}: {e}")
                continue
            wc = res["website_check"]
            stats["processed"] += 1
            stats["website_new"] += bool(wc["verified"] and not had_site)
            stats["website_rejected_candidate"] += bool(not had_site and wc["url"] and not wc["verified"])
            stats["website_recheck_failed"] += bool(had_site and not wc["verified"])
            stats["phone"] += bool((res.get("contacts") or {}).get("phone"))
            stats["email"] += bool((res.get("contacts") or {}).get("email"))
            stats["person"] += bool(res.get("person_registry") or res.get("person_site"))
            stats["address_full"] += bool(res.get("registry_address"))
            stats["complete"] += q["complete"]
            if args.verbose or wc["verified"]:
                log(f"  {c['country']} {c['name'][:40]:<40} site={wc['url'] or '-'} ok={wc['verified']} "
                    f"score={wc['score']} {','.join(wc['evidence'])} {','.join(wc['conflicts'])} "
                    f"tel={(res.get('contacts') or {}).get('phone') or '-'} mail={(res.get('contacts') or {}).get('email') or '-'}"
                    f" fehlt={','.join(q['missing']) or '-'}")
    after = completeness(db)
    stats["page_requests"] = fetcher.requests
    stats["seconds"] = int(time.monotonic() - started)
    log("\nLauf: " + json.dumps(dict(stats), ensure_ascii=False))
    print_completeness(before, after)
    if args.note:
        write_note(db, stats, before, after)


# ---------------------------------------------------------------------------
# Bericht
# ---------------------------------------------------------------------------
def completeness(db) -> dict:
    """Je (Land, Segment) der Live-Seiten: Firmen mit offenen Leads und davon vollständige (wie contact_companies)."""
    from deliveries import contact_companies
    pairs = live_pairs(db)
    complete = set(contact_companies(db))
    per: dict[tuple, set] = defaultdict(set)
    for l in db.select_all("leads", {"status": "in.(new,sample)", "select": "company_id,country,segment_id", "order": "id"}):
        if (l["country"], l["segment_id"]) in pairs:
            per[(l["country"], l["segment_id"])].add(l["company_id"])
    with_site = {c["id"] for c in db.select_all("watch_companies", {"website": "not.is.null", "select": "id", "order": "id"})}
    return {k: {"companies": len(v), "with_website": len(v & with_site), "complete": len(v & complete)}
            for k, v in sorted(per.items())}


def print_completeness(before: dict, after: dict | None = None) -> None:
    log("\nVollständigkeit (Firmen mit offenen Leads je Land/Segment der Live-Seiten)")
    log(f"{'Land':<5}{'Seg':<5}{'Firmen':>8}{'Website':>10}{'vollst.':>9}{'Quote':>8}" + ("   vorher: Website/vollst." if after else ""))
    for k, a in (after or before).items():
        b = before.get(k, {})
        rate = a["complete"] / a["companies"] * 100 if a["companies"] else 0
        extra = f"   {b.get('with_website', 0)}/{b.get('complete', 0)}" if after else ""
        log(f"{k[0]:<5}{k[1]:<5}{a['companies']:>8}{a['with_website']:>10}{a['complete']:>9}{rate:>7.2f}%{extra}")


def write_note(db, stats: Counter, before: dict, after: dict) -> None:
    tot = lambda d, f: sum(v[f] for v in d.values())  # noqa: E731
    insert_decisions(db, {
        "type": "daily_note", "subject": "Lead-Anreicherung",
        "reasoning": (f"{stats['processed']} Firmen geprüft: {stats['website_new']} neue geprüfte Websites, "
                      f"{stats['phone']} Telefon, {stats['email']} Sammel-E-Mail, {stats['person']} Ansprechpersonen. "
                      f"Vollständige Firmen (Live-Paare): {tot(before, 'complete')} -> {tot(after, 'complete')}."),
        "metrics": {"run": dict(stats), "after": {f"{k[0]}/{k[1]}": v for k, v in after.items()}},
        "action": "enrich.py run", "status": "done"})


def cmd_report(args) -> None:
    from lib.db import DB
    db = DB()
    now = completeness(db)
    print_completeness(now)
    q = Counter()
    for o in db.select_all("observations", {"kind": "eq.other", "key": "eq.quality", "select": "details"}):
        d = o["details"] or {}
        q["geprüft"] += 1
        q["vollständig"] += bool(d.get("complete"))
        for m in d.get("missing") or []:
            q["fehlt:" + m] += 1
        for i in d.get("issues") or []:
            q["problem:" + i] += 1
    log("\nQualität der geprüften Firmen: " + json.dumps(dict(q), ensure_ascii=False))
    if args.note:
        write_note(db, Counter({"processed": 0}), now, now)


# ---------------------------------------------------------------------------
# Probelauf ohne Datenbank
# ---------------------------------------------------------------------------
def cmd_try(args) -> None:
    if args.json:
        companies = json.loads(Path(args.json).read_text(encoding="utf-8"))
    else:
        companies = [{"id": "try", "name": args.name, "country": args.country, "address": args.address,
                      "city": args.city, "region": args.region, "website": args.website,
                      "registry_source": args.registry_source, "registry_id": args.registry_id}]
    fetcher = Fetcher()
    ch_key = os.environ.get("COMPANIES_HOUSE_API_KEY") or None
    stats = Counter()
    rows = []
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(enrich_one, c, fetcher, ch_key, False): c for c in companies}
        for fut in as_completed(futs):
            c, res = futs[fut], fut.result()
            wc, ct = res["website_check"], res.get("contacts") or {}
            person = res.get("person_registry") or res.get("person_site")
            addr = res.get("registry_address") or c.get("address") or (ct.get("address_on_site") if wc["verified"] else None)
            q = W.assess({**c, "website": wc["url"] if wc["verified"] else c.get("website"), "address": addr},
                         ct, person, wc, TODAY.isoformat())
            key = f"{c['country']}/{'given' if c.get('website') else 'search'}"
            stats[key + ":n"] += 1
            stats[key + ":site_verified"] += wc["verified"]
            stats[key + ":candidate_rejected"] += bool(wc["url"] and not wc["verified"])
            stats[key + ":phone"] += bool(ct.get("phone"))
            stats[key + ":email"] += bool(ct.get("email"))
            stats[key + ":person"] += bool(person)
            stats[key + ":address"] += bool(addr)
            stats[key + ":complete"] += q["complete"]
            rows.append(res)
            log(f"{c['country']} {c['name'][:38]:<38} site={wc['url'] or '-'} ok={wc['verified']} score={wc['score']} "
                f"[{','.join(wc['evidence'])}] {','.join(wc['conflicts'])} tel={ct.get('phone') or '-'} "
                f"mail={ct.get('email') or '-'} person={(person or {}).get('name') or '-'} "
                f"addr={'ja' if addr else '-'} fehlt={','.join(q['missing']) or '-'} {','.join(q['issues'])}")
    log(f"\n{len(companies)} Firmen, {fetcher.requests} Seitenabrufe, {int(time.monotonic() - started)} s")
    for k in sorted(stats):
        log(f"  {k:<32} {stats[k]}")
    if args.out:
        Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "report", "try"])
    ap.add_argument("--limit", type=int, default=150)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--all-segments", action="store_true", help="auch Segmente/Länder ohne Live-Seite")
    ap.add_argument("--note", action="store_true", help="Tagesnotiz in decisions schreiben")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--json", help="try: Datei mit Firmen (Liste von watch_companies-Zeilen)")
    ap.add_argument("--out", help="try: Ergebnisse als JSON speichern")
    for f in ("name", "address", "city", "region", "website", "registry-source", "registry-id"):
        ap.add_argument(f"--{f}")
    ap.add_argument("--country", default="UK")
    args = ap.parse_args(argv)
    {"run": cmd_run, "report": cmd_report, "try": cmd_try}[args.cmd](args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
