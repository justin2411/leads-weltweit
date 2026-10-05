"""Kontakt-Werk: Ansprechperson aus dem Register und Telefon/E-Mail von der Firmenwebsite zusammenführen und
gegenprüfen (Inhaber 05.10.2026, Plan docs/GEHIRN-AUFBAU.md). Reine Logik ohne Netz – Abrufe in scripts/kontaktwerk.py.

Quellen (nur erlaubte, kostenlos): Companies House (Officers, Sitz-PLZ), Registre national des entreprises über
recherche-entreprises.api.gouv.fr (Dirigeants, Sitz-PLZ), NY Department of State, die eigene Website der Firma
(Startseite, Kontakt, Impressum/mentions légales). Nichts wird erraten: E-Mail-Adressen stammen nur von Seiten oder
aus dem Bestand, nie aus Name + Domain gebaut.

Belege je Angabe (wie lib.websites.score_match: Name/Nummer/PLZ):
  Person   register_id (Register über die Nummer der Firma), register_name + plz (Suche nach Name UND Postleitzahl,
           genau ein Treffer), plz (Sitz-PLZ laut Register = PLZ des Leads), website_name (Nachname steht auf der
           eigenen Website), impressum (Impressum nennt die Person mit Label), email_name (Nachname in der E-Mail)
  Telefon  website (Nummer steht auf der eigenen Website)
  E-Mail   website (Adresse steht auf der eigenen Website), domain (Domain = Website), email_name
Eine Person gilt erst ab ZWEI Belegen und ohne Widerspruch (andere PLZ, anderer Name im Impressum, Firma nicht
aktiv, anderer Name im Bestand). Stufe „bestaetigt“ = Person mit Namen + Telefon und E-Mail mit mindestens einem
Beleg = Premium-Punkt „Ansprechperson+Kontakt“.

Das Ergebnis ändert nie, OB ein Lead rausgeht – das entscheidet allein die Drei-Stufen-Freigabe (lib/release_gate.py).
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata

from lib import premium as P
from lib import websites as W

VERSION = 2  # 2: Registersuche Name+PLZ auch für Radar-Firmen (overture_web), Premium-Labor 05.10.2026
MIN_BELEGE_PERSON = 2
RECHECK_DAYS = 30
FR_SOURCE = "Registre national des entreprises"
UK_SOURCE = "Companies House"
PARTICLES = {"de", "du", "des", "la", "le", "van", "von", "der", "den", "da", "di", "del", "mc", "st"}
PERSON_WIDERSPRUCH = {"plz_register_abweichend", "register_inaktiv", "person_website_abweichend",
                      "person_bestand_abweichend"}
# Premium-Punkte aus scripts/lib/premium.py (Ansprechperson 15, Premium ab 70 und frisch)
PREMIUM_PERSON = P.POINTS["person"]
PREMIUM_CONTACT = P.POINTS["contact"]
PREMIUM_MIN = P.PREMIUM_MIN


def fold(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def last_name(name: str | None) -> str:
    """Nachname (letztes Wort ohne Partikel), gefaltet; leer, wenn kürzer als 3 Zeichen."""
    words = [w for w in fold(name).split() if w not in PARTICLES]
    if len(words) < 2:
        return ""
    ln = words[-1]
    return ln if len(ln) >= 3 else ""


def same_person(a: str | None, b: str | None) -> bool:
    la, lb = last_name(a), last_name(b)
    return bool(la) and la == lb


def name_in_text(name: str | None, text: str) -> bool:
    ln = last_name(name)
    return bool(ln) and f" {ln} " in f" {fold(text)} "


def email_has_name(email: str | None, name: str | None) -> bool:
    ln = last_name(name)
    local = re.sub(r"[^a-z0-9]", "", fold((email or "").split("@")[0]))
    return bool(ln) and len(ln) >= 4 and ln.replace(" ", "") in local


def lead_postcode(company: dict) -> str:
    """Postleitzahl des Leads (UK Postcode ohne Leerzeichen, FR 5 Ziffern, US ZIP 5 Ziffern)."""
    country = company.get("country") or ""
    addr = company.get("address") or ""
    if country == "US":
        m = re.findall(r"\b(\d{5})(?:-\d{4})?\b", addr)
        return m[-1] if m else ""
    if country == "UK":
        m = W.UK_POSTCODE.search(addr.upper())
        return (m.group(1) + m.group(2)) if m else ""
    if country == "FR":
        m = re.findall(r"\b(\d{5})\b", addr)
        return m[-1] if m else ""
    return ""


def norm_pc(pc: str | None) -> str:
    return re.sub(r"\s", "", (pc or "").upper())


def core_name(name: str | None) -> str:
    """Firmenname ohne Rechtsform und Füllwörter (für den Abgleich mit Registertreffern)."""
    return " ".join(W.core_words(W.ascii_fold(name or "")))


def same_company(a: str | None, b: str | None) -> bool:
    ca, cb = core_name(a), core_name(b)
    return bool(ca) and ca == cb


# ------------------------------------------------------------------------------------------------ Register
def _title(s: str) -> str:
    return " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in s.split())


def fr_record(res: dict, via: str) -> dict | None:
    """Treffer von recherche-entreprises -> {name, role, postcode, active, source, via, company}."""
    if not res:
        return None
    siege = res.get("siege") or {}
    etabs = [e.get("code_postal") for e in res.get("matching_etablissements") or [] if e.get("code_postal")]
    rec = {"postcode": siege.get("code_postal") or "", "postcodes": sorted({siege.get("code_postal") or ""} | set(etabs) - {""}),
           "active": res.get("etat_administratif") == "A",
           "source": FR_SOURCE, "via": via, "company": res.get("nom_complet") or "", "name": None, "role": None,
           "id": res.get("siren")}
    for d in res.get("dirigeants") or []:
        if d.get("type_dirigeant") == "personne physique" and d.get("nom"):
            first = (d.get("prenoms") or "").split()[0] if d.get("prenoms") else ""
            nom = re.sub(r"\s*\([^)]*\)", "", d["nom"]).strip()
            if first and nom:
                rec.update(name=_title(f"{first} {nom}"), role=d.get("qualite") or "Dirigeant")
                return rec
    comp = res.get("complements") or {}
    if comp.get("est_entrepreneur_individuel") or str(res.get("nature_juridique") or "") == "1000":
        n = re.sub(r"\s*\([^)]*\)", "", res.get("nom_complet") or "").strip()
        if 2 <= len(n.split()) <= 4 and not re.search(r"\d", n):
            rec.update(name=_title(n), role="Entrepreneur individuel")
    return rec


def fr_pick(results: list[dict], name: str, pc: str) -> dict | None:
    """Suche nach Name + PLZ: genau ein aktiver Treffer, dessen Name (Firma oder Enseigne) gleich ist und dessen
    Sitz oder passende Niederlassung dieselbe PLZ hat."""
    hits = []
    for r in results or []:
        siege = r.get("siege") or {}
        names = [r.get("nom_complet"), r.get("nom_raison_sociale")] + list(siege.get("liste_enseignes") or [])
        names += [e.get("nom_commercial") for e in r.get("matching_etablissements") or []]
        pcs = {siege.get("code_postal")} | {e.get("code_postal") for e in r.get("matching_etablissements") or []}
        if any(same_company(n, name) for n in names if n) and pc in pcs:
            hits.append(r)
    return hits[0] if len(hits) == 1 else None


def uk_pick(items: list[dict], name: str, pc: str) -> dict | None:
    """Companies-House-Suche: genau ein aktiver Treffer mit gleichem Namen und gleicher Postleitzahl."""
    hits = []
    for it in items or []:
        if (it.get("company_status") or "active") != "active":
            continue
        ipc = norm_pc((it.get("address") or {}).get("postal_code") or "")
        if not ipc:
            m = W.UK_POSTCODE.search((it.get("address_snippet") or "").upper())
            ipc = (m.group(1) + m.group(2)) if m else ""
        if same_company(it.get("title"), name) and ipc and ipc == norm_pc(pc):
            hits.append(it)
    return hits[0] if len(hits) == 1 else None


# ------------------------------------------------------------------------------------------------ Website
def site_facts(pages: dict[str, str], site_url: str, company: dict, person_name: str | None) -> dict:
    """Was die eigene Website zeigt: Nummern, Adressen, Person im Impressum, Beleg, dass die Seite zur Firma gehört."""
    country = company.get("country") or ""
    text = "\n".join(W.without_hosting(W.page_text(p)) for p in pages.values())
    phones: list[str] = []
    emails: list[str] = []
    for p in pages.values():
        ph, _ = W.phones_on_page(p, country)
        phones += [x for x in ph if x not in phones]
        emails += [e for e in W.emails_on_page(p) if e not in emails and W.EMAIL_SYNTAX.match(e)]
    c = W.extract_contacts(pages, site_url, country, W.postcode_of(company))
    match = W.score_match({**company, "_person_name": person_name or ""}, pages, site_url)
    return {"pages": len(pages), "phones": phones[:10], "emails": emails[:10], "role_email": c.get("email"),
            "person": c.get("person"), "text": text[:200000], "domain": W.site_domain(site_url),
            "verified": bool(match.get("verified")) or match.get("score", 0) >= 25 and not match.get("conflicts"),
            "conflicts": match.get("conflicts") or []}


# ------------------------------------------------------------------------------------------------ Zusammenführen
def merge(company: dict, contact: dict | None, person_now: dict | None, register: dict | None, site: dict | None,
          today: dt.date | None = None) -> dict:
    """Register + Website + Bestand -> Ergebnis für leads.kontakt (siehe Moduldoku)."""
    today = today or dt.date.today()
    contact, person_now = contact or {}, person_now or {}
    country = company.get("country") or ""
    pc = lead_postcode(company)
    wid: list[str] = []
    hinweise: list[str] = []
    site_ok = bool(site) and site.get("verified") and not site.get("conflicts")
    if site and site.get("conflicts"):
        hinweise.append("website_widerspruch:" + str(site["conflicts"][0]).split(":")[0])

    # --- Ansprechperson
    cand, belege = None, []
    if register and register.get("name"):
        cand = {"name": register["name"], "role": register.get("role"), "source": register.get("source")}
        if register.get("via") == "name_plz":
            belege += ["register_name", "plz"]
        else:
            belege.append("register_id")
            # Sitz oder passende Niederlassung (RGE nennt die SIRET der Niederlassung, nicht des Sitzes)
            rpcs = {norm_pc(x) for x in (register.get("postcodes") or [register.get("postcode")]) if x}
            if rpcs and pc:
                if norm_pc(pc) in rpcs:
                    belege.append("plz")
                else:
                    wid.append("plz_register_abweichend")
        if register.get("active") is False:
            wid.append("register_inaktiv")
    sp = (site or {}).get("person") if site_ok else None
    if sp and sp.get("name"):
        if cand:
            if same_person(cand["name"], sp["name"]):
                belege.append("impressum")
            else:
                wid.append("person_website_abweichend")
        else:
            cand = {"name": sp["name"], "role": sp.get("role"), "source": "Company website (legal notice)"}
            belege.append("impressum")
    if cand and site_ok and "impressum" not in belege and name_in_text(cand["name"], site.get("text") or ""):
        belege.append("website_name")
    email = contact.get("email") or ""
    if cand and email_has_name(email, cand["name"]):
        belege.append("email_name")
    if cand and cand.get("source") == "Company website (legal notice)" and site_ok and email and \
            email.rsplit("@", 1)[-1].lower().removeprefix("www.") == site.get("domain"):
        belege.append("domain")  # Impressum auf der Website, deren Domain die E-Mail des Leads trägt
    known = (person_now.get("name") or "").strip()
    if known and cand and not same_person(known, cand["name"]):
        wid.append("person_bestand_abweichend")
    person_wid = [w for w in wid if w in PERSON_WIDERSPRUCH]
    person = None
    neu = False
    if cand and not person_wid and len(set(belege)) >= MIN_BELEGE_PERSON:
        person = {**cand, "belege": sorted(set(belege))}
        neu = not known
    elif known:
        person = {"name": known, "role": person_now.get("role"), "source": person_now.get("source") or "Bestand",
                  "belege": sorted(set(belege)) if cand and same_person(known, cand["name"]) else []}

    # --- Telefon und E-Mail
    phone = contact.get("phone") or company.get("phone_main") or ""
    pb, eb = [], []
    if phone and site_ok:
        e164, _ = W.normalize_phone(phone, country)
        if e164 and e164 in (site.get("phones") or []):
            pb.append("website")
        elif site.get("phones"):
            hinweise.append("telefon_nicht_auf_website")
    if email and site_ok:
        if email.lower() in (site.get("emails") or []):
            eb.append("website")
        if email.rsplit("@", 1)[-1].lower().removeprefix("www.") == site.get("domain"):
            eb.append("domain")
    if person and email_has_name(email, person["name"]):
        eb.append("email_name")

    funde = {}
    if site_ok:
        if site.get("role_email") and site["role_email"] != email.lower():
            funde["email"] = site["role_email"]
        e164, _ = W.normalize_phone(phone, country) if phone else (None, "")
        extra = [p for p in site.get("phones") or [] if p != e164][:3]
        if extra:
            funde["phones"] = extra

    person_ok = bool(person and person.get("name") and person.get("belege"))
    kontakt_ok = bool(phone and email and (pb or eb))
    if person_ok and kontakt_ok:
        stufe = "bestaetigt"
    elif wid and not person_ok:
        stufe = "widerspruch"
    elif person_ok or kontakt_ok:
        stufe = "teilweise"
    else:
        stufe = "leer"
    return {"v": VERSION, "on": today.isoformat(), "stufe": stufe, "premium_punkt": stufe == "bestaetigt",
            "person": person, "person_neu": bool(neu and person), "phone": {"belegt": sorted(set(pb))} if phone else None,
            "email": {"belegt": sorted(set(eb))} if email else None, "widerspruch": sorted(set(wid)),
            "hinweise": hinweise[:5], "funde": funde,
            "quellen": sorted({x for x in ((register or {}).get("source"), "Company website" if site_ok else None) if x})}


def _contact_unbelegt(kontakt: dict) -> bool:
    """Website gelesen, aber weder Telefon noch E-Mail dort/auf der Domain belegt und keine Person (Stufe „leer“).
    Premium-Labor 05.10.2026: 35 % (UK) bis 56 % (FR) der Radar-Premium-Leads – bekamen trotzdem 15 Kontakt-Punkte."""
    return kontakt.get("stufe") == "leer" and "Company website" in (kontakt.get("quellen") or [])


def _contact_belegt(kontakt: dict) -> bool:
    return bool(((kontakt.get("phone") or {}).get("belegt")) or ((kontakt.get("email") or {}).get("belegt")))


def premium_nachtrag(score, premium, kontakt: dict) -> tuple[int, dict] | None:
    """Premium-Punkte nach der Kontakt-Prüfung. Hat der Lead schon eine Premium-Bewertung:
    - Person jetzt bestätigt (vorher ohne Namen bewertet) -> Personen-Punkte dazu („Ansprechperson+Kontakt“).
    - Website gelesen und Kontakt dort nicht belegt (Stufe „leer“) -> die Kontakt-Punkte entfallen (Grund
      „kontakt_unbelegt“; nur strenger). Belegt eine spätere Prüfung Telefon oder E-Mail, kommen sie zurück.
    Stufe wie lib/premium.py: premium nur ab PREMIUM_MIN und mit frischem Ereignis. Gibt (score, premium) oder None
    (nichts zu ändern). Ändert nur Reihenfolge/Stufe, nie die Drei-Stufen-Freigabe."""
    if not isinstance(score, (int, float)) or not isinstance(kontakt, dict):
        return None
    p = dict(premium) if isinstance(premium, dict) else {}
    reasons = list(p.get("reasons") or [])
    score = int(score)
    changed = False
    if kontakt.get("premium_punkt"):
        if "person" not in reasons:
            score = min(100, score + PREMIUM_PERSON)
            reasons.append("person")
            changed = True
        if "kontakt_geprueft" not in reasons:
            reasons.append("kontakt_geprueft")
            changed = True
    if "kontakt" in reasons and _contact_unbelegt(kontakt):
        score = max(0, score - PREMIUM_CONTACT)
        reasons[reasons.index("kontakt")] = "kontakt_unbelegt"
        changed = True
    elif "kontakt_unbelegt" in reasons and _contact_belegt(kontakt):
        score = min(100, score + PREMIUM_CONTACT)
        reasons[reasons.index("kontakt_unbelegt")] = "kontakt"
        changed = True
    if not changed:
        return None
    fresh = any((m := re.fullmatch(r"frisch_(\d+)_tage", str(r))) and int(m.group(1)) <= P.PREMIUM_MAX_AGE
                for r in reasons)
    p.update(reasons=reasons, tier="premium" if score >= PREMIUM_MIN and fresh else "standard")
    return score, p
