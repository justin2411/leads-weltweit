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


def _list(text: str, key: str) -> list[str]:
    """Liste `  key: [A, B]` unter `tests:` (nur diese einfache Form, keine YAML-Abhängigkeit)."""
    block = re.search(r"^tests:\s*\n((?:[ \t]+.*\n?)*)", text, re.M)
    m = re.search(rf"^\s+{key}:\s*\[([^\]]*)\]", block.group(1), re.M) if block else None
    return [x.strip().strip("'\"").upper() for x in m.group(1).split(",") if x.strip()] if m else []


def test_scope(path: Path = FILE) -> tuple[list[str], list[str]]:
    """(Segmente, Länder), in denen Gehirn und JARVIS testen dürfen (Inhaber 04.10.2026: nur Webagenturen US/UK/FR).
    Fehlt die Datei oder der Block, ist nichts freigegeben (leere Listen = kein Test)."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return [], []
    return _list(text, "segmente"), _list(text, "laender")


def test_allowed(segment: str | None, country: str | None, scope: tuple[list[str], list[str]] | None = None) -> bool:
    """True nur für Segment × Land aus der Freigabe-Liste config/fokus.yaml `tests` (A/B, Varianten, Preise …)."""
    segs, countries = test_scope() if scope is None else scope
    return (segment or "").upper() in segs and (country or "").upper() in countries
