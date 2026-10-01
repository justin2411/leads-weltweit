"""Vertriebs-Briefing je Lead: warum jetzt, was die Firma wahrscheinlich braucht, wie man sie gewinnt.

Konkret statt generisch: kombiniert die echten Lead-Daten (Branche, Alter der Firma, Ort, Stellentitel, Anzahl
Stellen) mit einem Playbook je Käufer-Zielgruppe und Branche der Lead-Firma (salesplay.json) sowie den
Branchen-Tipps der Website (app/content/industry-hints.json). Keine erfundenen Fakten über die Firma.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAY = json.loads((HERE / "salesplay.json").read_text(encoding="utf-8"))
try:
    HINTS = json.loads((HERE.parents[1] / "app" / "content" / "industry-hints.json").read_text(encoding="utf-8"))
except OSError:
    HINTS = {"groups": {}, "hints": {}}
SLUG = {"S5": "accountants", "S4": "insurance-brokers", "S2": "web-agencies", "S9": "financial-advisers"}

# Branche der Lead-Firma aus SIC-Code oder Branchentext
GROUP_WORDS = [
    ("hospitality", r"restaurant|caf[eé]|coffee|food|beverage|\bbar\b|\bpub\b|hotel|catering|bakery|takeaway"),
    ("construction", r"construct|build|roof|plumb|electric|joiner|carpent|civil eng|install|renovat"),
    ("retail", r"retail|shop|store|e-?commerce|wholesale|boutique"),
    ("transport", r"transport|freight|logistic|haulage|hauling|courier|delivery|taxi|removal|carrier|trucking"),
    ("property", r"real estate|property|letting|landlord|estate agent|housing"),
    ("tech", r"software|computer|\bit\b|digital|\bdata\b|tech|\bweb\b|\bapp\b|cyber"),
    ("health", r"health|dental|medical|clinic|\bcare\b|pharma|therap|wellness|fitness|nursing"),
    ("professional", r"consult|legal|\blaw\b|accountan|management|marketing|advis|architect|design|recruit"),
]
ROLE_WORDS = [
    ("finance", r"account|finance|payroll|bookkeep|controller|audit|\btax\b|payable|receivable|credit"),
    ("tech", r"developer|software|\bit\b|devops|\bdata\b|support analyst|network|cyber|pre-sales|line support"),
    ("sales", r"sales|account manager|business development|\bbdm\b|commercial"),
    ("care", r"\bcare\b|nurse|nursing|clinical|health|support worker|dental|nursery|early years|educator"),
    ("hospitality", r"chef|kitchen|waiter|barista|bar staff|hospitality|front of house|housekeep"),
    ("logistics", r"driver|warehouse|courier|forklift|logistic|delivery|picker"),
    ("trades", r"technician|electrician|plumber|joiner|mechanic|welder|fitter|engineer|operative|builder"),
]
US_TERMS = [("Public and employers' liability", "General liability and workers' comp"),
            ("employers' and public liability", "general liability and workers' comp"),
            ("Employers' liability", "Workers' comp"), ("employers' liability", "workers' comp"),
            ("Public liability", "General liability"), ("public liability", "general liability"),
            ("Fleet and goods-in-transit cover", "Commercial auto and motor truck cargo cover"),
            ("fleet and goods-in-transit", "commercial auto and cargo"), ("goods-in-transit", "cargo"),
            ("Cover for hired-in vehicles", "Hired and non-owned auto cover"),
            ("Professional indemnity", "Professional liability (E&O)"),
            ("professional indemnity", "professional liability (E&O)"),
            ("VAT registration and the domestic reverse charge on building work", "Sales tax on materials and equipment where it applies"),
            ("CIS returns for subcontractors every month from the first job", "1099 reporting and payments for subcontractors from the first job"),
            ("A CIS and VAT setup package", "A 1099 and sales tax setup package"), ("monthly CIS returns", "1099 reporting"),
            ("CIS returns", "1099 reporting"), ("CIS", "1099 reporting"),
            ("VAT", "sales tax"), ("auto-enrolment", "401(k) setup"), ("Auto-enrolment", "401(k) setup"),
            ("Workplace pension", "401(k) plan"), ("workplace pension", "401(k) plan"), ("corporation tax", "business taxes"),
            ("tronc", "tip pooling"), ("Self-assessment", "Personal tax returns"), ("R&D tax relief", "R&D tax credits"),
            ("director's pay", "owner's pay"), ("Director's pay", "Owner's pay")]


def group_of(industry: str, sic: str = "") -> str:
    g = (HINTS.get("groups") or {}).get((sic or "")[:2])
    if g:
        return g
    t = (industry or "").lower()
    for name, pat in GROUP_WORDS:
        if re.search(pat, t):
            return name
    return "services"


def role_of(role: str) -> str:
    t = (role or "").lower()
    for name, pat in ROLE_WORDS:
        if re.search(pat, t):
            return name
    return "general"


def _us(text: str, country: str) -> str:
    if country != "US":
        return text
    for a, b in US_TERMS:
        text = text.replace(a, b)
    return text


def _age(date_iso: str) -> int | None:
    try:
        return (dt.date.today() - dt.date.fromisoformat((date_iso or "")[:10])).days
    except ValueError:
        return None


def briefing(signal: str, segment: str | None, event: str, date_iso: str, opener: str, question: str = "",
             industry: str = "", city: str = "", country: str = "UK", sic: str = "") -> dict:
    """why (konkret), needs (3 Punkte), offer, ask, opener."""
    seg = segment if segment in PLAY else "S5"
    grp = group_of(industry, sic) if (industry or sic) else group_of(event)  # Werke-Leads: Branche steht im Ereignis
    m = re.search(r"[“\"]([^”\"]+)[”\"]", event or "")
    role = m.group(1) if m else ""
    days = (re.search(r"open for (\d+) days", event or "") or [None, ""])[1]
    n = (re.search(r"(\d+) open roles", event or "") or [None, ""])[1]
    age = _age(date_iso)
    ind = (industry or "").strip().rstrip(".")
    where = f" in {city}" if city else ""
    hint = ((HINTS.get("hints") or {}).get(SLUG.get(seg, ""), {}) or {}).get(grp)

    if seg == "S1":
        p = PLAY["S1"]["new_incorporation"] if signal == "new_incorporation" else PLAY["S1"]["_roles"][role_of(role)]
    elif signal.startswith("job") and role_of(role) in (PLAY[seg].get("_roles") or {}):
        p = PLAY[seg]["_roles"][role_of(role)]  # die offene Stelle selbst ist der Anlass
    else:
        p = PLAY[seg].get(grp) or PLAY[seg]["services"]

    if signal == "new_incorporation":
        when = f"{age} days ago" if age is not None and 0 <= age <= 60 else "recently"
        why = f"Registered {when}{(' as a ' + ind.lower() + ' business') if ind else ''}{where}."
        why += " " + (hint[0] if hint else "New owners choose most of their providers in the first weeks, and the first one often stays for years.")
    elif signal == "job_open_30d":
        why = (f"Has been advertising {('“' + role + '”') if role else 'a role'} for {days or 'several'} days"
               f"{where}. A vacancy this old means the internal search has stalled and the work is piling up.")
    elif signal == "jobs_3plus":
        why = (f"Hiring for {n or 'several'} roles at the same time{where}. A growing business with a stretched team "
               "buys outside help, because it cannot do everything itself right now.")
    else:
        why = f"{(event or '').rstrip('.')}{where}. Change like this creates new needs, and companies pick new providers exactly now."

    ask = (hint[1] if hint and signal == "new_incorporation" else "") or p.get("ask") or question
    cap = lambda x: x[:1].upper() + x[1:]
    return {"why": _us(why, country), "needs": [cap(_us(x, country)) for x in p["needs"][:3]],
            "offer": _us(p["offer"], country), "ask": _us(ask, country), "opener": opener, "group": grp}
