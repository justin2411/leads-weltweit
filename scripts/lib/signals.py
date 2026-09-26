"""Aus Beobachtungen werden Leads: feste, nachvollziehbare Regeln.

Jeder Lead nennt das Ereignis, die Quelle mit Datum, die Dringlichkeit mit Begründung
und einen Einstiegssatz für den Käufer. Nur Firmendaten.
"""
from __future__ import annotations

import datetime as dt
import re


def _d(value) -> dt.date | None:
    if value is None or value == "":
        return None
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value)[:10])


def open_since(obs: dict) -> dt.date:
    """Frühestes belegtes Datum einer Stelle: Veröffentlichung laut Quelle, sonst unser erster Fund."""
    dates = [d for d in (_d(obs.get("posted_on")), _d(obs.get("first_seen"))) if d]
    return min(dates)


def _active_jobs(observations: list[dict]) -> list[dict]:
    return [o for o in observations if o["kind"] == "job_posting" and not o.get("gone_since")]


def detect_job_leads(company: dict, observations: list[dict], today: dt.date) -> list[dict]:
    """S1 (und S3/S5 je nach Stellentitel): Stellen 30+ Tage offen, 3+ Stellen gleichzeitig."""
    leads = []
    jobs = _active_jobs(observations)
    if not jobs:
        return leads

    long_open = sorted(
        ((o, (today - open_since(o)).days) for o in jobs if (today - open_since(o)).days >= 30),
        key=lambda x: -x[1],
    )
    for o, days in long_open:
        since = open_since(o)
        basis = "laut Stellenanzeige" if o.get("posted_on") and _d(o["posted_on"]) <= since else "seit unserem ersten Fund"
        urgency = "high" if days >= 60 else "medium"
        leads.append({
            "signal_type": "job_open_30d",
            "event_date": since.isoformat(),
            "event_summary": f"Stelle „{o.get('title') or 'ohne Titel'}“ ist seit {days} Tagen offen ({basis}, seit {since:%d.%m.%Y}).",
            "source_name": o.get("source_name") or "Karriereseite",
            "source_url": o.get("source_url"),
            "urgency": urgency,
            "urgency_reason": (
                f"{days} Tage ohne Besetzung; ab 60 Tagen steigt der Druck, externe Hilfe zu holen."
                if urgency == "high" else f"{days} Tage offen; typischer Zeitpunkt, an dem Firmen Personalvermittler einbeziehen."
            ),
            "opener": (
                f"I noticed {company['name']} has been advertising the {o.get('title') or 'open'} role since "
                f"{since:%B %Y}. Is that still a position you are looking to fill?"
            ),
            "observation_ids": [o["id"]] if o.get("id") else [],
            "topic": classify_job(o.get("title") or ""),
        })

    if len(jobs) >= 3:
        first = min(open_since(o) for o in jobs)
        titles = ", ".join(sorted({(o.get("title") or "?") for o in jobs})[:5])
        week_start = today - dt.timedelta(days=today.weekday())  # höchstens ein Lead pro Woche
        leads.append({
            "signal_type": "jobs_3plus",
            "event_date": week_start.isoformat(),
            "event_summary": f"{len(jobs)} offene Stellen gleichzeitig auf der Karriereseite ({titles}).",
            "source_name": jobs[0].get("source_name") or "Karriereseite",
            "source_url": jobs[0].get("source_url"),
            "urgency": "high" if len(jobs) >= 6 else "medium",
            "urgency_reason": f"{len(jobs)} parallele Ausschreibungen, älteste seit {first:%d.%m.%Y}.",
            "opener": f"{company['name']} currently lists {len(jobs)} open roles on its careers page. "
                      f"Are you handling all of that hiring in-house?",
            "observation_ids": [o["id"] for o in jobs if o.get("id")],
            "topic": "general",
        })
    return leads


IT_WORDS = re.compile(r"\b(it|sysadmin|system administrator|network|helpdesk|help desk|service desk|infrastructure|devops|cyber|desktop support|it support)\b", re.I)
FIN_WORDS = re.compile(r"\b(account\w*|bookkeep\w*|payroll|finance|controller|ap clerk|ar clerk|credit control|comptab\w*)\b", re.I)


def classify_job(title: str) -> str:
    if IT_WORDS.search(title):
        return "it"
    if FIN_WORDS.search(title):
        return "accounting"
    return "general"


def detect_incorporation_lead(company: dict, obs: dict, today: dt.date, max_age_days: int = 60) -> dict | None:
    """S2/S4/S5: Neugründung aus einem öffentlichen Register."""
    inc = _d(obs.get("posted_on"))
    if not inc:
        return None
    age = (today - inc).days
    if age < 0 or age > max_age_days:
        return None
    # Ob die Firma schon eine Website hat, steht nicht im Register; nichts behaupten, was wir nicht geprüft haben.
    urgency = "high" if age <= 30 else "medium" if age <= 45 else "low"
    return {
        "signal_type": "new_incorporation",
        "event_date": inc.isoformat(),
        "event_summary": f"{company['name']} wurde am {inc:%d.%m.%Y} im Register eingetragen"
                         + (f" ({company['city']})." if company.get("city") else "."),
        "source_name": obs.get("source_name"),
        "source_url": obs.get("source_url"),
        "urgency": urgency,
        "urgency_reason": f"Gründung vor {age} Tagen; Website, Auftritt und Dienstleister werden typischerweise jetzt ausgewählt.",
        "opener": f"Congratulations on setting up {company['name']} this {inc:%B}. "
                  "Have you already decided who will build your website?",
        "observation_ids": [obs["id"]] if obs.get("id") else [],
        "topic": "general",
    }


def detect_website_lead(company: dict, obs: dict) -> dict | None:
    """S2: veraltete oder nicht mobilfähige Website (aus site_audit)."""
    details = obs.get("details") or {}
    findings = details.get("findings") or []
    score = details.get("score", 0)
    if score < 2:
        return None
    seen = _d(obs.get("last_seen")) or _d(obs.get("first_seen"))
    urgency = "high" if score >= 4 else "medium" if score >= 3 else "low"
    return {
        "signal_type": "outdated_website",
        "event_date": seen.isoformat() if seen else None,
        "event_summary": "Website wirkt veraltet: " + "; ".join(findings[:4]) + ".",
        "source_name": "Firmenwebsite (eigene Prüfung)",
        "source_url": obs.get("source_url"),
        "urgency": urgency,
        "urgency_reason": f"{len(findings)} technische Befunde auf der Startseite (Stand {seen:%d.%m.%Y})." if seen
                          else f"{len(findings)} technische Befunde.",
        "opener": f"I had a look at the {company['name']} website"
                  + (" on my phone" if any("mobil" in f for f in findings) else "")
                  + " and noticed a few things that look dated. Is a refresh on your list this year?",
        "observation_ids": [obs["id"]] if obs.get("id") else [],
        "topic": "general",
    }


SEGMENT_FOR = {
    ("job_open_30d", "general"): "S1", ("job_open_30d", "it"): "S3", ("job_open_30d", "accounting"): "S5",
    ("jobs_3plus", "general"): "S1",
    ("new_incorporation", "general"): "S2",
    ("outdated_website", "general"): "S2",
}


# Zusätzliche Käufergruppen für dasselbe Signal (S9 Finanzberater: Wachstum und Gründung von Arbeitgebern)
ALSO_FOR = {"jobs_3plus": ["S9"], "new_incorporation": ["S9"]}


def segment_for(lead: dict) -> str | None:
    return SEGMENT_FOR.get((lead["signal_type"], lead.get("topic", "general")))


def segments_for(lead: dict) -> list[str]:
    main = segment_for(lead)
    return ([main] if main else []) + ALSO_FOR.get(lead["signal_type"], [])
