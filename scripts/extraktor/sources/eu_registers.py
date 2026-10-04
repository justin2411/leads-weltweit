"""BE / SE / IE / NL / FI: Rechtsform eines Käufers aus offiziellen offenen Registern, ohne Schlüssel, kostenlos.

JARVIS-Agent „Käufer finden · Mail-Länder“ (04.10.2026): In BE, SE, IE und NL dürfen wir nur Kapitalgesellschaften
anmailen (Prüfregel unverändert). Viele Webagenturen dort haben eine allgemeine Firmenadresse, scheiterten aber an
„Rechtsform nicht belegt“ (S2 call_only mit allgemeiner Adresse: NL 4.146, BE 1.309, SE 794, IE 186). Die Firmen
nennen ihre Unternehmens-/USt-/KVK-Nummer auf der eigenen Website (in BE Pflicht); das Register bestätigt:

- **EU VIES** (Europäische Kommission, ec.europa.eu/taxation_customs/vies, REST, ohne Schlüssel): gültige USt-Nummer
  -> eingetragener Name, bei BE mit Rechtsform („BV TENDER EXPERTS“, „SRL ANAGRAMME“), bei SE „… AB“/„AKTIEBOLAG“,
  bei IE „… LIMITED“. Natürliche Personen stehen mit Personennamen drin („Botten, Thierry“) -> keine Rechtsform.
- **KVK Handelsregister Open Dataset Basis Bedrijfsgegevens** (opendata.kvk.nl, HVDS, CC BY 4.0, ohne Schlüssel):
  liefert NUR BV/NV; jede andere Rechtsform (eenmanszaak, VOF …) antwortet mit Fehler IPD0015. Grenze laut KVK:
  höchstens eine Abfrage pro Minute je IP-Adresse (wir: 61 s Abstand), 200 je 5 Minuten für alle.

Test 04.10.2026 (je 100 Käufer „nur Anruf/Brief“ mit Firmen-E-Mail ohne Rechtsform): BE 46 mit Nummer, davon 36
Kapitalgesellschaften laut VIES; SE 9 mit Nummer, 4–7 AB; IE 1–2; NL 34 mit KVK-Nummer, 5 von 15 BV/NV.
Seit 04.10.2026 sind BE/IE „nie“ und NL kein Mail-Land (countries.yaml): genutzt wird das nur, wo die Länderregel
Mail erlaubt (Kunden-Werk `recheck_rows`), zurzeit SE und FI (Y-tunnus, „… Oy/Oyj“).
"""
from __future__ import annotations

import re
import time

import requests

VIES = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{number}"
KVK = "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/kvknummer/{number}"
KVK_INTERVAL = 61.0  # Sekunden zwischen zwei KVK-Abfragen (KVK: max. eine je Minute und IP)
VIES_INTERVAL = 1.0
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}

# Rechtsform im VIES-Namen (Anfang oder Ende, ganze Wörter); nur Formen aus lib.rules.COMPANY_FORMS
_BE = [("BVBA", "BVBA"), ("SPRL", "SPRL"), ("BV", "BV"), ("SRL", "SRL"), ("NV", "NV"), ("SA", "SA"), ("CV", "CV"),
       ("SC", "SC"), ("VZW", "VZW"), ("ASBL", "ASBL")]
_SE = [("AKTIEBOLAG", "AB"), ("AKTIEBOLAGET", "AB"), ("AB", "AB"), ("(PUBL)", "AB")]
_IE = [("DESIGNATED ACTIVITY COMPANY", "DAC"), ("DAC", "DAC"), ("CLG", "CLG"), ("PLC", "PLC"),
       ("UNLIMITED COMPANY", "UC"), ("LIMITED", "Ltd"), ("LTD", "Ltd"), ("TEORANTA", "Teoranta")]
_FI = [("OYJ", "Oyj"), ("OY", "Oy"), ("OSAKEYHTIÖ", "Oy"), ("AB", "Ab")]  # FI seit 04.10.2026 Mail-Land
FORMS = {"BE": _BE, "SE": _SE, "IE": _IE, "FI": _FI}


def form_from_name(cc: str, name: str | None) -> str | None:
    """Rechtsform aus dem Registernamen: BE vorn oder hinten („BV X“, „X SRL“), SE/IE hinten („X AB“, „X LIMITED“).
    Personennamen („Nachname, Vorname“) und unbekannte Formen (CommV, VOF, GmbH …) -> None."""
    if not name or name.strip() in ("---", ""):
        return None
    words = re.sub(r"[^\w()&]+", " ", name.upper().replace(".", "")).split()
    if not words:
        return None
    for token, form in FORMS.get(cc, []):
        parts = token.split()
        n = len(parts)
        if words[-n:] == parts or (cc == "BE" and words[:n] == parts):
            return form
    return None


def vies(cc: str, number: str, session: requests.Session | None = None) -> dict | None:
    """{valid, name, form} oder None (Dienst nicht erreichbar / Mitgliedstaat gerade nicht verfügbar)."""
    s = session or requests
    for attempt in range(3):
        r = s.get(VIES.format(cc=cc, number=number), headers=UA, timeout=30)
        if r.status_code in (429, 503) or (r.ok and "MS_MAX_CONCURRENT_REQ" in r.text):
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code >= 400:
            return None
        j = r.json()
        if j.get("userError") not in (None, "VALID", "INVALID"):
            time.sleep(3 * (attempt + 1))  # MS_UNAVAILABLE, TIMEOUT … -> später erneut
            continue
        name = (j.get("name") or "").strip()
        return {"valid": bool(j.get("isValid")), "name": name if name != "---" else "",
                "form": form_from_name(cc, name) if j.get("isValid") else None}
    return None


def kvk(number: str, session: requests.Session | None = None) -> dict | None:
    """KVK-Nummer -> {active, form} (form nur BV/NV); andere Rechtsform -> {active: None, form: None};
    None bei Störung/Grenze (kommt im nächsten Lauf wieder)."""
    s = session or requests
    r = s.get(KVK.format(number=number), headers=UA, timeout=30)
    if r.status_code == 429 or r.status_code >= 500:
        return None
    try:
        j = r.json()
    except ValueError:
        return None
    if r.status_code == 200 and j.get("rechtsvormCode") in ("BV", "NV"):
        return {"active": j.get("actief") == "J" and not j.get("insolventieCode"), "form": j["rechtsvormCode"]}
    if any(f.get("code") == "IPD0015" for f in j.get("fout") or []):
        return {"active": None, "form": None}  # keine BV/NV (eenmanszaak, VOF …) – bleibt „nur Anruf/Brief“
    return {"active": None, "form": None} if r.status_code == 404 else None
