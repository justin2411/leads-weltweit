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

    def test_no_workflow_kicks_another_or_itself(self):
        """Actions-Drossel (Inhaber 06.10.2026): kein Workflow startet andere Abläufe oder sich selbst."""
        for f in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            with self.subTest(f.name):
                text = "\n".join(l for l in f.read_text(encoding="utf-8").splitlines() if not l.lstrip().startswith("#"))
                self.assertNotIn("gh workflow run", text)
                self.assertNotIn("/dispatches", text)
                self.assertNotIn("repository_dispatch", text)
                self.assertNotIn("workflow_run", text)

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
        self.assertEqual(job["max_min"], 45)                        # Drossel 06.10.2026: alle 30 min
        self.assertEqual(tagescheck.WORKFLOWS["antworten.yml"][1], 2)

    def test_kaeufer_osm_cannot_hang(self):
        osm = next(s for s in _wf("kaeufer.yml")["jobs"]["suchen"]["steps"] if s.get("name") == "Kandidaten aus OpenStreetMap")
        self.assertEqual(osm["timeout-minutes"], 45)
        self.assertTrue(osm["continue-on-error"])


class ActionsDrosselTest(unittest.TestCase):
    """Actions-Drossel (Inhaber 06.10.2026: „fahr github actions erstmal runter“): höchstens 5 Jobs gleichzeitig im
    Repo (werke 2 + takt 1 + Versand 1 + Antworten 1; CI nur bei Pull Requests), Zeitpläne höchstens stündlich."""

    LIMIT = {"werke": 2, "takt": 1, "mails-senden": 1, "antworten": 1}

    @staticmethod
    def width(wf: dict) -> int:
        """Höchstzahl gleichzeitiger Jobs eines Laufs: Jobs gleicher Tiefe im needs-Graph laufen nebeneinander."""
        jobs = wf["jobs"]
        depth: dict[str, int] = {}

        def d(j: str) -> int:
            if j not in depth:
                needs = jobs[j].get("needs") or []
                needs = [needs] if isinstance(needs, str) else needs
                depth[j] = 1 + max((d(n) for n in needs), default=-1)
            return depth[j]

        per: dict[int, int] = {}
        for j, jd in jobs.items():
            par = (jd.get("strategy") or {}).get("max-parallel", 1 if not jd.get("strategy") else 99)
            per[d(j)] = per.get(d(j), 0) + par
        return max(per.values())

    def test_groups_and_parallelism(self):
        total = {}
        for f in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            if f.name == "ci.yml":
                continue
            wf = yaml.safe_load(f.read_text())
            with self.subTest(f.name):
                group = (wf.get("concurrency") or {}).get("group")
                self.assertIn(group, self.LIMIT)
                self.assertIs(wf["concurrency"]["cancel-in-progress"], False)
                self.assertLessEqual(self.width(wf), self.LIMIT[group])
                total[group] = max(total.get(group, 0), self.width(wf))
                for j in wf["jobs"].values():
                    self.assertNotIn("concurrency", j)  # nur Gruppen auf Workflow-Ebene (zählen sicher)
        self.assertLessEqual(sum(total.values()), 5)

    def test_crons_at_most_hourly_and_heavy_every_3_to_6_h(self):
        for f in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            wf = yaml.safe_load(f.read_text())
            crons = [c["cron"] for c in (wf[True].get("schedule") or [])]
            with self.subTest(f.name):
                runs_per_hour = sum(len(c.split()[0].split(",")) for c in crons if c.split()[1] == "*")
                self.assertLessEqual(runs_per_hour, 2 if f.name == "antworten.yml" else 1)
                for c in crons:
                    self.assertNotIn("/", c.split()[0])  # keine Minuten-Raster
                if wf.get("concurrency", {}).get("group") == "werke":
                    self.assertTrue(all(c.split()[1] != "*" for c in crons))
        self.assertEqual(yaml.safe_load((ROOT / ".github/workflows/werk-nachfuellen.yml").read_text())[True].keys(),
                         {"workflow_dispatch"})

    def test_scripts_do_not_dispatch(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from lib import drossel
        import werk_plan
        self.assertFalse(drossel.DISPATCH_ERLAUBT)
        self.assertLessEqual(drossel.MAX_LAEUFE, 5)
        self.assertLessEqual(drossel.MAX_PLAETZE, 5)
        self.assertEqual(werk_plan.MIN_BELEGT, 0)
        app = (ROOT / "app" / "lib" / "drossel.ts").read_text(encoding="utf-8")
        self.assertIn("export const ACTIONS_DIRECT_DISPATCH = false;", app)
