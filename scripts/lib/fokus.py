"""Fokus-Tests (config/fokus.yaml): Reihenfolge für Entwürfe, Käufersuche und Versand."""
from __future__ import annotations

import re
from pathlib import Path

FILE = Path(__file__).resolve().parents[2] / "config" / "fokus.yaml"


def focus_pairs(path: Path = FILE) -> list[tuple[str, str]]:
    """[(Segment, Land), …] in Prioritätsreihenfolge; leer, wenn keine Datei."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    return [(a, b) for a, b in re.findall(r"^\s*-\s*(S\d+)/([A-Z]{2})\s*$", text, re.M)]


def focus_only(path: Path = FILE) -> bool:
    """nur_fokus: true – der Versand schickt nur Mails der Fokus-Tests (Inhaber 02.10.2026)."""
    try:
        return bool(re.search(r"^nur_fokus:\s*true\s*$", path.read_text(encoding="utf-8"), re.M))
    except OSError:
        return False


def rank(segment: str | None, country: str | None, pairs: list[tuple[str, str]] | None = None) -> int:
    """0 für jeden Fokus-Test, 1 für alles andere. Fokus-Tests sind gleichrangig (Test-Matrix über drei Länder,
    Inhaber 01.10.2026), damit kein Land die anderen verdrängt; die Aufrufer mischen innerhalb des Fokus."""
    pairs = focus_pairs() if pairs is None else pairs
    return 0 if (segment, country) in pairs else 1
