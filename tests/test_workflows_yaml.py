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


def _wf(name: str) -> dict:
    return yaml.safe_load((ROOT / ".github" / "workflows" / name).read_text())


class WorkflowRobustnessTest(unittest.TestCase):
    """Prüfung 04.10.2026: GitHub ließ geplante Läufe stundenlang aus, Nachstarts liefen doppelt oder zu lang."""

    def test_wachhund_is_kicked_from_werke_and_antworten(self):
        for name, job in (("lead-werk.yml", "weiter"), ("kunden-werk.yml", "weiter"), ("antworten.yml", "run")):
            with self.subTest(name):
                j = _wf(name)["jobs"][job]
                kick = [s for s in j["steps"] if "gh workflow run wachhund.yml" in (s.get("run") or "")]
                self.assertEqual(len(kick), 1)
                self.assertEqual(kick[0]["if"], "always()")
                self.assertEqual(j["permissions"]["actions"], "write")
        self.assertIn("wachhund.yml", _wf("antworten.yml")["jobs"]["run"]["steps"][-1]["run"])

    def test_restart_retries_and_survives_empty_answer(self):
        for name in ("lead-werk.yml", "kunden-werk.yml"):
            run = _wf(name)["jobs"]["weiter"]["steps"][-1]["run"]
            self.assertIn("retry gh run view", run)
            self.assertIn("mins=999", run)
            self.assertIn(f"retry gh workflow run {name}", run)

    def test_daily_runs_skip_after_wachhund_restart(self):
        for name in ("morgenbericht.yml", "tagescheck.yml", "kaeufer.yml", "taeglich.yml"):
            with self.subTest(name):
                jobs = _wf(name)["jobs"]
                step = jobs["doppelt"]["steps"][0]
                self.assertEqual(step["if"], "github.event_name == 'schedule'")
                self.assertIn(f"actions/workflows/{name}/runs", step["run"])
                self.assertIn("event=workflow_dispatch", step["run"])
                self.assertEqual(jobs["doppelt"]["permissions"], {"actions": "read"})
                for k, j in jobs.items():
                    if k != "doppelt":
                        self.assertEqual(j["needs"], "doppelt")
                        self.assertEqual(j["if"], "needs.doppelt.outputs.skip != 'true'")

    def test_taeglich_uk_bulk_only_on_monday_or_input(self):
        wf = _wf("taeglich.yml")
        self.assertIs(wf[True]["workflow_dispatch"]["inputs"]["uk_bulk"]["default"], False)
        steps = {s.get("name"): s for s in wf["jobs"]["run"]["steps"]}
        uk = steps["Neugründungen UK (Companies House, montags)"]
        self.assertEqual(uk["timeout-minutes"], 40)
        self.assertIn("inputs.uk_bulk", uk["run"])
        self.assertNotIn("event_name", uk["run"])
        names = [s.get("name") for s in wf["jobs"]["run"]["steps"]]
        self.assertLess(names.index("Nachfassmails"), names.index("Quellen"))
        self.assertLess(names.index("Proben aktualisieren"), names.index("Neue Entwürfe (Freigabe laut config/versand.yaml)"))

    def test_antworten_restart_tolerance(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        import tagescheck
        import wachhund
        job = next(j for j in wachhund.JOBS if j["wf"] == "antworten.yml")
        self.assertEqual(job["max_min"], 20)
        self.assertEqual(tagescheck.WORKFLOWS["antworten.yml"][1], 1)

    def test_kaeufer_osm_cannot_hang(self):
        osm = next(s for s in _wf("kaeufer.yml")["jobs"]["suchen"]["steps"] if s.get("name") == "Kandidaten aus OpenStreetMap")
        self.assertEqual(osm["timeout-minutes"], 45)
        self.assertTrue(osm["continue-on-error"])
