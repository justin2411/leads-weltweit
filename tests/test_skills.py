"""Projekt-Skills (.claude/skills) halten die Regeln aus docs/GEHIRN-LERNEN.md §3 ein."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = sorted((ROOT / ".claude" / "skills").glob("*/SKILL.md"))


def _frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise AssertionError("Frontmatter fehlt")
    return dict(re.findall(r"^(\w+): (.*)$", m.group(1), re.M))


class SkillsTest(unittest.TestCase):
    def test_skills_vorhanden(self):
        names = {p.parent.name for p in SKILLS}
        self.assertLessEqual({"kaltmail-bauen", "ruecklaeufer-klaeren", "lehren-einpflegen"}, names)

    def test_skill_regeln(self):
        for path in SKILLS:
            with self.subTest(skill=path.parent.name):
                text = path.read_text(encoding="utf-8")
                fm = _frontmatter(text)
                name = fm.get("name", "")
                self.assertEqual(name, path.parent.name)
                self.assertRegex(name, r"^[a-z0-9-]{1,64}$")
                self.assertNotIn("claude", name)
                self.assertNotIn("anthropic", name)
                desc = fm.get("description", "")
                self.assertTrue(0 < len(desc) <= 1024)
                self.assertLess(len(text.splitlines()), 500)
                for must in ("CLAUDE.md §2", "Prüfschleife", "- [ ]"):
                    self.assertIn(must, text)
                # verwiesene Skripte müssen existieren
                for ref in set(re.findall(r"scripts/([\w/]+\.py)", text)):
                    self.assertTrue((ROOT / "scripts" / ref).exists(), ref)
                # kein API-Aufruf in Skills (nur Abo)
                self.assertNotIn("ANTHROPIC_API_KEY", text)
                self.assertNotIn("import anthropic", text)

    def test_skill_evals(self):
        for path in SKILLS:
            with self.subTest(skill=path.parent.name):
                data = json.loads((path.parent / "evals" / "evals.json").read_text(encoding="utf-8"))
                self.assertEqual(data["skill_name"], path.parent.name)
                self.assertGreaterEqual(len(data["evals"]), 3)
                for e in data["evals"]:
                    self.assertTrue(e["prompt"] and e["expected_output"] and e["expectations"])


if __name__ == "__main__":
    unittest.main()
