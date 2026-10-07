"""Beleg-Einstieg vorbereiten (Gehirn 05.10.2026, Auftrag c5da4536, Start frühestens Do 08.10.).

Idee: Der erste Absatz der Kaltmail nennt 2 echte, freigegebene Premium-Anlässe aus dem Land des Empfängers
(nur Firmenname + Anlass + Datum). Diese Leads sind danach für diesen Käufer reserviert und gehen nie an andere.

Dieses Modul ist nur der reine, prüfbare Teil – es sendet nichts und schreibt nichts:
  * bereit(...)        Rechnet, ob ein Land genug freie Premium-Leads für den Test hat, ohne die Proben auszuhungern.
  * firma_ok(...)      Nur Firmennamen mit erkannter Kapitalgesellschaft (keine Personennamen von Einzelunternehmern).
  * einstieg(...)      Baut den Beleg-Satz (EN/FR) aus 2 Leads, ohne Stadt, ohne Personendaten. Er wird an den
                       Einstiegsabsatz angehängt (Platzhalter {belege} in Variante B, lib/ab.py); „across {Land}“
                       steht schon im Satz davor. Kein „this week“ (Premium-Anlässe sind bis 14 Tage alt) und keine
                       Aussage, die nicht für jeden Anlass stimmt (Zertifikat/Umzug: Website ist vorhanden).

Engpass-Rechnung (Stand 05.10.2026, premium_status): frei US 2.700, UK 317, FR 142. Bei 100 Mails je Variante und
2 Belegen je Mail braucht Variante B 200 Premium-Leads; die Hälfte des Bestands bleibt für Proben. Deshalb startet
der Test nur, wo frei ≥ 2 × Bedarf – heute nur US. UK/FR folgen, sobald die Scout-Quellen reichen.
"""
from __future__ import annotations

import datetime as dt
import re

from lib.rules import is_legal_person

BELEGE_JE_MAIL = 2
MIN_N_JE_VARIANTE = 100  # wie A/B-Mindestmenge Mail
PUFFER_FAKTOR = 2  # die Hälfte des freien Premium-Bestands bleibt für Proben

# Kurzform des Anlasses je Signal (ohne Stadt/Region, ohne Personendaten)
ANLASS = {
    "en": {"no_website": "registered, no website yet", "new_incorporation": "newly registered, no website yet",
           "incorporation": "newly registered, no website yet", "new_company": "newly registered, no website yet",
           "cert_expiring": "security certificate about to expire", "no_https": "website without HTTPS",
           "relocation": "moved premises, website still shows the old details",
           "website_broken": "website down", "website_outdated": "outdated website",
           "website_not_mobile": "website not mobile-friendly"},
    "fr": {"no_website": "immatriculée, sans site web", "new_incorporation": "nouvellement immatriculée, sans site web",
           "incorporation": "nouvellement immatriculée, sans site web",
           "new_company": "nouvellement immatriculée, sans site web",
           "cert_expiring": "certificat de sécurité bientôt expiré", "no_https": "site sans HTTPS",
           "relocation": "a déménagé, site avec l'ancienne adresse", "website_broken": "site hors service",
           "website_outdated": "site vieillissant", "website_not_mobile": "site non adapté au mobile"},
}
LAND = {"US": "the US", "UK": "the UK", "FR": "France"}
MONATE_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
             "novembre", "décembre"]


def bedarf(n_mails: int = MIN_N_JE_VARIANTE, je_mail: int = BELEGE_JE_MAIL) -> int:
    """Premium-Leads, die Variante B für n Mails reserviert."""
    return n_mails * je_mail


def bereit(frei: int, n_mails: int = MIN_N_JE_VARIANTE) -> bool:
    """Genug freie Premium-Leads für den Test, ohne die Proben auszuhungern?"""
    return int(frei or 0) >= PUFFER_FAKTOR * bedarf(n_mails)


def _formen(name: str) -> list[str]:
    """Rechtsform-Kandidaten: letztes Wort (LLC, Ltd) und erstes Wort (FR oft „SARL Dupont“)."""
    toks = re.sub(r"[,()]", " ", name or "").split()
    return [toks[-1], toks[0]] if toks else []


def firma_ok(name: str | None, country: str) -> bool:
    """Nur Namen mit erkannter Kapitalgesellschaft am Ende (LLC, Inc, Ltd, SAS …) – nie Einzelunternehmer, deren
    Firmenname ein Personenname sein kann. Unbekannt = nein (strenger, nie lockerer)."""
    return bool(name) and any(is_legal_person(country, f) for f in _formen(name or ""))


def _datum(d, lang: str) -> str | None:
    try:
        x = d if isinstance(d, dt.date) else dt.date.fromisoformat(str(d)[:10])
    except (TypeError, ValueError):
        return None
    if lang == "fr":
        return f"{x.day} {MONATE_FR[x.month - 1]}"
    return f"{x:%b} {x.day}"


def zeile(lead: dict, lang: str) -> str | None:
    """'Firma (Anlass, Datum)' oder None, wenn etwas fehlt."""
    name = (lead.get("company_name") or "").strip()
    anlass = ANLASS.get(lang, ANLASS["en"]).get(lead.get("signal_type") or "")
    datum = _datum(lead.get("event_date"), lang)
    if not (name and anlass and datum) or not firma_ok(name, lead.get("country") or ""):
        return None
    return f"{name} ({anlass}, {datum})"


def einstieg(leads: list[dict], country: str) -> str | None:
    """Beleg-Satz der Variante B (ersetzt {belege} im Einstiegsabsatz). None, wenn keine 2 verschiedenen, vollständigen
    Belege da sind (dann bleibt die Mail unverändert und zählt nicht – wie bei jedem A/B-Element)."""
    cc = (country or "").upper()
    lang = "fr" if cc == "FR" else "en"
    seen, rows = set(), []
    for ld in leads:
        z = zeile({**ld, "country": cc}, lang)
        key = (ld.get("company_name") or "").strip().lower()
        if z and key not in seen:
            seen.add(key)
            rows.append(z)
        if len(rows) == BELEGE_JE_MAIL:
            break
    if len(rows) < BELEGE_JE_MAIL:
        return None
    if lang == "fr":
        return f"Deux exemples récents : {rows[0]} et {rows[1]}."
    return f"Two recent examples: {rows[0]} and {rows[1]}."


# Nur für die Längenprüfung der Kontrolle A (kein echter Lead, wird nie gesendet): A und B werden gleich behandelt –
# ein Käufer zählt nur, wenn auch eine typische Variante B die Schreibregeln (70–120 Wörter) bestehen würde.
def _m(name: str, sig: str, d: str) -> dict:
    return {"company_name": name, "signal_type": sig, "event_date": d}


MUSTER = {
    "US": [_m("Harbor Point Services LLC", "new_incorporation", "2026-10-01"),
           _m("Northwind Supply Inc", "cert_expiring", "2026-10-04")],
    "UK": [_m("Harbor Point Services Ltd", "new_incorporation", "2026-10-01"),
           _m("Northwind Supply Ltd", "cert_expiring", "2026-10-04")],
    "FR": [_m("Atelier Bois Menuiserie SAS", "no_https", "2026-10-03"),
           _m("SARL Dupont Habitat", "relocation", "2026-09-30")],
}


def muster(country: str) -> str:
    """Beleg-Satz mit typischer Länge (nur zur Prüfung, nie im Versand). Leer = Land ohne Muster (dann kein Test)."""
    cc = (country or "").upper()
    return einstieg(MUSTER.get(cc, []), cc) or ""
