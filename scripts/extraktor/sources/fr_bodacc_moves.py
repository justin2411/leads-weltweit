"""Frankreich S2: Umzug / neuer Sitz aus dem BODACC – über die Rohdaten der DILA (Quellen-Scout R63, 06.10.2026).

Quelle: amtlicher Open-Data-Server der DILA `echanges.dila.gouv.fr/OPENDATA/BODACC/FluxAnneeCourante/`
(Licence Ouverte, ohne Konto/Schlüssel). Je Ausgabe des BODACC B (Modifications/Radiations, Dienstag–Samstag) eine
Datei `RCS-B_BXB<Jahr><Nr>.taz` (tar.gz mit einer XML-Datei, ~0,5–1,5 MB). robots.txt des Servers: nicht vorhanden
(404) = keine Sperre. Die per robots.txt gesperrten BODACC-Schnittstellen (opendatasoft, bodacc.fr)
werden nie abgerufen; bodacc.fr erscheint nur als Beleg-Link der einzelnen Meldung.

Anlass für Webagenturen: Meldungen mit Transfert du siège / de l'établissement principal, Nouveau siège, Nouvel
établissement principal – nur Gesellschaften (personne morale), ohne SCI/Holding wie fr_bodacc, ohne gleichzeitige
Auflösung. Nach einem Umzug müssen Website, mentions légales, Google-Profil und Verzeichnisse die neue Adresse zeigen.
Datum = Erscheinen im BODACC. Telefon/E-Mail/Website nur über die vorhandene kostenlose Anreicherung (eigene Website
mit SIREN in den mentions légales); Ansprechperson = erste natürliche Person der Geschäftsführung laut Meldung.

Abruf: höchstens 1× am Tag je Datei (Job `fr-moves` im Lead-Werk, Merker vor dem Abruf), 1 s Pause zwischen den
Dateien; Zwischenspeicher `out/cache/fr_moves.json` (nur die Felder der Umzugsmeldungen, nie im Repo).
"""
from __future__ import annotations

import datetime as dt
import io
import json
import os
import re
import tarfile
import time
import urllib.robotparser
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from extraktor.model import candidate
from extraktor.sources.fr_bodacc import SKIP_ACT, SKIP_FORM, dirigeant

SOURCE = "bodacc_move"
BASE = "https://echanges.dila.gouv.fr/OPENDATA/BODACC/FluxAnneeCourante/"
ROBOTS = "https://echanges.dila.gouv.fr/robots.txt"
UA = {"User-Agent": "NextGenProfitBot/0.1 (+https://www.nextgen-profit.de)"}
CACHE = Path(os.environ.get("EXTRAKTOR_MOVES", "out/cache/fr_moves.json"))
DAYS = 30  # gespeichert bis 30 Tage; Premium zählt lib/premium.py nur bis 14 Tage
# Gedächtnis je Teil (Workflow-Zwischenspeicher): jede Umzugsmeldung wird nur EINMAL angereichert – die Teile laufen
# mehrmals am Tag, Firmen-Websites höchstens 1×/Tag (CLAUDE.md §2). Nicht grüne Umzüge werden nicht gespeichert
# (nur Premium), ohne Gedächtnis kämen sie in jedem Lauf wieder.
SEEN = Path(os.environ.get("EXTRAKTOR_MOVES_SEEN", "out/cache/fr_moves_seen.json"))
FILE = re.compile(r'href="(RCS-B_BXB(\d{4})(\d{4})\.taz)">[^<]*</a>\s+(\d{4}-\d{2}-\d{2}) ', re.I)
MOVE = re.compile(r"transfert d[ue] (?:si[eè]ge|l'[ée]tablissement principal)|nouveau si[eè]ge|"
                  r"nouvel [ée]tablissement principal|modification survenue sur l'adresse du si[eè]ge", re.I)
# Gleichzeitig aufgelöst/aufgegeben: kein Kunde für eine Webagentur
ENDING = re.compile(r"dissolution|cessation|liquidation|radiation|mise en sommeil|transmission universelle", re.I)


def detail_url(parution: str, numero: str) -> str:
    """Beleg-Link der Meldung auf bodacc.fr (wie bei fr_bodacc: id = B + Ausgabe + Nummer der Meldung)."""
    return f"https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B{parution}{numero}"


def _addr(el) -> dict:
    f = el.find("france") if el is not None else None
    if f is None:
        return {}
    return {k: (f.findtext(k) or "").strip() for k in ("numeroVoie", "typeVoie", "nomVoie", "codePostal", "ville")}


def parse(xml: bytes) -> list[dict]:
    """Umzugsmeldungen von Gesellschaften aus einer RCS-B-Ausgabe (XML), schon ohne Auflösungen."""
    root = ET.fromstring(xml)
    parution = (root.findtext("parution") or "").strip()
    day = (root.findtext("dateParution") or "").strip()
    out = []
    for a in root.iter("avis"):
        desc = (a.findtext("modificationsGenerales/descriptif") or "").strip()
        if not MOVE.search(desc) or ENDING.search(desc):
            continue
        p = a.find("personnes/personne")
        pm = p.find("personneMorale") if p is not None else None
        if pm is None:
            continue
        out.append({
            "id": f"B{parution}{(a.findtext('numeroAnnonce') or '').strip()}",
            "url": detail_url(parution, (a.findtext("numeroAnnonce") or "").strip()),
            "date": day, "desc": desc[:300], "dept": (a.findtext("numeroDepartement") or "").strip(),
            "name": (pm.findtext("denomination") or "").strip().strip('"'),
            "form": (pm.findtext("formeJuridique") or "").strip(),
            "admin": (pm.findtext("administration") or "").strip()[:400],
            "activity": (p.findtext("activite") or "").strip()[:300],
            "siren": re.sub(r"\D", "", p.findtext("numeroImmatriculation/numeroIdentificationRCS") or ""),
            "greffe": (p.findtext("numeroImmatriculation/nomGreffeImmat") or "").strip(),
            "siege": _addr(p.find("siegeSocial")), "etab": _addr(p.find("etablissementPrincipal")),
        })
    return out


def _allowed(url: str) -> bool:
    """robots.txt der DILA beachten (heute nicht vorhanden = alles erlaubt; eine spätere Sperre gilt sofort)."""
    rp = urllib.robotparser.RobotFileParser()
    r = requests.get(ROBOTS, headers=UA, timeout=60)
    if r.status_code >= 400:
        return r.status_code not in (401, 403)
    rp.parse(r.text.splitlines())
    return rp.can_fetch(UA["User-Agent"], url)


def files(index_html: str, since: dt.date) -> list[tuple[str, str]]:
    """(Dateiname, Ausgabe) der RCS-B-Dateien, die seit `since` erschienen sind (Datum laut Verzeichnis)."""
    out = []
    for name, year, nr, day in FILE.findall(index_html):
        if dt.date.fromisoformat(day) >= since:
            out.append((name, f"{year}{nr}"))
    return sorted(out, key=lambda x: x[1])


def download(log=print, today: dt.date | None = None, days: int = DAYS) -> list[dict]:
    """Tagesabruf: Verzeichnis + alle RCS-B-Ausgaben der letzten `days` Tage, je Datei 1 Abruf."""
    today = today or dt.date.today()
    if not _allowed(BASE):
        log("FR-Umzüge: robots.txt der DILA sperrt den Abruf – nichts geladen")
        return []
    idx = requests.get(BASE, headers=UA, timeout=120)
    idx.raise_for_status()
    todo = files(idx.text, today - dt.timedelta(days=days))
    rows: list[dict] = []
    for name, _ in todo:
        time.sleep(1)
        r = requests.get(BASE + name, headers=UA, timeout=180)
        r.raise_for_status()
        with tarfile.open(fileobj=io.BytesIO(r.content), mode="r:*") as tf:
            for m in tf.getmembers():
                if m.isfile() and m.name.lower().endswith(".xml"):
                    rows += parse(tf.extractfile(m).read())
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(rows, ensure_ascii=False))
    log(f"FR-Umzüge: {len(todo)} BODACC-B-Ausgaben, {len(rows)} Umzüge von Gesellschaften (≤ {days} Tage)")
    return rows


def cached() -> list[dict]:
    try:
        return json.loads(CACHE.read_text())
    except (OSError, ValueError):
        return []


def load_seen() -> dict[str, str]:
    """{Meldungs-ID: Prüfdatum} dieses Teils (älter als DAYS fällt weg, die Meldung ist dann ohnehin zu alt)."""
    try:
        d = json.loads(SEEN.read_text())
    except (OSError, ValueError):
        return {}
    cut = (dt.date.today() - dt.timedelta(days=DAYS + 1)).isoformat()
    return {k: v for k, v in d.items() if isinstance(v, str) and v >= cut}


def remember(ids, today: dt.date | None = None) -> int:
    """Bearbeitete Meldungen ins Gedächtnis schreiben (sofort gespeichert: ein Abbruch verliert nichts)."""
    seen = load_seen()
    day = (today or dt.date.today()).isoformat()
    n = 0
    for i in ids:
        if i and i not in seen:
            seen[i] = day
            n += 1
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    SEEN.write_text(json.dumps(seen))
    return n


def what_moved(desc: str) -> str:
    return "établissement principal" if re.search(r"[ée]tablissement principal", desc or "", re.I) else "siège"


def to_candidate(r: dict) -> dict | None:
    desc = r.get("desc") or ""
    if not MOVE.search(desc) or ENDING.search(desc):
        return None
    form, act = r.get("form") or "", (r.get("activity") or "").strip()
    if SKIP_FORM.search(form) or SKIP_ACT.search(act) or SKIP_FORM.search(r.get("name") or ""):
        return None
    siren = r.get("siren") or ""
    if len(siren) != 9:
        return None
    moved = what_moved(desc)
    a = (r.get("etab") if moved == "établissement principal" else None) or r.get("siege") or {}
    street = " ".join(x for x in (a.get("numeroVoie"), a.get("typeVoie"), a.get("nomVoie")) if x)
    if not (street and a.get("codePostal") and a.get("ville") and r.get("name")):
        return None
    pub = dt.date.fromisoformat(r["date"][:10])
    person, role = dirigeant(r.get("admin") or "")
    return candidate(
        source=SOURCE, source_id=siren, country="FR", source_url=r.get("url") or "",
        source_date=pub, event_date=pub, name=r["name"], legal_name=r["name"],
        street=street, city=a.get("ville") or "", state="", zip=a.get("codePostal") or "",
        person_name=person, person_role=f"{role} (BODACC)" if role else "",
        facts={"notice": r.get("id") or "", "siren": siren, "published_on": pub, "moved": moved, "form": form, "activity": act[:220],
               "department": r.get("dept"), "registry_court": r.get("greffe"), "signal_type": "relocation"},
    )


def load(limit: int | None, log=print, exclude: set[str] | None = None) -> list[dict]:
    """Umzüge aus dem Zwischenspeicher, neueste zuerst und mit Ansprechperson zuerst (exclude = schon gespeicherte
    SIREN dieser Quelle)."""
    done = load_seen()
    cands = [c for c in (to_candidate(r) for r in cached()) if c]
    n_all = len(cands)
    cands = [c for c in cands if c["facts"]["notice"] not in done]
    seen, uniq = set(), []
    for c in sorted(cands, key=lambda c: (-c["event_date"].toordinal(), not c.get("person_name"))):
        if c["source_id"] in seen or (exclude and c["source_id"] in exclude):
            continue
        seen.add(c["source_id"])
        uniq.append(c)
    out = uniq if limit is None else uniq[:limit]
    log(f"FR-Umzüge: {n_all} passende Gesellschaften, {n_all - len(cands)} schon bearbeitet, {len(out)} ausgewählt")
    return out


if __name__ == "__main__":  # Tagesabruf (Job `fr-moves` im Lead-Werk)
    download()
