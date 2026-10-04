"""robots.txt beachten (CLAUDE.md §2): Schnittstellen, die robots.txt für alle Bots sperrt, kommen im Code nie vor.

BODACC (04.10.2026): bodacc-datadila.opendatasoft.com und www.bodacc.fr sperren `/api/` für `User-agent: *`;
data.economie.gouv.fr ebenso (France Num läuft über tabular-api.data.gouv.fr). Downloads unter
static.data.gouv.fr/resources und files.data.gouv.fr sind in deren robots.txt ebenfalls gesperrt.
"""
import datetime as dt
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

# Abruf-Adressen, die robots.txt für alle Bots sperrt (Erwähnung des Hostnamens im Text ist erlaubt, Abruf nicht)
BLOCKED = re.compile(
    r"opendatasoft\.com/api/|bodacc\.fr/api/|data\.economie\.gouv\.fr/api/|"
    r"static\.data\.gouv\.fr/resources/|files\.data\.gouv\.fr/(?!robots)|www\.data\.gouv\.fr/(?:fr/)?datasets/r/"
)
SCAN = ("scripts", "app/app", "app/lib", ".github/workflows")
SUFFIXES = {".py", ".ts", ".tsx", ".js", ".yml", ".yaml", ".sh", ".json"}


class RobotsSperren(unittest.TestCase):
    def test_keine_gesperrten_schnittstellen_im_code(self):
        hits = []
        for base in SCAN:
            for f in (ROOT / base).rglob("*"):
                if not f.is_file() or f.suffix not in SUFFIXES or "node_modules" in f.parts:
                    continue
                for n, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
                    if BLOCKED.search(line):
                        hits.append(f"{f.relative_to(ROOT)}:{n}: {line.strip()[:120]}")
        self.assertEqual(hits, [], "robots.txt sperrt diese Abrufe (CLAUDE.md §2):\n" + "\n".join(hits))

    def test_bodacc_ruft_nichts_ab(self):
        from extraktor.sources import fr_bodacc
        logs = []
        with mock.patch("requests.get", side_effect=AssertionError("kein Abruf erlaubt")), \
                mock.patch("requests.post", side_effect=AssertionError("kein Abruf erlaubt")):
            rows = fr_bodacc.fetch(dt.date(2026, 9, 1), log=logs.append)
        self.assertEqual(rows, [])
        self.assertTrue(any("robots.txt" in m for m in logs))

    def test_watch_fr_incorporations_abgeschaltet(self):
        import io
        from contextlib import redirect_stdout

        import watch
        out = io.StringIO()
        with mock.patch("requests.get", side_effect=AssertionError("kein Abruf erlaubt")), redirect_stdout(out):
            watch.cmd_fr_incorporations(None, None)
        self.assertIn("robots.txt", out.getvalue())


if __name__ == "__main__":
    unittest.main()
