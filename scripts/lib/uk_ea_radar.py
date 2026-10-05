"""Premium-Radar UK: neu eingetragene Abfall-Beförderer laut Environment Agency (Quellen-Scout R44, 05.10.2026).

Anlass: Eine UK-Firma aus unserem S2-Bestand (Overture mit/ohne Website, offener S2-Lead) wurde in den letzten
FRESH_DAYS Tagen im öffentlichen Register „Waste Carriers, Brokers and Dealers“ (England) neu eingetragen – typisch für
Handwerk, Bau, Garten, Entrümpelung, Reinigung, die gerade (wieder) Aufträge mit Abfall annehmen. Datum =
`Registration Date` aus dem Register (Lower tier gilt unbefristet = Ersteintrag; Upper-tier-Verlängerungen mit alter
Nummer fallen über die Nummernschwelle weg). Zusammen mit dem heute bestätigten Website-Zustand ein Kombi-Anlass
(lib/premium.py).

Quelle: environment.data.gov.uk/public-register (Environment Agency, ohne Konto/Schlüssel; robots.txt sperrt nur
/public-register/view/api-reference). Lizenz: Environment Agency Conditional Licence (kommerzielle Nutzung erlaubt,
Quellenangabe ATTRIBUTION). Abruf je Kalendertag eine Seite (`registrationDate=JJJJ-MM-TT`), jede Seite höchstens
einmal am Tag (läuft im Job uk-psc des Lead-Werks, Merker je Tag). Das Register hat keine Kontaktdaten: Telefon,
E-Mail und Website kommen aus dem eigenen Bestand; Treffer nur bei gleicher Postleitzahl und eindeutigem Namen.

Ansprechperson: nur bei Einzelunternehmern, deren Eintrag auf genau diesen Namen lautet und deren Firmenname im Bestand
derselbe ist (Inhaber), sonst keine (wie ICO-Register).
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import re
import time
from collections import Counter

import requests

FRESH_DAYS = 14      # nur Premium-fähige Meldungen (lib/premium.PREMIUM_MAX_AGE)
SOURCE_NAME = "Environment Agency waste carriers register + website check"
BASE = "https://environment.data.gov.uk/public-register/waste-carriers-brokers"
LIST_URL = BASE + "/registration.csv?registrationDate={day}&_limit=5000"
ENTRY_URL = BASE + "/registration/{num}"
ATTRIBUTION = "Contains Environment Agency information © Environment Agency and/or database right"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
TYPES = {"Company", "Sole trader", "Partnership"}
RENEWAL_GAP = 5000   # Upper-tier-Nummern so weit unter der kleinsten neuen Lower-tier-Nummer = Verlängerung
LEGAL = re.compile(r"\b(limited|ltd|llp|plc|cic|the|t/a|trading as)\b")
PERSON = re.compile(r"^[A-Za-z][A-Za-z'\-]+( [A-Za-z][A-Za-z'\-]+){1,2}$")


def _d(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", LEGAL.sub(" ", (s or "").lower()))


def pc(s: str) -> str:
    return re.sub(r"\s", "", (s or "").upper())


def _num(s: str) -> int:
    return int(re.sub(r"\D", "", s or "") or 0)


# ---------------------------------------------------------------------------- Auswahl (rein, für Tests)
def select(rows: list[dict], today: dt.date) -> list[dict]:
    """Neue Eintragungen (≤ FRESH_DAYS Tage) von Firmen, Einzelunternehmern und Partnerschaften mit PLZ;
    Upper-tier-Verlängerungen (alte Nummer) fallen weg."""
    lower = [_num(r.get("Registration Number")) for r in rows if (r.get("Registration Tier") or "") == "Lower"]
    floor = (min(lower) - RENEWAL_GAP) if lower else 0
    out, seen = [], set()
    for r in rows:
        num = (r.get("Registration Number") or "").strip()
        day = _d(r.get("Registration Date"))
        if not num or num in seen or (r.get("Applicant Type") or "") not in TYPES or not day:
            continue
        if not 0 <= (today - day).days <= FRESH_DAYS or not pc(r.get("Postcode")):
            continue
        if _num(num) < floor or (r.get("Renewal Date") or "").strip():
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
        k = norm(r.get("Business Name") or "")
        if len(k) < 4:
            continue
        cs = []
        for c in by_pc.get(pc(r.get("Postcode")), []):
            ck = norm(c.get("name") or "")
            if ck == k or (min(len(ck), len(k)) >= 6 and (ck in k or k in ck)):
                cs.append(c)
        if len(cs) == 1:
            hits.setdefault(cs[0]["id"], []).append(r)
    return {cid: rs[0] for cid, rs in hits.items() if len({x["Registration Number"] for x in rs}) == 1}


def owner_name(reg: dict, company_name: str) -> str:
    """Inhaber nur bei Einzelunternehmern, deren Eintrag auf eine Person lautet, die zugleich der Firmenname ist."""
    name = re.sub(r"\s+", " ", reg.get("Business Name") or "").strip()
    if (reg.get("Applicant Type") or "") != "Sole trader" or not PERSON.match(name):
        return ""
    if norm(name) != norm(company_name):
        return ""
    return " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")) for w in name.split())


def texts(name: str, day: dt.date, sig: str, findings: list[dict], domain: str, checked: dt.date) -> dict:
    """Englische Texte, nur Belegtes: Registereintrag mit Datum + Website-Zustand mit Prüfdatum."""
    from extraktor.segments import WEB_EN, WEB_URGENCY, WEB_WHY, uk_day
    from lib.uk_psc_radar import OPENER, WEB
    event = f"registered with the Environment Agency as a waste carrier on {uk_day(day)}"
    why = "A new waste carrier registration usually means the business is taking on new kinds of jobs; "
    if sig == "no_website":
        return {"event_summary": f"{name}: {event}; the business has no website of its own (checked {uk_day(checked)}).",
                "opener": (f"Hi, I saw that {name} recently registered as a waste carrier with the Environment Agency. "
                           f"Would a first website that helps new customers find the business be useful?"),
                "urgency": "high",
                "urgency_reason": why + "without a website, customers who look it up find nothing."}
    parts = []
    for f in sorted(findings, key=lambda x: WEB.index(x["type"]) if x["type"] in WEB else 9)[:2]:
        if f.get("detail") in WEB_EN:
            p = WEB_EN[f["detail"]].format(domain=domain, value=f.get("value") or "")
            if p not in parts:
                parts.append(p)
    return {"event_summary": f"{name}: {event}; " + "; ".join(parts) + f" (checked {uk_day(checked)}).",
            "opener": (f"Hi, I saw that {name} recently registered as a waste carrier with the Environment Agency, "
                       f"and noticed {OPENER[sig]}"),
            "urgency": WEB_URGENCY[sig],
            "urgency_reason": why + WEB_WHY["en"][sig][0].lower() + WEB_WHY["en"][sig][1:]}


def lead_row(row: dict, reg: dict, sig: str, findings: list[dict], url: str, today: dt.date,
             checked: dt.date | None = None) -> tuple[dict, dict]:
    """(Beobachtung, Lead). row: company_id, name, website, phone_main, contact, person."""
    checked = checked or today
    from lib import premium
    from lib.websites import site_domain
    day = _d(reg["Registration Date"])
    num = reg["Registration Number"].strip()
    t = texts(row["name"], day, sig, findings, site_domain(url) if url else "", checked)
    src = ENTRY_URL.format(num=num)
    details = {"dated_event": {"kind": "waste_carrier_registration", "date": day.isoformat()},
               "ea_registration": {"number": num, "tier": reg.get("Registration Tier") or "",
                                   "type": reg.get("Registration Type") or "",
                                   "applicant": reg.get("Applicant Type") or ""},
               "attribution": ATTRIBUTION, "findings": findings, "checked_on": checked.isoformat(),
               "listed_website": row.get("website") or None}
    obs = {"company_id": row["company_id"], "kind": "filing", "key": "waste_carrier_registration",
           "title": t["event_summary"], "source_name": SOURCE_NAME, "source_url": src, "posted_on": day.isoformat(),
           "first_seen": today.isoformat(), "last_seen": today.isoformat(), "details": details}
    contact, person = row.get("contact") or {}, row.get("person") or {}
    pname = (person.get("name") or "").strip() or owner_name(reg, row["name"])
    lead = {"company_id": row["company_id"], "segment_id": "S2", "country": "UK", "signal_type": sig,
            "event_summary": t["event_summary"], "event_date": day.isoformat(), "source_name": SOURCE_NAME,
            "source_url": src, "source_date": checked.isoformat(), "urgency": t["urgency"],
            "urgency_reason": t["urgency_reason"], "opener": t["opener"], "status": "new",
            **premium.columns({"signal_type": sig, "event_date": day, "source_name": SOURCE_NAME,
                               "source_url": src, "details": details, "person_name": pname,
                               "phone": contact.get("phone") or row.get("phone_main") or "",
                               "email": contact.get("email") or ""}, today)}
    return obs, lead


# ---------------------------------------------------------------------------- Register (Netz)
def download(today: dt.date, log=print) -> list[dict]:
    """Eintragungen der letzten FRESH_DAYS vollständigen Tage, je Tag genau ein Abruf."""
    rows: list[dict] = []
    for back in range(1, FRESH_DAYS + 1):
        day = (today - dt.timedelta(days=back)).isoformat()
        for attempt in range(3):
            try:
                r = requests.get(LIST_URL.format(day=day), headers=UA, timeout=120)
                r.raise_for_status()
                rows += list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig", errors="replace"))))
                break
            except requests.RequestException as exc:
                log(f"UK-EA: {day} nicht abrufbar ({type(exc).__name__}), Versuch {attempt + 1}/3")
                time.sleep(10 * (attempt + 1))
        time.sleep(2)
    log(f"UK-EA: {len(rows)} Eintragungen in {FRESH_DAYS} Tagen")
    return rows


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
    regs = select(regs if regs is not None else download(today, log), today)
    st["neu_eingetragen"] = len(regs)
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
                log(f"UK-EA: Website nicht prüfbar ({type(exc).__name__})")
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
        who = owner_name(reg, co["name"])
        if who and not (person.get("name") or "").strip():
            db.insert("observations", [{"company_id": cid, "kind": "other", "key": "person",
                                        "first_seen": today.isoformat(), "last_seen": today.isoformat(),
                                        "details": {"name": who, "role": "Owner (sole trader, Environment Agency)",
                                                    "source": "Environment Agency waste carriers register"}}],
                      upsert_on="company_id,kind,key")
    log(f"UK-EA: {dict(st)}")
    return dict(st)
