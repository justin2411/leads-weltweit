"""Lead-Report USA mit der Vorlage des Inhabers (02.10.2026: „neue pdf vorlage … für die us leads nutzen“).

Vorlage: scripts/assets/report/lead-report-vorlage.html (HTML + JSON -> PDF, eigene README im Zip des Inhabers).
Diese Datei baut nur die JSON-Daten aus der Lead-CSV und druckt die Vorlage mit Chromium. Gleiche Regeln wie
leadreport.py: nur wahre Angaben, keine Platzhalter-Rolle („ask for the owner“), Ansprechperson und Website nur,
wenn vorhanden, Pakete und Preise aus der Datenbank.
"""
from __future__ import annotations

import datetime as dt
import os
import re
from pathlib import Path

from lib.leadreport import T, T2, _day, _money, _per_lead, _short_why, briefing, group_rows, real_role

TEMPLATE = Path(__file__).resolve().parents[1] / "assets" / "report" / "lead-report-vorlage.html"

REASON_TYPE = {"no_website": "nosite", "website_outdated": "outdated", "website_not_mobile": "outdated",
               "website_broken": "outdated", "no_https": "insecure"}
PRESENCE_TITLE = {"nosite": "Reachable – but no website", "outdated": "Reachable – but the website lets them down",
                  "insecure": "Reachable – but the website is not secure"}
WEB_GAP = {"nosite": "no own website could be found", "outdated": "website is outdated",
           "insecure": "website is not secure"}


def _bold_gap(why: str, kind: str) -> str:
    """Kernaussage fett (Vorlage: **…**), nur wenn sie wörtlich im Text steht."""
    for phrase in (WEB_GAP.get(kind, ""), "no website", "not secure", "outdated"):
        if phrase and phrase in why:
            return why.replace(phrase, f"**{phrase}**", 1)
    return why


def report_data(data: bytes, plans: list[dict] | None = None, cta_url: str | None = None,
                segment: str | None = None, period: dt.date | None = None) -> dict:
    t, t2 = T["en"], T2["en"]
    groups = group_rows(data)[:10]
    when = _day((period or dt.date.today()).isoformat(), "en")
    leads, kinds = [], []
    for g in groups:
        r = g["rows"][0]
        sig = r.get("signal") or ""
        kind = REASON_TYPE.get(sig, "other")
        kinds.append(kind)
        loc = (r.get("location") or "").strip()
        city, _, state = loc.partition(",")
        ind = (r.get("industry") or "").split(" - ")[-1].strip()
        opener = (r.get("opening_line") or "").strip()
        bf = briefing(sig, segment, r.get("event", ""), r.get("event_date", ""), opener,
                      (r.get("question_to_ask") or "").strip(), ind, city.strip(), "US", "")
        person = (r.get("contact_name") or "").strip()
        role = real_role(r.get("contact_role"))
        event = r.get("event") or ""
        web = re.sub(r"^https?://(www\.)?", "", r.get("website") or "").rstrip("/")
        online = {"phone": bool(r.get("phone")), "email": bool(r.get("email"))}
        if "facebook" in event.lower():
            online["facebook"] = True  # nur, wenn die Quelle die Seite nennt
        online["website"] = bool(web)
        leads.append({
            "name": g["company"], "category": ind, "city": city.strip(), "state": state.strip()[:2],
            "phone": r.get("phone") or "", "email": r.get("email") or "", "website": web,
            "contact": " · ".join(x for x in (person, role) if x) if person else role,
            "address": (r.get("address") or "").strip() or loc,
            "detected": _day(r.get("event_date", ""), "en"),
            "priority": (r.get("priority") or r.get("urgency") or "medium").lower(),
            "reason": t["sig"].get(sig, "") or "New signal", "reasonType": kind, "online": online,
            "why": _bold_gap(_short_why(bf["why"], g["company"], city.strip()), kind),
            "needs": bf["needs"][:4], "offer": bf["offer"], "ask": f"“{bf['ask']}”",
        })
    main = max(set(kinds), key=kinds.count) if kinds else "other"
    named = sum(1 for x in leads if x["contact"])
    has_fb = any("facebook" in x["online"] for x in leads)
    every = [{"icon": "phone", "text": "Phone"}, {"icon": "mail", "text": "Email"}, {"icon": "pin", "text": "Address"}]
    if named == len(leads) and leads:
        every.append({"icon": "user", "text": "Who to ask for"})
    every.append({"icon": "bulb", "text": "How to win them"})
    rows = [{"key": "phone", "icon": "phone", "label": "Phone number"},
            {"key": "email", "icon": "mail", "label": "Email address"}]
    if has_fb:
        rows.append({"key": "facebook", "icon": "social", "label": "Facebook page"})
    rows.append({"key": "website", "icon": "globe", "label": "Own website", "highlight": main == "nosite"})
    sample = plans is not None
    plan_cards = []
    for i, p in enumerate(plans or []):
        per = _per_lead(p, t2)
        cents = p.get("amount_cents") or 0
        plan_cards.append({
            "name": p.get("name", ""), "price": _money(p), "per": "per month",
            "text": t2["plan_txt"].get(p.get("key", ""), "").replace("Up to 15", "Up to **15**").replace("Up to 50", "Up to **50**"),
            "perLead": round(cents / 100 / ({"starter": 15, "pro": 50}.get(p.get("key"), 1) * 52 / 12), 2),
            "perLeadLabel": per.replace(" per lead", ""), "highlight": i == len(plans) - 1})
    if plan_cards:
        plan_cards.append({"name": t2["custom_n"], "price": t2["custom_p"], "text": t2["custom_t"],
                           "note": t2["per_lead_c"], "dashed": True})
    return {
        "brand": {"name": "NextGen", "accent": "Profit"},
        "leads": leads,
        "report": {"lang": "en", "date": when, "country": "United States", "map": "us",
                   "documentTitle": "NextGen Profit – Lead Briefing {date}", "kicker": "Lead briefing · {date}",
                   "eyebrow": "{count} leads selected for you · {country}",
                   "title": "Your free sample." if sample else "Your new leads.",
                   "subtitle": "{count} companies with a concrete reason to talk to you **now**.",
                   "footer": t["conf"]},
        "cover": {"inEveryLead": every,
                  "presenceTitle": PRESENCE_TITLE.get(main, "What they have in common"),
                  "presenceNote": "Checked {date} · one dot = one lead", "presenceRows": rows,
                  "opening": "That gap is your opening.", "industriesNote": "Across {states} states"},
        "closing": {
            "title": "Why these leads turn into", "titleAccent": "revenue",
            "reasons": [{"icon": "target", "title": "A real reason to buy",
                         "text": "Every company has a concrete reason that creates demand for your service."},
                        {"icon": "bolt", "title": "You call first",
                         "text": "Leads arrive days after the event, often before the company has found a provider."},
                        {"icon": "lock", "title": "Only for your firm",
                         "text": "Each lead goes to one firm in your field only. No competitor calls the same company."}],
            "steps": [{"icon": "focus", "title": "You choose your focus",
                       "text": "The industries and signals that fit your business, or simply the whole country."},
                      {"icon": "cal", "title": "Every Monday",
                       "text": "A fresh report like this one, as PDF and spreadsheet for your CRM."},
                      {"icon": "phone", "title": "You call and win clients",
                       "text": "Phone, email and a short sales briefing in every lead."}],
            "plans": plan_cards,
            "cta": {"title": t2["start"], "text": t2["cta"], "button": t2["btn"], "url": cta_url or ""},
            "tagline": t2["tagline"],
            "filler": {"eyebrow": "Your next step", "title": "Liked these leads? Get them every week.",
                       "text": "Fresh leads every Monday, only for your firm.", "button": t2["btn"]},
        },
    }


def render_pdf_us(data: bytes, plans: list[dict] | None = None, cta_url: str | None = None,
                  segment: str | None = None, period: dt.date | None = None) -> bytes | None:
    if not TEMPLATE.exists():
        return None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    payload = report_data(data, plans, cta_url, segment, period)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None,
                                  args=["--font-render-hinting=none", "--force-color-profile=srgb"])
            page = b.new_page()
            page.add_init_script("window.NO_AUTO_RENDER = true;")
            page.goto(TEMPLATE.as_uri(), wait_until="load")
            notes = page.evaluate("d => window.renderReport(d)", payload)
            for n in notes or []:
                print(f"Lead-Report US Hinweis: {n}")
            pdf = page.pdf(format="A4", print_background=True, prefer_css_page_size=True,
                           margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            b.close()
            return pdf
    except Exception as exc:  # noqa: BLE001 - Rückfall auf den bisherigen Report
        print(f"Lead-Report US nicht erstellt: {exc}")
        return None
