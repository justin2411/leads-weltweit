"""FR-Käufer für Webagenturen (S2) nur mit klarem Webdesign-Bezug (JARVIS-Auftrag 1e9a203d, 04.10.2026).

Auswertung optout-muster-s2: 3 von 17 angeschriebenen FR-Käufern ohne Webdesign (Software-/Marketingfirmen)
meldeten sich ab. Seitdem gilt für S2 in Frankreich zusätzlich zur unveränderten Prüfregel (lib.rules):

1. Branche laut Register (SIRENE, Code NAF/APE): 6201Z Programmation informatique, 6202A Conseil en systèmes et
   logiciels, 7311Z Agences de publicité oder 7410Z Design – und
2. die eigene Website nennt Webdesign ausdrücklich („web design“, „création de sites“, „agence web“ …) – und
3. die Website ist keine Domain-Verkaufs- oder Parkseite.

Nur strenger, nie lockerer: Fehlt ein Nachweis, ist der Käufer nicht mail-fähig. Reine Funktionen ohne Netzwerk.
"""
from __future__ import annotations

import re
import unicodedata

from lib.regnum import plain_text

WEB_NAF = {"6201Z", "6202A", "7311Z", "7410Z"}
MARK = "FR-Webdesign-Prüfung"
PENDING = "Webdesign-Prüfung offen"

# auf Text ohne Akzente, klein geschrieben
WEB_EVIDENCE = re.compile(
    r"\bweb ?design(er|ers|s)?\b|\bwebdesign|\bcreation (de |des |d'un |d un |de votre |de vos )?sites?\b|"
    r"\bagence (web|digitale web)\b|\bconception (de |des |d'un |d un |de votre |de vos )?sites?\b|"
    r"\brealisation (de |des |d'un |d un |de votre |de vos )?sites?\b|\bdeveloppement (de sites?|web)\b|"
    r"\bsites? (internet|web) (sur mesure|vitrine|e-?commerce)\b|\bsite vitrine\b|\bwebsite design\b|"
    r"\bdesign web\b|\bintegrat(eur|rice|ion) web\b|\brefon(te|dre|dons) (de |des |d'un |d un |de votre |vos |les )?sites?\b|"
    r"\bweb ?agency\b|\bcreateur de sites?\b|\bconcepteur (de )?sites?\b")
PARKED = re.compile(
    r"\b(this|the) domain (name )?(is|may be) for sale\b|\bbuy this domain\b|\bdomain (is )?parked\b|"
    r"\bce (nom de )?domaine (est|peut etre) (a vendre|en vente|disponible a la vente)\b|\bdomaine a vendre\b|"
    r"\bnom de domaine a vendre\b|\bsedo(parking)?\b|\bparkingcrew\b|\bafternic\b|\bhugedomains\b|\bdan\.com\b|"
    r"\bbodis\b|\bundeveloped\.com\b|\bparked (free|by)\b|\bdomain parking\b")


def _fold(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[\s ]+", " ", t.replace("’", "'"))


def naf_norm(code: str | None) -> str:
    """„62.01Z“ / „6201z“ -> „6201Z“."""
    return re.sub(r"[^0-9A-Z]", "", (code or "").upper())


def web_evidence(html: str) -> str | None:
    """Erster Webdesign-Nachweis im Seitentext oder None."""
    m = WEB_EVIDENCE.search(_fold(plain_text(html)))
    return m.group(0) if m else None


def parked(html: str, url: str = "") -> bool:
    """Domain-Verkaufs- oder Parkseite (Text oder End-URL)."""
    return bool(PARKED.search(_fold(plain_text(html))) or PARKED.search(_fold(url)))


def verdict(naf: str | None, html: str, loaded: bool = True, url: str = "") -> tuple[bool, str]:
    """(passt, Grund). Alle drei Bedingungen müssen erfüllt sein."""
    code = naf_norm(naf)
    if not loaded or not (html or "").strip():
        return False, "Website nicht lesbar, kein Webdesign-Nachweis"
    if parked(html, url):
        return False, "Domain-Verkaufs-/Parkseite"
    if not code:
        return False, "kein Code NAF im Register (SIRENE)"
    if code not in WEB_NAF:
        return False, f"NAF {code} ist keine Web-/Design-Branche"
    ev = web_evidence(html)
    if not ev:
        return False, f"NAF {code}, aber kein Webdesign auf der Website"
    return True, f"NAF {code} + Website „{ev}“"


def applies(segment: str | None, country: str | None) -> bool:
    return (segment or "").upper() == "S2" and (country or "").upper() == "FR"
