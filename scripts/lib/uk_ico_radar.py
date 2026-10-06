"""Premium-Radar UK: neu beim ICO eingetragene Firmen aus unserem Bestand (Quellen-Scout R58, 06.10.2026).

Anlass: Eine UK-Firma aus unserem S2-Bestand (Overture mit/ohne Website, offener S2-Lead) wurde in den letzten
FRESH_DAYS Tagen erstmals im ICO-Register der Gebührenzahler (Register of fee payers) als Verantwortlicher eingetragen
– typisch für eine neue Firma oder ein neues Angebot, bei dem Kundendaten anfallen. Datum = `Start_date_of_registration`
(bleibt bei Verlängerung gleich, neue Nummer nur bei Neuanmeldung). Zusammen mit dem heute bestätigten Website-Zustand
ein Kombi-Anlass (lib/premium.py).

Unterschied zu extraktor/sources/uk_ico.py (R42): dort nur Einträge MIT Kontakt im Register (wenige, ~250 je 30 T).
Hier alle frischen Einträge (~11.000 je 14 T) nur als Anlass; Telefon, E-Mail und Website kommen aus dem eigenen
Bestand, Treffer nur bei gleicher Postleitzahl und eindeutigem Namen (Organisationsname oder Handelsname, wie
lib/uk_ea_radar.py). Aus dem Register werden keine Personendaten übernommen (OGL gilt laut ICO nicht für
personenbezogene Daten): keine Ansprechperson aus dieser Quelle.

Abruf: keiner hier. Der Job uk-ico lädt das Register einmal am Tag (Merker vor dem Abruf) und legt die frischen
Einträge mit Name, Handelsnamen, PLZ, Datum und Register-Link in `out/cache/uk_ico_radar.json` ab
(uk_ico.radar_rows); der Job uk-psc liest diesen Zwischenspeicher. Je Firma höchstens ein Startseiten-Abruf
(website_check.inspect: robots.txt, 1 Abruf/s je Domain).
"""
from __future__ import annotations

import datetime as dt
import json
import os
from collections import Counter
from pathlib import Path

from lib.uk_ea_radar import norm, pc

FRESH_DAYS = 14      # nur Premium-fähige Eintragungen (lib/premium.PREMIUM_MAX_AGE)
SOURCE_NAME = "ICO register of fee payers + website check"
ENTRY_URL = "https://ico.org.uk/ESDWebPages/Entry/{num}"
CACHE = Path(os.environ.get("EXTRAKTOR_ICO_RADAR", "out/cache/uk_ico_radar.json"))
ATTRIBUTION = "Contains public sector information licensed under the Open Government Licence v3.0 (ICO)"


def _d(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def names(r: dict) -> list[str]:
    """Vergleichsschlüssel: Organisationsname (ohne Anrede) und Handelsnamen, je mindestens 4 Zeichen."""
    from extraktor.sources.uk_ico import _strip_title
    out = []
    for s in [_strip_title(r.get("Organisation_name") or "")] + (r.get("Trading_names") or "").split("|"):
        k = norm(s)
        if len(k) >= 4 and k not in out:
            out.append(k)
    return out


# ---------------------------------------------------------------------------- Auswahl (rein, für Tests)
def select(rows: list[dict], today: dt.date) -> list[dict]:
    """Eintragungen der letzten FRESH_DAYS Tage mit PLZ, keine Behörden, eine Zeile je Registernummer."""
    out, seen = [], set()
    for r in rows:
        num = (r.get("Registration_number") or "").strip()
        day = _d(r.get("Start_date_of_registration"))
        if not num or num in seen or not day or not pc(r.get("Organisation_postcode")):
            continue
        if (r.get("Public_authority") or "N").strip().upper() == "Y" or not 0 <= (today - day).days <= FRESH_DAYS:
            continue
        seen.add(num)
        out.append(r)
    return out


def match(regs: list[dict], comps: list[dict]) -> dict[str, dict]:
    """company_id -> Registereintrag: gleiche PLZ und gleicher Name (oder einer enthält den anderen, ab 6 Zeichen),
    nur wenn auf beiden Seiten genau ein Treffer."""
    from lib.uk_psc_radar import postcode
    by_pc: dict[str, list[dict]] = {}
    for c in comps:
        p = postcode(c.get("address") or "")
        if p:
            by_pc.setdefault(p, []).append(c)
    hits: dict[str, list[dict]] = {}
    for r in regs:
        keys = names(r)
        if not keys:
            continue
        cs = []
        for c in by_pc.get(pc(r.get("Organisation_postcode")), []):
            ck = norm(c.get("name") or "")
            if any(ck == k or (min(len(ck), len(k)) >= 6 and (ck in k or k in ck)) for k in keys):
                cs.append(c)
        if len(cs) == 1:
            hits.setdefault(cs[0]["id"], []).append(r)
    return {cid: rs[0] for cid, rs in hits.items() if len({x["Registration_number"] for x in rs}) == 1}


def texts(name: str, day: dt.date, sig: str, findings: list[dict], domain: str, checked: dt.date) -> dict:
    """Englische Texte, nur Belegtes: Registereintrag mit Datum + Website-Zustand mit Prüfdatum."""
    from extraktor.segments import WEB_EN, WEB_URGENCY, WEB_WHY, uk_day
    from lib.uk_psc_radar import OPENER, WEB
    event = f"registered with the Information Commissioner's Office (ICO) as a data controller on {uk_day(day)}"
    why = "A first ICO registration usually comes with a new business or a new service that handles customer data; "
    if sig == "no_website":
        return {"event_summary": f"{name}: {event}; the business has no website of its own (checked {uk_day(checked)}).",
                "opener": (f"Hi, I saw that {name} recently registered with the ICO. Would a first website that helps "
                           f"new customers find the business be useful?"),
                "urgency": "high",
                "urgency_reason": why + "without a website, customers who look it up find nothing."}
    parts = []
    for f in sorted(findings, key=lambda x: WEB.index(x["type"]) if x["type"] in WEB else 9)[:2]:
        if f.get("detail") in WEB_EN:
            p = WEB_EN[f["detail"]].format(domain=domain, value=f.get("value") or "")
            if p not in parts:
                parts.append(p)
    return {"event_summary": f"{name}: {event}; " + "; ".join(parts) + f" (checked {uk_day(checked)}).",
            "opener": f"Hi, I saw that {name} recently registered with the ICO, and noticed {OPENER[sig]}",
            "urgency": WEB_URGENCY[sig],
            "urgency_reason": why + WEB_WHY["en"][sig][0].lower() + WEB_WHY["en"][sig][1:]}


def lead_row(row: dict, reg: dict, sig: str, findings: list[dict], url: str, today: dt.date,
             checked: dt.date | None = None) -> tuple[dict, dict]:
    """(Beobachtung, Lead). row: company_id, name, website, phone_main, contact, person."""
    checked = checked or today
    from lib import premium
    from lib.websites import site_domain
    day = _d(reg["Start_date_of_registration"])
    num = reg["Registration_number"].strip()
    t = texts(row["name"], day, sig, findings, site_domain(url) if url else "", checked)
    src = (reg.get("Public_register_entry_URL") or "").strip() or ENTRY_URL.format(num=num)
    details = {"dated_event": {"kind": "ico_registration", "date": day.isoformat()},
               "ico_registration": {"number": num, "tier": reg.get("Payment_tier") or ""},
               "attribution": ATTRIBUTION, "findings": findings, "checked_on": checked.isoformat(),
               "listed_website": row.get("website") or None}
    obs = {"company_id": row["company_id"], "kind": "filing", "key": "ico_registration",
           "title": t["event_summary"], "source_name": SOURCE_NAME, "source_url": src, "posted_on": day.isoformat(),
           "first_seen": today.isoformat(), "last_seen": today.isoformat(), "details": details}
    contact, person = row.get("contact") or {}, row.get("person") or {}
    lead = {"company_id": row["company_id"], "segment_id": "S2", "country": "UK", "signal_type": sig,
            "event_summary": t["event_summary"], "event_date": day.isoformat(), "source_name": SOURCE_NAME,
            "source_url": src, "source_date": checked.isoformat(), "urgency": t["urgency"],
            "urgency_reason": t["urgency_reason"], "opener": t["opener"], "status": "new",
            **premium.columns({"signal_type": sig, "event_date": day, "source_name": SOURCE_NAME,
                               "source_url": src, "details": details,
                               "person_name": (person.get("name") or "").strip(),
                               "phone": contact.get("phone") or row.get("phone_main") or "",
                               "email": contact.get("email") or ""}, today)}
    return obs, lead


def cached() -> list[dict]:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else []
    except ValueError:
        return []


# ---------------------------------------------------------------------------- Lauf (Datenbank)
def run(db, fetcher, today: dt.date | None = None, apply: bool = True, log=print,
        premium_only: bool | None = None, comps: list[dict] | None = None, regs: list[dict] | None = None) -> dict:
    from extraktor.sources import website_check as wc
    from lib.uk_psc_radar import WEB, _one, uk_companies
    today = today or dt.date.today()
    if premium_only is None:
        from lib.premium import only_premium
        premium_only = only_premium(db)
    st: Counter = Counter()
    regs = select(regs if regs is not None else cached(), today)
    st["neu_eingetragen"] = len(regs)
    if not regs:
        log("UK-ICO-Radar: kein Zwischenspeicher mit frischen Eintragungen (Job uk-ico)")
        return dict(st)
    comps = comps if comps is not None else uk_companies(db)
    hits = match(regs, comps)
    st["im_bestand"] = len(hits)
    by_id = {c["id"]: c for c in comps}
    for cid, reg in hits.items():
        co = by_id[cid]
        leads = db.select("leads", {"company_id": f"eq.{cid}", "select": "id,status,signal_type,segment_id,source_date"})
        if any(x["status"] in ("sample", "delivered", "reserved") for x in leads):
            st["schon_vergeben"] += 1
            continue
        open_ = [x for x in leads if x["status"] == "new" and x["segment_id"] == "S2"]
        if not open_:
            st["kein_offener_lead"] += 1
            continue
        contact, person = _one(db, cid, "contact"), _one(db, cid, "person")
        row = {"company_id": cid, "name": co["name"], "website": co.get("website") or "",
               "phone_main": co.get("phone_main") or "", "contact": contact, "person": person}
        url, findings, checked = "", [], today
        if row["website"]:
            site = row["website"] if "//" in row["website"] else "http://" + row["website"]
            try:
                c = {"name": co["name"], "country": "UK", "phone": contact.get("phone") or row["phone_main"],
                     "facts": {"listed_website": site, "low_confidence": True}}
                res = wc.confirmed_only(c, wc.inspect(c, fetcher, today))
            except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
                st["fehler_website"] += 1
                log(f"UK-ICO-Radar: Website nicht prüfbar ({type(exc).__name__})")
                continue
            findings = [f for f in res.get("findings") or [] if f.get("type") in WEB]
            if not findings:
                st["website_ohne_befund"] += 1
                continue
            sig, url = wc.primary(findings), res.get("final_url") or site
        elif open_[0]["signal_type"] == "no_website":
            sig = "no_website"
            checked = _d(open_[0].get("source_date")) or today
        else:
            st["ohne_website_und_befund"] += 1
            continue
        obs, lead = lead_row(row, reg, sig, findings, url, today, checked)
        st["kandidaten"] += 1
        st[f"stufe:{lead['premium']['tier']}"] += 1
        if premium_only and lead["premium"]["tier"] != "premium":
            st["verworfen_standard"] += 1  # Nur Premium (Inhaber 05.10.2026)
            continue
        if not apply:
            continue
        try:
            o = db.insert("observations", [obs], upsert_on="company_id,kind,key")
            lead["observation_ids"] = [o[0]["id"]] if o else []
            got = db.insert("leads", [lead])
        except RuntimeError as e:
            if "23505" in str(e):  # gleiche Eintragung schon gespeichert
                st["schon_gespeichert"] += 1
                continue
            raise
        if not got:
            continue
        st["neue_leads"] += 1
        for old in open_:
            db.update("leads", {"id": old["id"], "status": "new"}, {"status": "expired"})
    log(f"UK-ICO-Radar: {dict(st)}")
    return dict(st)
