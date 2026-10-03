"""Durchreiche für die Drei-Stufen-Freigabe in Tests anderer Abläufe (Proben, Lieferungen), die mit vereinfachten
Attrappen-Leads arbeiten. Die Freigabe selbst testet tests/test_release_gate.py vollständig.

    from gatestub import setUpModule, tearDownModule  # noqa: F401  (unittest ruft beide je Modul auf)
"""
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import release_gate  # noqa: E402

_patches = [
    mock.patch.object(release_gate, "release", lambda db, leads, **kw: (list(leads), [])),
    mock.patch.object(release_gate, "check", lambda db, ids, **kw: [release_gate.Verdict(i, True) for i in ids]),
]


def setUpModule():
    for p in _patches:
        p.start()


def tearDownModule():
    for p in _patches:
        p.stop()
