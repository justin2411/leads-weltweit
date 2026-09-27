"""Vertriebs-Briefing je Lead für den Lead-Report: Lage, Ansatz, Gesprächsleitfaden, Einwand, Nachfassmail.

Fließtext wie von einem Vertriebsleiter. Firmenbezogenes kommt nur aus den Lead-Daten (Name, Datum, Stelle, Anzahl);
alles andere sind allgemeine, ehrliche Empfehlungen je Signal und Branche des Käufers – keine erfundenen Fakten.
"""
from __future__ import annotations

import re

# Was der Käufer (Zielgruppe) anbietet und welchen Nutzen er in einem Satz verspricht
SEG = {
    "en": {
        "S1": ("recruitment support", "a shortlist of pre-screened candidates within days, so the role is filled faster"),
        "S2": ("a new website", "a website that brings enquiries from the first month"),
        "S3": ("managed IT support", "reliable IT, security and support without hiring an IT person"),
        "S4": ("business insurance", "the right cover in place before the first contract, vehicle or employee"),
        "S5": ("bookkeeping, payroll and tax support", "clean books, payroll and tax deadlines handled from the start"),
        "S6": ("office space and fit-out", "a ready-to-use workspace without months of planning"),
        "S7": ("commercial cleaning", "a clean, professional site from day one without managing staff"),
        "S9": ("your service", "a quick, visible result with little effort on their side"),
    },
}

# Branchenspezifischer Winkel für Stellen-Signale (offene Stelle / mehrere Stellen)
JOB_ANGLE = {
    "S1": "Offer a shortlist of two or three pre-screened candidates for exactly this role within a week, on a success-fee basis. "
          "The risk for them is low, and the value is obvious because the search has already cost them weeks.",
    "S5": "If the open role is in finance, offer to cover the work until it is filled: bookkeeping, payroll or month-end close. "
          "If it is another role, the growing workload still lands on their accounts. Either way, you take pressure off immediately.",
    "S3": "Growing teams need laptops, accounts and security set up for every new hire. Offer to take onboarding IT off their plate "
          "so new people are productive on day one.",
    "S4": "More staff means new cover: employers' liability, key-person and possibly vehicles. Offer a short review so nothing is "
          "missing as the team grows.",
}


# Nach wem fragen (Rolle, nie ein Personenname – CLAUDE.md: keine Mitarbeiterdaten)
ASK_FOR = {
    "S1": {"_": "Hiring manager or HR", "new_incorporation": "The founder"},
    "S2": {"_": "Owner or marketing lead"},
    "S3": {"_": "Owner or office manager", "jobs_3plus": "Operations or office manager"},
    "S4": {"_": "Owner or managing director"},
    "S5": {"_": "Owner or finance lead", "new_incorporation": "The founder / owner"},
    "S6": {"_": "Owner or operations manager"},
    "S7": {"_": "Facilities or office manager"},
}


def ask_for(segment: str | None, signal: str) -> str:
    m = ASK_FOR.get(segment or "", {})
    return m.get(signal) or m.get("_") or ("The founder / owner" if signal == "new_incorporation" else "Owner or managing director")


def _role(event: str) -> str:
    m = re.search(r"[“\"]([^”\"]+)[”\"]", event or "")
    return m.group(1) if m else ""


def _num(event: str, pat: str) -> str:
    m = re.search(pat, event or "")
    return m.group(1) if m else ""


def briefing(signal: str, segment: str | None, company: str, event: str, date: str, opener: str, question: str,
             tip: str = "", lang: str = "en") -> dict:
    """Texte für einen Lead. Rückgabe: situation, angle, steps (Gesprächsleitfaden), objection, followup (Betreff, Text)."""
    service, value = SEG["en"].get(segment or "", SEG["en"]["S9"])
    role, days = _role(event), _num(event, r"open for (\d+) days")
    n = _num(event, r"(\d+) open roles")
    q = question or "How are you handling this at the moment?"
    if signal == "new_incorporation":
        situation = (f"{company} was registered on {date}. In the first weeks after registration, new owners set up "
                     "banking, tax, insurance and their online presence, and they choose most of their providers right now. "
                     "Whoever calls first with a clear, simple offer usually wins the account, and a first provider often stays for years.")
        angle = (f"Position {service} as one thing they can tick off this month. Founders are short on time, so make it easy: "
                 f"a fixed starter package, a short setup call and a clear promise: {value}.")
        objection = ("If they say it is too early: agree, and point out that setting it up properly from the start is cheaper than "
                     "fixing it later. Offer to call back on a fixed date and send a one-page overview today, so they have you on file.")
        subj = "Congratulations on the new company"
        mail = (f"Hi {company} team,\n\ncongratulations again on setting up the company. As mentioned on the phone, we help new "
                f"businesses get {service} sorted from day one: {value}.\n\nWould 15 minutes on Thursday or Friday work for a quick call?")
    elif signal in ("job_open_30d", "jobs_3plus"):
        if signal == "job_open_30d":
            situation = (f"{company} has been advertising {('the role “' + role + '”') if role else 'a role'}"
                         f"{(' for ' + days + ' days') if days else ' for weeks'}. A role that stays open this long usually means "
                         "the internal search is not working, and the gap costs them every week: work piles up, overtime grows "
                         "and other staff have to cover.")
        else:
            situation = (f"{company} currently lists {n or 'several'} open roles at the same time. That is a growing business with "
                         "a stretched team: more people, more processes and more admin, all at once. Growing companies are open to "
                         "outside help because they simply cannot do everything themselves right now.")
        angle = JOB_ANGLE.get(segment or "", f"Offer {service} as a way to take pressure off while they grow: {value}. "
                              "Keep the first step small and easy to say yes to.")
        objection = ("If they say they are handling it internally: respect that, then ask how long they are willing to keep the "
                     "gap open. Offer help only for that period. A small, time-limited start is much easier to accept than a big commitment.")
        subj = f"About the {role} role" if role else "Supporting your growth"
        mail = (f"Hi {company} team,\n\nthanks for your time today. As discussed, we can take some of the pressure off while "
                f"{('the ' + role + ' role is open') if role else 'you are hiring'}: {value}.\n\n"
                "Shall I send you a short proposal for the next four weeks?")
    else:
        situation = (f"Something changed at {company} recently ({event.rstrip('.')}). Change creates new needs, and companies "
                     "look for new providers exactly in these moments.")
        angle = f"Offer {service} as a simple first step: {value}."
        objection = "If they are not interested: ask one question about their plans and offer to send a short summary by email."
        subj = "A quick idea after the recent change"
        mail = f"Hi {company} team,\n\nthanks for your time today. As mentioned, we help with {service}: {value}.\n\nWould a short call next week work?"
    steps = [
        ("Open", f"“{opener}”" if opener else f"Introduce yourself and mention what you noticed at {company}."),
        ("Ask", f"“{q}” Listen for who handles it today and what worries them."),
        ("Bridge", tip or f"Connect their answer to your offer: {value}."),
        ("Close", "Ask for one small next step: “Shall we book 15 minutes this week?” Agree a date before you hang up."),
    ]
    return {"situation": situation, "angle": angle, "steps": steps, "objection": objection, "followup": (subj, mail)}
