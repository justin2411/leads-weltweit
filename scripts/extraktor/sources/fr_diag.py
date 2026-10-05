"""FR: Premium-Leads für Webagenturen (S2) aus dem „Annuaire des diagnostiqueurs immobiliers“ (DGALN).

Offener Datensatz auf data.gouv.fr (5bc5df57634f417a900a5ed0, Licence Ouverte 2.0), täglich als CSV auf
static.data.gouv.fr, ohne Schlüssel und ohne Konto. Je Zertifikat: Nom, Prénom, Société, Adresse, CP, Ville,
Tel1/Tel2, E-Mail, Organisme, Type de certificat, Date début/fin validité.

Anlass (Quellen-Scout R40, 05.10.2026): ein Diagnostiqueur, der NEU im Verzeichnis steht = frisch zertifiziert und
macht sich gerade selbstständig. „Date début validité“ allein reicht nicht (Zertifikate laufen 7 Jahre, eine
Verlängerung bekommt auch ein neues Startdatum). Deshalb Vergleich mit der Tagesdatei von vor OLD_DAYS Tagen: neu ist
nur, wer dort weder mit Name+Vorname noch mit seiner E-Mail stand und dessen ältestes Zertifikat ≤ NEW_DAYS Tage alt
ist. Datum des Anlasses = ältester Zertifikatsbeginn (lib/premium.py, `details.dated_event`).

Nur Freemail-Adressen (gmail, orange …): eine eigene Mail-Domain heißt meist Website oder Netzwerk-Angestellter
(wie RGE/Bio). Ob es wirklich keine Website gibt, prüft danach die normale Anreicherung und die Drei-Stufen-Freigabe.

Abruf: zwei Dateien am Tag (heute + vor OLD_DAYS Tagen), Zwischenspeicher `out/cache/fr_diag.json` (MAX_AGE 20 h).
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import time
from pathlib import Path

import requests

from extraktor.model import candidate
from lib import websites as W

SOURCE = "diagnostiqueurs"
DATASET = "https://www.data.gouv.fr/api/1/datasets/5bc5df57634f417a900a5ed0/"
PAGE_URL = "https://diagnostiqueurs.din.developpement-durable.gouv.fr/index.action"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
CACHE = Path(os.environ.get("EXTRAKTOR_DIAG", "out/cache/fr_diag.json"))
MAX_AGE = 20 * 3600
NEW_DAYS = 30  # gespeichert bis 30 Tage; Premium zählt lib/premium.py nur bis 14 Tage
OLD_DAYS = 31
FREEMAIL = re.compile(r"@(gmail|googlemail|hotmail|live|outlook|msn|yahoo|ymail|icloud|me|aol|orange|wanadoo|free|"
                      r"sfr|neuf|bbox|laposte|gmx|protonmail|proton)\.", re.I)
JUNK_SOC = re.compile(r"^\s*(n/?a|na|nc|non renseign[ée]e?|individuel(le)?|aucune?|neant|néant|-+|\.+|0+|x+|"
                      r"auto[- ]?entrepreneur|micro[- ]?entrepr\w*|ei|ind[ée]pendant)\s*$", re.I)
TITLE_DATE = re.compile(r"(\d{2})-(\d{2})-(\d{4})")


def _date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(s or "")[:10])
    except ValueError:
        return None


def key(r: dict) -> tuple[str, str]:
    return (W.norm(r.get("Nom") or ""), W.norm(r.get("Prenom") or ""))


def parse(text: str) -> list[dict]:
    return [r for r in csv.DictReader(io.StringIO(text), delimiter=";") if (r.get("Nom") or "").strip()]


def fresh(new_rows: list[dict], old_rows: list[dict], today: dt.date) -> list[dict]:
    """Personen (eine Zeile je Person, Zertifikate gesammelt), die in der alten Datei fehlen (Name und E-Mail) und
    deren ältestes Zertifikat 0 … NEW_DAYS Tage alt ist."""
    old_keys = {key(r) for r in old_rows}
    old_mail = {(r.get("email") or "").strip().lower() for r in old_rows} - {""}
    people: dict[tuple[str, str], list[dict]] = {}
    for r in new_rows:
        people.setdefault(key(r), []).append(r)
    out = []
    for k, rs in people.items():
        if k in old_keys or any((r.get("email") or "").strip().lower() in old_mail for r in rs):
            continue
        starts = [d for r in rs if (d := _date(r.get("Date début validité")))]
        if not starts or not 0 <= (today - min(starts)).days <= NEW_DAYS or max(starts) > today:
            continue
        first = rs[0]
        out.append({k2: (first.get(k2) or "").strip() for k2 in
                    ("Nom", "Prenom", "Societe", "Adresse", "CP", "Ville", "Tel1", "Tel2", "email", "Organisme")}
                   | {"first": min(starts).isoformat(),
                      "types": sorted({(r.get("Type de certificat") or "").strip() for r in rs} - {""})})
    return out


def _resources(get) -> list[tuple[dt.date, str]]:
    d = get(DATASET).json()
    out = []
    for r in d.get("resources") or []:
        m = TITLE_DATE.search(r.get("title") or "")
        if m and (r.get("url") or "").endswith(".csv"):
            out.append((dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))), r["url"]))
    return sorted(out, reverse=True)


def _get(url: str):
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=180)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))


def cached() -> list[dict]:
    """Frische Personen aus dem Zwischenspeicher (vom Tagesabruf `fr-diag` im Lead-Werk); sonst leer."""
    try:
        return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else []
    except ValueError:
        return []


def download(log=print, today: dt.date | None = None) -> list[dict]:
    """Tagesabruf: neueste Datei und die Datei von vor ≥ OLD_DAYS Tagen; jede Datei höchstens einmal am Tag."""
    today = today or dt.date.today()
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        return cached()
    res = _resources(_get)
    if not res:
        raise RuntimeError("Diagnostiqueurs: keine Tagesdateien gefunden")
    newest = res[0]
    old = next((x for x in res if (newest[0] - x[0]).days >= OLD_DAYS), None)
    if not old:
        raise RuntimeError("Diagnostiqueurs: keine Vergleichsdatei gefunden")
    new_rows = parse(_get(newest[1]).content.decode("utf-8-sig", "replace"))
    time.sleep(2)
    old_rows = parse(_get(old[1]).content.decode("utf-8-sig", "replace"))
    out = fresh(new_rows, old_rows, today)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    log(f"Diagnostiqueurs: {len(new_rows)} Zertifikate ({newest[0]}), Vergleich {old[0]}, {len(out)} neue Personen")
    return out


def _phones(d: dict) -> list[str]:
    out = []
    for k in ("Tel1", "Tel2"):
        v = re.sub(r"\s+", " ", d.get(k) or "").strip()
        if len(re.sub(r"\D", "", v)) >= 9 and v not in out:
            out.append(v)
    return out


def person(d: dict) -> str:
    s = re.sub(r"\s+", " ", f"{d.get('Prenom') or ''} {d.get('Nom') or ''}").strip()
    return " ".join(w[:1].upper() + w[1:].lower() for w in s.split(" ")) if s else ""


def society(d: dict) -> str:
    soc = re.sub(r"\s+", " ", d.get("Societe") or "").strip()
    return "" if JUNK_SOC.match(soc) or not re.search(r"[A-Za-zÀ-ÿ]{2}", soc) else soc


def companies(items: list[dict]) -> list[dict]:
    """Neue Diagnostiqueurs mit Freemail, Telefon und vollständiger Adresse. Mehrere neue Personen derselben Société
    (Netzwerk, Ausbildungszentrum, Angestellte) -> kein Anlass „macht sich selbstständig“, alle raus."""
    by_soc: dict[tuple[str, str], int] = {}
    for d in items:
        if society(d):
            k = (W.norm(society(d)), d.get("CP") or "")
            by_soc[k] = by_soc.get(k, 0) + 1
    out, seen = [], set()
    for d in items:
        k = (W.norm(d.get("Nom") or ""), W.norm(d.get("Prenom") or ""))
        if k in seen or not FREEMAIL.search(d.get("email") or ""):
            continue
        seen.add(k)
        if society(d) and by_soc.get((W.norm(society(d)), d.get("CP") or ""), 0) > 1:
            continue
        if not (_phones(d) and re.fullmatch(r"\d{5}", d.get("CP") or "") and (d.get("Ville") or "").strip()
                and len((d.get("Adresse") or "").strip()) >= 5):
            continue
        out.append(d)
    return out


FORMS = re.compile(r"\b(sarl|sas|sasu|eurl|sa|sci|snc|ei|eirl|sc)\b", re.I)
SMALL = {"de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et", "aux", "lès", "d", "l"}


def cap(s: str) -> str:
    """'spm diagnostic - agenda 40' -> 'SPM Diagnostic - Agenda 40' (nur ganz klein/groß Geschriebenes)."""
    s = re.sub(r"\s+", " ", (s or "").strip())
    if not (s.isupper() or s.islower()):
        return s
    parts = re.split(r"([ \-'’])", s.lower())
    out = "".join(p if p in " -'’" or (i and p in SMALL) else p[:1].upper() + p[1:] for i, p in enumerate(parts))
    return FORMS.sub(lambda m: m.group(0).upper(), out)


def source_id(d: dict) -> str:
    return W.norm(f"{d.get('Nom')} {d.get('Prenom')} {d.get('CP')}").replace(" ", "-")[:120]


def to_candidate(d: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    soc = society(d)
    # Ansprechperson nur, wenn die Person selbst der Betrieb ist (Einzelunternehmer: Société leer/Platzhalter);
    # bei einer Société kann sie Angestellte sein -> keine Person, die Prüfung nimmt die Rolle
    who = "" if soc else person(d)
    name = cap(soc) if soc else f"{who} Diagnostic Immobilier"
    phones = _phones(d)
    return candidate(
        source=SOURCE, source_id=source_id(d), country="FR", source_url=PAGE_URL,
        source_date=today, event_date=_date(d["first"]),
        name=name, legal_name=soc, street=cap(d["Adresse"]), city=cap(d["Ville"]), zip=d["CP"], phone=phones[0],
        phone_alt=phones[1] if len(phones) > 1 else "", email=(d.get("email") or "").strip().lower(),
        person_name=who, person_role="Gérant" if who else "",
        facts={"category": "Diagnostic immobilier", "checked_on": today,
               "diag_new": {"date": d["first"], "organisme": d.get("Organisme") or "", "types": d.get("types")[:6]}},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None, skip_phones: set[str] | None = None) -> list[dict]:
    """Bis zu `limit` neue Diagnostiqueurs, neueste zuerst (exclude = schon gespeicherte IDs; skip_phones =
    Telefon-Schlüssel aus overture.phone_key, die schon anderswo stehen)."""
    from extraktor.sources.overture import phone_key
    rows = companies(cached())
    rows.sort(key=lambda d: (d["first"], source_id(d)), reverse=True)
    skip = skip_phones or set()
    left = [d for d in rows if not (exclude and source_id(d) in exclude)
            and not any(phone_key(p) in skip for p in _phones(d))]
    out = [to_candidate(d) for d in (left if limit is None else left[:limit])]
    log(f"Diagnostiqueurs: {len(rows)} neue mit Freemail und Telefon, {len(rows) - len(left)} schon bekannt/"
        f"in Overture, {len(out)} ausgewählt")
    return out


if __name__ == "__main__":  # Tagesabruf (Job `fr-diag` im Lead-Werk)
    download()
