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
