#!/usr/bin/env python3
"""Kontakt-Werk: Ansprechperson aus dem Register + Telefon/E-Mail von der Firmenwebsite zusammenführen und
gegenprüfen (Inhaber 05.10.2026, Plan docs/GEHIRN-AUFBAU.md, Logik lib/kontakt.py).

Rund um die Uhr über .github/workflows/kontakt-werk.yml (Linie „kontakt“ in app/lib/werk-linien.json, Plätze aus dem
Leitstand, Autopilot nach Ertrag). Jeder Teil bearbeitet seinen ID-Ausschnitt (--shard i/n) der lieferbaren S2-Leads
US/UK/FR in dieser Reihenfolge (SQL signalwerk.kontakt_candidates):
  premium   Leads mit Premium-Bewertung (höchste zuerst)
  register  Registernummer bekannt: FR SIREN/SIRET (RGE, BODACC), UK Companies House, NY DOS
  name      UK/FR ohne Nummer: Registersuche nach Name UND Postleitzahl, nur bei genau einem Treffer
  web       eigene Website der Firma: Startseite + Kontakt/Impressum/Über uns
  alt       Gegenprüfung älter als 30 Tage
Je Lead: Register abfragen, Website höflich lesen (lib.fetch: robots.txt, gesperrte Plattformen; je Website höchstens
einmal in 20 h – watch_companies.website_fetched_at, und nie am Tag einer Live-Nachprüfung der Freigabe), dann
lib.kontakt.merge. Ergebnis in leads.kontakt/kontakt_at. Eine Person mit zwei Belegen ohne Widerspruch wird als
Ansprechperson gespeichert, wenn der Bestand noch keinen Namen hat (observations person, nichts überschrieben).
Premium-Punkt „Ansprechperson+Kontakt“: bestätigt -> premium_score + Personen-Punkte (lib.kontakt.premium_nachtrag).
Website gelesen, Kontakt dort nicht belegt (Stufe „leer“) -> Kontakt-Punkte entfallen, bis ein Beleg kommt (nur strenger).

Sendet nichts, ändert keine Sperrliste, lockert keine Prüfregel (die Drei-Stufen-Freigabe prüft jeden Lead weiter
vor Probe und Lieferung), schreibt keine Lead-Daten ins Repo (nur Zahlen). Pause im Dashboard (werke_paused
„kontakt-werk“).

  python scripts/kontaktwerk.py run --shard 0/3 --deadline-min 80 [--batch 60] [--probelauf]
  python scripts/kontaktwerk.py kpi
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import kontakt as K  # noqa: E402

WERK = "kontakt-werk"
SEGMENT = "S2"
COUNTRIES = ["US", "UK", "FR"]
GROUPS = ("premium", "register", "name", "web", "alt")
STATS_EVERY_MIN = 15
FR_API = "https://recherche-entreprises.api.gouv.fr/search"
CH_API = "https://api.company-information.service.gov.uk"
FR_INTERVAL = 1.0   # je Teil 1/s (Grenze der Schnittstelle 7/s für alle Teile zusammen)
CH_INTERVAL = 4.0   # je Teil 0,25/s (Grenze 600 je 5 min für alle Nutzer des Schlüssels)
WEB_MIN_H = 20      # dieselbe Website frühestens nach 20 h wieder
WORKERS = 6


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def shard_range(i: int, n: int) -> tuple[str, str | None]:
    n = max(1, n)
    i = max(0, min(i, n - 1))
    lo = str(uuid.UUID(int=(i << 128) // n))
    hi = str(uuid.UUID(int=((i + 1) << 128) // n)) if i < n - 1 else None
    return lo, hi


def _ts(v) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None
    except ValueError:
        return None


# ------------------------------------------------------------------------------------------------ Register
class Sources:
    """Netzzugriffe eines Teils: Register mit festem Abstand je Host, Websites über enrich.Fetcher (robots.txt)."""

    def __init__(self, ch_key: str | None):
        from enrich import Fetcher
        self.fetcher = Fetcher()
        self.session = self.fetcher.session
        self.ch_key = ch_key or None
        self.calls = Counter()

    def _fr(self, params: dict) -> list[dict]:
        def go():
            r = self.session.get(FR_API, params=params, timeout=30)
            if r.status_code == 429:
                time.sleep(5)
                r = self.session.get(FR_API, params=params, timeout=30)
            return r.json().get("results") or [] if r.status_code == 200 else []
        self.calls["fr"] += 1
        return self.fetcher.api("recherche-entreprises", FR_INTERVAL, go)

    def _ch(self, path: str, params: dict | None = None) -> dict | None:
        if not self.ch_key:
            return None

        def go():
            r = self.session.get(CH_API + path, params=params or {}, auth=(self.ch_key, ""), timeout=30)
            if r.status_code == 429:
                time.sleep(30)
                r = self.session.get(CH_API + path, params=params or {}, auth=(self.ch_key, ""), timeout=30)
            return r.json() if r.status_code == 200 else None
        self.calls["ch"] += 1
        return self.fetcher.api("companies-house", CH_INTERVAL, go)

    def uk_officer(self, number: str) -> dict | None:
        data = self._ch(f"/company/{number}/officers", {"items_per_page": 20}) or {}
        items = [o for o in data.get("items") or [] if not o.get("resigned_on")
                 and "corporate" not in (o.get("officer_role") or "")]
        items.sort(key=lambda o: 0 if o.get("officer_role") == "director" else 1)
        if not items:
            return None
        name = items[0].get("name", "")
        if "," in name:
            last, first = name.split(",", 1)
            name = f"{first.strip()} {last.strip()}"
        role = {"director": "Director", "llp-designated-member": "Designated member", "llp-member": "Member"}.get(
            items[0].get("officer_role"), "Director")
        return {"name": K._title(name), "role": role}

    def register(self, row: dict) -> dict | None:
        src, rid, country = row.get("registry_source") or "", (row.get("registry_id") or "").strip(), row["country"]
        if country == "FR" and src in ("rge", "bodacc_siren") and rid[:9].isdigit():
            siren = rid[:9]
            q = rid if len(rid) == 14 and rid.isdigit() else siren  # SIRET: Niederlassung mit eigener PLZ
            res = [r for r in self._fr({"q": q, "per_page": 1}) if r.get("siren") == siren]
            return K.fr_record(res[0], "id") if res else None
        if country == "FR" and src == "overture":
            pc = K.lead_postcode(row)
            if not pc or not K.core_name(row.get("name")):
                return None
            hit = K.fr_pick(self._fr({"q": row["name"], "code_postal": pc, "per_page": 5}), row["name"], pc)
            return K.fr_record(hit, "name_plz") if hit else None
        if country == "UK" and src == "companies_house" and rid:
            prof = self._ch(f"/company/{rid}") or {}
            if not prof:
                return None
            off = self.uk_officer(rid) or {}
            return {"name": off.get("name"), "role": off.get("role"), "source": K.UK_SOURCE, "via": "id", "id": rid,
                    "postcode": (prof.get("registered_office_address") or {}).get("postal_code") or "",
                    "active": prof.get("company_status") == "active"}
        if country == "UK" and src == "overture" and self.ch_key:
            pc = K.lead_postcode(row)
            if not pc or not K.core_name(row.get("name")):
                return None
            data = self._ch("/search/companies", {"q": row["name"], "items_per_page": 5}) or {}
            hit = K.uk_pick(data.get("items") or [], row["name"], pc)
            if not hit:
                return None
            off = self.uk_officer(hit["company_number"]) or {}
            return {"name": off.get("name"), "role": off.get("role"), "source": K.UK_SOURCE, "via": "name_plz",
                    "id": hit["company_number"], "postcode": pc, "active": True}
        if country == "US" and src == "ny_dos" and rid:
            from lib.people import ny_contact

            def go():
                return ny_contact(rid, row.get("name") or "", self.session)
            p = self.fetcher.api("data.ny.gov", 1.0, go)
            return {**p, "via": "id", "active": True, "postcode": ""} if p else None
        return None

    def website(self, row: dict) -> dict[str, str] | None:
        """Startseite + Kontakt/Impressum/Über uns derselben Domain (robots.txt über lib.fetch)."""
        from lib import websites as W
        url = (row.get("website") or "").strip()
        if not url:
            return None
        url = url if url.startswith("http") else "https://" + url
        home = self.fetcher.get(url)
        if not home:
            return None
        final, html = home
        pages = {final: html}
        for sub in W.subpage_links(html, final):
            got = self.fetcher.get(sub)
            if got:
                pages[got[0]] = got[1]
        self.calls["web"] += 1
        return pages


# ------------------------------------------------------------------------------------------------ Auswahl
def pick(db, shard: tuple[int, int], group: str, n: int, uk_register: bool) -> list[dict]:
    lo, hi = shard_range(*shard)
    return db.rpc("kontakt_candidates", {"p_countries": COUNTRIES, "p_group": group, "p_limit": n,
                                         "p_lo": lo, "p_hi": hi, "p_uk_register": uk_register}) or []


def load_context(db, rows: list[dict]) -> tuple[dict, dict, set]:
    """Kontakt- und Personen-Beobachtungen je Firma; Firmen, deren Lead heute live nachgeprüft wurde."""
    cids = sorted({r["company_id"] for r in rows})
    contact, person = {}, {}
    for i in range(0, len(cids), 100):
        part = cids[i:i + 100]
        for o in db.select("observations", {"company_id": f"in.({','.join(part)})", "kind": "eq.other",
                                            "key": "in.(contact,person)", "select": "company_id,key,details"}):
            d = o.get("details") if isinstance(o.get("details"), dict) else {}
            (contact if o["key"] == "contact" else person)[o["company_id"]] = d
    today = _now().date().isoformat()
    rechecked = set()
    lids = [r["lead_id"] for r in rows]
    for i in range(0, len(lids), 100):
        try:
            for c in db.select("lead_checks", {"lead_id": f"in.({','.join(lids[i:i + 100])})", "rechecked": "is.true",
                                               "select": "lead_id,checked_at"}):
                if str(c.get("checked_at") or "")[:10] == today:
                    rechecked.add(c["lead_id"])
        except RuntimeError:
            pass
    return contact, person, rechecked


def web_allowed(row: dict, rechecked: set, now: dt.datetime) -> bool:
    """Höchstens ein Abruf je Website in 20 h: nicht, wenn das Werk sie gerade gelesen hat oder die Freigabe den Lead
    heute live nachgeprüft hat (deren Abruf der Startseite zählt mit)."""
    if not (row.get("website") or "").strip():
        return False
    if row["lead_id"] in rechecked:
        return False
    last = _ts(row.get("website_fetched_at"))
    return not (last and now - last < dt.timedelta(hours=WEB_MIN_H))


# ------------------------------------------------------------------------------------------------ Ein Lead
def process(row: dict, src: Sources, contact: dict, person: dict, rechecked: set, today: dt.date) -> dict:
    """Netz + Zusammenführung für einen Lead. Ergebnis {'kontakt', 'fetched', 'error'}; schreibt nichts."""
    company = {"name": row.get("name"), "country": row["country"], "city": row.get("city"), "region": row.get("region"),
               "address": row.get("address"), "website": row.get("website"), "phone_main": row.get("phone_main"),
               "registry_source": row.get("registry_source"), "registry_id": row.get("registry_id")}
    out = {"fetched": False, "error": None}
    try:
        reg = src.register(row)
    except (requests.RequestException, ValueError) as e:
        out["error"] = f"register:{type(e).__name__}"
        reg = None
    site = None
    if web_allowed(row, rechecked, _now()):
        try:
            pages = src.website(row)
            out["fetched"] = True
            if pages:
                final = next(iter(pages))
                site = K.site_facts(pages, final, company, (reg or {}).get("name") or person.get("name"))
        except (requests.RequestException, ValueError, UnicodeError) as e:
            out["error"] = f"web:{type(e).__name__}"
    elif (row.get("website") or "").strip():
        out["web_spaeter"] = True
    out["kontakt"] = K.merge(company, contact, person, reg, site, today)
    out["register"] = bool(reg and reg.get("name"))
    return out


def save(db, row: dict, res: dict, person_now: dict) -> list[str]:
    """Ergebnis schreiben (nichts gelöscht, nichts überschrieben). Gibt Notizen (person_neu, premium) zurück."""
    notes = []
    k = res["kontakt"]
    upd = {"kontakt": k, "kontakt_at": _now().isoformat()}
    nach = K.premium_nachtrag(row.get("premium_score"), row.get("premium"), k)
    if nach:
        upd["premium_score"], upd["premium"] = nach
        notes.append("premium")
    db.update("leads", {"id": row["lead_id"]}, upd)
    if res.get("fetched"):
        try:
            db.update("watch_companies", {"id": row["company_id"]}, {"website_fetched_at": _now().isoformat()})
        except RuntimeError:
            pass
    p = k.get("person") or {}
    if k.get("person_neu") and p.get("name") and not (person_now or {}).get("name"):
        today = _now().date().isoformat()
        db.insert("observations", {"company_id": row["company_id"], "kind": "other", "key": "person",
                                   "first_seen": today, "last_seen": today, "source_name": p.get("source") or "Register",
                                   "details": {"name": p["name"], "role": p.get("role"), "source": p.get("source"),
                                               "belege": p.get("belege"), "by": WERK}},
                  upsert_on="company_id,kind,key")
        notes.append("person_neu")
    return notes


# ------------------------------------------------------------------------------------------------ Lauf
def stats_rows(per: dict[str, Counter]) -> list[dict]:
    out = []
    for country, c in sorted(per.items()):
        reasons = {k[2:]: v for k, v in c.items() if k.startswith("r:")}
        out.append({"segment_id": SEGMENT, "country": country, "candidates": c["geprueft"], "processed": c["geprueft"],
                    "green": c["bestaetigt"], "yellow": c["teilweise"], "red": c["widerspruch"],
                    "reasons": dict(Counter(reasons).most_common(12)),
                    "extra": {"personen_neu": c["person_neu"], "premium_nachtrag": c["premium"], "leer": c["leer"],
                              "fehler": c["fehler"], "web_spaeter": c["web_spaeter"]}})
    return out


def run(db, shard: tuple[int, int], *, deadline_min: float, batch: int, apply: bool, ch_key: str | None,
        log=print, hb=None, max_batches: int | None = None, src: Sources | None = None) -> dict:
    from lib.run_stats import record
    src = src or Sources(ch_key)
    start = _now()
    end = start + dt.timedelta(minutes=deadline_min)
    per: dict[str, Counter] = {}
    total = Counter()
    seen: set[str] = set()
    done_groups: set[str] = set()
    skipped: Counter = Counter()  # je Gruppe übersprungene (bleiben in der Auswahl) -> größer abfragen
    last_flush = start
    n_batches = 0

    def flush(started):
        if apply and per:
            record(db, WERK, stats_rows(per), started.isoformat(), log)
        per.clear()

    while _now() < end and (max_batches is None or n_batches < max_batches):
        if apply and n_batches and n_batches % 10 == 0:
            from lib.owner_settings import paused
            if paused(db, WERK):
                log("pausiert durch Inhaber – Lauf endet")
                break
        group = next((g for g in GROUPS if g not in done_groups), None)
        if group is None:
            log("nichts mehr zu prüfen in diesem Ausschnitt")
            break
        got = pick(db, shard, group, min(2000, batch + skipped[group]), bool(ch_key))
        rows = [r for r in got if r["lead_id"] not in seen][:batch]
        n_batches += 1
        # nur Leads, die jetzt etwas zum Prüfen haben (Website später = nächster Lauf, Register geht immer)
        if not rows:
            done_groups.add(group)
            continue
        seen |= {r["lead_id"] for r in rows}
        contact, person, rechecked = load_context(db, rows)
        today = _now().date()
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            results = list(ex.map(lambda r: process(r, src, contact.get(r["company_id"]) or {},
                                                    person.get(r["company_id"]) or {}, rechecked, today), rows))
        for row, res in zip(rows, results):
            c = per.setdefault(row["country"], Counter())
            k = res["kontakt"]
            if res.get("web_spaeter") and not res.get("register") and k["stufe"] in ("leer", "teilweise"):
                c["web_spaeter"] += 1  # Website heute schon gelesen: nicht als geprüft markieren
                total["web_spaeter"] += 1
                skipped[group] += 1
                continue
            if res.get("error") and k["stufe"] == "leer":
                c["fehler"] += 1
                total["fehler"] += 1
                skipped[group] += 1
                continue
            notes = []
            if apply:
                try:
                    notes = save(db, row, res, person.get(row["company_id"]) or {})
                except RuntimeError as e:
                    log(f"nicht gespeichert ({row['lead_id']}): {str(e)[:120]}")
                    c["fehler"] += 1
                    continue
            elif k.get("person_neu"):
                notes.append("person_neu")
            c["geprueft"] += 1
            c[k["stufe"]] += 1
            total["geprueft"] += 1
            total[k["stufe"]] += 1
            total["g:" + group] += 1
            for n in notes:
                c[n] += 1
                total[n] += 1
            for b in (k.get("person") or {}).get("belege") or []:
                c["r:person_" + b] += 1
            for w in k.get("widerspruch") or []:
                c["r:" + w] += 1
                total["w:" + w] += 1
        if hb is not None:
            hb.update(processed=total["geprueft"], green=total["bestaetigt"],
                      note=f"{total['geprueft']} geprüft, {total['bestaetigt']} bestätigt, {total['person_neu']} Personen neu")
        log(f"Teil {shard[0]}/{shard[1]} [{group}]: +{len(rows)} – gesamt {total['geprueft']}, bestätigt "
            f"{total['bestaetigt']}, Personen neu {total['person_neu']}")
        if (_now() - last_flush).total_seconds() >= STATS_EVERY_MIN * 60:
            flush(last_flush)
            last_flush = _now()
    flush(last_flush)
    total["batches"] = n_batches
    total.update({"abruf_" + k: v for k, v in src.calls.items()})
    return dict(total)


def report(total: dict) -> str:
    n = total.get("geprueft", 0)
    pct = f"{100 * total.get('bestaetigt', 0) / n:.1f} %" if n else "–"
    wid = sorted(((k[2:], v) for k, v in total.items() if k.startswith("w:")), key=lambda x: -x[1])[:4]
    return (f"Kontakt-Werk: {n} gegengeprüft, bestätigt {total.get('bestaetigt', 0)} ({pct}), teilweise "
            f"{total.get('teilweise', 0)}, Widerspruch {total.get('widerspruch', 0)}, Personen neu "
            f"{total.get('person_neu', 0)}, Premium-Punkt {total.get('premium', 0)}"
            + (f" – Widersprüche: {', '.join(f'{k} {v}' for k, v in wid)}" if wid else ""))


def write_kpi(db, log=print) -> list[dict]:
    """View kontakt_kpi -> kpi_daily (heutiger Tag, je Land): kontakt_geprueft_tag, kontakt_bestaetigt_tag, kontakt_personen_neu_tag (Metrik ohne Ziffern, kpi_daily_metric_check)."""
    try:
        rows = db.select("kontakt_kpi", {"select": "*"})
    except Exception as exc:  # noqa: BLE001
        log(f"Kontakt-Kennzahlen nicht lesbar: {type(exc).__name__}")
        return []
    day = _now().date().isoformat()
    out = []
    for r in rows:
        for m, col in (("kontakt_geprueft_tag", "geprueft_24h"), ("kontakt_bestaetigt_tag", "bestaetigt_24h"),
                       ("kontakt_personen_neu_tag", "personen_neu_24h")):
            out.append({"day": day, "country": r["country"], "segment_id": SEGMENT, "metric": m, "value": r.get(col) or 0})
    if out:
        try:
            db.insert("kpi_daily", [{**x, "updated_at": _now().isoformat()} for x in out],
                      upsert_on="day,country,segment_id,metric")
        except Exception as exc:  # noqa: BLE001
            log(f"kpi_daily nicht geschrieben: {type(exc).__name__}: {str(exc)[:160]}")
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--shard", default="0/1")
    r.add_argument("--deadline-min", type=float, default=80)
    r.add_argument("--batch", type=int, default=60)
    r.add_argument("--max-batches", type=int)
    r.add_argument("--probelauf", action="store_true", help="nichts speichern")
    sub.add_parser("kpi")
    a = ap.parse_args(argv)
    from lib.db import DB
    db = DB(timeout=60)
    if a.cmd == "kpi":
        for row in write_kpi(db):
            print(f"{row['country']}: {row.get('geprueft_24h')} gegengeprüft 24 h, {row.get('bestaetigt_24h')} bestätigt, "
                  f"{row.get('personen_neu_24h')} Personen neu")
        return 0
    i, _, n = a.shard.partition("/")
    shard = (int(i), int(n or 1))
    apply = not a.probelauf
    from lib.owner_settings import stop_if_paused
    if apply and stop_if_paused(db, WERK):
        return 0
    ch_key = os.environ.get("COMPANIES_HOUSE_API_KEY") or None
    if not ch_key:
        print("Ohne COMPANIES_HOUSE_API_KEY: UK nur über die Website")
    from lib.heartbeat import Heartbeat
    with Heartbeat(db if apply else None, WERK, os.environ.get("RUN_PART") or f"kontakt-{shard[0]}") as hb:
        total = run(db, shard, deadline_min=a.deadline_min, batch=a.batch, apply=apply, ch_key=ch_key, hb=hb,
                    max_batches=a.max_batches)
    line = report(total) + ("" if apply else " (Probelauf, nichts gespeichert)")
    print(line)
    if apply:
        write_kpi(db)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
