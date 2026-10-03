"""Alle GitHub-Workflows müssen gültiges YAML sein (03.10.2026: ein Doppelpunkt im Schrittnamen machte send.yml
unlesbar, GitHub hätte den Versand weder geplant noch manuell gestartet)."""
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


class WorkflowYamlTest(unittest.TestCase):
    def test_all_workflows_parse(self):
        for f in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            with self.subTest(f.name):
                data = yaml.safe_load(f.read_text())
                self.assertIn("jobs", data)
                self.assertIn(True if True in data else "on", data)  # YAML liest „on“ als True
