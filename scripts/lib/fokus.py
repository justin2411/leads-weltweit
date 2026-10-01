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


def rank(segment: str | None, country: str | None, pairs: list[tuple[str, str]] | None = None) -> int:
    """0, 1, 2 … für Fokus-Tests (nach Priorität), sonst eine Zahl dahinter."""
    pairs = focus_pairs() if pairs is None else pairs
    try:
        return pairs.index((segment, country))
    except ValueError:
        return len(pairs)
