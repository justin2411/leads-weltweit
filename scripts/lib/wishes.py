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
        "finance_roles", "no_website", "website_outdated", "not_mobile", "security", "broken", "fleet_warehouse"}


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


# Radar-Leads (lib/radar.py also_text): datiertes Ereignis + am selben Tag bestätigter Befund „veraltet“/„nicht mobil“
# im Text. Nur dieser Zusatzsatz zählt (Quellen-Scout 05.10.2026), nie geraten.
# Mit Prüfdatum (Premium-Labor 05.10.2026): „The same check on <Datum> also found that …“, „Our earlier check on
# <Datum> found that …“ (und FR); ältere Leads ohne Datum im Satz passen weiter.
ALSO_MARK = re.compile(r"(The same check(?: on [^.;:]+?)? also found that |Le même contrôle(?: du [^.;:]+?)? a aussi "
                       r"relevé que |Our earlier check on [^.;:]+? found that |Notre contrôle du [^.;:]+? avait relevé que )"
                       r"(.*)$", re.S)
ALSO_MOBILE = re.compile(r"not built for phones|pas adaptée aux mobiles")
ALSO_OUTDATED = re.compile(r"copyright|old version|Adobe Flash|ancienne version")
RADAR_TYPES = ("cert_expiring", "no_https")


def _also(l: dict, pat: re.Pattern) -> bool:
    if (l.get("signal_type") or "") not in RADAR_TYPES:
        return False
    m = ALSO_MARK.search(l.get("event_summary") or "")
    return bool(m and pat.search(m.group(2)))


def matches(key: str, l: dict, sic: str | None = None) -> bool:
    """Passt der Lead zum Wunsch? sic: SIC-Code der Beobachtung (nur für fleet_warehouse nötig)."""
    st = l.get("signal_type") or ""
    ev = l.get("event_summary") or ""
    if key in ("job_open_30d", "jobs_3plus", "new_location", "new_incorporation"):
        return st == key
    if key == "website_outdated":
        # Website-Prüfung (02.10.2026): kaputt oder veraltet gehört zum Wunsch „veraltete Website“
        return st in ("website_outdated", "website_broken") or _also(l, ALSO_OUTDATED)
    if key == "broken":
        return st == "website_broken"
    if key == "security":
        return st in ("no_https", "cert_expiring")
    if key == "new_director":
        return st == "new_incorporation"
    if key == "growth":
        return st == "jobs_3plus"
    if key == "expansion":
        return st in ("new_location", "jobs_3plus", "relocation")
    if key == "finance_roles":
        return st in ("job_open_30d", "jobs_3plus") and bool(FIN_WORDS.search(ev))
    if key == "no_website":
        # Firmen ohne Website (Overture, Signal no_website) und Neugründungen ohne gefundene Website
        return st == "no_website" or (st == "new_incorporation" and _no_website(l))
    if key == "not_mobile":
        return (st == "website_not_mobile" or (st == "website_outdated" and "mobile" in ev.lower())
                or _also(l, ALSO_MOBILE))
    if key == "fleet_warehouse":
        return st in ("new_incorporation", "new_location") and (
            bool(sic and str(sic)[:2] in FLEET_SIC) or bool(FLEET_WORDS.search(ev)))
    return False


# signal_type-Werte, unter denen ein Wunsch-Lead stehen kann (Vorauswahl in der Datenbank, siehe matches)
SIGNAL_TYPES = {
    "job_open_30d": ["job_open_30d"], "jobs_3plus": ["jobs_3plus"], "new_location": ["new_location"],
    "new_incorporation": ["new_incorporation"], "new_director": ["new_incorporation"], "growth": ["jobs_3plus"],
    "expansion": ["new_location", "jobs_3plus", "relocation"], "finance_roles": ["job_open_30d", "jobs_3plus"],
    "no_website": ["no_website", "new_incorporation"], "website_outdated": ["website_outdated", "website_broken", *RADAR_TYPES],
    "not_mobile": ["website_not_mobile", "website_outdated", *RADAR_TYPES], "security": ["no_https", "cert_expiring"], "broken": ["website_broken"],
    "fleet_warehouse": ["new_incorporation", "new_location"],
}


def signal_types(keys: list[str]) -> list[str]:
    """Alle signal_type-Werte, die zu den Wünschen passen können."""
    return sorted({t for k in keys for t in SIGNAL_TYPES.get(k, [])})


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
