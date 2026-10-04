"""Projekt-Skills (.claude/skills) halten die Regeln aus docs/GEHIRN-LERNEN.md §3 ein."""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SKILLS = sorted(p for p in (ROOT / ".claude" / "skills").glob("*/SKILL.md"))


def _frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    assert m, "Frontmatter fehlt"
    return dict(re.findall(r"^(\w+): (.*)$", m.group(1), re.M))


def test_skills_vorhanden():
    names = {p.parent.name for p in SKILLS}
    assert {"kaltmail-bauen", "ruecklaeufer-klaeren", "lehren-einpflegen"} <= names


@pytest.mark.parametrize("path", SKILLS, ids=lambda p: p.parent.name)
def test_skill_regeln(path: Path):
    text = path.read_text(encoding="utf-8")
    fm = _frontmatter(text)
    name = fm.get("name", "")
    assert name == path.parent.name
    assert re.fullmatch(r"[a-z0-9-]{1,64}", name)
    assert "claude" not in name and "anthropic" not in name
    desc = fm.get("description", "")
    assert 0 < len(desc) <= 1024
    assert len(text.splitlines()) < 500
    assert "CLAUDE.md §2" in text and "Prüfschleife" in text and "- [ ]" in text
    # verwiesene Skripte müssen existieren
    for ref in set(re.findall(r"scripts/([\w/]+\.py)", text)):
        assert (ROOT / "scripts" / ref).exists(), ref
    # kein API-Aufruf in Skills (nur Abo)
    assert "ANTHROPIC_API_KEY" not in text and "import anthropic" not in text


@pytest.mark.parametrize("path", SKILLS, ids=lambda p: p.parent.name)
def test_skill_evals(path: Path):
    data = json.loads((path.parent / "evals" / "evals.json").read_text(encoding="utf-8"))
    assert data["skill_name"] == path.parent.name
    assert len(data["evals"]) >= 3
    for e in data["evals"]:
        assert e["prompt"] and e["expected_output"] and e["expectations"]
