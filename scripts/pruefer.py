#!/usr/bin/env python3
"""Prüfer-Werk: dauerhafte Prüfer der lieferbaren Leads (Inhaber 05.10.2026: „Brauchen wir Masse-Leads? Lieber 4
dauerhafte Prüfer der Leads nach Qualitätsmerkmalen, damit die Leads immer besser werden und gut aufbereitet für den
Kunden werden.“).

Rund um die Uhr über .github/workflows/pruefer-werk.yml (Linie „pruefer“ in app/lib/werk-linien.json, Plätze aus dem
Leitstand). Jeder Teil prüft seinen Ausschnitt (--shard i/n nach Lead-ID) des lieferbaren S2-Bestands US/UK/FR
(status new, vollständige Daten wie deliveries.contact_companies) in dieser Reihenfolge:
  1. Premium-Leads (premium_score, höchste zuerst), sofern nicht in den letzten MIN_ABSTAND_H Stunden geprüft
  2. noch nie geprüfte Leads
  3. die am längsten nicht mehr geprüften Leads
Je Lead:
  - die unveränderte Drei-Stufen-Freigabe (lib/release_gate.py: Trigger echt inkl. Live-Nachprüfung höchstens 1×/Tag je
    Seite und robots.txt, Vollständigkeit, MX, Dubletten in der Auswahl, Sperrliste, Stufe 4 Inhaber-Regeln)
  - zusätzlich, nur strenger (hält zurück): Neugründung älter als 14 Tage (Anlass nicht mehr aktuell); Dublette im
    Bestand (gleiche Domain oder Telefonnummer bei einer anderen Firma mit älterem/vergebenem S2-Lead im selben Land)
  - Hinweise (Punkte-Abzug, Status bleibt): nur Rolle statt Name, Firmenname nur GROSS/klein, Lead-Text ohne Datum
    oder mit anderem Datum als der Beleg, Beleg ohne Datum
  - Aufbereitung nur, wenn eindeutig richtig: doppelte/äußere Leerzeichen im Firmennamen, Telefon ins internationale
    Format (E.164, nur wenn die Nummer gültig ist) – alles andere wird nur markiert
Ergebnis: lead_checks (Freigabe-Zeile + pruefer_punkte 0–100, pruefer_hinweise, pruefer_at), durchgefallene Leads
'held' mit Grund (release_gate.persist, nichts gelöscht), Qualitätswert (lib/quality.py), run_stats „pruefer-werk“,
kpi_daily pruefer_geprueft_24h / pruefer_qualitaet_pct (View signalwerk.pruefer_kpi).

Sendet nichts, ändert keine Sperrliste, lockert keine Prüfregel, schreibt keine Lead-Daten ins Repo (nur Zahlen).
Pause im Dashboard (owner_settings.werke_paused „pruefer-werk“).

  python scripts/pruefer.py run --shard 0/4 --deadline-min 80 [--batch 120] [--probelauf] [--offline]
  python scripts/pruefer.py kpi
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import random
import re
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

WERK = "pruefer-werk"
SEGMENT = "S2"
COUNTRIES = ("US", "UK", "FR")
MIN_ABSTAND_H = 20       # derselbe Lead frühestens nach 20 h wieder (Live-Nachprüfung ohnehin höchstens 1×/Tag)
GRUENDUNG_MAX_TAGE = 14  # Neugründung als Anlass nur bis 14 Tage
STATS_EVERY_MIN = 15     # Zähler spätestens alle 15 min schreiben (abgebrochene Teile verlieren wenig)
ABZUG = {"nur_rolle": 5, "schreibweise_gross": 5, "schreibweise_klein": 5, "text_ohne_datum": 5,
         "text_datum_abweichend": 5, "beleg_ohne_datum": 5}
TAKEN = ("reserved", "sample", "delivered", "sent")  # schon vergeben: ein neuer Lead derselben Firma ist Dublette

MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                          "september", "october", "november", "december"])}
MONTHS.update({m: i + 1 for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                                               "septembre", "octobre", "novembre", "décembre"])})
DATE_TEXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th|er)?\s+(" + "|".join(MONTHS) + r")\s+(\d{4})\b", re.I)
DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ------------------------------------------------------------------------------------------------ Ausschnitt
def shard_range(i: int, n: int) -> tuple[str, str | None]:
    """ID-Bereich [lo, hi) des Teils i von n (UUID-Raum gleichmäßig geteilt); hi None = bis zum Ende."""
    n = max(1, n)
    i = max(0, min(i, n - 1))
    lo = str(uuid.UUID(int=(i << 128) // n))
    hi = str(uuid.UUID(int=((i + 1) << 128) // n)) if i < n - 1 else None
    return lo, hi


def _range(lo: str, hi: str | None) -> dict:
    return {"and": f"(id.gte.{lo},id.lt.{hi})"} if hi else {"id": f"gte.{lo}"}


SEL = "id,company_id,country,premium_score,zuletzt_geprueft"


def _complete(db, rows: list[dict]) -> list[dict]:
    """Nur lieferbare (vollständige) Leads, einer je Firma."""
    from deliveries import contact_companies
    ids = sorted({r["company_id"] for r in rows if r.get("company_id")})
    if not ids:
        return []
    known = contact_companies(db, website_optional=True, only=ids)
    out, firms = [], set()
    for r in rows:
        cid = r.get("company_id")
        if cid in known and cid not in firms:
            firms.add(cid)
            out.append(r)
    return out


def pick_premium(db, lo, hi, n: int, cut: str) -> list[dict]:
    rows = db.select("leads", {"segment_id": f"eq.{SEGMENT}", "country": f"in.({','.join(COUNTRIES)})", "status": "eq.new",
                               "premium_score": "not.is.null", "or": f"(zuletzt_geprueft.is.null,zuletzt_geprueft.lt.{cut})",
                               **_range(lo, hi), "order": "premium_score.desc", "limit": str(n * 2), "select": SEL})
    return _complete(db, rows)[:n]


def pick_never(db, lo, hi, country: str, n: int, rng: random.Random, tries: int = 4) -> list[dict]:
    """Noch nie geprüfte Leads ab zufälligem Einstieg im eigenen Ausschnitt (wenige vollständige im großen Bestand)."""
    lo_i = uuid.UUID(lo).int
    hi_i = uuid.UUID(hi).int if hi else (1 << 128)
    got: dict[str, dict] = {}
    for t in range(tries):
        if len(got) >= n:
            break
        start = str(uuid.UUID(int=lo_i if t == tries - 1 else rng.randrange(lo_i, hi_i)))
        rows = db.select("leads", {"segment_id": f"eq.{SEGMENT}", "country": f"eq.{country}", "status": "eq.new",
                                   "zuletzt_geprueft": "is.null", **_range(start, hi), "order": "id",
                                   "limit": str(max(60, n * 6)), "select": SEL})
        for r in _complete(db, rows):
            got.setdefault(r["id"], r)
    return list(got.values())[:n]


def pick_oldest(db, lo, hi, country: str, n: int, cut: str) -> list[dict]:
    rows = db.select("leads", {"segment_id": f"eq.{SEGMENT}", "country": f"eq.{country}", "status": "eq.new",
                               "zuletzt_geprueft": f"lt.{cut}", **_range(lo, hi), "order": "zuletzt_geprueft.asc",
                               "limit": str(n * 2), "select": SEL})
    return _complete(db, rows)[:n]


def plan_batch(db, shard: tuple[int, int], n: int, rng: random.Random, now: dt.datetime, skip: set[str]) -> tuple[list[dict], dict]:
    """Premium zuerst, dann nie geprüfte, dann älteste Prüfung – je Land gleich verteilt. skip: in diesem Lauf schon geprüft."""
    lo, hi = shard_range(*shard)
    cut = (now - dt.timedelta(hours=MIN_ABSTAND_H)).isoformat()
    out: dict[str, dict] = {}
    firms: set[str] = set()
    info = Counter()

    def add(rows, kind):
        for r in rows:
            if len(out) >= n:
                return
            if r["id"] in skip or r["id"] in out or r.get("company_id") in firms:
                continue
            out[r["id"]] = r
            firms.add(r.get("company_id"))
            info[kind] += 1

    add(pick_premium(db, lo, hi, n, cut), "premium")
    for kind in ("nie", "alt"):
        for i, c in enumerate(COUNTRIES):
            rest = n - len(out)
            if rest <= 0:
                break
            share = -(-rest // (len(COUNTRIES) - i))
            rows = pick_never(db, lo, hi, c, share, rng) if kind == "nie" else pick_oldest(db, lo, hi, c, share, cut)
            add(rows, kind)
    return list(out.values()), dict(info)


# ------------------------------------------------------------------------------------------------ Prüfungen (rein)
def _d(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def dates_in_text(text: str) -> list[dt.date]:
    out = []
    for m in DATE_TEXT.finditer(text or ""):
        try:
            out.append(dt.date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1))))
        except (ValueError, KeyError):
            pass
    for m in DATE_ISO.finditer(text or ""):
        try:
            out.append(dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except ValueError:
            pass
    return out


def name_case(name: str) -> str | None:
    letters = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", name or "")
    if len(letters) < 5:
        return None
    if letters.isupper():
        return "schreibweise_gross"
    if letters.islower():
        return "schreibweise_klein"
    return None


def clean_name(name: str) -> str | None:
    """Eindeutig richtige Aufbereitung: doppelte und äußere Leerzeichen. None = nichts zu ändern."""
    n = re.sub(r"\s+", " ", name or "").strip()
    return n if n and n != name else None


def phone_fix(raw: str, region: str, country: str) -> str | None:
    """Internationales Format (E.164), nur wenn die Nummer gültig ist und sich nur die Schreibweise ändert."""
    if not raw or raw.startswith("+") and re.fullmatch(r"\+\d{6,15}", raw):
        return None
    from extraktor.qc import check_phone
    ph = check_phone(raw, region or "", country or "US")
    if not ph["ok"] or not ph["e164"]:
        return None
    digits = re.sub(r"\D", "", raw)
    e = ph["e164"]
    # nur Umformatierung: die nationale Nummer (ohne führende 0) steckt unverändert in der E.164-Nummer
    nat = digits.lstrip("0")
    return e if nat and e.endswith(nat[-9:]) else None


def extra_checks(it: dict, today: dt.date) -> tuple[list[str], list[str]]:
    """(harte Gründe = zurückhalten, Hinweise = Punkte-Abzug). Nur zusätzlich zur Freigabe, nie lockernd."""
    hard, hints = [], []
    co, pp = it.get("company") or {}, it.get("person") or {}
    ev = _d(it.get("event_date"))
    if it.get("signal_type") == "new_incorporation" and ev and (today - ev).days > GRUENDUNG_MAX_TAGE:
        hard.append(f"s1:anlass_veraltet:gruendung_{(today - ev).days}_tage")
    if not (pp.get("name") or "").strip() and (pp.get("role") or "").strip():
        hints.append("nur_rolle")
    nc = name_case(co.get("name") or "")
    if nc:
        hints.append(nc)
    summary = it.get("event_summary") or ""
    ds = dates_in_text(summary)
    src = _d(it.get("source_date"))
    if not ds:
        hints.append("text_ohne_datum")
    elif not any(d in {ev, src} for d in ds):
        hints.append("text_datum_abweichend")
    if not src:
        hints.append("beleg_ohne_datum")
    return hard, hints


def punkte(ok: bool, hints: list[str]) -> int:
    if not ok:
        return 0
    return max(0, 100 - sum(ABZUG.get(h, 0) for h in hints))


def _domains(it: dict) -> set[str]:
    from lib.release_gate import _is_freemail, domain_of
    co, ct = it.get("company") or {}, it.get("contact") or {}
    out = {domain_of(co.get("website") or "")}
    e = domain_of(ct.get("email") or "") if "@" in (ct.get("email") or "") else ""
    if e and not _is_freemail(e):
        out.add(e)
    return out - {""}


def _phone(it: dict) -> str:
    from extraktor.qc import check_phone
    co, ct = it.get("company") or {}, it.get("contact") or {}
    return check_phone(ct.get("phone") or co.get("phone_main") or "", co.get("region") or "", it.get("country") or "US")["e164"] or ""


def dup_decide(it: dict, others: list[dict]) -> str | None:
    """others: S2-Leads anderer Firmen mit gleicher Domain/Telefon {id,company_id,country,status,created_at,via}.
    Dublette, wenn ein solcher Lead im selben Land schon vergeben ist oder älter (bei Gleichstand kleinere ID) –
    so bleibt immer genau einer frei."""
    mine = (str(it.get("created_at") or ""), it["id"])
    for o in others:
        if o.get("company_id") == it.get("company_id") or o.get("country") != it.get("country"):
            continue
        if o.get("status") in TAKEN or (o.get("status") == "new" and (str(o.get("created_at") or ""), o["id"]) < mine):
            return f"s2:dublette_bestand_{o.get('via', 'firma')}"
    return None


def bestand_dups(db, items: list[dict]) -> dict[str, str]:
    """lead_id -> Grund: gleiche Domain (watch_companies.domain) oder Telefonnummer (Kontakt) bei einer anderen Firma."""
    by_dom: dict[str, set[str]] = {}
    by_tel: dict[str, set[str]] = {}
    doms = sorted({d for it in items for d in _domains(it)})
    for i in range(0, len(doms), 80):
        for r in db.select("watch_companies", {"domain": f"in.({','.join(doms[i:i + 80])})", "select": "id,domain"}):
            by_dom.setdefault(r["domain"], set()).add(r["id"])
    tels = sorted({_phone(it) for it in items} - {""})
    for i in range(0, len(tels), 60):
        q = ",".join(f'"{t}"' for t in tels[i:i + 60])
        for r in db.select("observations", {"kind": "eq.other", "key": "eq.contact", "details->>phone": f"in.({q})",
                                            "select": "company_id,phone:details->>phone"}):
            by_tel.setdefault(r["phone"], set()).add(r["company_id"])
    own = {it.get("company_id") for it in items}
    other_cids = sorted(({c for s in by_dom.values() for c in s} | {c for s in by_tel.values() for c in s}) - {None})
    leads: dict[str, list[dict]] = {}
    for i in range(0, len(other_cids), 100):
        for r in db.select("leads", {"company_id": f"in.({','.join(other_cids[i:i + 100])})", "segment_id": f"eq.{SEGMENT}",
                                     "status": f"in.(new,{','.join(TAKEN)})", "select": "id,company_id,country,status,created_at"}):
            leads.setdefault(r["company_id"], []).append(r)
    out = {}
    for it in items:
        others = []
        for d in _domains(it):
            others += [{**l, "via": "domain"} for c in by_dom.get(d, ()) for l in leads.get(c, [])]
        t = _phone(it)
        if t:
            others += [{**l, "via": "telefon"} for c in by_tel.get(t, ()) for l in leads.get(c, [])]
        # eine Firma, die selbst in dieser Auswahl liegt, wird von der Freigabe (duplicates) schon behandelt
        others = [o for o in others if o["company_id"] not in own or o["company_id"] == it.get("company_id")]
        hit = dup_decide(it, others)
        if hit:
            out[it["id"]] = hit
    return out


# ------------------------------------------------------------------------------------------------ Lauf
def apply_extra(vs, items: list[dict], today: dt.date, dups: dict[str, str]) -> dict[str, list[str]]:
    """Harte Zusatzgründe in die Urteile übernehmen (nur strenger); Rückgabe Hinweise je Lead."""
    by_id = {it["id"]: it for it in items}
    hints: dict[str, list[str]] = {}
    for v in vs:
        it = by_id.get(v.lead_id)
        if it is None:
            continue
        hard, h = extra_checks(it, today)
        if dups.get(v.lead_id):
            hard.append(dups[v.lead_id])
        hints[v.lead_id] = h
        if hard:
            v.reasons = list(v.reasons) + [r for r in hard if r not in v.reasons]
            st = min(int(r[1]) for r in hard)
            v.stage = min(v.stage or 9, st)
            v.ok = False
    return hints


def tidy(db, items: list[dict], ok_ids: set[str], log=print) -> dict[str, list[str]]:
    """Aufbereitung freigegebener Leads, nur eindeutige Fälle. Rückgabe {lead_id: ["aufbereitet:…"]}."""
    out: dict[str, list[str]] = {}
    now = _now().isoformat()
    for it in items:
        if it["id"] not in ok_ids:
            continue
        co, ct = it.get("company") or {}, it.get("contact") or {}
        try:
            n = clean_name(co.get("name") or "")
            if n and co.get("id"):
                db.update("watch_companies", {"id": co["id"]}, {"name": n, "updated_at": now})
                out.setdefault(it["id"], []).append("aufbereitet:firmenname_leerzeichen")
            raw = ct.get("phone") or ""
            e = phone_fix(raw, co.get("region") or "", it.get("country") or "")
            if e and it.get("company_id"):
                db.update("observations", {"company_id": it["company_id"], "kind": "other", "key": "contact"},
                          {"details": {**ct, "phone": e}})
                out.setdefault(it["id"], []).append("aufbereitet:telefon_international")
        except Exception as exc:  # noqa: BLE001 - Aufbereitung ist nie kritisch
            log(f"Aufbereitung übersprungen: {type(exc).__name__}")
    return out


def check_batch(db, picked: list[dict], *, apply: bool, live: bool, today: dt.date, log=print) -> dict:
    from lib import release_gate as G
    ids = [r["id"] for r in picked]
    items = G.load_items(db, ids)
    vs = G.check(db, ids, items=items, live=live, today=today)
    dups = bestand_dups(db, items)
    hints = apply_extra(vs, items, today, dups)
    tidied: dict[str, list[str]] = {}
    if apply:
        G.persist(db, vs, WERK, log=log)
        tidied = tidy(db, items, {v.lead_id for v in vs if v.ok}, log)
        at = _now().isoformat()
        rows = [{**v.row(WERK), "pruefer_punkte": punkte(v.ok, hints.get(v.lead_id, [])),
                 "pruefer_hinweise": (hints.get(v.lead_id, []) + tidied.get(v.lead_id, []))[:20], "pruefer_at": at}
                for v in vs if v.lead_id]
        for i in range(0, len(rows), 200):
            try:
                db.insert("lead_checks", rows[i:i + 200], upsert_on="lead_id")
            except Exception as exc:  # noqa: BLE001 - Punkte sind Zusatz, die Freigabe-Zeile steht schon
                log(f"Prüfer-Punkte nicht gespeichert: {type(exc).__name__}: {str(exc)[:160]}")
    return {"verdicts": vs, "hints": hints, "tidied": tidied, "dups": len(dups)}


def stats_rows(vs, hints: dict[str, list[str]], tidied: dict[str, list[str]], info: dict) -> list[dict]:
    from lib import release_gate as G
    rows = G.stats_rows(vs)
    for r in rows:
        group = [v for v in vs if (v.segment or None) == r["segment_id"] and (v.country or None) == r["country"]]
        pts = [punkte(v.ok, hints.get(v.lead_id, [])) for v in group]
        hc = Counter(h for v in group for h in hints.get(v.lead_id, []))
        r["extra"] = {**r.get("extra", {}), "punkte_avg": round(sum(pts) / len(pts), 1) if pts else None,
                      "hinweise": dict(hc.most_common(10)),
                      "aufbereitet": sum(len(tidied.get(v.lead_id, [])) for v in group), "auswahl": info}
    return rows


def write_kpi(db, log=print) -> list[dict]:
    """View pruefer_kpi -> kpi_daily (heutiger Tag, je Land): pruefer_geprueft_24h, pruefer_qualitaet_pct."""
    try:
        rows = db.select("pruefer_kpi", {"select": "*"})
    except Exception as exc:  # noqa: BLE001
        log(f"Prüfer-Kennzahlen nicht lesbar: {type(exc).__name__}")
        return []
    day = _now().date().isoformat()
    out = []
    for r in rows:
        out.append({"day": day, "country": r["country"], "segment_id": SEGMENT, "metric": "pruefer_geprueft_24h",
                    "value": r.get("geprueft_24h") or 0})
        if r.get("qualitaet_pct") is not None:
            out.append({"day": day, "country": r["country"], "segment_id": SEGMENT, "metric": "pruefer_qualitaet_pct",
                        "value": r["qualitaet_pct"]})
    if out:
        try:
            db.insert("kpi_daily", [{**x, "updated_at": _now().isoformat()} for x in out], upsert_on="day,country,segment_id,metric")
        except Exception as exc:  # noqa: BLE001
            log(f"kpi_daily nicht geschrieben: {type(exc).__name__}: {str(exc)[:160]}")
    return rows


def run(db, shard: tuple[int, int], *, deadline_min: float, batch: int, apply: bool, live: bool, log=print, hb=None,
        rng: random.Random | None = None, max_batches: int | None = None) -> dict:
    from lib.run_stats import record
    rng = rng or random.Random()
    start = _now()
    end = start + dt.timedelta(minutes=deadline_min)
    seen: set[str] = set()
    pend = {"vs": [], "hints": {}, "tidied": {}, "info": Counter()}
    total = Counter()
    last_flush = start
    empty = 0
    n_batches = 0

    def flush(started: dt.datetime):
        if apply and pend["vs"]:
            record(db, WERK, stats_rows(pend["vs"], pend["hints"], pend["tidied"], dict(pend["info"])), started.isoformat(), log)
        pend.update({"vs": [], "hints": {}, "tidied": {}, "info": Counter()})

    while _now() < end and (max_batches is None or n_batches < max_batches):
        if apply and n_batches and n_batches % 10 == 0:
            from lib.owner_settings import paused
            if paused(db, WERK):
                log("pausiert durch Inhaber – Lauf endet")
                break
        today = _now().date()
        picked, info = plan_batch(db, shard, batch, rng, _now(), seen)
        n_batches += 1
        if not picked:
            empty += 1
            if empty >= 2:
                log("nichts mehr zu prüfen in diesem Ausschnitt")
                break
            time.sleep(5)
            continue
        empty = 0
        seen |= {r["id"] for r in picked}
        res = check_batch(db, picked, apply=apply, live=live, today=today, log=log)
        vs = res["verdicts"]
        ok = sum(v.ok for v in vs)
        total["geprueft"] += len(vs)
        total["bestanden"] += ok
        total["gehalten"] += len(vs) - ok
        total["dubletten"] += res["dups"]
        total["aufbereitet"] += sum(len(x) for x in res["tidied"].values())
        total["punkte"] += sum(punkte(v.ok, res["hints"].get(v.lead_id, [])) for v in vs)
        for v in vs:
            if not v.ok:
                for r in v.reasons[:2]:
                    total["g:" + ":".join(r.split(":")[:2])] += 1
        pend["vs"] += vs
        pend["hints"].update(res["hints"])
        pend["tidied"].update(res["tidied"])
        pend["info"].update(info)
        if hb is not None:
            hb.update(processed=total["geprueft"], green=total["bestanden"],
                      note=f"{total['geprueft']} geprüft, {total['gehalten']} gehalten")
        log(f"Teil {shard[0]}/{shard[1]}: +{len(vs)} ({info}) – {ok} bestanden, gesamt {total['geprueft']}")
        if (_now() - last_flush).total_seconds() >= STATS_EVERY_MIN * 60:
            flush(last_flush)
            last_flush = _now()
    flush(last_flush)
    total["batches"] = n_batches
    return dict(total)


def report(total: dict) -> str:
    n = total.get("geprueft", 0)
    pct = f"{100 * total.get('bestanden', 0) / n:.1f} %" if n else "–"
    avg = f"{total.get('punkte', 0) / n:.0f}" if n else "–"
    top = sorted(((k[2:], v) for k, v in total.items() if k.startswith("g:")), key=lambda x: -x[1])[:5]
    return (f"Prüfer: {n} geprüft, Qualität lieferbar {pct}, {total.get('gehalten', 0)} gehalten "
            f"({total.get('dubletten', 0)} Dubletten), {total.get('aufbereitet', 0)} aufbereitet, Ø {avg} Punkte"
            + (f" – Gründe: {', '.join(f'{k} {v}' for k, v in top)}" if top else ""))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--shard", default="0/1")
    r.add_argument("--deadline-min", type=float, default=80)
    r.add_argument("--batch", type=int, default=120)
    r.add_argument("--max-batches", type=int)
    r.add_argument("--probelauf", action="store_true", help="nichts speichern")
    r.add_argument("--offline", action="store_true", help="ohne Live-Nachprüfung")
    sub.add_parser("kpi")
    a = ap.parse_args(argv)
    from lib.db import DB
    db = DB(timeout=60)
    if a.cmd == "kpi":
        for row in write_kpi(db):
            print(f"{row['country']}: {row.get('geprueft_24h')} geprüft 24 h, Qualität {row.get('qualitaet_pct')} %")
        return 0
    i, _, n = a.shard.partition("/")
    shard = (int(i), int(n or 1))
    apply = not a.probelauf
    from lib.owner_settings import stop_if_paused
    if apply and stop_if_paused(db, WERK):
        return 0
    from lib.heartbeat import Heartbeat
    with Heartbeat(db if apply else None, WERK, os.environ.get("RUN_PART") or f"pruefer-{shard[0]}") as hb:
        total = run(db, shard, deadline_min=a.deadline_min, batch=a.batch, apply=apply, live=not a.offline, hb=hb,
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
