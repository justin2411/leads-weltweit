"""Kostenlose Anreicherung: Website finden und prüfen, E-Mail und Telefon von der eigenen Website, MX-Prüfung.

Grundsatz aus lib/websites.py: eine falsche Website ist schlimmer als keine. Eine Domain gilt nur als Website der
Firma, wenn die Seite selbst es belegt (Name, Ort, Telefonnummer aus der Quelle, Postleitzahl, Ansprechperson).
Keine Suchmaschinen, keine Plattformen, robots.txt (lib.fetch.polite_get über enrich.Fetcher).

Kostenpflichtige Anreicherung ist hier bewusst NICHT eingebaut (CLAUDE.md: Geld nur nach Ja des Inhabers);
die Stelle dafür ist `PAID_ENRICHERS` (leer).
"""
from __future__ import annotations

import re

from lib import websites as W
from lib.rules import FREEMAIL_DOMAINS

PAID_ENRICHERS: list = []  # z. B. E-Mail-Finder – nur nach ausdrücklichem Ja des Inhabers (Kosten)

MORE_FREEMAIL = {"ymail.com", "rocketmail.com", "sbcglobal.net", "bellsouth.net", "charter.net", "cox.net",
                 "earthlink.net", "frontier.com", "frontiernet.net", "optonline.net", "windstream.net", "q.com",
                 "centurylink.net", "embarqmail.com", "juno.com", "netzero.net", "mail.ru", "inbox.com", "gmx.us",
                 "outlook.es", "hotmail.es", "live.co.uk", "aim.com", "pm.me", "tutanota.com", "duck.com"}
FREEMAIL = FREEMAIL_DOMAINS | MORE_FREEMAIL


def email_domain(email: str) -> str:
    return (email or "").rsplit("@", 1)[-1].lower().strip()


def is_freemail(email: str) -> bool:
    return email_domain(email) in FREEMAIL


def _company(c: dict) -> dict:
    """Format für lib.websites.score_match."""
    rid = c["facts"].get("company_number") or c["facts"].get("siren") or ""
    return {"name": c["name"], "country": c["country"], "city": c["city"], "region": c["state"],
            "address": " ".join(x for x in (c["street"], c["city"], c["state"], c["zip"]) if x),
            "postcode": c["zip"] if c["country"] != "US" else "", "registry_id": rid,
            "_person_name": c.get("person_name") or ""}


def _digits(p: str) -> str:
    d = re.sub(r"\D", "", p or "")
    return d[1:] if len(d) == 11 and d.startswith("1") else d[-9:] if len(d) > 9 else d


def extra_evidence(c: dict, html_pages: list[str]) -> list[str]:
    """Zusätzliche Belege, die score_match für US nicht kennt: Telefon aus der Quelle, Postleitzahl."""
    text = "\n".join(html_pages)
    ev = []
    phones, _ = W.phones_on_page(text, c["country"])
    src = {_digits(c.get("phone")), _digits(c.get("phone_alt"))} - {""}
    if src & {_digits(p) for p in phones}:
        ev.append("phone_on_site")
    if c.get("zip") and c["country"] == "US" and re.search(rf"\b{re.escape(c['zip'])}\b", W.page_text(text)):
        ev.append("zip_on_site")
    return ev


def check_site(url: str, c: dict, fetcher, from_email: bool) -> dict | None:
    """Website ansehen und bewerten. from_email: Domain stammt aus der E-Mail, die die Firma selbst amtlich
    angegeben hat – dann reichen schwächere Belege (Name oder Ort oder Telefon), solange nichts widerspricht."""
    from enrich import examine
    site = examine(url, _company(c), fetcher, force_deep=True)
    if not site:
        return None
    wanted = set(site["pages"])
    pages = [v[1] for v in list(fetcher.cache.values()) if v and v[0] in wanted]
    ev = extra_evidence(c, pages)
    site["evidence"] = site["evidence"] + ev
    score = site["score"] + (40 if "phone_on_site" in ev else 0) + (15 if "zip_on_site" in ev else 0)
    site["score"] = score
    if from_email:
        site["verified"] = not site["conflicts"] and score >= 20
    elif c["country"] in ("UK", "FR") and not site["conflicts"]:
        # UK/FR: Firmennamen sind im Register einmalig. Starke Belege: Registernummer, Postleitzahl des Sitzes,
        # exakter Name mit Rechtsform + Domain = Name, Telefon. Domain = Name allein reicht nie.
        e = set(site["evidence"])
        site["verified"] = (score >= W.THRESHOLD or "registry_id" in e or "phone_on_site" in e
                            or ("postcode" in e and score >= 35)
                            or {"name_full_legal", "domain_equals_name"} <= e)
    else:
        site["verified"] = not site["conflicts"] and score >= W.THRESHOLD
    site["_phones"], _ = W.phones_on_page("\n".join(pages), c["country"])
    site["_emails"] = [e for p in pages for e in W.emails_on_page(p)]
    return site


def find_site(c: dict, fetcher, max_examined: int = 3) -> dict:
    """{'site', 'method', 'checked'} – zuerst die Domain der eigenen E-Mail, sonst Domains aus dem Firmennamen."""
    from enrich import resolves
    checked = []
    if c.get("source") == "careers" and c.get("website"):
        # Die Domain ist die Seite, auf der die Firma ihre Stellen selbst veröffentlicht: wie eine eigene E-Mail-Domain
        dom = W.site_domain(c["website"])
        checked.append(dom)
        site = check_site(c["website"], c, fetcher, from_email=True)
        return {"site": site, "method": "own_careers_site", "checked": checked}
    if c.get("email") and not is_freemail(c["email"]):
        dom = email_domain(c["email"])
        checked.append(dom)
        if resolves(dom):
            site = check_site("https://" + dom, c, fetcher, from_email=True)
            if site:
                return {"site": site, "method": "email_domain", "checked": checked}
    best, examined = None, 0
    doms = W.domain_candidates(c["name"], c["country"])[:8]
    if c.get("source") == "sec_form_d":
        doms += [d for d in startup_candidates(c["name"]) if d not in doms]
    for dom in doms:
        checked.append(dom)
        if not resolves(dom):
            continue
        site = check_site("https://" + dom, c, fetcher, from_email=False)
        if site is None:
            continue
        examined += 1
        if best is None or site["score"] > best["score"]:
            best = site
        if site["verified"] or examined >= max_examined:
            break
    return {"site": best, "method": "name_candidates", "checked": checked}


def startup_candidates(name: str) -> list[str]:
    """Häufige Start-up-Domains (Form D): name.io/.ai/.co, getname.com, tryname.com, namehq.com, nameinc.com."""
    core = "".join(W.core_words(name))
    full = "".join(W.name_words(name))
    out = []
    for s in dict.fromkeys(x for x in (full, core) if len(x) >= 4):
        out += [f"{s}.io", f"{s}.ai", f"{s}.co", f"get{s}.com", f"try{s}.com", f"{s}hq.com", f"{s}inc.com",
                f"{s}.app", f"{s}.tech", f"{s}.health", f"{s}.bio"]
    return list(dict.fromkeys(out))


def pick_email(emails: list[str], domain: str) -> str | None:
    """Rollenadresse auf der eigenen Domain bevorzugt, sonst jede Adresse auf der eigenen Domain (Inhaber 01.10.2026:
    alle Kontaktdaten, die die Firma selbst veröffentlicht)."""
    role = W.role_email(emails, domain)
    if role:
        return role
    for e in emails:
        host = email_domain(e)
        host = host[4:] if host.startswith("www.") else host
        if W.EMAIL_SYNTAX.match(e) and (host == domain or host.endswith("." + domain)) \
                and not re.match(r"^(noreply|no-reply|donotreply|privacy|abuse|postmaster|webmaster|dmca|legal)@", e):
            return e
    return None


def enrich(c: dict, fetcher, need_website: bool = True) -> dict:
    """Website, E-Mail, Telefon ergänzen. Schreibt Belege nach c['evidence']; überschreibt keine Quellendaten."""
    from enrich import mx_ok
    ev = c.setdefault("evidence", {})
    if need_website or (c.get("email") and not is_freemail(c["email"])):
        found = find_site(c, fetcher)
        site = found["site"]
        ev["website_checked"] = found["checked"]
        if site and site["verified"]:
            c["website"] = site["url"]
            ev["website"] = {"method": found["method"], "score": site["score"], "evidence": site["evidence"]}
            dom = W.site_domain(site["url"])
            if not c.get("email"):
                e = pick_email(site["_emails"], dom)
                if e:
                    c["email"] = e
                    ev["email_from"] = "website"
            if not c.get("phone") and site["_phones"]:
                c["phone"] = site["_phones"][0]
                ev["phone_from"] = "website"
            ev["site_phones"] = site["_phones"][:5]
            person = (site.get("contacts") or {}).get("person")
            if not c.get("person_name") and person and person.get("name"):
                c["person_name"] = person["name"]
                c["person_role"] = (person.get("role") or "Managing director") + " (legal notice on website)"
                ev["person_from"] = "website_legal_notice"
        elif site:
            ev["website_rejected"] = {"url": site["url"], "score": site["score"], "conflicts": site["conflicts"],
                                      "evidence": site["evidence"]}
    if c.get("email"):
        ev["mx"] = mx_ok(email_domain(c["email"]))
    for paid in PAID_ENRICHERS:  # pragma: no cover - bewusst leer
        paid(c)
    return c
