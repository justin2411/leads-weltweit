"""Registernummern, die eine Firma auf ihrer eigenen Website veröffentlicht (Quellen-Scout R20, 03.10.2026).

UK: Companies-House-Nummer („Company No. 01234567“, „Registered in England & Wales 01234567“, „Reg. No SC123456“).
FR: SIREN aus den Mentions légales (Pflichtangabe: „RCS Lyon 812 345 678“, „SIRET 812 345 678 00012“,
„TVA FR12 812345678“), nur mit gültiger Prüfziffer (Luhn).

Die Nummer allein beweist nichts: Rechtsform und Status kommen immer aus dem Register (uk_ch.by_number,
fr_sirene.by_siren). Erst dann gilt die Firma als Kapitalgesellschaft – die Prüfregel selbst bleibt unverändert.
"""
from __future__ import annotations

import html as _html
import re

_TAGS = re.compile(r"<(script|style)\b.*?</\1>|<[^>]+>", re.I | re.S)
FR_SIREN = re.compile(
    r"(?:\bsiren\b|\bsiret\b|\br\.?\s?c\.?\s?s\.?(?=[\s:]|$)|registre du commerce[^0-9]{0,40}|"
    r"\btva\b[^0-9]{0,25}fr\s?\d{2})"
    r"[^0-9]{0,40}?(\d{3}[\s. ]?\d{3}[\s. ]?\d{3})(?![\d])", re.I)
UK_NUMBER = re.compile(
    r"(?:\bcompany\b|\bregistration\b|\breg\.?(?=[\s:#n])|\bregistered\b)[^0-9<]{0,40}?\b((?:SC|NI|OC|SO)?\d{6,8})\b", re.I)


def plain_text(html: str) -> str:
    """Seiten-HTML als Text (Tags, Skripte, Stile raus; &nbsp; zu Leerzeichen)."""
    t = _TAGS.sub(" ", html or "")
    return _html.unescape(t).replace(" ", " ")


def luhn_ok(digits: str) -> bool:
    total = 0
    for i, c in enumerate(reversed(digits)):
        d = int(c) * (2 if i % 2 else 1)
        total += d - 9 if d > 9 else d
    return total % 10 == 0


def fr_sirens(text: str) -> list[str]:
    """SIREN-Nummern (9 Ziffern, gültige Prüfziffer) in Reihenfolge des Auftretens, ohne Doppelte."""
    out = []
    for m in FR_SIREN.findall(text or ""):
        n = re.sub(r"\D", "", m)
        if len(n) == 9 and n != "000000000" and luhn_ok(n) and n not in out:
            out.append(n)
    return out


def uk_numbers(text: str) -> list[str]:
    """Companies-House-Nummern (8 Stellen, ggf. mit Präfix SC/NI/OC/SO), ohne Doppelte."""
    out = []
    for m in UK_NUMBER.findall(text or ""):
        n = m.upper()
        n = n.zfill(8) if n.isdigit() else n[:2] + n[2:].zfill(6)
        if n.strip("0") and n not in out:
            out.append(n)
    return out


# ---------------------------------------------------------------------------
# BE / SE / IE / NL (JARVIS-Agent „Käufer finden · Mail-Länder“, 04.10.2026): Nummern auf der eigenen Website,
# Rechtsform kommt aus EU-VIES (Name der Firma im Mehrwertsteuerregister) bzw. KVK Open Dataset (nur BV/NV).
# ---------------------------------------------------------------------------
BE_NUMBER = re.compile(
    r"(?:\bbtw\b|\btva\b|\bvat\b|ondernemingsnummer|num[ée]ro d.entreprise|\bkbo\b|\bbce\b|enterprise number|"
    r"\brpr\b|\brpm\b|\bbe\b)[^0-9<]{0,25}?(?:BE)?\s?([01]\d{3}[\s.]?\d{3}[\s.]?\d{3})(?!\d)", re.I)
SE_NUMBER = re.compile(
    r"(?:org\.?\s*nr|organisationsnummer|org\.?\s*nummer|momsreg\w*|\bvat\b|\bmoms\b)[^0-9<]{0,25}?(?:SE)?\s?"
    r"(\d{6}-?\d{4})(?!\d)", re.I)
IE_VAT = re.compile(r"\b(?:vat|tax)\b[^0-9<]{0,30}?(?:IE)\s?(\d{7}[A-W][A-IW]?)\b", re.I)
FI_YTUNNUS = re.compile(r"(?:y-?tunnus|business id|ly-?tunnus|fo-?nummer|\bvat\b|alv)[^0-9<]{0,25}?(?:FI)?\s?(\d{7}-?\d)(?!\d)", re.I)
NL_KVK = re.compile(r"(?:\bkvk\b|k\.v\.k\.|kamer van koophandel|\bcoc\b|chamber of commerce|handelsregister)"
                    r"[^0-9<]{0,30}?(\d{8})(?!\d)", re.I)


def _uniq(xs):
    out = []
    for x in xs:
        if x not in out:
            out.append(x)
    return out


def be_numbers(text: str) -> list[str]:
    """Belgische Unternehmensnummern (10 Ziffern, Prüfziffer 97 − Rest mod 97)."""
    out = []
    for m in BE_NUMBER.findall(text or ""):
        n = re.sub(r"\D", "", m).zfill(10)
        if len(n) == 10 and int(n[:8]) and 97 - int(n[:8]) % 97 == int(n[8:]):
            out.append(n)
    return _uniq(out)


def se_numbers(text: str) -> list[str]:
    """Schwedische Organisationsnummern (10 Ziffern, Luhn) als VIES-Nummer (+ „01“)."""
    out = []
    for m in SE_NUMBER.findall(text or ""):
        n = re.sub(r"\D", "", m)
        if len(n) == 10 and luhn_ok(n):
            out.append(n + "01")
    return _uniq(out)


def ie_vats(text: str) -> list[str]:
    """Irische USt-Nummern mit Präfix IE („VAT No. IE 1234567AB“)."""
    return _uniq([m.upper() for m in IE_VAT.findall(text or "")])


def fi_numbers(text: str) -> list[str]:
    """Finnische Y-tunnus (7 Ziffern + Prüfziffer, Gewichte 7-9-10-5-8-4-2, mod 11) als VIES-Nummer (8 Ziffern)."""
    out = []
    for m in FI_YTUNNUS.findall(text or ""):
        n = re.sub(r"\D", "", m)
        r = sum(int(a) * w for a, w in zip(n[:7], (7, 9, 10, 5, 8, 4, 2))) % 11
        if len(n) == 8 and r != 1 and (0 if r == 0 else 11 - r) == int(n[7]):
            out.append(n)
    return _uniq(out)


def nl_kvks(text: str) -> list[str]:
    """KVK-Nummern (8 Ziffern) neben „KvK“/„Kamer van Koophandel“."""
    return _uniq([m for m in NL_KVK.findall(text or "") if m.strip("0")])


def numbers_for(country: str, text: str) -> list[str]:
    """Registernummern je Land (UK, FR, BE, SE, IE, NL, FI)."""
    fn = {"UK": uk_numbers, "FR": fr_sirens, "BE": be_numbers, "SE": se_numbers, "IE": ie_vats, "NL": nl_kvks, "FI": fi_numbers}.get(country)
    return fn(text) if fn else []
