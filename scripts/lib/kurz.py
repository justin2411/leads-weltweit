"""Wenig Text überall (Inhaber 04.10.2026: „ich will einen klaren titel und dann eine kurze knappe und saubere
begründung haben, damit ich es direkt einordnen kann … immer wenig text nutzen überall!“).

kurz_titel(text)  -> worum es geht, ≤ 60 Zeichen
kurz_grund(text)  -> ein klarer Satz, ≤ 160 Zeichen
insert_decisions  -> schreibt signalwerk.decisions mit kurz_titel/kurz_grund; fehlen die Spalten noch
                     (PostgREST PGRST204), wird ohne sie geschrieben – Schreiben scheitert nie daran.

Gleiche Regeln wie app/lib/kurz-schreiben.ts (gemeinsame Fälle: tests/fixtures/kurz_cases.json).
"""
from __future__ import annotations

import re

TITEL_MAX = 60
GRUND_MAX = 160
KURZ_SPALTEN = ("kurz_titel", "kurz_grund")

_ZEIT = r"\d{1,2}:\d{2}(?::\d{2})?"
_ZONE = r"(?:UTC|MESZ|MEZ|CEST|CET)"
# „Sitzung 27.09. 16:30 UTC:“, „Vorschlag:“, „Notiz:“, „Hinweis:“ am Anfang
_PRAEFIX = re.compile(
    rf"^(?:(?:Gehirn-)?Sitzung(?:\s+\d{{1,2}}\.\d{{1,2}}\.(?:\d{{2,4}})?)?(?:\s*{_ZEIT})?(?:\s*{_ZONE})?\s*[:–-]\s*"
    rf"|(?:Vorschlag|Notiz|Hinweis|Info)\s*:\s*)",
    re.I)
_ZEITSTEMPEL = re.compile(rf"\s*(?:\b(?:um|seit|ab|bis)\s+)?~?\s*(?:\d{{1,2}}\.\d{{1,2}}\.(?:\d{{2,4}})?\s+)?~?{_ZEIT}(?:\s*{_ZONE})?"
                          rf"|\s*\b{_ZONE}\b")
_ISO = re.compile(r"\s*\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?")
_KLAMMER = re.compile(r"\s*\([^()]*\)")


def _klammer_weg(m: re.Match) -> str:
    """Klammern mit Zahlen, Formeln oder langen Einschüben weg; kurze Wörter wie „(Testmodus)“ bleiben."""
    inner = m.group(0).strip()[1:-1]
    return "" if re.search(r"[\d=/%]", inner) or len(inner) > 25 else m.group(0)


_ABK = {"z", "b", "u", "a", "d", "h", "ca", "bzw", "inkl", "ggf", "evtl", "nr", "vgl", "usw", "etc", "max", "min",
        "mind", "bspw", "s", "st", "str", "dr", "mio", "mrd", "tsd", "vs", "abs", "art", "e", "i", "o", "v"}


def _glatt(text: str | None) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def kuerzen(text: str | None, n: int) -> str:
    """An Wortgrenze auf höchstens n Zeichen kürzen, mit „…“ wenn gekürzt."""
    t = _glatt(text)
    if len(t) <= n:
        return t
    cut = t[: n - 1]
    sp = cut.rfind(" ")
    if sp >= n // 2:
        cut = cut[:sp]
    return cut.rstrip(" ,;:–-(/~") + "…"


def _ohne_rauschen(text: str) -> str:
    t = _glatt(text)
    for _ in range(2):  # „Sitzung …: Vorschlag: …“
        t = _PRAEFIX.sub("", t)
    t = _ISO.sub("", t)
    t = _ZEITSTEMPEL.sub("", t)
    for _ in range(2):  # verschachtelte Klammern
        t = _KLAMMER.sub(_klammer_weg, t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    return re.sub(r"\s+", " ", t).strip(" ,;–-")


def _satzende(t: str) -> int:
    """Index hinter dem ersten echten Satzende (nicht bei Daten wie 27.09. oder Abkürzungen wie z. B.)."""
    for m in re.finditer(r"[.!?](?=\s+[A-ZÄÖÜ0-9„\"]|\s*$)", t):
        if t[m.start()] == ".":
            wort = re.split(r"[\s(]", t[: m.start()])[-1]
            if re.fullmatch(r"[\d.,]*\d", wort) and re.search(r"\d\.\d{1,2}$|^\d{1,2}$", wort):
                continue  # Datum „27.09.“
            if wort.lower().rstrip(".") in _ABK or (len(wort) == 1 and wort.isalpha()):
                continue
        return m.end()
    return len(t)


def _teile(t: str, n: int) -> str:
    """Ganze Teilsätze (an „, “ „; “ „ – “) nehmen, solange sie passen; sonst an Wortgrenze kürzen."""
    if len(t) <= n:
        return t
    stuecke = re.split(r"(?<=[,;])\s+|\s+(?=[–—]\s)", t)
    out = ""
    for s in stuecke:
        neu = (out + " " + s).strip() if out else s
        if len(neu.rstrip(",; –—")) > n:
            break
        out = neu
    out = out.rstrip(",; –—")
    if len(out) >= n // 2:
        return out
    return kuerzen(t, n)


def kurz_titel(text: str | None) -> str:
    """Worum es geht, ≤ 60 Zeichen: ohne Sitzungs-/Vorschlags-Präfix und Uhrzeiten, bis zum ersten Doppelpunkt
    oder Satzende. Kurze Etiketten („Recherche: …“, „Preis: …“) bleiben mit dem Rest stehen."""
    t = _ohne_rauschen(text or "")
    if not t:
        return ""
    t = t[: _satzende(t)].rstrip(".")
    if ":" in t:
        kopf, rest = t.split(":", 1)
        rest = rest.strip()
        if len(kopf) > 24 or not rest:
            t = kopf.strip()
        else:
            # Etikett behalten, Rest bis zum nächsten Doppelpunkt
            t = f"{kopf.strip()}: {rest.split(':', 1)[0].strip()}"
    return _teile(t, TITEL_MAX)


def kurz_grund(text: str | None) -> str:
    """Ein klarer Satz, ≤ 160 Zeichen: ohne Uhrzeiten und Zahlenkaskaden in Klammern, erster Satz."""
    t = _ohne_rauschen(text or "")
    if not t:
        return ""
    satz = t[: _satzende(t)].strip()
    satz = _teile(satz, GRUND_MAX)
    return satz


def mit_kurz(row: dict) -> dict:
    """Zeile für decisions um kurz_titel/kurz_grund ergänzen (vorhandene Werte bleiben, werden aber begrenzt)."""
    out = dict(row)
    titel = out.get("kurz_titel") or kurz_titel(out.get("subject"))
    grund = out.get("kurz_grund") or kurz_grund(out.get("reasoning"))
    out["kurz_titel"] = kuerzen(titel, TITEL_MAX) or None
    out["kurz_grund"] = kuerzen(grund, GRUND_MAX) or None
    return out


def _fehlende_spalte(err: Exception) -> bool:
    msg = str(err)
    return "PGRST204" in msg or any(c in msg and ("column" in msg or "Spalte" in msg) for c in KURZ_SPALTEN)


def insert_decisions(db, rows: list[dict] | dict) -> list[dict]:
    """decisions schreiben – mit Kurzfassung; fehlen die Spalten (Migration noch nicht angewandt), ohne sie."""
    many = isinstance(rows, list)
    voll = [mit_kurz(r) for r in (rows if many else [rows])]
    if not voll:
        return []
    try:
        return db.insert("decisions", voll if many else voll[0])
    except RuntimeError as e:
        if not _fehlende_spalte(e):
            raise
        alt = [{k: v for k, v in r.items() if k not in KURZ_SPALTEN} for r in voll]
        return db.insert("decisions", alt if many else alt[0])
