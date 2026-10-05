"""Premium-Radar UK: Eigentümerwechsel laut Companies House (Quellen-Scout 05.10.2026, Premium-Jagd UK).

Anlass: Bei einer UK-Firma aus unserem S2-Bestand (Website mit Befund oder ohne Website) meldet das amtliche Register
„persons with significant control“ (PSC) in den letzten FRESH_DAYS Tagen eine neue oder ausgeschiedene Person mit
maßgeblichem Einfluss (Eigentümer ab 25 %). Datum = notified_on / ceased_on aus dem Register (echtes, datiertes
Ereignis), zusammen mit dem heute bestätigten Website-Zustand ein Kombi-Anlass (lib/premium.py).

Quellen (kostenlos, ohne Konto/Schlüssel, robots.txt von download.companieshouse.gov.uk erlaubt alles):
  BasicCompanyData (monatlich): Name + Sitz-PLZ -> Firmennummer (uk_ch.match_companies, nur eindeutige Treffer),
                                Gründungsdatum (Erstmeldung einer Neugründung ist kein Wechsel)
  PSC-Snapshot (täglich, ~33 Teile): Meldungen je Firmennummer
Höchstens ein Lauf am Tag (Job uk-psc im Lead-Werk, Zwischenspeicher-Schlüssel je Tag) – jede Datei höchstens einmal
am Tag abgerufen. Je Firma höchstens ein Startseiten-Abruf (website_check.inspect: robots.txt, 1 Abruf/s je Domain).

Ein Treffer wird ein neuer S2-Lead (wie das Radar: eigene Beobachtung filing/psc_change, bisheriger offener Lead der
Firma -> expired, Firmen, die schon an einen Käufer gingen, bleiben unberührt). Die Drei-Stufen-Freigabe prüft ihn wie
jeden anderen. Ansprechperson: die neu gemeldete natürliche Person, nur wenn die Firma noch keine hat.
"""
from __future__ import annotations

import datetime as dt
import io
import json
import os
import re
import zipfile
from collections import Counter

FRESH_DAYS = 30      # Meldung höchstens so alt (lib/premium.FRESH_MID)
INITIAL_DAYS = 90    # Meldungen bis 90 Tage nach der Gründung = Erstmeldung, kein Wechsel
SOURCE_NAME = "Companies House PSC register + website check"
PSC_URL = "https://find-and-update.company-information.service.gov.uk/company/{num}/persons-with-significant-control"
UK_PC = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")
WEB = ("website_broken", "no_https", "website_not_mobile", "website_outdated")


def _d(v) -> dt.date | None:
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def postcode(address: str) -> str:
    m = UK_PC.search((address or "").upper())
    return (m.group(1) + m.group(2)) if m else ""


def person_name(d: dict) -> str:
    """Natürliche Person aus einem PSC-Eintrag („Vorname Nachname“), sonst leer (Firmen/Erklärungen)."""
    if d.get("kind") != "individual-person-with-significant-control":
        return ""
    ne = d.get("name_elements") or {}
    first, last = (ne.get("forename") or "").strip(), (ne.get("surname") or "").strip()
    return f"{first.title()} {last.title()}" if first and last else ""


# ---------------------------------------------------------------------------- Ereignis (rein, für Tests)
def event_of(entries: list[dict], incorporated: dt.date | None, today: dt.date) -> dict | None:
    """PSC-Einträge einer Firma -> jüngster Wechsel der letzten FRESH_DAYS Tage oder None.
    Nur Zugänge kurz nach der Gründung (Erstmeldung) zählen nicht."""
    since = today - dt.timedelta(days=FRESH_DAYS)
    added, ceased = [], []
    for d in entries:
        no, ce = _d(d.get("notified_on")), _d(d.get("ceased_on"))
        if ce and since <= ce <= today:
            ceased.append((ce, person_name(d)))
        elif no and since <= no <= today and not ce:
            if incorporated and (no - incorporated).days < INITIAL_DAYS:
                continue
            added.append((no, person_name(d)))
    if not added and not ceased:
        return None
    date = max(x[0] for x in added + ceased)
    people = sorted({n for _, n in added if n})
    return {"date": date, "added": len(added), "ceased": len(ceased), "people": people,
            "person": people[0] if len(people) == 1 else ""}


def _change_text(ev: dict, d) -> str:
    if ev["added"] and ev["people"]:
        who = " and ".join(ev["people"][:2])
        verb = "was" if len(ev["people"][:2]) == 1 else "were"
        return f"{who} {verb} registered as a person with significant control (owner) at Companies House on {d(ev['date'])}"
    if ev["added"]:
        return f"Companies House registered a new person with significant control (owner) on {d(ev['date'])}"
    return f"Companies House shows a change of owner: a person with significant control stepped down on {d(ev['date'])}"


OPENER = {
    "no_https": "Chrome shows \u2018Not secure\u2019 on the website. Would help with a secure, modern site be useful?",
    "website_broken": "the website listed for the business does not show it at the moment. Would a working site be useful?",
    "website_not_mobile": "the website is not built for phones. Would a site that works well on mobile be useful?",
    "website_outdated": "the website runs on older web technology. Would a modern refresh be useful?",
}


def texts(name: str, ev: dict, sig: str, findings: list[dict], domain: str, checked: dt.date) -> dict:
    """Englische Texte, nur Belegtes: Registermeldung mit Datum + Website-Zustand mit Prüfdatum."""
    from extraktor.segments import WEB_EN, WEB_URGENCY, WEB_WHY, uk_day
    change = _change_text(ev, uk_day)
    if sig == "no_website":
        summary = f"{name}: {change}; the business has no website of its own (checked {uk_day(checked)})."
        opener = (f"Hi, I saw the recent ownership update for {name} at Companies House. Would a first website that "
                  f"helps new customers find the business be useful?")
        return {"event_summary": summary, "opener": opener, "urgency": "high",
                "urgency_reason": "A change of owner is a common moment to rework how a business presents itself; "
                                  "without a website, customers who look it up find nothing."}
    parts = []
    for f in sorted(findings, key=lambda x: WEB.index(x["type"]) if x["type"] in WEB else 9)[:2]:
        if f.get("detail") in WEB_EN:
            p = WEB_EN[f["detail"]].format(domain=domain, value=f.get("value") or "")
            if p not in parts:
                parts.append(p)
    summary = f"{name}: {change}; " + "; ".join(parts) + f" (checked {uk_day(checked)})."
    opener = f"Hi, I saw the recent ownership update for {name} at Companies House, and noticed {OPENER[sig]}"
    return {"event_summary": summary, "opener": opener, "urgency": WEB_URGENCY[sig],
            "urgency_reason": "A change of owner is a common moment to rework how a business presents itself; "
                              + WEB_WHY["en"][sig][0].lower() + WEB_WHY["en"][sig][1:]}


def lead_row(row: dict, ev: dict, num: str, sig: str, findings: list[dict], url: str, today: dt.date,
             checked: dt.date | None = None) -> tuple[dict, dict]:
    """(Beobachtung, Lead) für einen Eigentümerwechsel. row: company_id, name, website, phone_main, contact, person.
    checked: Tag der Website-Prüfung (Befund: heute; „keine Website“: Prüftag des bisherigen Leads – die Freigabe
    prüft dann vor der Weitergabe nach)."""
    checked = checked or today
    from lib import premium
    from lib.websites import site_domain
    t = texts(row["name"], ev, sig, findings, site_domain(url) if url else "", checked)
    src = PSC_URL.format(num=num)
    details = {"dated_event": {"kind": "psc_change", "date": ev["date"].isoformat()}, "company_number": num,
               "psc": {"added": ev["added"], "ceased": ev["ceased"], "people": ev["people"]},
               "findings": findings, "checked_on": checked.isoformat(), "listed_website": row.get("website") or None}
    obs = {"company_id": row["company_id"], "kind": "filing", "key": "psc_change", "title": t["event_summary"],
           "source_name": SOURCE_NAME, "source_url": src, "posted_on": ev["date"].isoformat(),
           "first_seen": today.isoformat(), "last_seen": today.isoformat(), "details": details}
    contact, person = row.get("contact") or {}, row.get("person") or {}
    pname = (person.get("name") or "").strip() or ev.get("person") or ""
    lead = {"company_id": row["company_id"], "segment_id": "S2", "country": "UK", "signal_type": sig,
            "event_summary": t["event_summary"], "event_date": ev["date"].isoformat(), "source_name": SOURCE_NAME,
            "source_url": src, "source_date": checked.isoformat(), "urgency": t["urgency"],
            "urgency_reason": t["urgency_reason"], "opener": t["opener"], "status": "new",
            **premium.columns({"signal_type": sig, "event_date": ev["date"], "source_name": SOURCE_NAME,
                               "source_url": src, "details": details, "person_name": pname,
                               "phone": contact.get("phone") or row.get("phone_main") or "",
                               "email": contact.get("email") or ""}, today)}
    return obs, lead


# ---------------------------------------------------------------------------- Register (Netz)
def psc_entries(numbers: set[str], log=print) -> dict[str, list[dict]]:
    """PSC-Einträge mit Meldung oder Austritt in den letzten FRESH_DAYS Tagen je Firmennummer (alle Snapshot-Teile,
    jeder Teil nach dem Lesen gelöscht, außer EXTRAKTOR_KEEP_PSC=1)."""
    from extraktor.sources import uk_ch
    since = (dt.date.today() - dt.timedelta(days=FRESH_DAYS + 1)).isoformat()
    out: dict[str, list[dict]] = {}
    snap = uk_ch._latest("en_pscdata.html", r'psc-snapshot-\d{4}-\d{2}-\d{2}_\d+of\d+\.zip')
    stamp, total = re.match(r"psc-snapshot-(\d{4}-\d{2}-\d{2})_\d+of(\d+)\.zip", snap).groups()
    for part in range(1, int(total) + 1):
        path = uk_ch._download(f"psc-snapshot-{stamp}_{part}of{total}.zip")
        with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
            for line in io.TextIOWrapper(f, encoding="utf-8"):
                cn = re.search(r'"company_number"\s*:\s*"([^"]+)"', line)
                if not cn or cn.group(1) not in numbers:
                    continue
                try:
                    d = json.loads(line).get("data") or {}
                except ValueError:
                    continue
                if (d.get("notified_on") or "") >= since or (d.get("ceased_on") or "") >= since:
                    out.setdefault(cn.group(1), []).append(d)
        if os.environ.get("EXTRAKTOR_KEEP_PSC") != "1":
            path.unlink(missing_ok=True)
    log(f"UK-PSC: {len(out)} von {len(numbers)} Firmen mit Meldung seit {since} (Snapshot {stamp})")
    return out


# ---------------------------------------------------------------------------- Lauf (Datenbank)
def uk_companies(db, page: int = 1000) -> list[dict]:
    """UK-Firmen aus dem S2-Bestand (Overture mit/ohne Website), seitenweise über die ID (kein offset)."""
    out, last = [], "00000000-0000-0000-0000-000000000000"
    while True:
        rows = db.select("watch_companies", {"select": "id,name,address,website,phone_main", "country": "eq.UK",
                                             "registry_source": "in.(overture,overture_web)", "id": f"gt.{last}",
                                             "order": "id", "limit": str(page)})
        out += rows
        if len(rows) < page:
            return out
        last = rows[-1]["id"]


def _one(db, cid: str, key: str) -> dict:
    r = db.select("observations", {"company_id": f"eq.{cid}", "kind": "eq.other", "key": f"eq.{key}",
                                   "select": "details", "limit": "1"})
    return (r[0].get("details") or {}) if r else {}


def run(db, fetcher, today: dt.date | None = None, apply: bool = True, log=print,
        premium_only: bool | None = None) -> dict:
    from extraktor.sources import uk_ch
    from extraktor.sources import website_check as wc
    today = today or dt.date.today()
    if premium_only is None:
        from lib.premium import only_premium
        premium_only = only_premium(db)
    st: Counter = Counter()
    comps = uk_companies(db)
    st["firmen_bestand"] = len(comps)
    cands = [{"source_id": c["id"], "name": c["name"], "zip": postcode(c.get("address") or "")} for c in comps]
    nums = uk_ch.match_companies([c for c in cands if c["zip"]], log=log)
    st["im_register"] = len(nums)
    info = uk_ch.details(set(nums.values()), log=log)
    entries = psc_entries(set(info), log=log)
    by_id = {c["id"]: c for c in comps}
    for cid, num in nums.items():
        if num not in entries:
            continue
        ev = event_of(entries[num], (info.get(num) or {}).get("incorporated_on"), today)
        if not ev:
            st["nur_erstmeldung"] += 1
            continue
        st["wechsel"] += 1
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
                # streng wie bei unsicheren Einträgen: nur Befunde auf einer geladenen Seite, die die Firma belegt
                res = wc.confirmed_only(c, wc.inspect(c, fetcher, today))
            except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
                st["fehler_website"] += 1
                log(f"UK-PSC: Website nicht prüfbar ({type(exc).__name__})")
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
        obs, lead = lead_row(row, ev, num, sig, findings, url, today, checked)
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
            if "23505" in str(e):  # gleicher Wechsel schon gespeichert
                st["schon_gespeichert"] += 1
                continue
            raise
        if not got:
            continue
        st["neue_leads"] += 1
        for old in open_:
            db.update("leads", {"id": old["id"], "status": "new"}, {"status": "expired"})
        if ev.get("person") and not (person.get("name") or "").strip():
            db.insert("observations", [{"company_id": cid, "kind": "other", "key": "person",
                                        "first_seen": today.isoformat(), "last_seen": today.isoformat(),
                                        "details": {"name": ev["person"],
                                                    "role": "Owner (person with significant control, Companies House)",
                                                    "source": "Companies House PSC register"}}],
                      upsert_on="company_id,kind,key")
    log(f"UK-PSC: {dict(st)}")
    return dict(st)
