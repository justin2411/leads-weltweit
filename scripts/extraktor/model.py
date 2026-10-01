"""Gemeinsames Lead-Format des Extraktors und CSV-Spalten."""
from __future__ import annotations

import re

# Reihenfolge der CSV-Spalten (Inhaber-Ansicht und Import)
CSV_COLUMNS = [
    "ampel", "segment", "country", "company", "legal_name", "contact_name", "contact_role", "phone", "phone_type",
    "email", "email_type", "website", "street", "city", "state", "zip",
    "signal", "signal_date", "company_info", "opener", "urgency", "urgency_reason",
    "source", "source_id", "source_url", "qc", "qc_notes", "sc", "sc_notes",
]


def candidate(**kw) -> dict:
    """Leerer Kandidat mit allen Feldern; Quellen füllen, was sie belegen können."""
    base = {
        "source": "", "source_id": "", "source_url": "", "source_date": None, "event_date": None,
        "country": "US", "name": "", "legal_name": "", "street": "", "city": "", "state": "", "zip": "",
        "phone": "", "phone_alt": "", "email": "", "website": "", "person_name": "", "person_role": "",
        "facts": {}, "evidence": {},
    }
    base.update(kw)
    return base


def title_case(s: str) -> str:
    """'J3K TRANSPORT LLC' -> 'J3K Transport LLC' (Rechtsformen und Kürzel bleiben groß)."""
    keep = {"LLC", "LLP", "LP", "PLLC", "INC", "CO", "USA", "US", "II", "III", "IV", "DBA", "PC", "PA", "LTD", "JR", "SR"}
    s = (s or "").strip()
    if re.search(r"[a-z]", s):  # schon gemischt geschrieben (SEC): so lassen, nur Leerraum glätten
        return re.sub(r"\s+", " ", s)
    out = []
    for w in re.split(r"(\s+)", (s or "").strip()):
        if not w.strip():
            out.append(w)
            continue
        bare = re.sub(r"[^A-Za-z]", "", w).upper()
        if bare == "INC":
            out.append("Inc." + ("," if w.endswith(",") else ""))
        elif bare in keep or (any(c.isdigit() for c in w) and len(w) <= 6):
            out.append(w.upper() if bare in keep else w)
        elif "-" in w:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return "".join(out)
