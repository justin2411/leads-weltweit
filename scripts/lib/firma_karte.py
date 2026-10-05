"""Firma-Karte (app/lib/firma-karte.json): Bereiche → Agenten → Werke → Flüsse, eine Quelle für App und Skripte.

Gleiche Datei wie app/lib/firma-karte.ts. Nur lesen; Änderungen an der Zuordnung immer in der JSON-Datei.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

PFAD = Path(__file__).resolve().parents[2] / "app" / "lib" / "firma-karte.json"


@lru_cache(maxsize=1)
def karte() -> dict:
    return json.loads(PFAD.read_text(encoding="utf-8"))


def naehe_umsatz() -> dict[str, float]:
    """Umsatznähe je Bereich (Gewicht im Abteilungs-Motor), z. B. {"vertrieb": 1.0, "recht": 0.3}."""
    return {b["slug"]: float(b["naehe_umsatz"]) for b in karte()["bereiche"]}


def bereich_von(rolle: str | None) -> str:
    """Bereich einer Rolle (agent_tasks.rolle); ohne Rolle oder unbekannt → „strategie“ (A1–A8)."""
    if not rolle:
        return "strategie"
    rid = rolle if ":" in rolle else f"rolle:{rolle}"
    for b in karte()["bereiche"]:
        if rid in b["agenten"]:
            return b["slug"]
    return "strategie"


def rolle_fuer_bereich(slug: str) -> str | None:
    """Leitende Fach-Rolle eines Bereichs (ohne Präfix), z. B. vertrieb → „trichter“; None ohne Rolle."""
    for b in karte()["bereiche"]:
        if b["slug"] == slug and str(b.get("leitung", "")).startswith("rolle:"):
            return b["leitung"][6:]
    return None
