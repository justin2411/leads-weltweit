"""Katalog zusätzlicher Zielgruppen aus config/zielgruppen.yaml (vom System selbst startbar)."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import yaml

PATH = Path(__file__).resolve().parents[2] / "config" / "zielgruppen.yaml"


@lru_cache(maxsize=1)
def entries() -> dict[str, dict]:
    try:
        data = yaml.safe_load(PATH.read_text(encoding="utf-8")) or {}
    except OSError:
        return {}
    return {e["id"]: e for e in data.get("zielgruppen", [])}


def osm_segments() -> dict[str, dict]:
    """Im Format von osm.SEGMENTS."""
    out = {}
    for sid, e in entries().items():
        pat = e.get("muster")
        out[sid] = {"filters": e["osm_filter"], "pattern": re.compile(pat, re.I) if pat else None,
                    "specialization": e.get("spezialisierung") or ""}
    return out


def countries() -> dict[str, list[str]]:
    return {sid: e.get("laender", []) for sid, e in entries().items()}


def also_for(active: set[str]) -> dict[str, list[str]]:
    """Signal -> zusätzliche aktive Katalog-Zielgruppen."""
    out: dict[str, list[str]] = {}
    for sid, e in entries().items():
        if sid in active:
            for sig in e.get("signale", []):
                out.setdefault(sig, []).append(sid)
    return out


def opener(segment: str, lang: str) -> str | None:
    e = entries().get(segment)
    return e.get("opener") if e and lang == "en" else None


def draft(segment: str, firm: str, area: str, spec: str, brand: str, example_line: str) -> tuple[str, str, str, str, str] | None:
    """(Betreff, erster Satz, Kern, Detail, Frage) für eine Katalog-Zielgruppe oder None."""
    e = entries().get(segment)
    if not e:
        return None
    spec = spec or e.get("spezialisierung") or ""
    f = {"firm": firm, "area": area, "spec": spec, "brand": brand}
    return (e["betreff"].format(**f), e["erster_satz"].format(**f), e["kern"].format(**f),
            example_line or e["detail"].format(**f), e["frage"].format(**f))
