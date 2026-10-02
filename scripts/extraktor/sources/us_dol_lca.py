"""US: Arbeitgeber mit Fachkräfte-Bedarf aus den LCA-Offenlegungsdaten des US-Arbeitsministeriums (DOL OFLC).
Quellen-Scout 02.10.2026 (S1 Personalvermittlung), Inhaber 02.10.2026: Altersgrenze für diese Quelle lockern.

Amtliche Quartalsdatei (Werk der US-Bundesregierung, gemeinfrei, ein Download je Quartal, kein Scraping):
https://www.dol.gov/agencies/eta/foreign-labor/performance -> LCA_Disclosure_Data_FY<jahr>_Q<n>.xlsx (~250 MB)

Je Fall: Arbeitgeber mit Adresse, Telefon, FEIN, NAICS, Ansprechperson des Arbeitgebers (Name, Rolle, Telefon,
E-Mail), Stelle, Eingangsdatum, Zahl der Stellen und Art (Neueinstellung, Wechsel, Verlängerung).
Wir nehmen nur die Kontaktfelder des Arbeitgebers, nie Anwalt/Agent, und keine Lohnangaben.

Auswahl (Test 02.10.2026: 2.806 vollständige Arbeitgeber in FY2026 Q3):
  - zertifizierte Fälle der letzten 90 Tage der Datei, je Arbeitgeber (FEIN, sonst Name)
  - mindestens 3 Neueinstellungen (NEW_EMPLOYMENT + CHANGE_EMPLOYER)
  - keine Personaldienste, IT-Dienstleister, Beratungen (die sind selbst Vermittler), keine Hochschulen,
    keine Großanmelder (> 50 Fälle im Geschäftsjahr)
  - E-Mail der Ansprechperson auf einer Domain, die zum Firmennamen passt (keine Kanzlei, kein Freemail)

`build()` lädt die Datei und schreibt nur die ausgewählten Arbeitgeber als kleine JSON-Datei (Zwischenspeicher
für alle Teile des Lead-Werks); `load()` liest sie und macht daraus Kandidaten.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

import requests

from extraktor.model import candidate, title_case

PAGE = "https://www.dol.gov/agencies/eta/foreign-labor/performance"
CACHE = Path("out/cache/dol_lca.json")
# Ehrlicher Bot-Name ohne „Mozilla“: dol.gov (Akamai) sperrt den Browser-ähnlichen Namen mit 403 (Scout 02.10.2026)
UA = {"User-Agent": "NextGenProfitBot/0.1 (+company-signal research)"}
SOURCE_NAME = "US Department of Labor, LCA disclosure data"
WINDOW_DAYS = 90
MIN_NEW_HIRES = 3
MAX_FY_CASES = 50
CERTIFIED = {"Certified", "Certified - Withdrawn"}
FREEMAIL = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "live.com", "msn.com",
            "protonmail.com", "ymail.com", "comcast.net", "att.net", "me.com"}
STOP = {"INC", "LLC", "CORP", "CORPORATION", "CO", "LTD", "THE", "OF", "AND", "LP", "LLP", "PC", "PLLC", "GROUP", "USA",
        "US", "AMERICA", "COMPANY", "SERVICES", "HOLDINGS", "INTERNATIONAL", "NA"}
# Vermittler und Dienstleister sind selbst Wettbewerber unserer Käufer; Hochschulen stellen anders ein
SKIP_NAICS = re.compile(r"^(5613|54151|5416|6113)")
SKIP_NAME = re.compile(r"\b(STAFFING|CONSULTING|CONSULTANTS|CONSULTANCY|SOLUTIONS|TECHNOLOGIES|TECHNOLOGY|INFOTECH|"
                       r"SYSTEMS|SOFTWARE|IT SERVICES|INFOSYSTEMS|RECRUIT\w*|TALENT|GLOBAL SERVICES|TECH|UNIVERSITY|"
                       r"COLLEGE|SCHOOL DISTRICT|PUBLIC SCHOOLS)\b")
LAW = re.compile(r"law|legal|immig|visa|fragomen|berardi|ogletree", re.I)
COLS = ("CASE_NUMBER", "CASE_STATUS", "RECEIVED_DATE", "EMPLOYER_NAME", "EMPLOYER_FEIN", "EMPLOYER_ADDRESS1",
        "EMPLOYER_ADDRESS2", "EMPLOYER_CITY", "EMPLOYER_STATE", "EMPLOYER_POSTAL_CODE", "EMPLOYER_PHONE", "NAICS_CODE",
        "EMPLOYER_POC_FIRST_NAME", "EMPLOYER_POC_LAST_NAME", "EMPLOYER_POC_JOB_TITLE", "EMPLOYER_POC_PHONE",
        "EMPLOYER_POC_EMAIL", "AGENT_ATTORNEY_EMAIL_ADDRESS", "JOB_TITLE", "SOC_TITLE", "TOTAL_WORKER_POSITIONS",
        "NEW_EMPLOYMENT", "CHANGE_EMPLOYER")


def latest_url() -> str:
    """Neueste LCA-Quartalsdatei auf der DOL-Seite (höchstes Geschäftsjahr, höchstes Quartal)."""
    html = requests.get(PAGE, headers={**UA, "Accept": "text/html"}, timeout=60).text
    links = set(re.findall(r'href="([^"]*LCA_Disclosure_Data_FY(\d{4})_Q(\d)\.xlsx)"', html))
    if not links:
        raise RuntimeError("keine LCA-Datei auf der DOL-Seite gefunden")
    href = max(links, key=lambda x: (int(x[1]), int(x[2])))[0]
    return href if href.startswith("http") else "https://www.dol.gov" + href


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", "", (name or "").upper())).strip()


def _day(v) -> dt.date | None:
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _num(v) -> int:
    try:
        return int(float(v or 0))
    except (TypeError, ValueError):
        return 0


def company_mail(email: str, employer: str, attorney_email: str = "") -> bool:
    """E-Mail der Ansprechperson liegt auf einer Domain, die zum Firmennamen passt (nicht Kanzlei, nicht Freemail)."""
    email = (email or "").strip().lower()
    if "@" not in email:
        return False
    dom = email.rsplit("@", 1)[1]
    if dom in FREEMAIL or LAW.search(dom):
        return False
    if attorney_email and "@" in attorney_email and attorney_email.lower().rsplit("@", 1)[1] == dom:
        return False
    stem = re.sub(r"[^a-z0-9]", "", dom.rsplit(".", 1)[0].split(".")[-1])
    words = _norm(employer).split()
    toks = [t.lower() for t in words if t not in STOP and len(t) >= 3]
    if any(t in stem or (len(stem) >= 4 and stem in t) for t in toks):
        return True
    ini = "".join(t[0] for t in words if t not in STOP).lower()
    return len(ini) >= 2 and stem.startswith(ini)


def select(rows, log=print) -> list[dict]:
    """Fälle (dicts mit COLS) -> ausgewählte Arbeitgeber, neueste zuerst."""
    rows = [r for r in rows if _day(r.get("RECEIVED_DATE"))]
    if not rows:
        return []
    fy = Counter(r.get("EMPLOYER_FEIN") or _norm(r.get("EMPLOYER_NAME")) for r in rows)
    end = max(_day(r["RECEIVED_DATE"]) for r in rows)
    start = end - dt.timedelta(days=WINDOW_DAYS - 1)
    emp: dict[str, dict] = {}
    for r in rows:
        d = _day(r["RECEIVED_DATE"])
        if d < start or r.get("CASE_STATUS") not in CERTIFIED:
            continue
        key = r.get("EMPLOYER_FEIN") or _norm(r.get("EMPLOYER_NAME"))
        e = emp.setdefault(key, {"key": key, "cases": 0, "positions": 0, "new_hires": 0, "first": d, "last": d,
                                 "titles": Counter(), "soc": Counter(), "contact": None, "contact_day": None})
        e["cases"] += 1
        e["positions"] += max(_num(r.get("TOTAL_WORKER_POSITIONS")), 1)
        e["new_hires"] += _num(r.get("NEW_EMPLOYMENT")) + _num(r.get("CHANGE_EMPLOYER"))
        e["first"], e["last"] = min(e["first"], d), max(e["last"], d)
        e["titles"][clean_title(r.get("JOB_TITLE"))] += 1
        e["soc"][(r.get("SOC_TITLE") or "").strip()] += 1
        # Kontakt aus dem neuesten Fall mit Firmen-Mail, Adresse, Telefon und Ansprechperson
        full = all((r.get(k) or "").strip() for k in ("EMPLOYER_ADDRESS1", "EMPLOYER_CITY", "EMPLOYER_STATE",
                                                       "EMPLOYER_POSTAL_CODE", "EMPLOYER_POC_LAST_NAME",
                                                       "EMPLOYER_POC_JOB_TITLE"))
        phone = (r.get("EMPLOYER_PHONE") or r.get("EMPLOYER_POC_PHONE") or "").strip()
        if (full and phone and company_mail(r.get("EMPLOYER_POC_EMAIL"), r.get("EMPLOYER_NAME"),
                                            r.get("AGENT_ATTORNEY_EMAIL_ADDRESS") or "")
                and (e["contact_day"] is None or d > e["contact_day"])):
            e["contact"], e["contact_day"] = r, d
    out, why = [], Counter()
    for key, e in emp.items():
        r = e["contact"]
        if fy[key] > MAX_FY_CASES:
            why["over_50_cases"] += 1
        elif e["new_hires"] < MIN_NEW_HIRES:
            why["under_3_new_hires"] += 1
        elif r is None:
            why["no_complete_company_contact"] += 1
        elif SKIP_NAICS.search(str(r.get("NAICS_CODE") or "")) or SKIP_NAME.search(_norm(r.get("EMPLOYER_NAME"))):
            why["staffing_it_consulting_or_education"] += 1
        else:
            out.append({
                "key": key, "name": r["EMPLOYER_NAME"].strip(), "case": r["CASE_NUMBER"],
                "street": ", ".join(x.strip() for x in (r.get("EMPLOYER_ADDRESS1"), r.get("EMPLOYER_ADDRESS2")) if (x or "").strip()),
                "city": r["EMPLOYER_CITY"].strip(), "state": r["EMPLOYER_STATE"].strip()[:2].upper(),
                "zip": str(r["EMPLOYER_POSTAL_CODE"]).strip()[:5],
                "phone": (r.get("EMPLOYER_PHONE") or "").strip(), "phone_alt": (r.get("EMPLOYER_POC_PHONE") or "").strip(),
                "email": r["EMPLOYER_POC_EMAIL"].strip().lower(),
                "person": f"{(r.get('EMPLOYER_POC_FIRST_NAME') or '').strip()} {r['EMPLOYER_POC_LAST_NAME'].strip()}".strip(),
                "role": r["EMPLOYER_POC_JOB_TITLE"].strip(), "naics": str(r.get("NAICS_CODE") or "").strip(),
                "cases": e["cases"], "positions": e["positions"], "new_hires": e["new_hires"],
                "first": e["first"].isoformat(), "last": e["last"].isoformat(),
                "titles": [t for t, _ in e["titles"].most_common(3) if t],
                "soc": [t for t, _ in e["soc"].most_common(2) if t],
            })
    out.sort(key=lambda x: x["last"], reverse=True)
    log(f"DOL LCA: {len(emp)} Arbeitgeber {start}–{end}, ausgewählt {len(out)}; ausgeschlossen {dict(why)}")
    return out


def clean_title(t) -> str:
    """Stellentitel ohne Binde- und Gedankenstriche (Inhaber 02.10.2026), in normaler Schreibweise."""
    t = re.sub(r"\s*[-–—/]+\s*", " ", str(t or "")).strip()
    t = re.sub(r"\s+", " ", t)
    if t.isupper() or t.islower():
        t = t.title()
    # römische Stufen und Kürzel groß lassen („Engineer II“, „QA Analyst“)
    return re.sub(r"\b(Ii|Iii|Iv|Vi|Qa|It|Ui|Ux|Hr|Ai|Ml|Rn|Cad)\b", lambda m: m.group(1).upper(), t)


def read_xlsx(path: Path):
    """Zeilen der ersten Tabelle als dicts (nur COLS), speichersparend Zeile für Zeile."""
    from python_calamine import CalamineWorkbook
    rows = CalamineWorkbook.from_path(str(path)).get_sheet_by_index(0).iter_rows()
    head = [str(h).strip() for h in next(rows)]
    idx = {c: head.index(c) for c in COLS if c in head}
    for row in rows:
        yield {c: _cell(row[i] if i < len(row) else "", c) for c, i in idx.items()}


def _cell(v, col: str):
    """Zahlenzellen (PLZ, Telefon, FEIN) als Text: calamine liefert float, select() erwartet str."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    s = str(int(v)) if float(v).is_integer() else str(v)
    return s.zfill(5) if col == "EMPLOYER_POSTAL_CODE" and len(s) < 5 else s


def build(path: Path = CACHE, log=print) -> Path:
    """Neueste Quartalsdatei laden, auswählen, als kleine JSON-Datei ablegen (Zwischenspeicher)."""
    url = latest_url()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".xlsx")
    log(f"DOL LCA: lade {url}")
    with requests.get(url, headers=UA, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    try:
        emps = select(read_xlsx(tmp), log=log)
    finally:
        tmp.unlink(missing_ok=True)
    path.write_text(json.dumps({"url": url, "built": dt.date.today().isoformat(), "employers": emps}), encoding="utf-8")
    return path


def to_candidate(e: dict, url: str = PAGE) -> dict:
    first, last = dt.date.fromisoformat(e["first"]), dt.date.fromisoformat(e["last"])
    name = title_case(e["name"])
    return candidate(
        source="dol_lca", source_id=e["key"], country="US", source_url=url, source_date=last, event_date=last,
        name=name, legal_name=name, street=title_case(e["street"]), city=title_case(e["city"]), state=e["state"],
        zip=e["zip"], phone=e["phone"], phone_alt=e["phone_alt"] if e["phone_alt"] != e["phone"] else "",
        email=e["email"], person_name=title_case(e["person"]), person_role=e["role"],
        facts={"cases": e["cases"], "positions": e["positions"], "new_hires": e["new_hires"], "first_received": first,
               "last_received": last, "titles": e["titles"], "soc_titles": e["soc"], "naics": e["naics"],
               "case_number": e["case"]},
    )


def load(path: Path = CACHE, log=print) -> list[dict]:
    if not path.exists():
        log(f"DOL LCA: kein Zwischenspeicher {path}, Quelle übersprungen")
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [to_candidate(e, data.get("url") or PAGE) for e in data["employers"]]
