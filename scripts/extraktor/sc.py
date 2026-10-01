"""Kontrolle 2 – Vertriebssignal, Firmeninfo und Einstiegssatz: passen sie wirklich zu genau diesem Lead?

Prüft je Lead:
  - Branchenregel erfüllt (segments.fits) und Signal frisch (höchstens MAX_AGE_DAYS alt, nicht in der Zukunft)
  - jede Zahl in den Texten steht in den Fakten dieses Leads (keine erfundenen Zahlen)
  - Firmenname steht im Text, Ort/Bundesstaat im Text = Adresse des Leads
  - keine Platzhalter, keine verbotenen Wörter (Garantien, Druck), sinnvolle Länge
  - Texte sind individuell: kein anderer Lead im Lauf hat denselben Text (batch_unique)
Ergebnis: {'status': 'pass'|'fail', 'problems': [...]}
"""
from __future__ import annotations

import datetime as dt
import re

from extraktor import segments
from lib.rules import FORBIDDEN_PATTERNS

MAX_AGE_DAYS = 45
FIELDS = ("signal", "company_info", "opener", "urgency_reason")


def _allowed_numbers(c: dict, t: dict) -> set[str]:
    """Alle Zahlen, die in den Texten vorkommen dürfen – abgeleitet aus Fakten, Adresse und Daten."""
    f = c["facts"]
    vals: set[str] = set()

    def add(v):
        if v is None or v == "":
            return
        if isinstance(v, (dt.date, dt.datetime)):
            vals.update({str(v.year), str(v.day), f"{v.day:02d}"})
            return
        if isinstance(v, bool):
            return
        if isinstance(v, int):
            vals.update({str(v), f"{v:,}"})
            return
        if isinstance(v, (list, tuple)):
            for x in v:
                add(x)
            return
        vals.update(re.findall(r"\d[\d,]*", str(v)))

    for v in f.values():
        add(v)
    for k in ("name", "street", "zip", "person_role", "email", "city"):
        add(c.get(k))
    add(t.get("signal_date"))
    return {v.strip(",") for v in vals}


def _numbers(text: str) -> list[str]:
    # Zahlen ohne angehängte Buchstaben; Telefon/E-Mail kommen in Texten nicht vor
    return [n.strip(",") for n in re.findall(r"(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?(?![A-Za-z])", text or "")]


def run(c: dict, seg: str, t: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    problems = []
    ok, why = segments.fits(seg, c)
    if not ok:
        problems.append(f"segment_rule_failed: {why}")
    sd = t.get("signal_date")
    if not sd:
        problems.append("signal_without_date")
    else:
        age = (today - sd).days
        if age > MAX_AGE_DAYS:
            problems.append(f"signal_too_old ({age} days)")
        if age < 0:
            problems.append("signal_date_in_future")
    allowed = _allowed_numbers(c, t)
    for k in FIELDS:
        text = t.get(k) or ""
        if not text.strip():
            problems.append(f"{k}_empty")
            continue
        if re.search(r"\{|\}|\bNone\b|\bnan\b|\bnull\b|\$0\b|, ,|\(\)", text):
            problems.append(f"{k}_placeholder")
        for n in _numbers(text):
            if n not in allowed and n.replace(",", "") not in allowed:
                problems.append(f"{k}_number_not_in_facts:{n}")
        for pat in FORBIDDEN_PATTERNS.get("fr" if c.get("country") == "FR" else "en", []):
            if re.search(pat, text, re.I):
                problems.append(f"{k}_forbidden_word:{pat}")
        if len(text) > 400:
            problems.append(f"{k}_too_long")
    for k in ("signal", "company_info", "opener"):
        if c["name"] not in (t.get(k) or "") and k != "signal":
            problems.append(f"{k}_without_company_name")
    info = t.get("company_info") or ""
    if c.get("country") == "US" and c.get("state") and f", {c['state']}" not in info:
        problems.append("company_info_place_differs_from_address")
    if c.get("city") and c["city"] not in info:
        problems.append("company_info_city_differs_from_address")
    if seg == "S9" and c.get("person_name") and c["person_name"] not in (t.get("signal") or ""):
        problems.append("s9_signal_without_person")
    return {"status": "fail" if problems else "pass", "problems": problems}


def batch_unique(leads: list[dict]) -> None:
    """Texte müssen je Lead individuell sein: gleicher Text bei zwei Leads -> beide durchgefallen."""
    for k in ("signal", "company_info", "opener"):
        seen: dict[str, list[dict]] = {}
        for l in leads:
            seen.setdefault((l.get(k) or "").strip().lower(), []).append(l)
        for text, group in seen.items():
            # derselbe Text bei derselben Firma (z. B. S1 und S9) ist kein Fehler – nur bei verschiedenen Firmen
            if text and len({(l.get("source"), l.get("source_id")) for l in group}) > 1:
                for l in group:
                    l["sc"]["problems"].append(f"{k}_not_unique")
                    l["sc"]["status"] = "fail"
