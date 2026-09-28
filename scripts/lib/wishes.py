"""Wunsch aus dem Probe-Formular („Welche Leads brauchen Sie?“, Inhaber 28.09.2026).

Die Landingpage speichert ihn maschinenlesbar am Ende von sample_requests.note:
    "…; wunsch:signals=no_website,website_outdated;text=nur Gastronomie"
Die Schlüssel stehen in app/content/sample-wishes.ts (gleiche Namen!). Hier: Note lesen und je Schlüssel
entscheiden, ob ein Lead passt. Passt nichts oder zu wenig, füllt die Probe mit anderen vollständigen Leads der
Branche auf (regional_sample in responder.py) – nie mit unvollständigen.
"""
from __future__ import annotations

import re

MARK = "wunsch:"

# gleiche Wörter wie scripts/lib/signals.py (Finanzstellen)
FIN_WORDS = re.compile(r"\b(account\w*|bookkeep\w*|payroll|finance|controller|ap clerk|ar clerk|credit control|comptab\w*|paie)\b", re.I)
FLEET_WORDS = re.compile(r"\b(warehous\w*|fleet|logistic\w*|haulage|freight|transport\w*|courier|entrep[oô]t|logistique)\b", re.I)
# SIC-Abteilungen: 49 Landverkehr, 52 Lagerei, 53 Post/Kurier
FLEET_SIC = ("49", "52", "53")

KEYS = {"job_open_30d", "jobs_3plus", "new_location", "new_incorporation", "new_director", "growth", "expansion",
        "finance_roles", "no_website", "website_outdated", "not_mobile", "fleet_warehouse"}


def parse(note: str | None) -> tuple[list[str], str]:
    """(Signal-Schlüssel, Freitext) aus der Note; ohne Wunsch ([], "")."""
    note = note or ""
    i = note.find(MARK)
    if i < 0:
        return [], ""
    body = note[i + len(MARK):]
    sig, _, text = body.partition(";text=")
    sig = sig.removeprefix("signals=")
    keys = [k for k in (x.strip() for x in sig.split(",")) if k in KEYS]
    return keys[:3], text.strip()


def split_note(note: str | None) -> tuple[str, str]:
    """(übriger Hinweis, Wunsch-Teil). Der Wunsch steht immer am Ende; der Freitext darf nichts auslösen."""
    note = note or ""
    i = note.find(MARK)
    if i < 0:
        return note, ""
    return note[:i].rstrip("; ").strip(), note[i:]


def with_note(old: str | None, new: str) -> str:
    """Neuen Hinweis setzen, den Wunsch des Kunden aber behalten (sonst ginge er beim Statuswechsel verloren)."""
    _, wish = split_note(old)
    return "; ".join(x for x in (new, wish) if x)


def _no_website(l: dict) -> bool:
    co = l.get("watch_companies") or {}
    return ("no website found" in (l.get("event_summary") or "").lower()
            or (not co.get("website") and bool(co.get("website_checked_at"))))


def matches(key: str, l: dict, sic: str | None = None) -> bool:
    """Passt der Lead zum Wunsch? sic: SIC-Code der Beobachtung (nur für fleet_warehouse nötig)."""
    st = l.get("signal_type") or ""
    ev = l.get("event_summary") or ""
    if key in ("job_open_30d", "jobs_3plus", "new_location", "new_incorporation", "website_outdated"):
        return st == key
    if key == "new_director":
        return st == "new_incorporation"
    if key == "growth":
        return st == "jobs_3plus"
    if key == "expansion":
        return st in ("new_location", "jobs_3plus")
    if key == "finance_roles":
        return st in ("job_open_30d", "jobs_3plus") and bool(FIN_WORDS.search(ev))
    if key == "no_website":
        return st == "new_incorporation" and _no_website(l)
    if key == "not_mobile":
        return st == "website_not_mobile" or (st == "website_outdated" and "mobile" in ev.lower())
    if key == "fleet_warehouse":
        return st in ("new_incorporation", "new_location") and (
            bool(sic and str(sic)[:2] in FLEET_SIC) or bool(FLEET_WORDS.search(ev)))
    return False


def prefer(leads: list[dict], keys: list[str], sic_of=None) -> list[dict]:
    """Gewünschte Leads zuerst (Reihenfolge sonst unverändert), danach alle übrigen als Auffüllung."""
    if not keys:
        return list(leads)
    def hit(l: dict) -> bool:
        s = sic_of(l) if sic_of and "fleet_warehouse" in keys else None
        return any(matches(k, l, s) for k in keys)
    first = [l for l in leads if hit(l)]
    ids = {id(l) for l in first}
    return first + [l for l in leads if id(l) not in ids]
