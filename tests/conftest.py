"""Gemeinsame Test-Einstellungen.

Die Drei-Stufen-Freigabe (lib/release_gate.py) prüft echte Daten inkl. Netz-Nachprüfung. Tests anderer Abläufe
(Proben, Lieferungen) arbeiten mit vereinfachten Attrappen-Leads – dort wird die Freigabe durch eine Durchreiche
ersetzt. Die Freigabe selbst testet tests/test_release_gate.py vollständig.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))


@pytest.fixture(autouse=True)
def _gate_passthrough(request, monkeypatch):
    if request.module.__name__.endswith("test_release_gate"):
        yield
        return
    from lib import release_gate
    monkeypatch.setattr(release_gate, "release", lambda db, leads, **kw: (list(leads), []))
    monkeypatch.setattr(release_gate, "check", lambda db, ids, **kw: [release_gate.Verdict(i, True) for i in ids])
    yield
