"""Premium-Radar FR: Firma aus dem S2-Bestand hat einen öffentlichen Auftrag gewonnen (Quellen-Scout R50, 05.10.2026).

Anlass: Eine französische KMU aus unserem S2-Bestand (Overture mit/ohne Website, RGE) hat laut den „Données essentielles
de la commande publique“ (DECP) in den letzten FRESH_DAYS Tagen einen öffentlichen Auftrag erhalten. Datum =
`dateNotification` (Zustellung des Zuschlags an den Auftragnehmer). Zusammen mit dem heute bestätigten Website-Zustand
bzw. „keine Website“ ein Kombi-Anlass (lib/premium.py, Signal-Datum = echtes Ereignis): wer gerade einen Auftrag
gewonnen hat, wird von Auftraggebern, Partnern und Bewerbern gesucht.

Quelle: konsolidierte DECP (data.gouv.fr Datensatz 608c055b35eb4e6ee20eb325, Licence Ouverte 2.0), Abruf über die
offizielle Tabular-API von data.gouv.fr (ohne Konto/Schlüssel, kein robots.txt; die Datei selbst liegt auf
static.data.gouv.fr und wird nicht abgerufen). Nur Auftragnehmer der Kategorie PME, je Lauf höchstens MAX_PAGES Seiten,
1 Abruf je Sekunde, einmal am Tag (Job fr-decp im Lead-Werk, Merker je Tag). Die DECP haben keine Kontaktdaten:
Telefon, E-Mail und Website kommen aus dem eigenen Bestand; Treffer nur bei gleichem Département, gleicher Gemeinde und
gleichem Namen (oder Wortanfang), auf beiden Seiten eindeutig. Keine Ansprechperson aus der Quelle.
"""
from __future__ import annotations

import datetime as dt
import re
import time
import unicodedata
from collections import Counter

import requests

FRESH_DAYS = 14      # nur Premium-fähige Zuschläge (lib/premium.PREMIUM_MAX_AGE)
MAX_PAGES = 120      # 200 Zeilen je Seite; 14 Tage PME ≈ 6.000–7.000 Zeilen
SOURCE_NAME = "Données essentielles de la commande publique (DECP) + website check"
RESOURCE = "22847056-61df-452d-837d-8b8ceadbfc52"
API = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE}/data/"
COLUMNS = ("uid,titulaire_id,titulaire_typeIdentifiant,titulaire_nom,titulaire_categorie,titulaire_commune_nom,"
           "titulaire_departement_code,objet,dateNotification,acheteur_nom")
ENTRY_URL = API + "?uid__exact={uid}"
ATTRIBUTION = "Données essentielles de la commande publique, data.gouv.fr, Licence Ouverte 2.0"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)", "Accept": "application/json"}
WEB = ("website_broken", "no_https", "website_not_mobile", "website_outdated")
LEGAL = re.compile(r"\b(sas|sasu|sarl|eurl|sa|snc|sci|scop|scp|selarl|selas|sca|gie|ets|etablissements|ent|"
                   r"entreprise|entreprises|societe|ste|soc|cie|the)\b")
OPENER = {
    "no_https": "Chrome affiche « Non sécurisé » sur votre site. Un site moderne et "
                "sécurisé vous intéresserait-il ?",
    "website_broken": "le site indiqué ne présente pas l'entreprise en ce moment. Un site qui fonctionne "
                      "vous intéresserait-il ?",
    "website_not_mobile": "votre site n'est pas adapté aux mobiles. Un site agréable sur téléphone "
                          "vous intéresserait-il ?",
    "website_outdated": "votre site repose sur une technique web ancienne. Une modernisation vous "
                        "intéresserait-elle ?",
}
WHY = "Un marché public remporté amène donneurs d'ordre, partenaires et candidats à chercher l'entreprise en ligne ; "


def _d(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def tokens(s: str) -> list[str]:
    return re.sub(r"[^a-z0-9]+", " ", LEGAL.sub(" ", re.sub(r"['’]", " ", _ascii(s)))).split()


def commune(s: str) -> str:
    s = re.sub(r"\b(\d+(er|e)?\s*arrondissement)\b", "", _ascii(s))
    return re.sub(r"[^a-z]", "", s.replace("saint", "st"))


def dept(code: str) -> str:
    c = (code or "").strip().upper()
    return "20" if c in ("2A", "2B") else c[:2]


def names(nom: str) -> list[list[str]]:
    """Name laut DECP, dazu die Enseigne in Klammern: „DOUSSON SAS (DOUSSON ELECTRICITE)“."""
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", nom or "")
    parts = [m.group(1), m.group(2)] if m else [nom]
    return [t for t in (tokens(p) for p in parts) if len("".join(t)) >= 4]


def same_name(a: list[str], b: list[str]) -> bool:
    """Gleich, oder die Wörter des kürzeren Namens sind der Anfang des längeren (mind. 6 Zeichen):
    „Chapron“ = „Chapron Travaux Publics“, aber nicht „Atelier A“ = „Atelier Alucia“."""
    if a == b:
        return True
    s, l = (a, b) if len(a) <= len(b) else (b, a)
    return len("".join(s)) >= 6 and l[:len(s)] == s


# ---------------------------------------------------------------------------- Auswahl (rein, für Tests)
def select(rows: list[dict], today: dt.date) -> list[dict]:
    """Zuschläge an PME mit SIRET der letzten FRESH_DAYS Tage, je SIREN der jüngste."""
    best: dict[str, dict] = {}
    for r in rows:
        day = _d(r.get("dateNotification"))
        sid = re.sub(r"\D", "", r.get("titulaire_id") or "")
        if (r.get("titulaire_typeIdentifiant") or "") != "SIRET" or len(sid) != 14 or not day:
            continue
        if (r.get("titulaire_categorie") or "") != "PME" or not 0 <= (today - day).days <= FRESH_DAYS:
            continue
        if not (r.get("uid") and r.get("titulaire_nom") and r.get("titulaire_commune_nom")):
            continue
        old = best.get(sid[:9])
        if old is None or _d(old["dateNotification"]) < day:
            best[sid[:9]] = r
    return list(best.values())


def place_of(c: dict) -> tuple[str, str] | None:
    m = re.search(r"\b(\d{5})\s*$", c.get("address") or "")
    return (m.group(1)[:2], commune(c.get("city") or "")) if m else None


def match(awards: list[dict], comps: list[dict]) -> dict[str, dict]:
    """company_id -> Zuschlag: gleiches Département, gleiche Gemeinde, gleicher Name; auf beiden Seiten eindeutig."""
    by_place: dict[tuple, list[dict]] = {}
    for c in comps:
        p = place_of(c)
        if p and p[1]:
            by_place.setdefault(p, []).append(c)
    hits: dict[str, list[dict]] = {}
    for r in awards:
        ks = names(r["titulaire_nom"])
        cs = [c for c in by_place.get((dept(r.get("titulaire_departement_code")),
                                       commune(r.get("titulaire_commune_nom"))), [])
              if any(same_name(tokens(c.get("name") or ""), k) for k in ks)]
        if len(cs) == 1:
            hits.setdefault(cs[0]["id"], []).append(r)
    return {cid: rs[0] for cid, rs in hits.items()
            if len({re.sub(r"\D", "", x["titulaire_id"])[:9] for x in rs}) == 1}


def clean_objet(s: str, n: int = 90) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"\s+", " ", s).strip().strip(".;:,- ")
    s = s.replace("{", "(").replace("}", ")")
    if len(s) > n:
        s = s[:n].rsplit(" ", 1)[0].rstrip(".;:,- ") + "…"
    return s


def texts(name: str, award: dict, sig: str, findings: list[dict], domain: str, checked: dt.date) -> dict:
    """Französische Texte, nur Belegtes: Zuschlag mit Datum und Auftraggeber + Website-Zustand mit Prüfdatum."""
    from extraktor.segments import WEB_FR, WEB_URGENCY, WEB_WHY, jour
    day = _d(award["dateNotification"])
    buyer = re.sub(r"\s+", " ", award.get("acheteur_nom") or "").strip()
    objet = clean_objet(award.get("objet") or "")
    event = f"a remporté un marché public notifié le {jour(day)}" + (f" ({buyer}" if buyer else "")
    event += (f", « {objet} »)" if objet else ")") if buyer else (f" (« {objet} »)" if objet else "")
    if sig == "no_website":
        return {"event_summary": f"{name} : {event} ; l'entreprise n'a pas de site web propre (vérifié le {jour(checked)}).",
                "opener": (f"Bonjour, j'ai vu que {name} a récemment remporté un marché public. Un premier site "
                           f"pour être trouvé par de nouveaux clients vous intéresserait-il ?"),
                "urgency": "high",
                "urgency_reason": WHY + "sans site, ils ne trouvent rien."}
    parts = []
    for f in sorted(findings, key=lambda x: WEB.index(x["type"]) if x["type"] in WEB else 9)[:2]:
        if f.get("detail") in WEB_FR:
            p = WEB_FR[f["detail"]].format(domain=domain, value=f.get("value") or "")
            if p not in parts:
                parts.append(p)
    return {"event_summary": f"{name} : {event} ; " + " ; ".join(parts) + f" (vérifié le {jour(checked)}).",
            "opener": f"Bonjour, j'ai vu que {name} a récemment remporté un marché public, et j'ai remarqué que {OPENER[sig]}",
            "urgency": WEB_URGENCY[sig],
            "urgency_reason": WHY + WEB_WHY["fr"][sig][0].lower() + WEB_WHY["fr"][sig][1:]}


def lead_row(row: dict, award: dict, sig: str, findings: list[dict], url: str, today: dt.date,
             checked: dt.date | None = None) -> tuple[dict, dict]:
    """(Beobachtung, Lead). row: company_id, name, website, phone_main, contact, person."""
    checked = checked or today
    from lib import premium
    from lib.websites import site_domain
    day = _d(award["dateNotification"])
    t = texts(row["name"], award, sig, findings, site_domain(url) if url else "", checked)
    src = ENTRY_URL.format(uid=award["uid"])
    siret = re.sub(r"\D", "", award.get("titulaire_id") or "")
    details = {"dated_event": {"kind": "public_contract_award", "date": day.isoformat()},
               "decp": {"uid": award["uid"], "siret": siret, "acheteur": award.get("acheteur_nom") or "",
                        "objet": clean_objet(award.get("objet") or "", 200)},
               "attribution": ATTRIBUTION, "findings": findings, "checked_on": checked.isoformat(),
               "listed_website": row.get("website") or None}
    obs = {"company_id": row["company_id"], "kind": "filing", "key": "public_contract_award",
           "title": t["event_summary"], "source_name": SOURCE_NAME, "source_url": src, "posted_on": day.isoformat(),
           "first_seen": today.isoformat(), "last_seen": today.isoformat(), "details": details}
    contact, person = row.get("contact") or {}, row.get("person") or {}
    lead = {"company_id": row["company_id"], "segment_id": "S2", "country": "FR", "signal_type": sig,
            "event_summary": t["event_summary"], "event_date": day.isoformat(), "source_name": SOURCE_NAME,
            "source_url": src, "source_date": checked.isoformat(), "urgency": t["urgency"],
            "urgency_reason": t["urgency_reason"], "opener": t["opener"], "status": "new",
            **premium.columns({"signal_type": sig, "event_date": day, "source_name": SOURCE_NAME,
                               "source_url": src, "details": details,
                               "person_name": (person.get("name") or "").strip(),
                               "phone": contact.get("phone") or row.get("phone_main") or "",
                               "email": contact.get("email") or ""}, today)}
    return obs, lead


# ---------------------------------------------------------------------------- Quelle (Netz)
def download(today: dt.date, log=print, session=None, max_pages: int = MAX_PAGES) -> list[dict]:
    """Zuschläge an PME seit today − FRESH_DAYS, seitenweise (Cursor der API), 1 Abruf/s, Wiederholung bei Abbruch."""
    s = session or requests.Session()
    since = (today - dt.timedelta(days=FRESH_DAYS + 1)).isoformat()
    url = (f"{API}?dateNotification__greater={since}&titulaire_categorie__exact=PME&page_size=200"
           f"&columns={COLUMNS}")
    rows, pages = [], 0
    while url and pages < max_pages:
        for attempt in range(5):
            try:
                r = s.get(url, headers=UA, timeout=120)
                r.raise_for_status()
                d = r.json()
                break
            except (requests.RequestException, ValueError) as exc:
                log(f"FR-DECP: Seite {pages + 1} nicht abrufbar ({type(exc).__name__}), Versuch {attempt + 1}/5")
                time.sleep(5 * (attempt + 1))
        else:
            break
        rows += d.get("data") or []
        pages += 1
        url = (d.get("links") or {}).get("next")
        time.sleep(1)
    log(f"FR-DECP: {len(rows)} Zuschläge an PME seit {since} ({pages} Seiten)")
    return rows


def fr_companies(db, page: int = 1000) -> list[dict]:
    """FR-Firmen aus dem S2-Bestand (Overture mit/ohne Website, RGE), seitenweise über die ID (kein offset)."""
    out, last = [], "00000000-0000-0000-0000-000000000000"
    while True:
        rows = db.select("watch_companies", {"select": "id,name,city,address,website,phone_main", "country": "eq.FR",
                                             "registry_source": "in.(overture,overture_web,rge)", "id": f"gt.{last}",
                                             "order": "id", "limit": str(page)})
        out += rows
        if len(rows) < page:
            return out
        last = rows[-1]["id"]


# ---------------------------------------------------------------------------- Lauf (Datenbank)
def run(db, fetcher, today: dt.date | None = None, apply: bool = True, log=print,
        premium_only: bool | None = None, comps: list[dict] | None = None, rows: list[dict] | None = None) -> dict:
    from extraktor.sources import website_check as wc
    from lib.uk_psc_radar import _one
    today = today or dt.date.today()
    if premium_only is None:
        from lib.premium import only_premium
        premium_only = only_premium(db)
    st: Counter = Counter()
    awards = select(rows if rows is not None else download(today, log), today)
    st["zuschlaege_pme"] = len(awards)
    comps = comps if comps is not None else fr_companies(db)
    hits = match(awards, comps)
    st["im_bestand"] = len(hits)
    by_id = {c["id"]: c for c in comps}
    for cid, award in hits.items():
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
                c = {"name": co["name"], "country": "FR", "phone": contact.get("phone") or row["phone_main"],
                     "facts": {"listed_website": site, "low_confidence": True}}
                res = wc.confirmed_only(c, wc.inspect(c, fetcher, today))
            except Exception as exc:  # noqa: BLE001 - eine Firma darf den Lauf nicht beenden
                st["fehler_website"] += 1
                log(f"FR-DECP: Website nicht prüfbar ({type(exc).__name__})")
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
        obs, lead = lead_row(row, award, sig, findings, url, today, checked)
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
            if "23505" in str(e):  # gleicher Zuschlag schon gespeichert
                st["schon_gespeichert"] += 1
                continue
            raise
        if not got:
            continue
        st["neue_leads"] += 1
        for old in open_:
            db.update("leads", {"id": old["id"], "status": "new"}, {"status": "expired"})
    log(f"FR-DECP: {dict(st)}")
    return dict(st)
