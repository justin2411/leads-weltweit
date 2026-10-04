"""Lead-Report mit der Vorlage des Inhabers für US, UK, IE, FR, BE, NL (02.10.2026: „übernimm dies bitte und trage
es ein damit immer die richtige vorlage genommen wird“).

Vorlage: scripts/assets/report/lead-report-vorlage.html, Grundtexte je Land: scripts/assets/report/base/{land}.json
(aus den Beispieldaten des Inhabers, ohne Leads). Diese Datei baut nur die JSON-Daten aus der Lead-CSV und druckt die
Vorlage mit Chromium. Regeln wie leadreport.py: nur wahre Angaben, keine Platzhalter-Rolle („ask for the owner“),
Ansprechperson und Website nur, wenn vorhanden, Pakete und Preise aus der Datenbank.

Sprache: wie die Lead-Texte (playbook): FR Französisch, sonst Englisch. BE und NL nutzen ihre Landkarte mit
englischen Texten, bis es Lead-Texte auf Niederländisch bzw. für Belgien gibt (base/be.json, base/nl.json liegen bereit).
"""
from __future__ import annotations

import copy
import datetime as dt
import json
import os
import re
from pathlib import Path

from lib.leadreport import PER_WEEK, T, T2, _day, _money, _per_lead, _short_why, briefing, group_rows, real_role
from lib.report_regions import region_of
from lib import premium_wert

ASSETS = Path(__file__).resolve().parents[1] / "assets" / "report"
TEMPLATE = ASSETS / "lead-report-vorlage.html"
MAPS = {"US": "us", "UK": "uk", "IE": "ie", "FR": "fr", "BE": "be", "NL": "nl"}
COUNTRY_EN = {"US": "United States", "UK": "United Kingdom", "IE": "Ireland", "BE": "Belgium", "NL": "the Netherlands"}

REASON_TYPE = {"no_website": "nosite", "website_outdated": "outdated", "website_not_mobile": "outdated",
               "website_broken": "outdated", "no_https": "insecure"}
TXT = {
    "en": {"presence": {"nosite": "Reachable – but no website", "outdated": "Reachable – but the website lets them down",
                        "insecure": "Reachable – but the website is not secure"},
           "gap": {"nosite": "no own website could be found", "outdated": "outdated", "insecure": "not secure"},
           "title": ("Your free sample.", "Your new leads."), "who": "Who to ask for",
           "step3": "Phone, email and a short sales briefing in every lead.", "other": "New signal"},
    "fr": {"presence": {"nosite": "Joignables – mais sans site web", "outdated": "Joignables – mais le site les dessert",
                        "insecure": "Joignables – mais le site n’est pas sécurisé"},
           "gap": {"nosite": "aucun site", "outdated": "ancien", "insecure": "sécurisé"},
           "title": ("Votre échantillon gratuit.", "Vos nouveaux prospects."), "who": "Interlocuteur",
           "step3": "Téléphone, e-mail et un court briefing commercial pour chaque prospect.", "other": "Nouveau signal"},
}


def supported(country: str) -> bool:
    return (country or "").upper() in MAPS and TEMPLATE.exists()


def _base(cc: str, lang: str) -> dict:
    """Grundtexte des Landes; passt die Sprache nicht zu den Lead-Texten, englische Texte mit der Landkarte."""
    own = json.loads((ASSETS / "base" / f"{cc.lower()}.json").read_text(encoding="utf-8"))
    if (own["report"].get("lang") or "en")[:2] == lang:
        return own
    base = json.loads((ASSETS / "base" / ("us.json" if cc == "US" else "uk.json")).read_text(encoding="utf-8"))
    base["report"].update({"map": own["report"]["map"], "country": COUNTRY_EN.get(cc, own["report"]["country"])})
    return base


def _bold_gap(why: str, phrase: str) -> str:
    """Kernaussage fett (Vorlage: **…**), nur wenn sie wörtlich im Text steht."""
    return why.replace(phrase, f"**{phrase}**", 1) if phrase and phrase in why else why


def report_data(data: bytes, country: str = "US", plans: list[dict] | None = None, cta_url: str | None = None,
                segment: str | None = None, period: dt.date | None = None) -> dict:
    cc = (country or "US").upper()
    lang = "fr" if cc == "FR" else "en"
    t, t2, tx = T[lang], T2[lang], TXT[lang]
    d = copy.deepcopy(_base(cc, lang))
    groups = group_rows(data)[:10]
    when = _day((period or dt.date.today()).isoformat(), lang)
    leads, kinds = [], []
    for g in groups:
        r = g["rows"][0]
        sig = r.get("signal") or ""
        kind = REASON_TYPE.get(sig, "other")
        kinds.append(kind)
        loc = (r.get("location") or "").strip()
        city, _, rest = loc.partition(",")
        city = city.strip()
        addr = (r.get("address") or "").strip() or loc
        ind = (r.get("industry") or "").split(" - ")[-1].strip()
        bf = briefing(sig, segment, r.get("event", ""), r.get("event_date", ""), (r.get("opening_line") or "").strip(),
                      (r.get("question_to_ask") or "").strip(), ind, city, cc, "")
        person = (r.get("contact_name") or "").strip()
        role = real_role(r.get("contact_role"))
        web = re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/")
        online = {"phone": bool(r.get("phone")), "email": bool(r.get("email"))}
        if "facebook" in (r.get("event") or "").lower():
            online["facebook"] = True  # nur, wenn die Quelle die Seite nennt
        online["website"] = bool(web)
        lead = {
            "name": g["company"], "category": ind, "city": city.title() if city.isupper() else city,
            "phone": r.get("phone") or "", "email": r.get("email") or "", "website": web,
            "contact": " · ".join(x for x in (person, role) if x) if person else role,
            "address": addr, "detected": _day(r.get("event_date", ""), lang),
            "priority": (r.get("priority") or r.get("urgency") or "medium").lower(),
            "reason": t["sig"].get(sig, "") or tx["other"], "reasonType": kind, "online": online,
            "why": _bold_gap(_short_why(bf["why"], g["company"], city), tx["gap"].get(kind, "")),
            "needs": bf["needs"][:4], "offer": bf["offer"], "ask": f"“{bf['ask']}”",
        }
        # Lead-Karte (Wertrechnung, Inhaber 04.10.2026): Alter des Anlasses, Beleg-Link mit Abrufdatum,
        # Quelle der Ansprechperson, Einstiegssatz – nur, was die Daten wirklich hergeben
        age = premium_wert.alter(r.get("event_date", ""), period or dt.date.today(), lang)
        if age:
            lead["detectedAge"] = age
        ev = premium_wert.beleg(sig, r.get("website") or "", r.get("source_url") or "", r.get("checked_on") or "", lang)
        if ev:
            lead["evidence"] = ev
        if lead["contact"] and (r.get("contact_source") or "").strip():
            lead["contactSource"] = r["contact_source"].strip()
        if (r.get("opening_line") or "").strip():
            lead["opener"] = r["opening_line"].strip()
        if cc == "US":
            lead["state"] = rest.strip()[:2]
        else:
            lead["region"] = region_of(cc, addr, city)
        leads.append(lead)
    main = max(set(kinds), key=kinds.count) if kinds else "other"
    sample = plans is not None
    rep, cover, closing = d["report"], d["cover"], d["closing"]
    rep.update({"date": when, "title": tx["title"][0 if sample else 1]})
    rep.pop("demo", None)
    # Ansprechperson nur versprechen, wenn jeder Lead eine hat; Facebook-Zeile nur, wenn die Quelle es nennt
    if not leads or not all(x["contact"] for x in leads):
        cover["inEveryLead"] = [x for x in cover["inEveryLead"] if x.get("icon") != "user"]
    if not any("facebook" in x["online"] for x in leads):
        cover["presenceRows"] = [x for x in cover["presenceRows"] if x.get("key") != "facebook"]
    for row in cover["presenceRows"]:
        row["highlight"] = row.get("key") == "website" and main == "nosite"
    cover["presenceTitle"] = tx["presence"].get(main, cover["presenceTitle"])
    closing["steps"][-1]["text"] = tx["step3"]
    if plans:
        cards = []
        for i, p in enumerate(plans):
            per = _per_lead(p, t2)
            cents = p.get("amount_cents") or 0
            n = PER_WEEK.get(p.get("key"), 1)
            cards.append({"name": p.get("name", ""), "price": _money(p), "per": t2["per"],
                          "text": re.sub(r"(\d+)", r"**\1**", t2["plan_txt"].get(p.get("key", ""), ""), count=1),
                          "perLead": round(cents / 100 / (n * 52 / 12), 2),
                          "perLeadLabel": re.sub(r"\s*(per lead|par piste)$", "", per),
                          "highlight": i == len(plans) - 1})
        custom = next((x for x in closing["plans"] if x.get("dashed")), None)
        closing["plans"] = cards + ([custom] if custom else [])
    closing["cta"]["url"] = cta_url or f"mailto:{os.environ.get('REPLY_TO') or 'info@nextgen-profit.de'}"
    d["leads"] = leads
    wt = premium_wert.daten()["texte"][lang]
    d["cardLabels"] = {"evidence": wt["karte_beleg"], "contactSource": wt["karte_quelle_person"],
                       "opener": wt["karte_einstieg"]}
    # Seite „Was ein Kunde wert ist“: nur Proben (Pakete bekannt) für Webagenturen US/UK/FR
    value = premium_wert.seite(segment, cc, plans) if sample else None
    if value:
        d["value"] = value
    return d


def render_pdf_tpl(data: bytes, country: str, plans: list[dict] | None = None, cta_url: str | None = None,
                   segment: str | None = None, period: dt.date | None = None) -> bytes | None:
    if not supported(country):
        return None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    payload = report_data(data, country, plans, cta_url, segment, period)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None,
                                  args=["--font-render-hinting=none", "--force-color-profile=srgb"])
            page = b.new_page()
            page.add_init_script("window.NO_AUTO_RENDER = true;")
            page.goto(TEMPLATE.as_uri(), wait_until="load")
            notes = page.evaluate("d => window.renderReport(d)", payload)
            for n in notes or []:
                print(f"Lead-Report {country} Hinweis: {n}")
            pdf = page.pdf(format="A4", print_background=True, prefer_css_page_size=True,
                           margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            b.close()
            return pdf
    except Exception as exc:  # noqa: BLE001 - Rückfall auf den bisherigen Report
        print(f"Lead-Report {country} nicht erstellt: {exc}")
        return None
