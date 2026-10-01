"""IE: Rechtsform einer Firma aus dem offenen Firmenregister (Companies Registration Office, opendata.cro.ie,
kostenloser Massendownload aller Firmen, ohne Schlüssel, täglich aktualisiert).

Kunden-Werk (Scout-Sprint 01.10.2026): In Irland mailen wir nur Kapitalgesellschaften (S.I. 336/2011, Prüfregel
unverändert). Die Rechtsform stand fast nie im Overture-Eintrag oder auf der Website, darum blieben irische Käufer
„nur Anruf/Brief“. Abgleich wie bei Companies House: Name (ohne Rechtsform) kommt unter den aktiven Firmen genau
einmal vor und ist eindeutig genug (mindestens zwei Wörter oder 8 Zeichen). Test 01.10.2026: 12.842 von 97.337
irischen Overture-Firmen mit Website eindeutig, davon 96 % LTD.
"""
from __future__ import annotations

import csv
import io
import re
import time
import zipfile
from pathlib import Path

import requests

from extraktor.sources.uk_ch import _key as _uk_key

IE_SUFFIX = re.compile(r"\b(dac|clg|uc|plc|teoranta|teo|designated activity( company)?)\b")


def _key(name: str) -> str:
    """Name ohne Rechtsform (wie Companies House, zusätzlich die irischen Formen DAC/CLG/UC/Teoranta)."""
    return " ".join(IE_SUFFIX.sub(" ", _uk_key(name)).split())

URL = ("https://opendata.cro.ie/dataset/bf6f837d-0946-4c14-9a99-82cd6980c121/resource/"
       "3fef41bc-b8f4-4b10-8434-ce51c29b1bba/download/companies.csv.zip")
CACHE = Path(__file__).resolve().parents[3] / "out" / "cache" / "cro_companies.csv.zip"
MAX_AGE = 7 * 86400
# company_type -> Rechtsform (nur Kapitalgesellschaften; „External company“ = ausländische Zweigniederlassung: leer)
FORMS = (("LTD", "Ltd"), ("DAC", "DAC"), ("CLG", "CLG"), ("PLC", "PLC"), ("UC", "UC"))


def form_of(company_type: str) -> str | None:
    t = (company_type or "").strip().upper()
    for prefix, form in FORMS:
        if t.startswith(prefix):
            return form
    return None


def _download(log=print) -> Path:
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with requests.get(URL, stream=True, timeout=120) as r:
                r.raise_for_status()
                tmp = CACHE.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for block in r.iter_content(1 << 20):
                        f.write(block)
                tmp.replace(CACHE)
                return CACHE
        except requests.RequestException as exc:
            log(f"CRO-Download Versuch {attempt + 1}: {type(exc).__name__}")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("CRO-Massendaten nicht erreichbar")


def index(rows) -> dict[str, list[tuple[str, str]]]:
    """Aktive Firmen: Namensschlüssel -> [(Firmennummer, company_type)]."""
    out: dict[str, list[tuple[str, str]]] = {}
    for r in rows:
        if (r.get("company_status") or "").strip() != "Normal":
            continue
        out.setdefault(_key(r.get("company_name") or ""), []).append((r["company_num"], r.get("company_type") or ""))
    return out


def match(names: dict[str, str], idx: dict[str, list[tuple[str, str]]]) -> dict[str, dict]:
    """{ID: Name} -> {ID: {number, form}} nur bei eindeutigem, ausreichend langem Namen und Kapitalgesellschaft."""
    out = {}
    for sid, name in names.items():
        k = _key(name)
        if not (len(k.split()) >= 2 or len(k) >= 8):
            continue
        hits = idx.get(k) or []
        if len(hits) == 1 and form_of(hits[0][1]):
            out[sid] = {"number": hits[0][0], "form": form_of(hits[0][1])}
    return out


def match_by_name(names: dict[str, str], log=print) -> dict[str, dict]:
    if not names:
        return {}
    try:
        with zipfile.ZipFile(_download(log)) as z, z.open(z.namelist()[0]) as f:
            idx = index(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace")))
    except (RuntimeError, zipfile.BadZipFile, KeyError) as exc:
        log(f"IE: Firmenregister nicht verfügbar ({exc}) – Rechtsform bleibt offen")
        return {}
    out = match(names, idx)
    log(f"IE: {len(out)} von {len(names)} Firmen über den Namen eindeutig im Register (Kapitalgesellschaft)")
    return out
